package domain

import (
	"time"

	"github.com/google/uuid"
)

// JournalEntry represents a financial transaction to be synced to the GL
type JournalEntry struct {
	ID          uuid.UUID
	ReferenceID string // e.g., InvoiceID, PaymentID
	Date        time.Time
	Memo        string
	Lines       []JournalEntryLine
	Status      string // Pending, Synced, Failed
	ExternalID  string // ID in QBO/NetSuite
	CreatedAt   time.Time
}

type JournalEntryLine struct {
	AccountID   string // Internal or External Account ID
	AccountName string
	Description string
	Debit       int64 // Cents
	Credit      int64 // Cents
}

// GLAccount represents a chart of accounts mapping
type GLAccount struct {
	ID           string
	Name         string
	Type         string // Asset, Liability, Equity, Income, Expense
	ExternalID   string
	InternalCode string
}
