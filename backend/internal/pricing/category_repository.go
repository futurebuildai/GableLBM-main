package pricing

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"strings"
	"time"

	"github.com/gablelbm/gable/pkg/database"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgconn"
)

// CategoryRepository defines database operations for category pricing.
type CategoryRepository interface {
	// Categories
	ListCategories(ctx context.Context) ([]ProductCategory, error)
	GetCategory(ctx context.Context, id uuid.UUID) (*ProductCategory, error)
	CreateCategory(ctx context.Context, c *ProductCategory) error
	UpdateCategory(ctx context.Context, c *ProductCategory) error

	// Category Pricing Rules
	CreateCategoryRule(ctx context.Context, r *CategoryPricingRule) error
	UpdateCategoryRule(ctx context.Context, r *CategoryPricingRule) error
	DeleteCategoryRule(ctx context.Context, id uuid.UUID) error
	GetCategoryRule(ctx context.Context, id uuid.UUID) (*CategoryPricingRule, error)
	ListCategoryRules(ctx context.Context, filter CategoryRuleFilter) ([]CategoryPricingRule, error)

	// Resolution: 5-step algorithm queries
	ResolveAccountExact(ctx context.Context, customerID uuid.UUID, categoryID uuid.UUID) (*CategoryPricingRule, error)
	ResolveAccountAncestor(ctx context.Context, customerID uuid.UUID, categoryPath string) (*CategoryPricingRule, error)
	ResolveTierExact(ctx context.Context, tier string, categoryID uuid.UUID) (*CategoryPricingRule, error)
	ResolveTierAncestor(ctx context.Context, tier string, categoryPath string) (*CategoryPricingRule, error)

	// Matrix view (batch for admin UI)
	GetMatrixRules(ctx context.Context) ([]CategoryPricingRule, error)

	// Product category lookup (returns categoryID, categoryPath, costPrice)
	GetProductCategoryPath(ctx context.Context, productID uuid.UUID) (uuid.UUID, string, float64, error)

	// Audit trail
	CreateAuditEntry(ctx context.Context, entry *CategoryPricingAudit) error
	ListAuditEntries(ctx context.Context, ruleID uuid.UUID) ([]CategoryPricingAudit, error)

	// Bulk operations
	BulkUpsertRules(ctx context.Context, rules []CategoryPricingRule) error
	BulkDeleteRules(ctx context.Context, ids []uuid.UUID) error

	// Pagination
	ListCategoryRulesPaginated(ctx context.Context, filter CategoryRuleFilter, limit, offset int) ([]CategoryPricingRule, int, error)
}

// PostgresCategoryRepository implements CategoryRepository using pgx.
type PostgresCategoryRepository struct {
	db *database.DB
}

// NewCategoryRepository creates a new PostgresCategoryRepository.
func NewCategoryRepository(db *database.DB) *PostgresCategoryRepository {
	return &PostgresCategoryRepository{db: db}
}

// --- Categories ---

func (r *PostgresCategoryRepository) ListCategories(ctx context.Context) ([]ProductCategory, error) {
	query := `
		SELECT id, name, slug, path::text, parent_id, sort_order, is_active, created_at, updated_at
		FROM product_categories
		WHERE is_active = true
		ORDER BY path ASC, sort_order ASC`

	rows, err := r.db.GetExecutor(ctx).Query(ctx, query)
	if err != nil {
		return nil, fmt.Errorf("failed to list categories: %w", err)
	}
	defer rows.Close()

	var cats []ProductCategory
	for rows.Next() {
		var c ProductCategory
		if err := rows.Scan(&c.ID, &c.Name, &c.Slug, &c.Path, &c.ParentID, &c.SortOrder, &c.IsActive, &c.CreatedAt, &c.UpdatedAt); err != nil {
			return nil, fmt.Errorf("failed to scan category: %w", err)
		}
		cats = append(cats, c)
	}
	return cats, nil
}

func (r *PostgresCategoryRepository) GetCategory(ctx context.Context, id uuid.UUID) (*ProductCategory, error) {
	query := `
		SELECT id, name, slug, path::text, parent_id, sort_order, is_active, created_at, updated_at
		FROM product_categories
		WHERE id = $1`

	var c ProductCategory
	err := r.db.GetExecutor(ctx).QueryRow(ctx, query, id).Scan(
		&c.ID, &c.Name, &c.Slug, &c.Path, &c.ParentID, &c.SortOrder, &c.IsActive, &c.CreatedAt, &c.UpdatedAt,
	)
	if err != nil {
		if err == pgx.ErrNoRows {
			return nil, nil
		}
		return nil, fmt.Errorf("failed to get category: %w", err)
	}
	return &c, nil
}

func (r *PostgresCategoryRepository) CreateCategory(ctx context.Context, c *ProductCategory) error {
	if c.ID == uuid.Nil {
		c.ID = uuid.New()
	}
	now := time.Now()
	c.CreatedAt = now
	c.UpdatedAt = now

	query := `
		INSERT INTO product_categories (id, name, slug, path, parent_id, sort_order, is_active, created_at, updated_at)
		VALUES ($1, $2, $3, $4::ltree, $5, $6, $7, $8, $9)`

	_, err := r.db.GetExecutor(ctx).Exec(ctx, query,
		c.ID, c.Name, c.Slug, c.Path, c.ParentID, c.SortOrder, c.IsActive, c.CreatedAt, c.UpdatedAt,
	)
	if err != nil {
		return fmt.Errorf("failed to create category: %w", err)
	}
	return nil
}

func (r *PostgresCategoryRepository) UpdateCategory(ctx context.Context, c *ProductCategory) error {
	c.UpdatedAt = time.Now()

	query := `
		UPDATE product_categories
		SET name = $2, slug = $3, sort_order = $4, is_active = $5, updated_at = $6
		WHERE id = $1`

	_, err := r.db.GetExecutor(ctx).Exec(ctx, query,
		c.ID, c.Name, c.Slug, c.SortOrder, c.IsActive, c.UpdatedAt,
	)
	if err != nil {
		return fmt.Errorf("failed to update category: %w", err)
	}
	return nil
}

// --- Category Pricing Rules ---

func (r *PostgresCategoryRepository) CreateCategoryRule(ctx context.Context, rule *CategoryPricingRule) error {
	if rule.ID == uuid.Nil {
		rule.ID = uuid.New()
	}
	now := time.Now()
	rule.CreatedAt = now
	rule.UpdatedAt = now

	query := `
		INSERT INTO category_pricing_rules
			(id, target_type, customer_id, tier, category_id, rule_type, rule_value,
			 margin_floor_pct, starts_at, expires_at, is_active, priority, created_by, created_at, updated_at)
		VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)`

	_, err := r.db.GetExecutor(ctx).Exec(ctx, query,
		rule.ID, rule.TargetType, rule.CustomerID, nilIfEmpty(rule.Tier), rule.CategoryID,
		rule.RuleType, rule.RuleValue, rule.MarginFloorPct,
		rule.StartsAt, rule.ExpiresAt, rule.IsActive, rule.Priority,
		rule.CreatedBy, rule.CreatedAt, rule.UpdatedAt,
	)
	if err != nil {
		var pgErr *pgconn.PgError
		if errors.As(err, &pgErr) && pgErr.Code == "23505" {
			return fmt.Errorf("an active rule already exists for this target and category")
		}
		return fmt.Errorf("failed to create category rule: %w", err)
	}
	return nil
}

func (r *PostgresCategoryRepository) UpdateCategoryRule(ctx context.Context, rule *CategoryPricingRule) error {
	rule.UpdatedAt = time.Now()

	query := `
		UPDATE category_pricing_rules
		SET rule_type = $2, rule_value = $3, margin_floor_pct = $4,
		    starts_at = $5, expires_at = $6, is_active = $7, priority = $8, updated_at = $9
		WHERE id = $1`

	_, err := r.db.GetExecutor(ctx).Exec(ctx, query,
		rule.ID, rule.RuleType, rule.RuleValue, rule.MarginFloorPct,
		rule.StartsAt, rule.ExpiresAt, rule.IsActive, rule.Priority, rule.UpdatedAt,
	)
	if err != nil {
		return fmt.Errorf("failed to update category rule: %w", err)
	}
	return nil
}

func (r *PostgresCategoryRepository) DeleteCategoryRule(ctx context.Context, id uuid.UUID) error {
	query := `DELETE FROM category_pricing_rules WHERE id = $1`
	_, err := r.db.GetExecutor(ctx).Exec(ctx, query, id)
	if err != nil {
		return fmt.Errorf("failed to delete category rule: %w", err)
	}
	return nil
}

func (r *PostgresCategoryRepository) GetCategoryRule(ctx context.Context, id uuid.UUID) (*CategoryPricingRule, error) {
	query := `
		SELECT cpr.id, cpr.target_type, cpr.customer_id, cpr.tier, cpr.category_id,
		       cpr.rule_type, cpr.rule_value, cpr.margin_floor_pct,
		       cpr.starts_at, cpr.expires_at, cpr.is_active, cpr.priority,
		       cpr.created_by, cpr.created_at, cpr.updated_at,
		       pc.name, pc.path::text
		FROM category_pricing_rules cpr
		JOIN product_categories pc ON pc.id = cpr.category_id
		WHERE cpr.id = $1`

	var rule CategoryPricingRule
	var tier *string
	err := r.db.GetExecutor(ctx).QueryRow(ctx, query, id).Scan(
		&rule.ID, &rule.TargetType, &rule.CustomerID, &tier, &rule.CategoryID,
		&rule.RuleType, &rule.RuleValue, &rule.MarginFloorPct,
		&rule.StartsAt, &rule.ExpiresAt, &rule.IsActive, &rule.Priority,
		&rule.CreatedBy, &rule.CreatedAt, &rule.UpdatedAt,
		&rule.CategoryName, &rule.CategoryPath,
	)
	if err != nil {
		if err == pgx.ErrNoRows {
			return nil, nil
		}
		return nil, fmt.Errorf("failed to get category rule: %w", err)
	}
	if tier != nil {
		rule.Tier = *tier
	}
	return &rule, nil
}

func (r *PostgresCategoryRepository) ListCategoryRules(ctx context.Context, filter CategoryRuleFilter) ([]CategoryPricingRule, error) {
	query := `
		SELECT cpr.id, cpr.target_type, cpr.customer_id, cpr.tier, cpr.category_id,
		       cpr.rule_type, cpr.rule_value, cpr.margin_floor_pct,
		       cpr.starts_at, cpr.expires_at, cpr.is_active, cpr.priority,
		       cpr.created_by, cpr.created_at, cpr.updated_at,
		       pc.name, pc.path::text
		FROM category_pricing_rules cpr
		JOIN product_categories pc ON pc.id = cpr.category_id
		WHERE 1=1`

	var args []any
	argIdx := 1

	if filter.TargetType != nil {
		query += fmt.Sprintf(" AND cpr.target_type = $%d", argIdx)
		args = append(args, *filter.TargetType)
		argIdx++
	}
	if filter.Tier != "" {
		query += fmt.Sprintf(" AND cpr.tier = $%d", argIdx)
		args = append(args, filter.Tier)
		argIdx++
	}
	if filter.CustomerID != nil {
		query += fmt.Sprintf(" AND cpr.customer_id = $%d", argIdx)
		args = append(args, *filter.CustomerID)
		argIdx++
	}
	if filter.CategoryID != nil {
		query += fmt.Sprintf(" AND cpr.category_id = $%d", argIdx)
		args = append(args, *filter.CategoryID)
		argIdx++
	}
	if filter.IsActive != nil {
		query += fmt.Sprintf(" AND cpr.is_active = $%d", argIdx)
		args = append(args, *filter.IsActive)
		argIdx++
	}

	query += " ORDER BY cpr.target_type ASC, cpr.tier ASC, pc.path ASC, cpr.priority DESC"

	rows, err := r.db.GetExecutor(ctx).Query(ctx, query, args...)
	if err != nil {
		return nil, fmt.Errorf("failed to list category rules: %w", err)
	}
	defer rows.Close()

	return scanCategoryRules(rows)
}

// --- Resolution Queries (5-step algorithm) ---

func (r *PostgresCategoryRepository) ResolveAccountExact(ctx context.Context, customerID uuid.UUID, categoryID uuid.UUID) (*CategoryPricingRule, error) {
	query := `
		SELECT cpr.id, cpr.target_type, cpr.customer_id, cpr.tier, cpr.category_id,
		       cpr.rule_type, cpr.rule_value, cpr.margin_floor_pct,
		       cpr.starts_at, cpr.expires_at, cpr.is_active, cpr.priority,
		       cpr.created_by, cpr.created_at, cpr.updated_at,
		       pc.name, pc.path::text
		FROM category_pricing_rules cpr
		JOIN product_categories pc ON pc.id = cpr.category_id
		WHERE cpr.target_type = 'ACCOUNT'
		  AND cpr.customer_id = $1
		  AND cpr.category_id = $2
		  AND cpr.is_active = true
		  AND (cpr.starts_at IS NULL OR cpr.starts_at <= NOW())
		  AND (cpr.expires_at IS NULL OR cpr.expires_at > NOW())
		ORDER BY cpr.priority DESC
		LIMIT 1`

	return r.scanSingleRule(ctx, query, customerID, categoryID)
}

func (r *PostgresCategoryRepository) ResolveAccountAncestor(ctx context.Context, customerID uuid.UUID, categoryPath string) (*CategoryPricingRule, error) {
	query := `
		SELECT cpr.id, cpr.target_type, cpr.customer_id, cpr.tier, cpr.category_id,
		       cpr.rule_type, cpr.rule_value, cpr.margin_floor_pct,
		       cpr.starts_at, cpr.expires_at, cpr.is_active, cpr.priority,
		       cpr.created_by, cpr.created_at, cpr.updated_at,
		       pc.name, pc.path::text
		FROM category_pricing_rules cpr
		JOIN product_categories pc ON pc.id = cpr.category_id
		WHERE cpr.target_type = 'ACCOUNT'
		  AND cpr.customer_id = $1
		  AND cpr.is_active = true
		  AND pc.path <@ $2::ltree
		  AND (cpr.starts_at IS NULL OR cpr.starts_at <= NOW())
		  AND (cpr.expires_at IS NULL OR cpr.expires_at > NOW())
		ORDER BY nlevel(pc.path) DESC, cpr.priority DESC
		LIMIT 1`

	return r.scanSingleRule(ctx, query, customerID, categoryPath)
}

func (r *PostgresCategoryRepository) ResolveTierExact(ctx context.Context, tier string, categoryID uuid.UUID) (*CategoryPricingRule, error) {
	query := `
		SELECT cpr.id, cpr.target_type, cpr.customer_id, cpr.tier, cpr.category_id,
		       cpr.rule_type, cpr.rule_value, cpr.margin_floor_pct,
		       cpr.starts_at, cpr.expires_at, cpr.is_active, cpr.priority,
		       cpr.created_by, cpr.created_at, cpr.updated_at,
		       pc.name, pc.path::text
		FROM category_pricing_rules cpr
		JOIN product_categories pc ON pc.id = cpr.category_id
		WHERE cpr.target_type = 'TIER'
		  AND cpr.tier = $1
		  AND cpr.category_id = $2
		  AND cpr.is_active = true
		  AND (cpr.starts_at IS NULL OR cpr.starts_at <= NOW())
		  AND (cpr.expires_at IS NULL OR cpr.expires_at > NOW())
		ORDER BY cpr.priority DESC
		LIMIT 1`

	return r.scanSingleRule(ctx, query, tier, categoryID)
}

func (r *PostgresCategoryRepository) ResolveTierAncestor(ctx context.Context, tier string, categoryPath string) (*CategoryPricingRule, error) {
	query := `
		SELECT cpr.id, cpr.target_type, cpr.customer_id, cpr.tier, cpr.category_id,
		       cpr.rule_type, cpr.rule_value, cpr.margin_floor_pct,
		       cpr.starts_at, cpr.expires_at, cpr.is_active, cpr.priority,
		       cpr.created_by, cpr.created_at, cpr.updated_at,
		       pc.name, pc.path::text
		FROM category_pricing_rules cpr
		JOIN product_categories pc ON pc.id = cpr.category_id
		WHERE cpr.target_type = 'TIER'
		  AND cpr.tier = $1
		  AND cpr.is_active = true
		  AND pc.path <@ $2::ltree
		  AND (cpr.starts_at IS NULL OR cpr.starts_at <= NOW())
		  AND (cpr.expires_at IS NULL OR cpr.expires_at > NOW())
		ORDER BY nlevel(pc.path) DESC, cpr.priority DESC
		LIMIT 1`

	return r.scanSingleRule(ctx, query, tier, categoryPath)
}

// --- Matrix (admin UI) ---

func (r *PostgresCategoryRepository) GetMatrixRules(ctx context.Context) ([]CategoryPricingRule, error) {
	query := `
		SELECT cpr.id, cpr.target_type, cpr.customer_id, cpr.tier, cpr.category_id,
		       cpr.rule_type, cpr.rule_value, cpr.margin_floor_pct,
		       cpr.starts_at, cpr.expires_at, cpr.is_active, cpr.priority,
		       cpr.created_by, cpr.created_at, cpr.updated_at,
		       pc.name, pc.path::text
		FROM category_pricing_rules cpr
		JOIN product_categories pc ON pc.id = cpr.category_id
		WHERE cpr.is_active = true
		  AND cpr.target_type = 'TIER'
		  AND (cpr.starts_at IS NULL OR cpr.starts_at <= NOW())
		  AND (cpr.expires_at IS NULL OR cpr.expires_at > NOW())
		ORDER BY pc.path ASC, cpr.tier ASC`

	rows, err := r.db.GetExecutor(ctx).Query(ctx, query)
	if err != nil {
		return nil, fmt.Errorf("failed to get matrix rules: %w", err)
	}
	defer rows.Close()

	return scanCategoryRules(rows)
}

// --- Product Category Lookup ---

func (r *PostgresCategoryRepository) GetProductCategoryPath(ctx context.Context, productID uuid.UUID) (uuid.UUID, string, float64, error) {
	query := `
		SELECT pc.id, pc.path::text, COALESCE(p.average_unit_cost, 0)
		FROM products p
		JOIN product_categories pc ON pc.id = p.category_id
		WHERE p.id = $1`

	var categoryID uuid.UUID
	var path string
	var costPrice float64
	err := r.db.GetExecutor(ctx).QueryRow(ctx, query, productID).Scan(&categoryID, &path, &costPrice)
	if err != nil {
		if err == pgx.ErrNoRows {
			return uuid.Nil, "", 0, fmt.Errorf("product %s has no category", productID)
		}
		return uuid.Nil, "", 0, fmt.Errorf("failed to get product category: %w", err)
	}
	return categoryID, path, costPrice, nil
}

// --- Helpers ---

func (r *PostgresCategoryRepository) scanSingleRule(ctx context.Context, query string, args ...any) (*CategoryPricingRule, error) {
	var rule CategoryPricingRule
	var tier *string
	err := r.db.GetExecutor(ctx).QueryRow(ctx, query, args...).Scan(
		&rule.ID, &rule.TargetType, &rule.CustomerID, &tier, &rule.CategoryID,
		&rule.RuleType, &rule.RuleValue, &rule.MarginFloorPct,
		&rule.StartsAt, &rule.ExpiresAt, &rule.IsActive, &rule.Priority,
		&rule.CreatedBy, &rule.CreatedAt, &rule.UpdatedAt,
		&rule.CategoryName, &rule.CategoryPath,
	)
	if err != nil {
		if err == pgx.ErrNoRows {
			return nil, nil
		}
		return nil, fmt.Errorf("failed to resolve category rule: %w", err)
	}
	if tier != nil {
		rule.Tier = *tier
	}
	return &rule, nil
}

func scanCategoryRules(rows pgx.Rows) ([]CategoryPricingRule, error) {
	var rules []CategoryPricingRule
	for rows.Next() {
		var rule CategoryPricingRule
		var tier *string
		if err := rows.Scan(
			&rule.ID, &rule.TargetType, &rule.CustomerID, &tier, &rule.CategoryID,
			&rule.RuleType, &rule.RuleValue, &rule.MarginFloorPct,
			&rule.StartsAt, &rule.ExpiresAt, &rule.IsActive, &rule.Priority,
			&rule.CreatedBy, &rule.CreatedAt, &rule.UpdatedAt,
			&rule.CategoryName, &rule.CategoryPath,
		); err != nil {
			return nil, fmt.Errorf("failed to scan category rule: %w", err)
		}
		if tier != nil {
			rule.Tier = *tier
		}
		rules = append(rules, rule)
	}
	return rules, nil
}

func nilIfEmpty(s string) *string {
	s = strings.TrimSpace(s)
	if s == "" {
		return nil
	}
	return &s
}

// --- Audit Trail ---

func (r *PostgresCategoryRepository) CreateAuditEntry(ctx context.Context, entry *CategoryPricingAudit) error {
	if entry.ID == uuid.Nil {
		entry.ID = uuid.New()
	}
	if entry.PerformedAt.IsZero() {
		entry.PerformedAt = time.Now()
	}

	oldJSON, _ := json.Marshal(entry.OldValues)
	newJSON, _ := json.Marshal(entry.NewValues)

	query := `
		INSERT INTO category_pricing_audit
			(id, rule_id, action, old_values, new_values, performed_by, performed_at,
			 category_id, target_type, tier, customer_id)
		VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`

	_, err := r.db.GetExecutor(ctx).Exec(ctx, query,
		entry.ID, entry.RuleID, entry.Action,
		oldJSON, newJSON,
		entry.PerformedBy, entry.PerformedAt,
		entry.CategoryID, nilIfEmpty(entry.TargetType), nilIfEmpty(entry.Tier), entry.CustomerID,
	)
	if err != nil {
		return fmt.Errorf("failed to create audit entry: %w", err)
	}
	return nil
}

func (r *PostgresCategoryRepository) ListAuditEntries(ctx context.Context, ruleID uuid.UUID) ([]CategoryPricingAudit, error) {
	query := `
		SELECT id, rule_id, action, old_values, new_values, performed_by, performed_at,
		       category_id, target_type, tier, customer_id
		FROM category_pricing_audit
		WHERE rule_id = $1
		ORDER BY performed_at DESC
		LIMIT 50`

	rows, err := r.db.GetExecutor(ctx).Query(ctx, query, ruleID)
	if err != nil {
		return nil, fmt.Errorf("failed to list audit entries: %w", err)
	}
	defer rows.Close()

	var entries []CategoryPricingAudit
	for rows.Next() {
		var e CategoryPricingAudit
		var oldJSON, newJSON []byte
		var targetType, tier *string
		if err := rows.Scan(
			&e.ID, &e.RuleID, &e.Action, &oldJSON, &newJSON,
			&e.PerformedBy, &e.PerformedAt,
			&e.CategoryID, &targetType, &tier, &e.CustomerID,
		); err != nil {
			return nil, fmt.Errorf("failed to scan audit entry: %w", err)
		}
		if oldJSON != nil {
			_ = json.Unmarshal(oldJSON, &e.OldValues)
		}
		if newJSON != nil {
			_ = json.Unmarshal(newJSON, &e.NewValues)
		}
		if targetType != nil {
			e.TargetType = *targetType
		}
		if tier != nil {
			e.Tier = *tier
		}
		entries = append(entries, e)
	}
	return entries, nil
}

// --- Bulk Operations ---

func (r *PostgresCategoryRepository) BulkUpsertRules(ctx context.Context, rules []CategoryPricingRule) error {
	tx, err := r.db.Pool.Begin(ctx)
	if err != nil {
		return fmt.Errorf("begin tx: %w", err)
	}
	defer tx.Rollback(ctx)

	for i := range rules {
		rule := &rules[i]
		if rule.ID == uuid.Nil {
			rule.ID = uuid.New()
		}
		now := time.Now()
		rule.UpdatedAt = now

		query := `
			INSERT INTO category_pricing_rules
				(id, target_type, customer_id, tier, category_id, rule_type, rule_value,
				 margin_floor_pct, starts_at, expires_at, is_active, priority, created_by, created_at, updated_at)
			VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)
			ON CONFLICT (id) DO UPDATE SET
				rule_type = EXCLUDED.rule_type,
				rule_value = EXCLUDED.rule_value,
				margin_floor_pct = EXCLUDED.margin_floor_pct,
				starts_at = EXCLUDED.starts_at,
				expires_at = EXCLUDED.expires_at,
				is_active = EXCLUDED.is_active,
				priority = EXCLUDED.priority,
				updated_at = EXCLUDED.updated_at`

		if rule.CreatedAt.IsZero() {
			rule.CreatedAt = now
		}

		_, err := tx.Exec(ctx, query,
			rule.ID, rule.TargetType, rule.CustomerID, nilIfEmpty(rule.Tier), rule.CategoryID,
			rule.RuleType, rule.RuleValue, rule.MarginFloorPct,
			rule.StartsAt, rule.ExpiresAt, rule.IsActive, rule.Priority,
			rule.CreatedBy, rule.CreatedAt, rule.UpdatedAt,
		)
		if err != nil {
			return fmt.Errorf("bulk upsert rule %s: %w", rule.ID, err)
		}
	}

	return tx.Commit(ctx)
}

func (r *PostgresCategoryRepository) BulkDeleteRules(ctx context.Context, ids []uuid.UUID) error {
	query := `DELETE FROM category_pricing_rules WHERE id = ANY($1)`
	_, err := r.db.GetExecutor(ctx).Exec(ctx, query, ids)
	if err != nil {
		return fmt.Errorf("bulk delete rules: %w", err)
	}
	return nil
}

// --- Paginated List ---

func (r *PostgresCategoryRepository) ListCategoryRulesPaginated(ctx context.Context, filter CategoryRuleFilter, limit, offset int) ([]CategoryPricingRule, int, error) {
	baseWhere := " WHERE 1=1"
	var args []any
	argIdx := 1

	if filter.TargetType != nil {
		baseWhere += fmt.Sprintf(" AND cpr.target_type = $%d", argIdx)
		args = append(args, *filter.TargetType)
		argIdx++
	}
	if filter.Tier != "" {
		baseWhere += fmt.Sprintf(" AND cpr.tier = $%d", argIdx)
		args = append(args, filter.Tier)
		argIdx++
	}
	if filter.CustomerID != nil {
		baseWhere += fmt.Sprintf(" AND cpr.customer_id = $%d", argIdx)
		args = append(args, *filter.CustomerID)
		argIdx++
	}
	if filter.CategoryID != nil {
		baseWhere += fmt.Sprintf(" AND cpr.category_id = $%d", argIdx)
		args = append(args, *filter.CategoryID)
		argIdx++
	}
	if filter.IsActive != nil {
		baseWhere += fmt.Sprintf(" AND cpr.is_active = $%d", argIdx)
		args = append(args, *filter.IsActive)
		argIdx++
	}

	// Count query
	countQuery := `SELECT COUNT(*) FROM category_pricing_rules cpr` + baseWhere
	var total int
	if err := r.db.GetExecutor(ctx).QueryRow(ctx, countQuery, args...).Scan(&total); err != nil {
		return nil, 0, fmt.Errorf("count category rules: %w", err)
	}

	// Data query
	dataQuery := `
		SELECT cpr.id, cpr.target_type, cpr.customer_id, cpr.tier, cpr.category_id,
		       cpr.rule_type, cpr.rule_value, cpr.margin_floor_pct,
		       cpr.starts_at, cpr.expires_at, cpr.is_active, cpr.priority,
		       cpr.created_by, cpr.created_at, cpr.updated_at,
		       pc.name, pc.path::text
		FROM category_pricing_rules cpr
		JOIN product_categories pc ON pc.id = cpr.category_id` +
		baseWhere +
		" ORDER BY cpr.target_type ASC, cpr.tier ASC, pc.path ASC, cpr.priority DESC" +
		fmt.Sprintf(" LIMIT $%d OFFSET $%d", argIdx, argIdx+1)

	dataArgs := append(args, limit, offset)
	rows, err := r.db.GetExecutor(ctx).Query(ctx, dataQuery, dataArgs...)
	if err != nil {
		return nil, 0, fmt.Errorf("list paginated category rules: %w", err)
	}
	defer rows.Close()

	rules, err := scanCategoryRules(rows)
	if err != nil {
		return nil, 0, err
	}
	return rules, total, nil
}
