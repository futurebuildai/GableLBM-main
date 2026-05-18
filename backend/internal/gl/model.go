package gl

import (
	"time"

	"github.com/google/uuid"
)

// Account types
const (
	AccountTypeAsset     = "ASSET"
	AccountTypeLiability = "LIABILITY"
	AccountTypeEquity    = "EQUITY"
	AccountTypeRevenue   = "REVENUE"
	AccountTypeExpense   = "EXPENSE"
)

// Normal balance directions
const (
	NormalDebit  = "DEBIT"
	NormalCredit = "CREDIT"
)

// Journal entry sources
const (
	SourceManual     = "MANUAL"
	SourceInvoice    = "INVOICE"
	SourcePayment    = "PAYMENT"
	SourceAdjustment = "ADJUSTMENT"
	SourceClosing    = "CLOSING"
	SourceVendorInv  = "VENDOR_INVOICE"
	SourceVendorPmt  = "VENDOR_PAYMENT"
)

// Journal entry statuses
const (
	StatusDraft  = "DRAFT"
	StatusPosted = "POSTED"
	StatusVoid   = "VOID"
)

// Fiscal period statuses
const (
	PeriodOpen   = "OPEN"
	PeriodClosed = "CLOSED"
)

// GLAccount represents a single account in the Chart of Accounts.
type GLAccount struct {
	ID            uuid.UUID  `json:"id"`
	Code          string     `json:"code"`
	Name          string     `json:"name"`
	Type          string     `json:"type"`
	Subtype       string     `json:"subtype"`
	ParentID      *uuid.UUID `json:"parent_id,omitempty"`
	NormalBalance string     `json:"normal_balance"`
	IsActive      bool       `json:"is_active"`
	Description   string     `json:"description"`
	Balance       int64      `json:"balance"` // Computed, in cents
	CreatedAt     time.Time  `json:"created_at"`
	UpdatedAt     time.Time  `json:"updated_at"`
}

// JournalEntry represents a double-entry journal entry header.
type JournalEntry struct {
	ID          uuid.UUID     `json:"id"`
	EntryNumber int           `json:"entry_number"`
	EntryDate   time.Time     `json:"entry_date"`
	Memo        string        `json:"memo"`
	Source      string        `json:"source"`
	SourceRefID *uuid.UUID    `json:"source_ref_id,omitempty"`
	Status      string        `json:"status"`
	PostedBy    string        `json:"posted_by"`
	TotalDebit  int64         `json:"total_debit"`  // Computed, cents
	TotalCredit int64         `json:"total_credit"` // Computed, cents
	Lines       []JournalLine `json:"lines,omitempty"`
	CreatedAt   time.Time     `json:"created_at"`
	UpdatedAt   time.Time     `json:"updated_at"`
}

// JournalLine represents a single debit or credit line in a journal entry.
type JournalLine struct {
	ID          uuid.UUID `json:"id"`
	EntryID     uuid.UUID `json:"journal_entry_id"`
	AccountID   uuid.UUID `json:"account_id"`
	AccountCode string    `json:"account_code,omitempty"`
	AccountName string    `json:"account_name,omitempty"`
	Description string    `json:"description"`
	Debit       int64     `json:"debit"`  // Cents
	Credit      int64     `json:"credit"` // Cents
}

// FiscalPeriod represents an accounting period that can be opened or closed.
type FiscalPeriod struct {
	ID        uuid.UUID  `json:"id"`
	Name      string     `json:"name"`
	StartDate time.Time  `json:"start_date"`
	EndDate   time.Time  `json:"end_date"`
	Status    string     `json:"status"`
	ClosedAt  *time.Time `json:"closed_at,omitempty"`
	ClosedBy  string     `json:"closed_by,omitempty"`
	CreatedAt time.Time  `json:"created_at"`
}

// TrialBalanceRow is a single row in the trial balance report.
type TrialBalanceRow struct {
	AccountID   uuid.UUID `json:"account_id"`
	AccountCode string    `json:"account_code"`
	AccountName string    `json:"account_name"`
	AccountType string    `json:"account_type"`
	Debit       int64     `json:"debit"`  // Cents
	Credit      int64     `json:"credit"` // Cents
}
