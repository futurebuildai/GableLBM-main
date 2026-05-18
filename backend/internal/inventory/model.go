package inventory

import (
	"time"

	"github.com/google/uuid"
)

// Inventory represents stock levels at a location
type Inventory struct {
	ID         uuid.UUID  `json:"id"`
	ProductID  uuid.UUID  `json:"product_id"`
	LocationID *uuid.UUID `json:"location_id,omitempty"`
	Location   string     `json:"location"` // Deprecated text field
	Quantity   float64    `json:"quantity"`
	Allocated  float64    `json:"allocated"`
	UpdatedAt  time.Time  `json:"updated_at"`
}

// StockMovementRequest represents a request to move stock
type StockMovementRequest struct {
	ProductID      uuid.UUID  `json:"product_id"`
	FromLocationID *uuid.UUID `json:"from_location_id"`
	ToLocationID   uuid.UUID  `json:"to_location_id"`
	Quantity       float64    `json:"quantity"`
	Reason         string     `json:"reason"`
}

// StockAdjustmentRequest represents a request to adjust stock (cycle count)
type StockAdjustmentRequest struct {
	ProductID  uuid.UUID  `json:"product_id"`
	LocationID *uuid.UUID `json:"location_id"`
	Quantity   float64    `json:"quantity"` // The new quantity (or delta? usually new quantity for cycle count)
	Reason     string     `json:"reason"`
	IsDelta    bool       `json:"is_delta"` // if true, add/subtract. if false, replace.
}
