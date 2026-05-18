package matching

import (
	"time"

	"github.com/google/uuid"
)

// MatchStatus represents the overall or per-line match status.
type MatchStatus string

const (
	MatchStatusPending   MatchStatus = "PENDING"
	MatchStatusMatched   MatchStatus = "MATCHED"
	MatchStatusPartial   MatchStatus = "PARTIAL"
	MatchStatusException MatchStatus = "EXCEPTION"
)

// MatchResult is the 3-way match outcome for a single PO.
type MatchResult struct {
	ID              uuid.UUID   `json:"id" db:"id"`
	POID            uuid.UUID   `json:"po_id" db:"po_id"`
	VendorInvoiceID *uuid.UUID  `json:"vendor_invoice_id,omitempty" db:"vendor_invoice_id"`
	Status          MatchStatus `json:"status" db:"status"`
	MatchedAt       *time.Time  `json:"matched_at,omitempty" db:"matched_at"`
	MatchedBy       *uuid.UUID  `json:"matched_by,omitempty" db:"matched_by"`
	Notes           string      `json:"notes,omitempty" db:"notes"`
	CreatedAt       time.Time   `json:"created_at" db:"created_at"`

	// Populated on read
	Lines []MatchLineDetail `json:"lines,omitempty"`
}

// MatchLineDetail stores per-line comparison data.
type MatchLineDetail struct {
	ID               uuid.UUID   `json:"id" db:"id"`
	MatchResultID    uuid.UUID   `json:"match_result_id" db:"match_result_id"`
	POLineID         uuid.UUID   `json:"po_line_id" db:"po_line_id"`
	Description      string      `json:"description" db:"description"`
	POQty            float64     `json:"po_qty" db:"po_qty"`
	ReceivedQty      float64     `json:"received_qty" db:"received_qty"`
	InvoicedQty      float64     `json:"invoiced_qty" db:"invoiced_qty"`
	POUnitCost       int64       `json:"po_unit_cost" db:"po_unit_cost"`             // cents
	InvoiceUnitPrice int64       `json:"invoice_unit_price" db:"invoice_unit_price"` // cents
	QtyVariancePct   float64     `json:"qty_variance_pct" db:"qty_variance_pct"`
	PriceVariancePct float64     `json:"price_variance_pct" db:"price_variance_pct"`
	LineStatus       MatchStatus `json:"line_status" db:"line_status"`
	CreatedAt        time.Time   `json:"created_at" db:"created_at"`
}

// MatchConfig holds configurable tolerance thresholds.
type MatchConfig struct {
	ID                 uuid.UUID `json:"id" db:"id"`
	QtyTolerancePct    float64   `json:"qty_tolerance_pct" db:"qty_tolerance_pct"`
	PriceTolerancePct  float64   `json:"price_tolerance_pct" db:"price_tolerance_pct"`
	DollarTolerance    int64     `json:"dollar_tolerance" db:"dollar_tolerance"` // cents
	AutoApproveOnMatch bool      `json:"auto_approve_on_match" db:"auto_approve_on_match"`
	UpdatedAt          time.Time `json:"updated_at" db:"updated_at"`
}

// --- Request / Response Types ---

// UpdateMatchConfigRequest is used to update tolerance settings.
type UpdateMatchConfigRequest struct {
	QtyTolerancePct    *float64 `json:"qty_tolerance_pct,omitempty"`
	PriceTolerancePct  *float64 `json:"price_tolerance_pct,omitempty"`
	DollarTolerance    *float64 `json:"dollar_tolerance,omitempty"` // dollars, converted to cents
	AutoApproveOnMatch *bool    `json:"auto_approve_on_match,omitempty"`
}

// MatchException is a summary view for exception reporting.
type MatchException struct {
	MatchResultID   uuid.UUID   `json:"match_result_id"`
	POID            uuid.UUID   `json:"po_id"`
	VendorInvoiceID *uuid.UUID  `json:"vendor_invoice_id,omitempty"`
	Status          MatchStatus `json:"status"`
	Notes           string      `json:"notes,omitempty"`
	CreatedAt       time.Time   `json:"created_at"`
	LineCount       int         `json:"line_count"`
	ExceptionCount  int         `json:"exception_count"`
}
