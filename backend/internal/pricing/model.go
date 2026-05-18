package pricing

import (
	"time"

	"github.com/google/uuid"
)

type PricingSource string

const (
	SourceContract        PricingSource = "CONTRACT"
	SourceTier            PricingSource = "TIER"
	SourceRetail          PricingSource = "RETAIL"
	SourceQuantityBreak   PricingSource = "QUANTITY_BREAK"
	SourceJobOverride     PricingSource = "JOB_OVERRIDE"
	SourcePromotional     PricingSource = "PROMOTIONAL"
	SourceCategoryTier    PricingSource = "CATEGORY_TIER"
	SourceCategoryAccount PricingSource = "CATEGORY_ACCOUNT"
)

type RuleType string

const (
	RuleTypeQuantityBreak RuleType = "QUANTITY_BREAK"
	RuleTypeJobOverride   RuleType = "JOB_OVERRIDE"
	RuleTypePromotional   RuleType = "PROMOTIONAL"
)

type CalculatedPrice struct {
	ProductID     uuid.UUID     `json:"product_id"`
	OriginalPrice float64       `json:"original_price"` // Base Retail
	FinalPrice    float64       `json:"final_price"`
	DiscountPct   float64       `json:"discount_pct"`
	Source        PricingSource `json:"source"`
	Details       string        `json:"details"` // e.g. "Gold Member Discount"
}

type CustomerContract struct {
	ID            uuid.UUID `json:"id"`
	CustomerID    uuid.UUID `json:"customer_id"`
	ProductID     uuid.UUID `json:"product_id"`
	ContractPrice float64   `json:"contract_price"`
	CreatedAt     time.Time `json:"created_at"`
	UpdatedAt     time.Time `json:"updated_at"`
}

type PricingRule struct {
	ID             uuid.UUID  `json:"id"`
	Name           string     `json:"name"`
	RuleType       RuleType   `json:"rule_type"`
	ProductID      *uuid.UUID `json:"product_id,omitempty"`
	CustomerID     *uuid.UUID `json:"customer_id,omitempty"`
	JobID          *uuid.UUID `json:"job_id,omitempty"`
	Category       string     `json:"category,omitempty"`
	FixedPrice     *float64   `json:"fixed_price,omitempty"`
	DiscountPct    *float64   `json:"discount_pct,omitempty"`
	MarkupPct      *float64   `json:"markup_pct,omitempty"`
	MinQuantity    float64    `json:"min_quantity"`
	MaxQuantity    *float64   `json:"max_quantity,omitempty"`
	MarginFloorPct *float64   `json:"margin_floor_pct,omitempty"`
	StartsAt       *time.Time `json:"starts_at,omitempty"`
	ExpiresAt      *time.Time `json:"expires_at,omitempty"`
	IsActive       bool       `json:"is_active"`
	Priority       int        `json:"priority"`
	CreatedAt      time.Time  `json:"created_at"`
	UpdatedAt      time.Time  `json:"updated_at"`
}
