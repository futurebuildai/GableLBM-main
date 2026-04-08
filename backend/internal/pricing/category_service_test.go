package pricing

import (
	"context"
	"math"
	"testing"

	"github.com/google/uuid"
)

// --- Mock Repository ---

type mockCategoryRepo struct {
	categories    []ProductCategory
	rules         []CategoryPricingRule
	productCatMap map[uuid.UUID]struct {
		ID        uuid.UUID
		Path      string
		CostPrice float64
	}
}

func (m *mockCategoryRepo) ListCategories(_ context.Context) ([]ProductCategory, error) {
	return m.categories, nil
}

func (m *mockCategoryRepo) GetCategory(_ context.Context, id uuid.UUID) (*ProductCategory, error) {
	for i := range m.categories {
		if m.categories[i].ID == id {
			return &m.categories[i], nil
		}
	}
	return nil, nil
}

func (m *mockCategoryRepo) CreateCategory(_ context.Context, c *ProductCategory) error {
	m.categories = append(m.categories, *c)
	return nil
}

func (m *mockCategoryRepo) UpdateCategory(_ context.Context, _ *ProductCategory) error {
	return nil
}

func (m *mockCategoryRepo) CreateCategoryRule(_ context.Context, r *CategoryPricingRule) error {
	m.rules = append(m.rules, *r)
	return nil
}

func (m *mockCategoryRepo) UpdateCategoryRule(_ context.Context, _ *CategoryPricingRule) error {
	return nil
}

func (m *mockCategoryRepo) DeleteCategoryRule(_ context.Context, _ uuid.UUID) error {
	return nil
}

func (m *mockCategoryRepo) GetCategoryRule(_ context.Context, id uuid.UUID) (*CategoryPricingRule, error) {
	for i := range m.rules {
		if m.rules[i].ID == id {
			return &m.rules[i], nil
		}
	}
	return nil, nil
}

func (m *mockCategoryRepo) ListCategoryRules(_ context.Context, _ CategoryRuleFilter) ([]CategoryPricingRule, error) {
	return m.rules, nil
}

func (m *mockCategoryRepo) GetMatrixRules(_ context.Context) ([]CategoryPricingRule, error) {
	var tier []CategoryPricingRule
	for _, r := range m.rules {
		if r.TargetType == TargetTypeTier && r.IsActive {
			tier = append(tier, r)
		}
	}
	return tier, nil
}

func (m *mockCategoryRepo) GetProductCategoryPath(_ context.Context, productID uuid.UUID) (uuid.UUID, string, float64, error) {
	if entry, ok := m.productCatMap[productID]; ok {
		return entry.ID, entry.Path, entry.CostPrice, nil
	}
	return uuid.Nil, "", 0, nil
}

func (m *mockCategoryRepo) CreateAuditEntry(_ context.Context, _ *CategoryPricingAudit) error {
	return nil
}

func (m *mockCategoryRepo) ListAuditEntries(_ context.Context, _ uuid.UUID) ([]CategoryPricingAudit, error) {
	return nil, nil
}

func (m *mockCategoryRepo) BulkUpsertRules(_ context.Context, rules []CategoryPricingRule) error {
	for _, r := range rules {
		m.rules = append(m.rules, r)
	}
	return nil
}

func (m *mockCategoryRepo) BulkDeleteRules(_ context.Context, ids []uuid.UUID) error {
	idSet := make(map[uuid.UUID]bool)
	for _, id := range ids {
		idSet[id] = true
	}
	filtered := m.rules[:0]
	for _, r := range m.rules {
		if !idSet[r.ID] {
			filtered = append(filtered, r)
		}
	}
	m.rules = filtered
	return nil
}

func (m *mockCategoryRepo) ListCategoryRulesPaginated(_ context.Context, _ CategoryRuleFilter, limit, offset int) ([]CategoryPricingRule, int, error) {
	total := len(m.rules)
	if offset >= total {
		return nil, total, nil
	}
	end := offset + limit
	if end > total {
		end = total
	}
	return m.rules[offset:end], total, nil
}

func (m *mockCategoryRepo) ResolveAccountExact(_ context.Context, customerID uuid.UUID, categoryID uuid.UUID) (*CategoryPricingRule, error) {
	for i := range m.rules {
		r := &m.rules[i]
		if r.TargetType == TargetTypeAccount && r.IsActive &&
			r.CustomerID != nil && *r.CustomerID == customerID &&
			r.CategoryID == categoryID {
			return r, nil
		}
	}
	return nil, nil
}

func (m *mockCategoryRepo) ResolveAccountAncestor(_ context.Context, customerID uuid.UUID, categoryPath string) (*CategoryPricingRule, error) {
	// Find the best matching ancestor rule for this account
	var best *CategoryPricingRule
	bestDepth := -1

	for i := range m.rules {
		r := &m.rules[i]
		if r.TargetType == TargetTypeAccount && r.IsActive &&
			r.CustomerID != nil && *r.CustomerID == customerID {
			// Check if the rule's category path is an ancestor of the product's category path
			if isAncestorPath(r.CategoryPath, categoryPath) {
				depth := pathDepth(r.CategoryPath)
				if depth > bestDepth {
					best = r
					bestDepth = depth
				}
			}
		}
	}
	return best, nil
}

func (m *mockCategoryRepo) ResolveTierExact(_ context.Context, tier string, categoryID uuid.UUID) (*CategoryPricingRule, error) {
	for i := range m.rules {
		r := &m.rules[i]
		if r.TargetType == TargetTypeTier && r.IsActive &&
			r.Tier == tier && r.CategoryID == categoryID {
			return r, nil
		}
	}
	return nil, nil
}

func (m *mockCategoryRepo) ResolveTierAncestor(_ context.Context, tier string, categoryPath string) (*CategoryPricingRule, error) {
	var best *CategoryPricingRule
	bestDepth := -1

	for i := range m.rules {
		r := &m.rules[i]
		if r.TargetType == TargetTypeTier && r.IsActive && r.Tier == tier {
			if isAncestorPath(r.CategoryPath, categoryPath) {
				depth := pathDepth(r.CategoryPath)
				if depth > bestDepth {
					best = r
					bestDepth = depth
				}
			}
		}
	}
	return best, nil
}

// isAncestorPath checks if ancestor is a prefix of descendant in ltree terms.
func isAncestorPath(ancestor, descendant string) bool {
	if ancestor == descendant {
		return false // exact match is not an ancestor
	}
	if len(ancestor) >= len(descendant) {
		return false
	}
	return descendant[:len(ancestor)] == ancestor && descendant[len(ancestor)] == '.'
}

func pathDepth(path string) int {
	depth := 1
	for _, ch := range path {
		if ch == '.' {
			depth++
		}
	}
	return depth
}

// --- Test Fixtures ---

var (
	lumberID  = uuid.MustParse("10000000-0000-0000-0000-000000000001")
	framingID = uuid.MustParse("10000000-0000-0000-0000-000000000002")
	hardwareID = uuid.MustParse("10000000-0000-0000-0000-000000000003")

	customerBigD = uuid.MustParse("20000000-0000-0000-0000-000000000001")

	product2x4 = uuid.MustParse("30000000-0000-0000-0000-000000000001")
	productNail = uuid.MustParse("30000000-0000-0000-0000-000000000002")
)

func makeTestRepo() *mockCategoryRepo {
	return &mockCategoryRepo{
		categories: []ProductCategory{
			{ID: lumberID, Name: "Lumber", Slug: "lumber", Path: "lumber"},
			{ID: framingID, Name: "Framing Lumber", Slug: "framing_lumber", Path: "lumber.framing", ParentID: &lumberID},
			{ID: hardwareID, Name: "Hardware", Slug: "hardware", Path: "hardware"},
		},
		rules: nil,
		productCatMap: map[uuid.UUID]struct {
			ID        uuid.UUID
			Path      string
			CostPrice float64
		}{
			product2x4:  {ID: framingID, Path: "lumber.framing", CostPrice: 3.50},
			productNail: {ID: hardwareID, Path: "hardware", CostPrice: 0.15},
		},
	}
}

// --- Resolution Tests ---

func TestResolveEffectivePrice_TierExact(t *testing.T) {
	repo := makeTestRepo()
	ruleID := uuid.New()
	repo.rules = []CategoryPricingRule{
		{
			ID:           ruleID,
			TargetType:   TargetTypeTier,
			Tier:         "GOLD",
			CategoryID:   framingID,
			CategoryPath: "lumber.framing",
			RuleType:     CategoryRuleMarkdown,
			RuleValue:    15.0,
			IsActive:     true,
		},
	}

	svc := NewCategoryPricingService(repo)
	resolved, err := svc.ResolveEffectivePrice(context.Background(), customerBigD, "GOLD", product2x4)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	if resolved.MatchType != "tier_exact" {
		t.Errorf("expected match_type=tier_exact, got %s", resolved.MatchType)
	}
	if resolved.Rule == nil {
		t.Fatal("expected rule to be non-nil")
	}
	if resolved.Rule.ID != ruleID {
		t.Errorf("expected rule ID=%s, got %s", ruleID, resolved.Rule.ID)
	}
}

func TestResolveEffectivePrice_TierAncestor(t *testing.T) {
	repo := makeTestRepo()
	repo.rules = []CategoryPricingRule{
		{
			ID:           uuid.New(),
			TargetType:   TargetTypeTier,
			Tier:         "GOLD",
			CategoryID:   lumberID,
			CategoryPath: "lumber",
			RuleType:     CategoryRuleMarkdown,
			RuleValue:    10.0,
			IsActive:     true,
		},
	}

	svc := NewCategoryPricingService(repo)
	// product2x4 is in "lumber.framing", rule is on "lumber" (ancestor)
	resolved, err := svc.ResolveEffectivePrice(context.Background(), customerBigD, "GOLD", product2x4)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	if resolved.MatchType != "tier_ancestor" {
		t.Errorf("expected match_type=tier_ancestor, got %s", resolved.MatchType)
	}
	if resolved.Rule == nil || resolved.Rule.RuleValue != 10.0 {
		t.Error("expected ancestor rule with value 10.0")
	}
}

func TestResolveEffectivePrice_AccountOverridesTier(t *testing.T) {
	repo := makeTestRepo()
	repo.rules = []CategoryPricingRule{
		{
			ID:           uuid.New(),
			TargetType:   TargetTypeTier,
			Tier:         "GOLD",
			CategoryID:   framingID,
			CategoryPath: "lumber.framing",
			RuleType:     CategoryRuleMarkdown,
			RuleValue:    10.0,
			IsActive:     true,
		},
		{
			ID:           uuid.New(),
			TargetType:   TargetTypeAccount,
			CustomerID:   &customerBigD,
			CategoryID:   framingID,
			CategoryPath: "lumber.framing",
			RuleType:     CategoryRuleMarkdown,
			RuleValue:    20.0,
			IsActive:     true,
		},
	}

	svc := NewCategoryPricingService(repo)
	resolved, err := svc.ResolveEffectivePrice(context.Background(), customerBigD, "GOLD", product2x4)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	if resolved.MatchType != "account_exact" {
		t.Errorf("expected match_type=account_exact, got %s", resolved.MatchType)
	}
	if resolved.Rule.RuleValue != 20.0 {
		t.Errorf("expected account rule with value 20.0, got %f", resolved.Rule.RuleValue)
	}
}

func TestResolveEffectivePrice_AccountAncestor(t *testing.T) {
	repo := makeTestRepo()
	repo.rules = []CategoryPricingRule{
		{
			ID:           uuid.New(),
			TargetType:   TargetTypeAccount,
			CustomerID:   &customerBigD,
			CategoryID:   lumberID,
			CategoryPath: "lumber",
			RuleType:     CategoryRuleMarkdown,
			RuleValue:    12.0,
			IsActive:     true,
		},
	}

	svc := NewCategoryPricingService(repo)
	resolved, err := svc.ResolveEffectivePrice(context.Background(), customerBigD, "RETAIL", product2x4)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	if resolved.MatchType != "account_ancestor" {
		t.Errorf("expected match_type=account_ancestor, got %s", resolved.MatchType)
	}
}

func TestResolveEffectivePrice_NoMatch(t *testing.T) {
	repo := makeTestRepo()
	// No rules defined

	svc := NewCategoryPricingService(repo)
	resolved, err := svc.ResolveEffectivePrice(context.Background(), customerBigD, "RETAIL", product2x4)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	if resolved.MatchType != "none" {
		t.Errorf("expected match_type=none, got %s", resolved.MatchType)
	}
	if resolved.Rule != nil {
		t.Error("expected rule to be nil for no match")
	}
}

func TestResolveEffectivePrice_RetailTierSkipped(t *testing.T) {
	repo := makeTestRepo()
	repo.rules = []CategoryPricingRule{
		{
			ID:           uuid.New(),
			TargetType:   TargetTypeTier,
			Tier:         "RETAIL",
			CategoryID:   framingID,
			CategoryPath: "lumber.framing",
			RuleType:     CategoryRuleMarkdown,
			RuleValue:    5.0,
			IsActive:     true,
		},
	}

	svc := NewCategoryPricingService(repo)
	// RETAIL tier should skip tier resolution entirely
	resolved, err := svc.ResolveEffectivePrice(context.Background(), customerBigD, "RETAIL", product2x4)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	if resolved.MatchType != "none" {
		t.Errorf("expected match_type=none for RETAIL tier, got %s", resolved.MatchType)
	}
}

// --- ApplyRule Tests ---

func TestApplyRule(t *testing.T) {
	svc := &CategoryPricingService{}

	tests := []struct {
		name      string
		ruleType  CategoryRuleType
		ruleValue float64
		basePrice float64
		costPrice float64
		expected  float64
	}{
		{
			name:      "MARKDOWN 10% off $100",
			ruleType:  CategoryRuleMarkdown,
			ruleValue: 10.0,
			basePrice: 100.0,
			costPrice: 0,
			expected:  90.0,
		},
		{
			name:      "MARKDOWN 15% off $10",
			ruleType:  CategoryRuleMarkdown,
			ruleValue: 15.0,
			basePrice: 10.0,
			costPrice: 0,
			expected:  8.50,
		},
		{
			name:      "MARKUP 30% on cost $50",
			ruleType:  CategoryRuleMarkup,
			ruleValue: 30.0,
			basePrice: 100.0,
			costPrice: 50.0,
			expected:  65.0,
		},
		{
			name:      "MARKUP with no cost uses base price",
			ruleType:  CategoryRuleMarkup,
			ruleValue: 20.0,
			basePrice: 100.0,
			costPrice: 0,
			expected:  120.0,
		},
		{
			name:      "FIXED price $42.50",
			ruleType:  CategoryRuleFixed,
			ruleValue: 42.50,
			basePrice: 100.0,
			costPrice: 50.0,
			expected:  42.50,
		},
		{
			name:      "MARGIN 20% target on cost $100",
			ruleType:  CategoryRuleMargin,
			ruleValue: 20.0,
			basePrice: 200.0,
			costPrice: 100.0,
			expected:  125.0,
		},
		{
			name:      "MARGIN 40% target on cost $50",
			ruleType:  CategoryRuleMargin,
			ruleValue: 40.0,
			basePrice: 100.0,
			costPrice: 50.0,
			expected:  83.33,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			rule := &CategoryPricingRule{
				RuleType:  tt.ruleType,
				RuleValue: tt.ruleValue,
			}
			got := svc.ApplyRule(rule, tt.basePrice, tt.costPrice)
			if math.Abs(got-tt.expected) > 0.01 {
				t.Errorf("ApplyRule() = %f, want %f", got, tt.expected)
			}
		})
	}
}

func TestApplyRule_NilRule(t *testing.T) {
	svc := &CategoryPricingService{}
	got := svc.ApplyRule(nil, 100.0, 50.0)
	if got != 100.0 {
		t.Errorf("ApplyRule(nil) = %f, want 100.0", got)
	}
}

// --- Helper Tests ---

func TestBuildCategoryTree(t *testing.T) {
	flat := []ProductCategory{
		{ID: lumberID, Name: "Lumber", Path: "lumber"},
		{ID: framingID, Name: "Framing", Path: "lumber.framing", ParentID: &lumberID},
		{ID: hardwareID, Name: "Hardware", Path: "hardware"},
	}

	tree := buildCategoryTree(flat)
	if len(tree) != 2 {
		t.Fatalf("expected 2 roots, got %d", len(tree))
	}
	if tree[0].Name != "Lumber" {
		t.Errorf("expected first root=Lumber, got %s", tree[0].Name)
	}
	if len(tree[0].Children) != 1 {
		t.Fatalf("expected Lumber to have 1 child, got %d", len(tree[0].Children))
	}
	if tree[0].Children[0].Name != "Framing" {
		t.Errorf("expected child=Framing, got %s", tree[0].Children[0].Name)
	}
}

func TestSplitPath(t *testing.T) {
	tests := []struct {
		input    string
		expected []string
	}{
		{"lumber", []string{"lumber"}},
		{"lumber.framing", []string{"lumber", "framing"}},
		{"lumber.framing.syp", []string{"lumber", "framing", "syp"}},
		{"", nil},
	}

	for _, tt := range tests {
		got := splitPath(tt.input)
		if len(got) != len(tt.expected) {
			t.Errorf("splitPath(%q) = %v, want %v", tt.input, got, tt.expected)
			continue
		}
		for i := range got {
			if got[i] != tt.expected[i] {
				t.Errorf("splitPath(%q)[%d] = %q, want %q", tt.input, i, got[i], tt.expected[i])
			}
		}
	}
}
