package millwork

import (
	"encoding/json"
	"time"

	"github.com/google/uuid"
)

type MillworkOption struct {
	ID              uuid.UUID       `json:"id"`
	Category        string          `json:"category"`
	Name            string          `json:"name"`
	PriceAdjustment float64         `json:"price_adjustment"`
	Attributes      json.RawMessage `json:"attributes"` // Flexible JSON attributes
	CreatedAt       time.Time       `json:"created_at"`
	UpdatedAt       time.Time       `json:"updated_at"`
}

type CreateOptionRequest struct {
	Category        string          `json:"category"`
	Name            string          `json:"name"`
	PriceAdjustment float64         `json:"price_adjustment"`
	Attributes      json.RawMessage `json:"attributes"`
}
