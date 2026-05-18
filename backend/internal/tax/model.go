package tax

import (
	"time"

	"github.com/google/uuid"
)

// TaxAddress represents a standardized address for tax jurisdiction lookup.
type TaxAddress struct {
	Line1      string `json:"line1"`
	Line2      string `json:"line2,omitempty"`
	City       string `json:"city"`
	State      string `json:"state"`
	PostalCode string `json:"postal_code"`
	Country    string `json:"country"` // ISO 3166-1 alpha-2 (e.g., "US")
}

// TaxLine represents the tax breakdown for a single line item.
type TaxLine struct {
	LineNumber   int     `json:"line_number"`
	ItemCode     string  `json:"item_code"`
	Description  string  `json:"description"`
	Quantity     float64 `json:"quantity"`
	Amount       int64   `json:"amount"`        // Pre-tax amount in cents
	TaxAmount    int64   `json:"tax_amount"`     // Tax in cents
	TaxRate      float64 `json:"tax_rate"`       // Effective tax rate (0.0825 = 8.25%)
	Jurisdiction string  `json:"jurisdiction"`   // e.g., "TX", "Harris County"
	TaxCode      string  `json:"tax_code"`       // Avalara tax code (e.g., "P0000000" for tangible personal property)
	Exempt       bool    `json:"exempt"`
}

// TaxResult is the aggregated tax calculation result for a transaction.
type TaxResult struct {
	DocumentCode string    `json:"document_code,omitempty"` // Avalara document code for commit/void
	TotalAmount  int64     `json:"total_amount"`            // Pre-tax total in cents
	TotalTax     int64     `json:"total_tax"`               // Total tax in cents
	GrandTotal   int64     `json:"grand_total"`             // TotalAmount + TotalTax
	Lines        []TaxLine `json:"lines"`
	IsEstimate   bool      `json:"is_estimate"` // True if flat-rate fallback was used
}

// TaxExemption represents a customer's tax exemption certificate.
type TaxExemption struct {
	ID                uuid.UUID  `json:"id" db:"id"`
	CustomerID        uuid.UUID  `json:"customer_id" db:"customer_id"`
	ExemptReason      string     `json:"exempt_reason" db:"exempt_reason"`       // e.g., "RESALE", "GOVERNMENT", "CONTRACTOR"
	CertificateNumber string     `json:"certificate_number" db:"certificate_number"`
	IssuingState      string     `json:"issuing_state" db:"issuing_state"`        // 2-letter state code
	EffectiveDate     time.Time  `json:"effective_date" db:"effective_date"`
	ExpiryDate        *time.Time `json:"expiry_date,omitempty" db:"expiry_date"`
	IsActive          bool       `json:"is_active" db:"is_active"`
	CreatedAt         time.Time  `json:"created_at" db:"created_at"`
}

// TaxPreviewRequest is sent by the frontend to get a tax estimate on a cart or invoice.
type TaxPreviewRequest struct {
	CustomerID  *uuid.UUID     `json:"customer_id,omitempty"`
	ShipFrom    TaxAddress     `json:"ship_from"`
	ShipTo      TaxAddress     `json:"ship_to"`
	Lines       []TaxLineInput `json:"lines"`
	DocumentType string        `json:"document_type"` // "SalesInvoice", "ReturnInvoice"
}

// TaxLineInput is a single line item in a tax preview request.
type TaxLineInput struct {
	LineNumber  int     `json:"line_number"`
	ItemCode    string  `json:"item_code"`
	Description string  `json:"description"`
	Quantity    float64 `json:"quantity"`
	Amount      int64   `json:"amount"`   // Pre-tax line total in cents
	TaxCode     string  `json:"tax_code"` // Avalara tax code; defaults to "P0000000"
}

// CreateExemptionRequest is the payload for creating a new tax exemption.
type CreateExemptionRequest struct {
	CustomerID        uuid.UUID `json:"customer_id"`
	ExemptReason      string    `json:"exempt_reason"`
	CertificateNumber string    `json:"certificate_number"`
	IssuingState      string    `json:"issuing_state"`
	ExpiryDate        *string   `json:"expiry_date,omitempty"` // ISO 8601 date
}
