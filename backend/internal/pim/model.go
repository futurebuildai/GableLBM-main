package pim

import (
	"time"

	"github.com/google/uuid"
)

// PIMContent represents AI-generated product descriptions and SEO metadata (1:1 with products)
type PIMContent struct {
	ID               uuid.UUID         `json:"id"`
	ProductID        uuid.UUID         `json:"product_id"`
	ShortDescription string            `json:"short_description"`
	LongDescription  string            `json:"long_description"`
	MarketingCopy    string            `json:"marketing_copy"`
	Attributes       map[string]string `json:"attributes"`
	SEOTitle         string            `json:"seo_title"`
	SEODescription   string            `json:"seo_description"`
	SEOKeywords      []string          `json:"seo_keywords"`
	SEOSlug          string            `json:"seo_slug"`
	LastGenModel     string            `json:"last_gen_model"`
	LastGenPrompt    string            `json:"last_gen_prompt"`
	LastGenAt        *time.Time        `json:"last_gen_at"`
	CreatedAt        time.Time         `json:"created_at"`
	UpdatedAt        time.Time         `json:"updated_at"`
}

// PIMMedia represents a product image (1:many)
type PIMMedia struct {
	ID          uuid.UUID  `json:"id"`
	ProductID   uuid.UUID  `json:"product_id"`
	MediaType   string     `json:"media_type"`
	URL         string     `json:"url"`
	AltText     string     `json:"alt_text"`
	SortOrder   int        `json:"sort_order"`
	IsPrimary   bool       `json:"is_primary"`
	GenModel    string     `json:"gen_model"`
	GenPrompt   string     `json:"gen_prompt"`
	GenStyle    string     `json:"gen_style"`
	GeneratedAt *time.Time `json:"generated_at"`
	CreatedAt   time.Time  `json:"created_at"`
	UpdatedAt   time.Time  `json:"updated_at"`
}

// PIMCollateral represents marketing collateral (1:many)
type PIMCollateral struct {
	ID             uuid.UUID  `json:"id"`
	ProductID      uuid.UUID  `json:"product_id"`
	CollateralType string     `json:"collateral_type"`
	Title          string     `json:"title"`
	Content        string     `json:"content"`
	Tone           string     `json:"tone"`
	Audience       string     `json:"audience"`
	GenModel       string     `json:"gen_model"`
	GenPrompt      string     `json:"gen_prompt"`
	GeneratedAt    *time.Time `json:"generated_at"`
	CreatedAt      time.Time  `json:"created_at"`
	UpdatedAt      time.Time  `json:"updated_at"`
}

// ProductDetail is the aggregate returned for the detail page
type ProductDetail struct {
	ID              uuid.UUID       `json:"id"`
	SKU             string          `json:"sku"`
	Description     string          `json:"description"`
	UOMPrimary      string          `json:"uom_primary"`
	BasePrice       float64         `json:"base_price"`
	Vendor          *string         `json:"vendor"`
	UPC             *string         `json:"upc"`
	WeightLbs       float64         `json:"weight_lbs"`
	ReorderPoint    float64         `json:"reorder_point"`
	ReorderQty      float64         `json:"reorder_qty"`
	TotalQuantity   float64         `json:"total_quantity"`
	TotalAllocated  float64         `json:"total_allocated"`
	AverageUnitCost float64         `json:"average_unit_cost"`
	TargetMargin    float64         `json:"target_margin"`
	CommissionRate  float64         `json:"commission_rate"`
	CreatedAt       time.Time       `json:"created_at"`
	UpdatedAt       time.Time       `json:"updated_at"`
	Content         *PIMContent     `json:"content"`
	Media           []PIMMedia      `json:"media"`
	Collateral      []PIMCollateral `json:"collateral"`
}

// --- Request/Response types ---

// GenerateDescriptionsRequest is the payload for AI description generation
type GenerateDescriptionsRequest struct {
	Tone     string `json:"tone"`
	Audience string `json:"audience"`
}

// GenerateDescriptionsResponse holds the AI-generated text
type GenerateDescriptionsResponse struct {
	ShortDescription string            `json:"short_description"`
	LongDescription  string            `json:"long_description"`
	MarketingCopy    string            `json:"marketing_copy"`
	Attributes       map[string]string `json:"attributes"`
}

// GenerateSEORequest is the payload for SEO metadata generation
type GenerateSEORequest struct {
	TargetKeywords []string `json:"target_keywords"`
}

// GenerateSEOResponse holds AI-generated SEO data
type GenerateSEOResponse struct {
	Title       string   `json:"title"`
	Description string   `json:"description"`
	Keywords    []string `json:"keywords"`
	Slug        string   `json:"slug"`
}

// GenerateImageRequest is the payload for AI image generation
type GenerateImageRequest struct {
	Style  string `json:"style"`
	Prompt string `json:"prompt"`
}

// GenerateCollateralRequest is the payload for marketing collateral generation
type GenerateCollateralRequest struct {
	Type     string `json:"type"`
	Tone     string `json:"tone"`
	Audience string `json:"audience"`
}

// UpdateContentRequest allows manual editing of PIM content fields
type UpdateContentRequest struct {
	ShortDescription *string            `json:"short_description,omitempty"`
	LongDescription  *string            `json:"long_description,omitempty"`
	MarketingCopy    *string            `json:"marketing_copy,omitempty"`
	Attributes       *map[string]string `json:"attributes,omitempty"`
	SEOTitle         *string            `json:"seo_title,omitempty"`
	SEODescription   *string            `json:"seo_description,omitempty"`
	SEOKeywords      *[]string          `json:"seo_keywords,omitempty"`
	SEOSlug          *string            `json:"seo_slug,omitempty"`
}
