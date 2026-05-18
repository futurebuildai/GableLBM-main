package bankrecon

import (
	"time"

	"github.com/google/uuid"
)

// TransactionStatus tracks the state of a bank transaction.
type TransactionStatus string

const (
	TransactionStatusUnmatched TransactionStatus = "UNMATCHED"
	TransactionStatusMatched   TransactionStatus = "MATCHED"
	TransactionStatusExcluded  TransactionStatus = "EXCLUDED"
)

// SessionStatus tracks the state of a reconciliation session.
type SessionStatus string

const (
	SessionStatusInProgress SessionStatus = "IN_PROGRESS"
	SessionStatusCompleted  SessionStatus = "COMPLETED"
)

// BankAccount represents a bank account linked to a GL cash account.
type BankAccount struct {
	ID            uuid.UUID `json:"id" db:"id"`
	Name          string    `json:"name" db:"name"`
	AccountNumber string    `json:"account_number" db:"account_number"`
	RoutingNumber string    `json:"routing_number" db:"routing_number"`
	GLAccountID   uuid.UUID `json:"gl_account_id" db:"gl_account_id"`
	IsActive      bool      `json:"is_active" db:"is_active"`
	CreatedAt     time.Time `json:"created_at" db:"created_at"`
}

// BankTransaction represents a single row from an imported bank statement.
type BankTransaction struct {
	ID                    uuid.UUID         `json:"id" db:"id"`
	BankAccountID         uuid.UUID         `json:"bank_account_id" db:"bank_account_id"`
	ReconciliationID      *uuid.UUID        `json:"reconciliation_id,omitempty" db:"reconciliation_id"`
	TransactionDate       time.Time         `json:"transaction_date" db:"transaction_date"`
	Amount                int64             `json:"amount" db:"amount"` // cents; positive=deposit, negative=withdrawal
	Description           string            `json:"description" db:"description"`
	Reference             string            `json:"reference" db:"reference"`
	MatchedJournalEntryID *uuid.UUID        `json:"matched_journal_entry_id,omitempty" db:"matched_journal_entry_id"`
	Status                TransactionStatus `json:"status" db:"status"`
	CreatedAt             time.Time         `json:"created_at" db:"created_at"`
}

// ReconciliationSession represents a bank reconciliation session.
type ReconciliationSession struct {
	ID               uuid.UUID     `json:"id" db:"id"`
	BankAccountID    uuid.UUID     `json:"bank_account_id" db:"bank_account_id"`
	BankAccountName  string        `json:"bank_account_name,omitempty"`
	PeriodStart      time.Time     `json:"period_start" db:"period_start"`
	PeriodEnd        time.Time     `json:"period_end" db:"period_end"`
	StatementBalance int64         `json:"statement_balance" db:"statement_balance"` // cents
	GLBalance        int64         `json:"gl_balance" db:"gl_balance"`               // cents
	ClearedCount     int           `json:"cleared_count" db:"cleared_count"`
	ClearedTotal     int64         `json:"cleared_total" db:"cleared_total"` // cents
	OutstandingCount int           `json:"outstanding_count" db:"outstanding_count"`
	OutstandingTotal int64         `json:"outstanding_total" db:"outstanding_total"` // cents
	Difference       int64         `json:"difference" db:"difference"`               // cents
	Status           SessionStatus `json:"status" db:"status"`
	CompletedBy      *uuid.UUID    `json:"completed_by,omitempty" db:"completed_by"`
	CompletedAt      *time.Time    `json:"completed_at,omitempty" db:"completed_at"`
	CreatedAt        time.Time     `json:"created_at" db:"created_at"`

	// Populated on read
	Transactions []BankTransaction `json:"transactions,omitempty"`
}

// --- Request Types ---

// CreateBankAccountRequest is sent when setting up a bank account.
type CreateBankAccountRequest struct {
	Name          string    `json:"name"`
	AccountNumber string    `json:"account_number"`
	RoutingNumber string    `json:"routing_number"`
	GLAccountID   uuid.UUID `json:"gl_account_id"`
}

// CreateSessionRequest starts a new reconciliation session.
type CreateSessionRequest struct {
	BankAccountID    uuid.UUID `json:"bank_account_id"`
	PeriodStart      string    `json:"period_start"`      // YYYY-MM-DD
	PeriodEnd        string    `json:"period_end"`        // YYYY-MM-DD
	StatementBalance float64   `json:"statement_balance"` // dollars
}

// ImportCSVRequest wraps CSV content for import.
type ImportCSVRequest struct {
	BankAccountID    uuid.UUID  `json:"bank_account_id"`
	ReconciliationID *uuid.UUID `json:"reconciliation_id,omitempty"`
	CSVContent       string     `json:"csv_content"`
}

// ManualMatchRequest links a bank transaction to a GL journal entry.
type ManualMatchRequest struct {
	BankTransactionID uuid.UUID `json:"bank_transaction_id"`
	JournalEntryID    uuid.UUID `json:"journal_entry_id"`
}

// ImportResult summarizes what happened during CSV import.
type ImportResult struct {
	TotalRows    int `json:"total_rows"`
	ImportedRows int `json:"imported_rows"`
	SkippedRows  int `json:"skipped_rows"`
	AutoMatched  int `json:"auto_matched"`
}
