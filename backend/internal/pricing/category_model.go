package pricing

import (
	"time"

	"github.com/google/uuid"
)

// TargetType determines if a category pricing rule targets a specific account or a tier.
type TargetType string

const (
	TargetTypeAccount TargetType = "ACCOUNT"
	TargetTypeTier    TargetType = "TIER"
)

// CategoryRuleType defines how the rule_value is applied to calculate effective price.
type CategoryRuleType string

const (
	CategoryRuleMarkup   CategoryRuleType = "MARKUP"   // sell = cost * (1 + value/100)
	CategoryRuleMarkdown CategoryRuleType = "MARKDOWN" // sell = base * (1 - value/100)
	CategoryRuleFixed    CategoryRuleType = "FIXED"    // sell = value (absolute price)
	CategoryRuleMargin   CategoryRuleType = "MARGIN"   // sell = cost / (1 - value/100)
)

// ProductCategory represents a node in the hierarchical product category tree.
type ProductCategory struct {
	ID        uuid.UUID  `json:"id"`
	Name      string     `json:"name"`
	Slug      string     `json:"slug"`
	Path      string     `json:"path"`   // ltree path, e.g. "lumber.framing"
	ParentID  *uuid.UUID `json:"parent_id,omitempty"`
	SortOrder int        `json:"sort_order"`
	IsActive  bool       `json:"is_active"`
	CreatedAt time.Time  `json:"created_at"`
	UpdatedAt time.Time  `json:"updated_at"`

	Children []ProductCategory `json:"children,omitempty"`
}

// CategoryPricingRule represents a row in category_pricing_rules.
type CategoryPricingRule struct {
	ID             uuid.UUID        `json:"id"`
	TargetType     TargetType       `json:"target_type"`
	CustomerID     *uuid.UUID       `json:"customer_id,omitempty"`
	Tier           string           `json:"tier,omitempty"`
	CategoryID     uuid.UUID        `json:"category_id"`
	RuleType       CategoryRuleType `json:"rule_type"`
	RuleValue      float64          `json:"rule_value"`
	MarginFloorPct *float64         `json:"margin_floor_pct,omitempty"`
	StartsAt       *time.Time       `json:"starts_at,omitempty"`
	ExpiresAt      *time.Time       `json:"expires_at,omitempty"`
	IsActive       bool             `json:"is_active"`
	Priority       int              `json:"priority"`
	CreatedBy      string           `json:"created_by,omitempty"`
	CreatedAt      time.Time        `json:"created_at"`
	UpdatedAt      time.Time        `json:"updated_at"`

	// Joined fields for API responses
	CategoryName string `json:"category_name,omitempty"`
	CategoryPath string `json:"category_path,omitempty"`
	CustomerName string `json:"customer_name,omitempty"`
}

// ResolvedCategoryPrice is the output of the category resolution algorithm.
type ResolvedCategoryPrice struct {
	Rule         *CategoryPricingRule `json:"rule,omitempty"`
	MatchType    string              `json:"match_type"`    // "account_exact", "account_ancestor", "tier_exact", "tier_ancestor", "none"
	CategoryPath string              `json:"category_path"`
	CostPrice    float64             `json:"cost_price"` // product's average unit cost for MARKUP/MARGIN rules
}

// MatrixCell represents a single cell in the pricing matrix grid.
type MatrixCell struct {
	CategoryID   uuid.UUID           `json:"category_id"`
	CategoryName string              `json:"category_name"`
	CategoryPath string              `json:"category_path"`
	Tier         string              `json:"tier"`
	Rule         *CategoryPricingRule `json:"rule,omitempty"`
	Inherited    bool                `json:"inherited"`
	SourcePath   string              `json:"source_path,omitempty"`
}

// MatrixResponse is the admin API response for the full pricing matrix.
type MatrixResponse struct {
	Categories []ProductCategory `json:"categories"`
	Tiers      []string          `json:"tiers"`
	Cells      []MatrixCell      `json:"cells"`
}

// CategoryRuleFilter is used to filter category pricing rules in list queries.
type CategoryRuleFilter struct {
	TargetType *TargetType `json:"target_type,omitempty"`
	Tier       string      `json:"tier,omitempty"`
	CustomerID *uuid.UUID  `json:"customer_id,omitempty"`
	CategoryID *uuid.UUID  `json:"category_id,omitempty"`
	IsActive   *bool       `json:"is_active,omitempty"`
}

// CategoryPricingAudit represents a row in the audit trail table.
type CategoryPricingAudit struct {
	ID          uuid.UUID              `json:"id"`
	RuleID      uuid.UUID              `json:"rule_id"`
	Action      string                 `json:"action"`
	OldValues   map[string]any         `json:"old_values,omitempty"`
	NewValues   map[string]any         `json:"new_values,omitempty"`
	PerformedBy string                 `json:"performed_by"`
	PerformedAt time.Time              `json:"performed_at"`
	CategoryID  *uuid.UUID             `json:"category_id,omitempty"`
	TargetType  string                 `json:"target_type,omitempty"`
	Tier        string                 `json:"tier,omitempty"`
	CustomerID  *uuid.UUID             `json:"customer_id,omitempty"`
}

// PaginatedRulesResponse wraps a paginated list of category pricing rules.
type PaginatedRulesResponse struct {
	Data   []CategoryPricingRule `json:"data"`
	Total  int                   `json:"total"`
	Limit  int                   `json:"limit"`
	Offset int                   `json:"offset"`
}
