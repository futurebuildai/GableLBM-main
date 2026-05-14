package product

import (
	"time"

	"github.com/google/uuid"
)

// UOM represents the strict Unit of Measure types matching the database ENUM
type UOM string

const (
	UOM_PCS    UOM = "PCS"
	UOM_EA     UOM = "EA"
	UOM_LF     UOM = "LF"
	UOM_SF     UOM = "SF"
	UOM_BF     UOM = "BF"
	UOM_MBF    UOM = "MBF"
	UOM_SQ     UOM = "SQ"
	UOM_BOX    UOM = "BOX"
	UOM_CTN    UOM = "CTN"
	UOM_RL     UOM = "RL"
	UOM_GAL    UOM = "GAL"
	UOM_LBS    UOM = "LBS"
	UOM_BAG    UOM = "BAG"
	UOM_BUNDLE UOM = "BUNDLE"
	UOM_PAIR   UOM = "PAIR"
	UOM_SET    UOM = "SET"
)

// Product represents a catalog item
type Product struct {
	ID              uuid.UUID  `json:"id"`
	SKU             string     `json:"sku"`
	Description     string     `json:"description"`
	UOMPrimary      UOM        `json:"uom_primary"`
	BasePrice       float64    `json:"base_price"`
	Vendor          *string    `json:"vendor"`     // Denormalized display name (kept for back-compat)
	VendorID        *uuid.UUID `json:"vendor_id"`  // Canonical FK -> vendors.id
	UPC             *string    `json:"upc"`
	WeightLbs       float64    `json:"weight_lbs"`
	ReorderPoint    float64    `json:"reorder_point"`
	ReorderQty      float64    `json:"reorder_qty"`
	TotalQuantity   float64    `json:"total_quantity" db:"-"` // Aggregated from inventory
	TotalAllocated  float64    `json:"total_allocated" db:"-"`
	AverageUnitCost float64    `json:"average_unit_cost"`
	TargetMargin    float64    `json:"target_margin"`
	CommissionRate  float64    `json:"commission_rate"`
	CreatedAt       time.Time  `json:"created_at"`
	UpdatedAt       time.Time  `json:"updated_at"`
}

// ReorderAlert represents a product that's below its reorder point
type ReorderAlert struct {
	ProductID    uuid.UUID  `json:"product_id"`
	SKU          string     `json:"sku"`
	Description  string     `json:"description"`
	Vendor       *string    `json:"vendor"`
	VendorID     *uuid.UUID `json:"vendor_id"`
	ReorderPoint float64    `json:"reorder_point"`
	ReorderQty   float64    `json:"reorder_qty"`
	CurrentStock float64    `json:"current_stock"`
	Deficit      float64    `json:"deficit"`
}
