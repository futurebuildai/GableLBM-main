package purchase_order

import (
	"time"

	"github.com/google/uuid"
)

type PurchaseOrder struct {
	ID             uuid.UUID           `json:"id"`
	BranchID       uuid.UUID           `json:"branch_id"`
	VendorID       *uuid.UUID          `json:"vendor_id,omitempty"`
	VendorName     string              `json:"vendor_name,omitempty"`
	Status         string              `json:"status"`
	Source         string              `json:"source"`
	CreatedAt      time.Time           `json:"created_at"`
	UpdatedAt      time.Time           `json:"updated_at"`
	Lines          []PurchaseOrderLine `json:"lines,omitempty"`
	LineCount      int                 `json:"line_count,omitempty"`
	TotalCost      float64             `json:"total_cost,omitempty"`
	FreightCharges []FreightCharge     `json:"freight_charges,omitempty"`
}

type PurchaseOrderLine struct {
	ID             uuid.UUID  `json:"id"`
	POID           uuid.UUID  `json:"po_id"`
	ProductID      *uuid.UUID `json:"product_id,omitempty"`
	Description    string     `json:"description"`
	Quantity       float64    `json:"quantity"`
	QtyReceived    float64    `json:"qty_received"`
	Cost           float64    `json:"cost"`
	LinkedSOLineID *uuid.UUID `json:"linked_so_line_id,omitempty"`
}

const (
	StatusDraft          = "DRAFT"
	StatusSent           = "SENT"
	StatusPartialReceive = "PARTIAL"
	StatusReceived       = "RECEIVED"
	StatusCancelled      = "CANCELLED"
)

// PO source constants — must stay in sync with the CHECK constraint in
// migration 055_po_source.sql.
const (
	SourceManual       = "MANUAL"
	SourceReorder      = "REORDER"
	SourceSpecialOrder = "SPECIAL_ORDER"
	SourceA2A          = "A2A"
)
