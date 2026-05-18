package payment

import (
	"time"

	"github.com/google/uuid"
)

type PaymentMethod string

const (
	PaymentMethodCash    PaymentMethod = "CASH"
	PaymentMethodCard    PaymentMethod = "CARD"
	PaymentMethodCheck   PaymentMethod = "CHECK"
	PaymentMethodAccount PaymentMethod = "ACCOUNT"
)

// PaymentStatus tracks the lifecycle of a payment.
type PaymentStatus string

const (
	PaymentStatusPending  PaymentStatus = "PENDING"
	PaymentStatusComplete PaymentStatus = "COMPLETE"
	PaymentStatusVoided   PaymentStatus = "VOIDED"
	PaymentStatusRefunded PaymentStatus = "REFUNDED"
)

// Payment represents a payment against an invoice.
type Payment struct {
	ID        uuid.UUID     `json:"id" db:"id"`
	InvoiceID uuid.UUID     `json:"invoice_id" db:"invoice_id"`
	Amount    int64         `json:"amount" db:"amount"` // In Cents
	Method    PaymentMethod `json:"method" db:"method"`
	Reference string        `json:"reference" db:"reference"`
	Notes     string        `json:"notes" db:"notes"`
	CreatedAt time.Time     `json:"created_at" db:"created_at"`

	// Gateway fields (populated for CARD payments via Run Payments)
	GatewayTxID   string `json:"gateway_tx_id,omitempty" db:"gateway_tx_id"`
	GatewayStatus string `json:"gateway_status,omitempty" db:"gateway_status"`
	TokenID       string `json:"-" db:"token_id"` // Never expose token to client
	CardLast4     string `json:"card_last4,omitempty" db:"card_last4"`
	CardBrand     string `json:"card_brand,omitempty" db:"card_brand"`
	AuthCode      string `json:"auth_code,omitempty" db:"auth_code"`
}

// Refund tracks a refund against a previously completed payment.
type Refund struct {
	ID              uuid.UUID `json:"id" db:"id"`
	PaymentID       uuid.UUID `json:"payment_id" db:"payment_id"`
	Amount          int64     `json:"amount" db:"amount"` // In Cents
	Reason          string    `json:"reason" db:"reason"`
	GatewayRefundID string    `json:"gateway_refund_id,omitempty" db:"gateway_refund_id"`
	Status          string    `json:"status" db:"status"` // PENDING, COMPLETE, FAILED
	CreatedAt       time.Time `json:"created_at" db:"created_at"`
}

// TenderLine represents one leg of a split payment.
// A single invoice can have multiple tender lines (e.g., $500 cash + $1200 card).
type TenderLine struct {
	ID        uuid.UUID     `json:"id" db:"id"`
	InvoiceID uuid.UUID     `json:"invoice_id" db:"invoice_id"`
	PaymentID *uuid.UUID    `json:"payment_id,omitempty" db:"payment_id"` // Set after payment processes
	Method    PaymentMethod `json:"method" db:"method"`
	Amount    int64         `json:"amount" db:"amount"` // In Cents
	Reference string        `json:"reference,omitempty" db:"reference"`
	CreatedAt time.Time     `json:"created_at" db:"created_at"`
}

// CreatePaymentIntentRequest is sent by the frontend to initiate a card payment.
type CreatePaymentIntentRequest struct {
	InvoiceID uuid.UUID `json:"invoice_id"`
	Amount    int64     `json:"amount"` // In cents
}

// PaymentIntentResponse returns the public key needed by Runner.js on the frontend.
type PaymentIntentResponse struct {
	PublicKey string `json:"public_key"`
	InvoiceID string `json:"invoice_id"`
	Amount    int64  `json:"amount_cents"`
}

// ProcessCardPaymentRequest is sent after Runner.js tokenizes the card.
type ProcessCardPaymentRequest struct {
	InvoiceID uuid.UUID `json:"invoice_id"`
	TokenID   string    `json:"token_id"`
	Amount    int64     `json:"amount"` // In cents
	Notes     string    `json:"notes"`
}

// RefundRequest is sent to initiate a refund on a completed payment.
type RefundRequest struct {
	PaymentID uuid.UUID `json:"payment_id"`
	Amount    int64     `json:"amount"` // In cents (partial or full)
	Reason    string    `json:"reason"`
}
