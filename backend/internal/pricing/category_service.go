package pricing

import (
	"context"
	"fmt"
	"math"

	"github.com/gablelbm/gable/pkg/middleware"
	"github.com/google/uuid"
)

// CategoryPricingService implements the 5-step category-aware pricing resolution.
type CategoryPricingService struct {
	catRepo CategoryRepository
}

// NewCategoryPricingService creates a new CategoryPricingService.
func NewCategoryPricingService(catRepo CategoryRepository) *CategoryPricingService {
	return &CategoryPricingService{catRepo: catRepo}
}

// ResolveEffectivePrice runs the 5-step resolution algorithm:
//  1. Account + exact category
//  2. Account + ancestor category
//  3. Tier + exact category
//  4. Tier + ancestor category
//  5. No match (fallthrough to base price)
func (s *CategoryPricingService) ResolveEffectivePrice(
	ctx context.Context,
	customerID uuid.UUID,
	customerTier string,
	productID uuid.UUID,
) (*ResolvedCategoryPrice, error) {
	// Step 0: Get the product's category, ltree path, and cost price
	categoryID, categoryPath, costPrice, err := s.catRepo.GetProductCategoryPath(ctx, productID)
	if err != nil {
		// Product has no category — cannot resolve, fall through
		return &ResolvedCategoryPrice{MatchType: "none"}, nil
	}

	makeResult := func(rule *CategoryPricingRule, matchType string) *ResolvedCategoryPrice {
		return &ResolvedCategoryPrice{
			Rule:         rule,
			MatchType:    matchType,
			CategoryPath: categoryPath,
			CostPrice:    costPrice,
		}
	}

	// Step 1: Account + exact category
	rule, err := s.catRepo.ResolveAccountExact(ctx, customerID, categoryID)
	if err != nil {
		return nil, fmt.Errorf("resolve account exact: %w", err)
	}
	if rule != nil {
		return makeResult(rule, "account_exact"), nil
	}

	// Step 2: Account + ancestor category (climb ltree path)
	rule, err = s.catRepo.ResolveAccountAncestor(ctx, customerID, categoryPath)
	if err != nil {
		return nil, fmt.Errorf("resolve account ancestor: %w", err)
	}
	if rule != nil {
		return makeResult(rule, "account_ancestor"), nil
	}

	// Step 3: Tier + exact category
	if customerTier != "" && customerTier != "RETAIL" {
		rule, err = s.catRepo.ResolveTierExact(ctx, customerTier, categoryID)
		if err != nil {
			return nil, fmt.Errorf("resolve tier exact: %w", err)
		}
		if rule != nil {
			return makeResult(rule, "tier_exact"), nil
		}

		// Step 4: Tier + ancestor category
		rule, err = s.catRepo.ResolveTierAncestor(ctx, customerTier, categoryPath)
		if err != nil {
			return nil, fmt.Errorf("resolve tier ancestor: %w", err)
		}
		if rule != nil {
			return makeResult(rule, "tier_ancestor"), nil
		}
	}

	// Step 5: No match — fall through to base price
	return &ResolvedCategoryPrice{
		MatchType:    "none",
		CategoryPath: categoryPath,
		CostPrice:    costPrice,
	}, nil
}

// ApplyRule calculates the effective price based on rule type.
//   - MARKDOWN: basePrice * (1 - value/100)
//   - MARKUP:   costPrice * (1 + value/100)
//   - FIXED:    value (absolute price)
//   - MARGIN:   costPrice / (1 - value/100)
func (s *CategoryPricingService) ApplyRule(rule *CategoryPricingRule, basePrice float64, costPrice float64) float64 {
	if rule == nil {
		return basePrice
	}

	switch rule.RuleType {
	case CategoryRuleMarkdown:
		return math.Round(basePrice*(1-rule.RuleValue/100)*100) / 100
	case CategoryRuleMarkup:
		if costPrice > 0 {
			return math.Round(costPrice*(1+rule.RuleValue/100)*100) / 100
		}
		return math.Round(basePrice*(1+rule.RuleValue/100)*100) / 100
	case CategoryRuleFixed:
		return rule.RuleValue
	case CategoryRuleMargin:
		if costPrice > 0 && rule.RuleValue < 100 {
			return math.Round(costPrice/(1-rule.RuleValue/100)*100) / 100
		}
		return basePrice
	default:
		return basePrice
	}
}

// --- Category Management ---

// ListCategories returns all active categories as a flat list.
func (s *CategoryPricingService) ListCategories(ctx context.Context) ([]ProductCategory, error) {
	return s.catRepo.ListCategories(ctx)
}

// ListCategoriesTree returns categories as a nested tree structure.
func (s *CategoryPricingService) ListCategoriesTree(ctx context.Context) ([]ProductCategory, error) {
	flat, err := s.catRepo.ListCategories(ctx)
	if err != nil {
		return nil, err
	}
	return buildCategoryTree(flat), nil
}

// CreateCategory creates a new product category.
func (s *CategoryPricingService) CreateCategory(ctx context.Context, c *ProductCategory) error {
	return s.catRepo.CreateCategory(ctx, c)
}

// UpdateCategory updates an existing product category.
func (s *CategoryPricingService) UpdateCategory(ctx context.Context, c *ProductCategory) error {
	return s.catRepo.UpdateCategory(ctx, c)
}

// --- Rule Management ---

// CreateCategoryRule creates a new category pricing rule and logs an audit entry.
func (s *CategoryPricingService) CreateCategoryRule(ctx context.Context, r *CategoryPricingRule) error {
	if err := s.catRepo.CreateCategoryRule(ctx, r); err != nil {
		return err
	}
	s.logAudit(ctx, r.ID, "CREATE", nil, r)
	return nil
}

// UpdateCategoryRule updates an existing category pricing rule and logs an audit entry.
func (s *CategoryPricingService) UpdateCategoryRule(ctx context.Context, r *CategoryPricingRule) error {
	old, _ := s.catRepo.GetCategoryRule(ctx, r.ID)
	if err := s.catRepo.UpdateCategoryRule(ctx, r); err != nil {
		return err
	}
	s.logAudit(ctx, r.ID, "UPDATE", old, r)
	return nil
}

// DeleteCategoryRule deletes a category pricing rule and logs an audit entry.
func (s *CategoryPricingService) DeleteCategoryRule(ctx context.Context, id uuid.UUID) error {
	old, _ := s.catRepo.GetCategoryRule(ctx, id)
	if err := s.catRepo.DeleteCategoryRule(ctx, id); err != nil {
		return err
	}
	s.logAudit(ctx, id, "DELETE", old, nil)
	return nil
}

// GetCategoryRule retrieves a single category pricing rule by ID.
func (s *CategoryPricingService) GetCategoryRule(ctx context.Context, id uuid.UUID) (*CategoryPricingRule, error) {
	return s.catRepo.GetCategoryRule(ctx, id)
}

// ListCategoryRules lists category pricing rules with optional filters.
func (s *CategoryPricingService) ListCategoryRules(ctx context.Context, filter CategoryRuleFilter) ([]CategoryPricingRule, error) {
	return s.catRepo.ListCategoryRules(ctx, filter)
}

// ListCategoryRulesPaginated lists rules with pagination.
func (s *CategoryPricingService) ListCategoryRulesPaginated(ctx context.Context, filter CategoryRuleFilter, limit, offset int) ([]CategoryPricingRule, int, error) {
	return s.catRepo.ListCategoryRulesPaginated(ctx, filter, limit, offset)
}

// ListAuditEntries returns audit log entries for a given rule.
func (s *CategoryPricingService) ListAuditEntries(ctx context.Context, ruleID uuid.UUID) ([]CategoryPricingAudit, error) {
	return s.catRepo.ListAuditEntries(ctx, ruleID)
}

// BulkUpsertRules creates/updates multiple rules in a transaction with audit logging.
func (s *CategoryPricingService) BulkUpsertRules(ctx context.Context, rules []CategoryPricingRule) error {
	// Fetch existing rules for audit diffing
	existingMap := make(map[uuid.UUID]*CategoryPricingRule)
	for _, r := range rules {
		if r.ID != uuid.Nil {
			if existing, err := s.catRepo.GetCategoryRule(ctx, r.ID); err == nil && existing != nil {
				existingMap[r.ID] = existing
			}
		}
	}

	if err := s.catRepo.BulkUpsertRules(ctx, rules); err != nil {
		return err
	}

	// Log audit for each rule
	for i := range rules {
		old := existingMap[rules[i].ID]
		action := "CREATE"
		if old != nil {
			action = "UPDATE"
		}
		s.logAudit(ctx, rules[i].ID, action, old, &rules[i])
	}
	return nil
}

// BulkDeleteRules deletes multiple rules with audit logging.
func (s *CategoryPricingService) BulkDeleteRules(ctx context.Context, ids []uuid.UUID) error {
	// Fetch existing rules for audit
	var oldRules []*CategoryPricingRule
	for _, id := range ids {
		if old, err := s.catRepo.GetCategoryRule(ctx, id); err == nil && old != nil {
			oldRules = append(oldRules, old)
		}
	}

	if err := s.catRepo.BulkDeleteRules(ctx, ids); err != nil {
		return err
	}

	for _, old := range oldRules {
		s.logAudit(ctx, old.ID, "DELETE", old, nil)
	}
	return nil
}

// --- Audit Helpers ---

func (s *CategoryPricingService) logAudit(ctx context.Context, ruleID uuid.UUID, action string, old, new_ *CategoryPricingRule) {
	entry := &CategoryPricingAudit{
		RuleID:      ruleID,
		Action:      action,
		PerformedBy: getPerformedBy(ctx),
	}
	if old != nil {
		entry.OldValues = ruleToMap(old)
		entry.CategoryID = &old.CategoryID
		entry.TargetType = string(old.TargetType)
		entry.Tier = old.Tier
		entry.CustomerID = old.CustomerID
	}
	if new_ != nil {
		entry.NewValues = ruleToMap(new_)
		entry.CategoryID = &new_.CategoryID
		entry.TargetType = string(new_.TargetType)
		entry.Tier = new_.Tier
		entry.CustomerID = new_.CustomerID
	}
	// Fire-and-forget: audit failures should not block the operation
	_ = s.catRepo.CreateAuditEntry(ctx, entry)
}

func getPerformedBy(ctx context.Context) string {
	if claims := middleware.ClaimsFromContext(ctx); claims != nil {
		if claims.Email != "" {
			return claims.Email
		}
		return claims.Subject
	}
	return "system"
}

func ruleToMap(r *CategoryPricingRule) map[string]any {
	m := map[string]any{
		"rule_type":  string(r.RuleType),
		"rule_value": r.RuleValue,
		"is_active":  r.IsActive,
		"priority":   r.Priority,
	}
	if r.MarginFloorPct != nil {
		m["margin_floor_pct"] = *r.MarginFloorPct
	}
	if r.Tier != "" {
		m["tier"] = r.Tier
	}
	if r.CustomerID != nil {
		m["customer_id"] = r.CustomerID.String()
	}
	return m
}

// --- Matrix ---

// GetMatrix builds the full pricing matrix for the admin UI.
func (s *CategoryPricingService) GetMatrix(ctx context.Context) (*MatrixResponse, error) {
	categories, err := s.catRepo.ListCategories(ctx)
	if err != nil {
		return nil, fmt.Errorf("list categories: %w", err)
	}

	rules, err := s.catRepo.GetMatrixRules(ctx)
	if err != nil {
		return nil, fmt.Errorf("get matrix rules: %w", err)
	}

	tiers := []string{"RETAIL", "SILVER", "GOLD", "PLATINUM"}

	// Build a lookup: tier+categoryID → rule
	ruleMap := make(map[string]*CategoryPricingRule)
	for i := range rules {
		key := rules[i].Tier + ":" + rules[i].CategoryID.String()
		ruleMap[key] = &rules[i]
	}

	// Build cells for each category×tier combination
	var cells []MatrixCell
	for _, cat := range categories {
		for _, tier := range tiers {
			key := tier + ":" + cat.ID.String()
			cell := MatrixCell{
				CategoryID:   cat.ID,
				CategoryName: cat.Name,
				CategoryPath: cat.Path,
				Tier:         tier,
			}

			if rule, ok := ruleMap[key]; ok {
				cell.Rule = rule
				cell.Inherited = false
			} else {
				// Check ancestors for inherited rule
				inheritedRule := findInheritedRule(cat.Path, tier, categories, ruleMap)
				if inheritedRule != nil {
					cell.Rule = inheritedRule
					cell.Inherited = true
					cell.SourcePath = inheritedRule.CategoryPath
				}
			}

			cells = append(cells, cell)
		}
	}

	return &MatrixResponse{
		Categories: buildCategoryTree(categories),
		Tiers:      tiers,
		Cells:      cells,
	}, nil
}

// --- Helpers ---

// buildCategoryTree converts a flat sorted list into a nested tree.
func buildCategoryTree(flat []ProductCategory) []ProductCategory {
	// Make copies so we don't mutate the input
	nodes := make([]ProductCategory, len(flat))
	copy(nodes, flat)
	for i := range nodes {
		nodes[i].Children = nil
	}

	idMap := make(map[uuid.UUID]*ProductCategory)
	for i := range nodes {
		idMap[nodes[i].ID] = &nodes[i]
	}

	var roots []ProductCategory
	for i := range nodes {
		if nodes[i].ParentID != nil {
			if parent, ok := idMap[*nodes[i].ParentID]; ok {
				parent.Children = append(parent.Children, nodes[i])
				continue
			}
		}
		roots = append(roots, nodes[i])
	}

	// Re-attach children from the map (they may have been appended after being added to roots)
	for i := range roots {
		if mapped, ok := idMap[roots[i].ID]; ok {
			roots[i].Children = mapped.Children
		}
	}

	return roots
}

// findInheritedRule walks up the category path to find an ancestor rule.
func findInheritedRule(path string, tier string, categories []ProductCategory, ruleMap map[string]*CategoryPricingRule) *CategoryPricingRule {
	// Walk up the path segments: "lumber.framing" → check "lumber"
	parts := splitPath(path)
	for i := len(parts) - 1; i >= 0; i-- {
		ancestorPath := joinPath(parts[:i])
		if ancestorPath == "" || ancestorPath == path {
			continue
		}
		// Find the category with this path
		for _, cat := range categories {
			if cat.Path == ancestorPath {
				key := tier + ":" + cat.ID.String()
				if rule, ok := ruleMap[key]; ok {
					return rule
				}
			}
		}
	}
	return nil
}

func splitPath(path string) []string {
	if path == "" {
		return nil
	}
	result := []string{}
	current := ""
	for _, ch := range path {
		if ch == '.' {
			if current != "" {
				result = append(result, current)
			}
			current = ""
		} else {
			current += string(ch)
		}
	}
	if current != "" {
		result = append(result, current)
	}
	return result
}

func joinPath(parts []string) string {
	result := ""
	for i, p := range parts {
		if i > 0 {
			result += "."
		}
		result += p
	}
	return result
}
