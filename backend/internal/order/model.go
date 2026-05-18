package order

import (
	"time"

	"github.com/google/uuid"
)

type OrderStatus string

const (
	StatusDraft     OrderStatus = "DRAFT"
	StatusConfirmed OrderStatus = "CONFIRMED"
	StatusFulfilled OrderStatus = "FULFILLED"
	StatusCancelled OrderStatus = "CANCELLED"
	StatusOnHold    OrderStatus = "ON_HOLD"
)

type Order struct {
	ID           uuid.UUID   `json:"id"`
	BranchID     uuid.UUID   `json:"branch_id"`
	CustomerID   uuid.UUID   `json:"customer_id"`
	CustomerName string      `json:"customer_name,omitempty"`
	QuoteID      *uuid.UUID  `json:"quote_id,omitempty"`
	Status       OrderStatus `json:"status"`
	TotalAmount  int64       `json:"total_amount"` // Cents
	CreatedAt    time.Time   `json:"created_at"`
	UpdatedAt    time.Time   `json:"updated_at"`

	// Salesperson
	SalespersonID   *uuid.UUID `json:"salesperson_id,omitempty"`
	SalespersonName string     `json:"salesperson_name,omitempty"`

	// Margin & Commission (computed from line-level product cost data, all in cents)
	TotalCost       int64   `json:"total_cost"`       // Cents
	TotalMargin     int64   `json:"total_margin"`     // Cents
	MarginPercent   float64 `json:"margin_percent"`   // Percentage (kept as float)
	TotalCommission int64   `json:"total_commission"` // Cents

	// Relations
	Lines []OrderLine `json:"lines,omitempty"`
}

type OrderLine struct {
	ID               uuid.UUID  `json:"id"`
	OrderID          uuid.UUID  `json:"order_id"`
	ProductID        uuid.UUID  `json:"product_id"`
	ProductSKU       string     `json:"product_sku,omitempty"`
	ProductName      string     `json:"product_name,omitempty"`
	Quantity         float64    `json:"quantity"`          // Physical quantity (not money)
	PriceEach        int64      `json:"price_each"`        // Cents
	UnitCost         int64      `json:"unit_cost"`         // Cents
	CommissionRate   float64    `json:"commission_rate"`   // Percentage (kept as float)
	IsSpecialOrder   bool       `json:"is_special_order"`
	VendorID         *uuid.UUID `json:"vendor_id,omitempty"`
	SpecialOrderCost int64      `json:"special_order_cost,omitempty"` // Cents
}

type CreateOrderRequest struct {
	CustomerID uuid.UUID          `json:"customer_id"`
	QuoteID    *uuid.UUID         `json:"quote_id"`
	Lines      []OrderLineRequest `json:"lines"`
}

type OrderLineRequest struct {
	ProductID        uuid.UUID  `json:"product_id"`
	Quantity         float64    `json:"quantity"`          // Physical quantity (not money)
	PriceEach        int64      `json:"price_each"`        // Cents
	IsSpecialOrder   bool       `json:"is_special_order"`
	VendorID         *uuid.UUID `json:"vendor_id"`
	SpecialOrderCost int64      `json:"special_order_cost"` // Cents
}

type UpdateStatusRequest struct {
	Status OrderStatus `json:"status"`
}
