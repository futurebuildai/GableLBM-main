package deposit

import (
	"time"

	"github.com/google/uuid"
)

// DepositStatus is the lifecycle of a customer prepayment.
type DepositStatus string

const (
	StatusOpen     DepositStatus = "OPEN"     // funds held, available to apply
	StatusApplied  DepositStatus = "APPLIED"  // fully drawn down against AR
	StatusRefunded DepositStatus = "REFUNDED" // returned to the customer
)

// CustomerDeposit is a prepayment held as a liability (2200 Customer Deposits)
// until applied against the customer's AR. Money is int64 cents in app code.
type CustomerDeposit struct {
	ID            uuid.UUID  `json:"id"`
	CustomerID    uuid.UUID  `json:"customer_id"`
	BranchID      *uuid.UUID `json:"branch_id,omitempty"`
	Amount        int64      `json:"amount"`         // Cents, original
	AppliedAmount int64      `json:"applied_amount"` // Cents, cumulative applied
	Remaining     int64      `json:"remaining"`      // Cents, computed (amount − applied)
	Status        string     `json:"status"`
	Method        string     `json:"method"` // how the prepayment was taken
	Reference     string     `json:"reference,omitempty"`
	Note          string     `json:"note,omitempty"`
	GLEntryID     *uuid.UUID `json:"gl_entry_id,omitempty"`
	CreatedAt     time.Time  `json:"created_at"`
	UpdatedAt     time.Time  `json:"updated_at"`
}

// DepositApplication records one draw-down of a deposit against AR.
type DepositApplication struct {
	ID         uuid.UUID  `json:"id"`
	DepositID  uuid.UUID  `json:"deposit_id"`
	CustomerID uuid.UUID  `json:"customer_id"`
	Amount     int64      `json:"amount"` // Cents
	InvoiceID  *uuid.UUID `json:"invoice_id,omitempty"`
	GLEntryID  *uuid.UUID `json:"gl_entry_id,omitempty"`
	CreatedAt  time.Time  `json:"created_at"`
}

// RecordDepositRequest takes a new prepayment (money as cents, ERP convention).
type RecordDepositRequest struct {
	CustomerID uuid.UUID  `json:"customer_id"`
	BranchID   *uuid.UUID `json:"branch_id,omitempty"`
	Amount     int64      `json:"amount_cents"`
	Method     string     `json:"method,omitempty"` // default CASH
	Reference  string     `json:"reference,omitempty"`
	Note       string     `json:"note,omitempty"`
}

// ApplyDepositRequest draws a deposit down against AR (optionally a specific
// invoice).
type ApplyDepositRequest struct {
	Amount    int64      `json:"amount_cents"`
	InvoiceID *uuid.UUID `json:"invoice_id,omitempty"`
}
