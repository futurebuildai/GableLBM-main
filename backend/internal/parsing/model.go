package parsing

import "github.com/google/uuid"

// ParsedItem represents a single item extracted from a material list document.
type ParsedItem struct {
	RawText        string           `json:"raw_text"`
	MatchedProduct *MatchedProduct  `json:"matched_product,omitempty"`
	Quantity       float64          `json:"quantity"`
	UOM            string           `json:"uom"`
	Confidence     float64          `json:"confidence"` // 0.0 - 1.0
	IsSpecialOrder bool             `json:"is_special_order"`
	Alternatives   []MatchedProduct `json:"alternatives,omitempty"`
}

// MatchedProduct holds the catalog product that was matched to a parsed line.
type MatchedProduct struct {
	ProductID   uuid.UUID `json:"product_id"`
	SKU         string    `json:"sku"`
	Description string    `json:"description"`
	UOM         string    `json:"uom"`
	BasePrice   float64   `json:"base_price"`
}

// ParseResponse is the API response from the parsing endpoint.
type ParseResponse struct {
	Items       []ParsedItem `json:"items"`
	SourceImage string       `json:"source_image"` // base64 data URI of the uploaded image
	ParseTimeMs int64        `json:"parse_time_ms"`
	ItemCount   int          `json:"item_count"`
}
