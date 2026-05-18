package invoice

import (
	"time"

	"github.com/google/uuid"
)

type InvoiceStatus string

const (
	InvoiceStatusUnpaid  InvoiceStatus = "UNPAID"
	InvoiceStatusPartial InvoiceStatus = "PARTIAL"
	InvoiceStatusPaid    InvoiceStatus = "PAID"
	InvoiceStatusVoid    InvoiceStatus = "VOID"
	InvoiceStatusOverdue InvoiceStatus = "OVERDUE"
)

type Invoice struct {
	ID           uuid.UUID     `json:"id" db:"id"`
	BranchID     uuid.UUID     `json:"branch_id" db:"branch_id"`
	OrderID      uuid.UUID     `json:"order_id" db:"order_id"`
	CustomerID   uuid.UUID     `json:"customer_id" db:"customer_id"`
	CustomerName string        `json:"customer_name,omitempty"`
	Status       InvoiceStatus `json:"status" db:"status"`
	Subtotal     int64         `json:"subtotal" db:"subtotal"`           // Cents
	TaxRate      float64       `json:"tax_rate" db:"tax_rate"`           // e.g. 0.0825 for 8.25%
	TaxAmount    int64         `json:"tax_amount" db:"tax_amount"`       // Cents
	TotalAmount  int64         `json:"total_amount" db:"total_amount"`   // Cents (subtotal + tax)
	PaymentTerms string        `json:"payment_terms" db:"payment_terms"` // NET30, NET60, COD, DUE_ON_RECEIPT
	DueDate      *time.Time    `json:"due_date" db:"due_date"`
	PaidAt       *time.Time    `json:"paid_at" db:"paid_at"`
	CreatedAt    time.Time     `json:"created_at" db:"created_at"`
	UpdatedAt    time.Time     `json:"updated_at" db:"updated_at"`

	// Relations
	Lines []InvoiceLine `json:"lines,omitempty" db:"-"`
}

// CreditMemo represents a credit against a customer account
type CreditMemo struct {
	ID         uuid.UUID  `json:"id"`
	InvoiceID  *uuid.UUID `json:"invoice_id,omitempty"`
	CustomerID uuid.UUID  `json:"customer_id"`
	Amount     int64      `json:"amount"` // Cents
	Reason     string     `json:"reason"`
	Status     string     `json:"status"` // PENDING, APPLIED, VOID
	CreatedAt  time.Time  `json:"created_at"`
	AppliedAt  *time.Time `json:"applied_at,omitempty"`
}

// Payment terms constants
const (
	TermsCOD          = "COD"
	TermsDueOnReceipt = "DUE_ON_RECEIPT"
	TermsNet30        = "NET30"
	TermsNet60        = "NET60"
	TermsNet90        = "NET90"
)

type InvoiceLine struct {
	ID          uuid.UUID `json:"id" db:"id"`
	InvoiceID   uuid.UUID `json:"invoice_id" db:"invoice_id"`
	ProductID   uuid.UUID `json:"product_id" db:"product_id"`
	ProductSKU  string    `json:"product_sku,omitempty"`
	ProductName string    `json:"product_name,omitempty"`
	Quantity    float64   `json:"quantity" db:"quantity"`
	PriceEach   int64     `json:"price_each" db:"price_each"` // Cents
	CreatedAt   time.Time `json:"created_at" db:"created_at"`
}
