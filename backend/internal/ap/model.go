package ap

import (
	"time"

	"github.com/google/uuid"
)

// InvoiceStatus tracks the lifecycle of a vendor invoice.
type InvoiceStatus string

const (
	InvoiceStatusPending  InvoiceStatus = "PENDING"
	InvoiceStatusApproved InvoiceStatus = "APPROVED"
	InvoiceStatusPartial  InvoiceStatus = "PARTIAL"
	InvoiceStatusPaid     InvoiceStatus = "PAID"
	InvoiceStatusVoided   InvoiceStatus = "VOIDED"
)

// PaymentMethod for AP payments to vendors.
type PaymentMethod string

const (
	PaymentMethodCheck PaymentMethod = "CHECK"
	PaymentMethodACH   PaymentMethod = "ACH"
	PaymentMethodWire  PaymentMethod = "WIRE"
)

// VendorInvoice represents a bill received from a vendor.
type VendorInvoice struct {
	ID            uuid.UUID     `json:"id" db:"id"`
	VendorID      uuid.UUID     `json:"vendor_id" db:"vendor_id"`
	VendorName    string        `json:"vendor_name,omitempty" db:"vendor_name"` // Joined
	InvoiceNumber string        `json:"invoice_number" db:"invoice_number"`
	InvoiceDate   time.Time     `json:"invoice_date" db:"invoice_date"`
	DueDate       time.Time     `json:"due_date" db:"due_date"`
	POID          *uuid.UUID    `json:"po_id,omitempty" db:"po_id"`
	Subtotal      int64         `json:"subtotal" db:"subtotal"`       // Cents
	TaxAmount     int64         `json:"tax_amount" db:"tax_amount"`   // Cents
	Total         int64         `json:"total" db:"total"`             // Cents
	AmountPaid    int64         `json:"amount_paid" db:"amount_paid"` // Cents
	Status        InvoiceStatus `json:"status" db:"status"`
	ApprovedBy    *uuid.UUID    `json:"approved_by,omitempty" db:"approved_by"`
	ApprovedAt    *time.Time    `json:"approved_at,omitempty" db:"approved_at"`
	Notes         string        `json:"notes,omitempty" db:"notes"`
	CreatedAt     time.Time     `json:"created_at" db:"created_at"`

	// Populated on read
	Lines []VendorInvoiceLine `json:"lines,omitempty"`
}

// VendorInvoiceLine represents a line item on a vendor invoice.
type VendorInvoiceLine struct {
	ID          uuid.UUID  `json:"id" db:"id"`
	InvoiceID   uuid.UUID  `json:"invoice_id" db:"invoice_id"`
	Description string     `json:"description" db:"description"`
	Quantity    float64    `json:"quantity" db:"quantity"`
	UnitPrice   int64      `json:"unit_price" db:"unit_price"` // Cents
	LineTotal   int64      `json:"line_total" db:"line_total"` // Cents
	GLAccountID *uuid.UUID `json:"gl_account_id,omitempty" db:"gl_account_id"`
	CreatedAt   time.Time  `json:"created_at" db:"created_at"`
}

// APPayment represents a payment made to a vendor.
type APPayment struct {
	ID          uuid.UUID     `json:"id" db:"id"`
	VendorID    uuid.UUID     `json:"vendor_id" db:"vendor_id"`
	VendorName  string        `json:"vendor_name,omitempty" db:"vendor_name"` // Joined
	BatchID     *uuid.UUID    `json:"batch_id,omitempty" db:"batch_id"`
	Amount      int64         `json:"amount" db:"amount"` // Cents
	Method      PaymentMethod `json:"method" db:"method"`
	CheckNumber string        `json:"check_number,omitempty" db:"check_number"`
	Reference   string        `json:"reference,omitempty" db:"reference"`
	PaymentDate time.Time     `json:"payment_date" db:"payment_date"`
	Status      string        `json:"status" db:"status"` // PENDING, COMPLETE, VOIDED
	CreatedAt   time.Time     `json:"created_at" db:"created_at"`
}

// APPaymentApplication links a payment to specific vendor invoices.
type APPaymentApplication struct {
	ID        uuid.UUID `json:"id" db:"id"`
	PaymentID uuid.UUID `json:"payment_id" db:"payment_id"`
	InvoiceID uuid.UUID `json:"invoice_id" db:"invoice_id"`
	Amount    int64     `json:"amount" db:"amount"` // Cents
	CreatedAt time.Time `json:"created_at" db:"created_at"`
}

// --- Request Types ---

// CreateVendorInvoiceRequest is sent when entering a new vendor bill.
type CreateVendorInvoiceRequest struct {
	VendorID      uuid.UUID                    `json:"vendor_id"`
	InvoiceNumber string                       `json:"invoice_number"`
	InvoiceDate   string                       `json:"invoice_date"` // YYYY-MM-DD
	DueDate       string                       `json:"due_date"`     // YYYY-MM-DD
	POID          *uuid.UUID                   `json:"po_id,omitempty"`
	TaxAmount     float64                      `json:"tax_amount"` // Dollars
	Notes         string                       `json:"notes"`
	Lines         []CreateVendorInvoiceLineReq `json:"lines"`
}

// CreateVendorInvoiceLineReq is a line item within a vendor invoice.
type CreateVendorInvoiceLineReq struct {
	Description string     `json:"description"`
	Quantity    float64    `json:"quantity"`
	UnitPrice   float64    `json:"unit_price"` // Dollars
	GLAccountID *uuid.UUID `json:"gl_account_id,omitempty"`
}

// CreateAPPaymentRequest is sent when paying vendors.
type CreateAPPaymentRequest struct {
	VendorID    uuid.UUID     `json:"vendor_id"`
	Amount      float64       `json:"amount"` // Dollars
	Method      PaymentMethod `json:"method"`
	CheckNumber string        `json:"check_number,omitempty"`
	Reference   string        `json:"reference,omitempty"`
	PaymentDate string        `json:"payment_date"` // YYYY-MM-DD
	InvoiceIDs  []uuid.UUID   `json:"invoice_ids"`  // Invoices this payment applies to
}

// APAgingSummary represents aging buckets for a vendor.
type APAgingSummary struct {
	VendorID   uuid.UUID `json:"vendor_id"`
	VendorName string    `json:"vendor_name"`
	Current    int64     `json:"current"` // Cents
	Past30     int64     `json:"past_30"` // Cents
	Past60     int64     `json:"past_60"` // Cents
	Past90     int64     `json:"past_90"` // Cents
	Total      int64     `json:"total"`   // Cents
}
