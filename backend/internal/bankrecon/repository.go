package bankrecon

import (
	"context"
	"fmt"
	"time"

	"github.com/gablelbm/gable/pkg/database"
	"github.com/google/uuid"
)

// Repository defines the data access interface for bank reconciliation.
type Repository interface {
	// Bank Accounts
	CreateBankAccount(ctx context.Context, acct *BankAccount) error
	GetBankAccount(ctx context.Context, id uuid.UUID) (*BankAccount, error)
	ListBankAccounts(ctx context.Context) ([]BankAccount, error)

	// Bank Transactions
	CreateBankTransaction(ctx context.Context, txn *BankTransaction) error
	GetBankTransaction(ctx context.Context, id uuid.UUID) (*BankTransaction, error)
	ListTransactions(ctx context.Context, bankAccountID uuid.UUID, reconID *uuid.UUID) ([]BankTransaction, error)
	UpdateBankTransaction(ctx context.Context, txn *BankTransaction) error

	// Reconciliation Sessions
	CreateSession(ctx context.Context, s *ReconciliationSession) error
	GetSession(ctx context.Context, id uuid.UUID) (*ReconciliationSession, error)
	UpdateSession(ctx context.Context, s *ReconciliationSession) error
	ListSessions(ctx context.Context, bankAccountID *uuid.UUID) ([]ReconciliationSession, error)
}

// PostgresRepository implements Repository with Postgres.
type PostgresRepository struct {
	db *database.DB
}

// NewRepository creates a new bankrecon repository.
func NewRepository(db *database.DB) *PostgresRepository {
	return &PostgresRepository{db: db}
}

// --- Bank Accounts ---

func (r *PostgresRepository) CreateBankAccount(ctx context.Context, acct *BankAccount) error {
	if acct.ID == uuid.Nil {
		acct.ID = uuid.New()
	}
	acct.CreatedAt = time.Now()

	query := `
		INSERT INTO bank_accounts (id, name, account_number, routing_number, gl_account_id, is_active, created_at)
		VALUES ($1, $2, $3, $4, $5, $6, $7)
	`
	_, err := r.db.GetExecutor(ctx).Exec(ctx, query,
		acct.ID, acct.Name, acct.AccountNumber, acct.RoutingNumber,
		acct.GLAccountID, acct.IsActive, acct.CreatedAt,
	)
	if err != nil {
		return fmt.Errorf("failed to create bank account: %w", err)
	}
	return nil
}

func (r *PostgresRepository) GetBankAccount(ctx context.Context, id uuid.UUID) (*BankAccount, error) {
	query := `
		SELECT id, name, COALESCE(account_number, '') as account_number,
			COALESCE(routing_number, '') as routing_number, gl_account_id, is_active, created_at
		FROM bank_accounts WHERE id = $1
	`
	var acct BankAccount
	err := r.db.GetExecutor(ctx).QueryRow(ctx, query, id).Scan(
		&acct.ID, &acct.Name, &acct.AccountNumber, &acct.RoutingNumber,
		&acct.GLAccountID, &acct.IsActive, &acct.CreatedAt,
	)
	if err != nil {
		return nil, fmt.Errorf("failed to get bank account: %w", err)
	}
	return &acct, nil
}

func (r *PostgresRepository) ListBankAccounts(ctx context.Context) ([]BankAccount, error) {
	query := `
		SELECT id, name, COALESCE(account_number, '') as account_number,
			COALESCE(routing_number, '') as routing_number, gl_account_id, is_active, created_at
		FROM bank_accounts
		ORDER BY name ASC
	`
	rows, err := r.db.GetExecutor(ctx).Query(ctx, query)
	if err != nil {
		return nil, fmt.Errorf("failed to list bank accounts: %w", err)
	}
	defer rows.Close()

	var accounts []BankAccount
	for rows.Next() {
		var acct BankAccount
		if err := rows.Scan(
			&acct.ID, &acct.Name, &acct.AccountNumber, &acct.RoutingNumber,
			&acct.GLAccountID, &acct.IsActive, &acct.CreatedAt,
		); err != nil {
			return nil, fmt.Errorf("failed to scan bank account: %w", err)
		}
		accounts = append(accounts, acct)
	}
	return accounts, nil
}

// --- Bank Transactions ---

func (r *PostgresRepository) CreateBankTransaction(ctx context.Context, txn *BankTransaction) error {
	if txn.ID == uuid.Nil {
		txn.ID = uuid.New()
	}
	txn.CreatedAt = time.Now()

	query := `
		INSERT INTO bank_transactions (id, bank_account_id, reconciliation_id, transaction_date,
			amount, description, reference, matched_journal_entry_id, status, created_at)
		VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
	`
	_, err := r.db.GetExecutor(ctx).Exec(ctx, query,
		txn.ID, txn.BankAccountID, txn.ReconciliationID, txn.TransactionDate,
		float64(txn.Amount)/100.0, txn.Description, txn.Reference,
		txn.MatchedJournalEntryID, txn.Status, txn.CreatedAt,
	)
	if err != nil {
		return fmt.Errorf("failed to create bank transaction: %w", err)
	}
	return nil
}

func (r *PostgresRepository) GetBankTransaction(ctx context.Context, id uuid.UUID) (*BankTransaction, error) {
	query := `
		SELECT id, bank_account_id, reconciliation_id, transaction_date,
			amount, COALESCE(description, '') as description, COALESCE(reference, '') as reference,
			matched_journal_entry_id, status, created_at
		FROM bank_transactions WHERE id = $1
	`
	var txn BankTransaction
	var amount float64
	err := r.db.GetExecutor(ctx).QueryRow(ctx, query, id).Scan(
		&txn.ID, &txn.BankAccountID, &txn.ReconciliationID, &txn.TransactionDate,
		&amount, &txn.Description, &txn.Reference,
		&txn.MatchedJournalEntryID, &txn.Status, &txn.CreatedAt,
	)
	if err != nil {
		return nil, fmt.Errorf("failed to get bank transaction: %w", err)
	}
	txn.Amount = int64(amount*100.0 + 0.5)
	return &txn, nil
}

func (r *PostgresRepository) ListTransactions(ctx context.Context, bankAccountID uuid.UUID, reconID *uuid.UUID) ([]BankTransaction, error) {
	query := `
		SELECT id, bank_account_id, reconciliation_id, transaction_date,
			amount, COALESCE(description, '') as description, COALESCE(reference, '') as reference,
			matched_journal_entry_id, status, created_at
		FROM bank_transactions
		WHERE bank_account_id = $1
		  AND ($2::uuid IS NULL OR reconciliation_id = $2)
		ORDER BY transaction_date DESC
	`
	rows, err := r.db.GetExecutor(ctx).Query(ctx, query, bankAccountID, reconID)
	if err != nil {
		return nil, fmt.Errorf("failed to list transactions: %w", err)
	}
	defer rows.Close()

	var txns []BankTransaction
	for rows.Next() {
		var txn BankTransaction
		var amount float64
		if err := rows.Scan(
			&txn.ID, &txn.BankAccountID, &txn.ReconciliationID, &txn.TransactionDate,
			&amount, &txn.Description, &txn.Reference,
			&txn.MatchedJournalEntryID, &txn.Status, &txn.CreatedAt,
		); err != nil {
			return nil, fmt.Errorf("failed to scan transaction: %w", err)
		}
		txn.Amount = int64(amount*100.0 + 0.5)
		txns = append(txns, txn)
	}
	return txns, nil
}

func (r *PostgresRepository) UpdateBankTransaction(ctx context.Context, txn *BankTransaction) error {
	query := `
		UPDATE bank_transactions
		SET matched_journal_entry_id = $2, status = $3, reconciliation_id = $4
		WHERE id = $1
	`
	_, err := r.db.GetExecutor(ctx).Exec(ctx, query,
		txn.ID, txn.MatchedJournalEntryID, txn.Status, txn.ReconciliationID,
	)
	if err != nil {
		return fmt.Errorf("failed to update bank transaction: %w", err)
	}
	return nil
}

// --- Reconciliation Sessions ---

func (r *PostgresRepository) CreateSession(ctx context.Context, s *ReconciliationSession) error {
	if s.ID == uuid.Nil {
		s.ID = uuid.New()
	}
	s.CreatedAt = time.Now()

	query := `
		INSERT INTO reconciliation_sessions (id, bank_account_id, period_start, period_end,
			statement_balance, gl_balance, cleared_count, cleared_total,
			outstanding_count, outstanding_total, difference, status, created_at)
		VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
	`
	_, err := r.db.GetExecutor(ctx).Exec(ctx, query,
		s.ID, s.BankAccountID, s.PeriodStart, s.PeriodEnd,
		float64(s.StatementBalance)/100.0, float64(s.GLBalance)/100.0,
		s.ClearedCount, float64(s.ClearedTotal)/100.0,
		s.OutstandingCount, float64(s.OutstandingTotal)/100.0,
		float64(s.Difference)/100.0, s.Status, s.CreatedAt,
	)
	if err != nil {
		return fmt.Errorf("failed to create reconciliation session: %w", err)
	}
	return nil
}

func (r *PostgresRepository) GetSession(ctx context.Context, id uuid.UUID) (*ReconciliationSession, error) {
	query := `
		SELECT rs.id, rs.bank_account_id, ba.name as bank_account_name,
			rs.period_start, rs.period_end,
			rs.statement_balance, rs.gl_balance,
			rs.cleared_count, rs.cleared_total,
			rs.outstanding_count, rs.outstanding_total,
			rs.difference, rs.status, rs.completed_by, rs.completed_at, rs.created_at
		FROM reconciliation_sessions rs
		LEFT JOIN bank_accounts ba ON ba.id = rs.bank_account_id
		WHERE rs.id = $1
	`
	var s ReconciliationSession
	var stmtBal, glBal, clearTotal, outTotal, diff float64
	err := r.db.GetExecutor(ctx).QueryRow(ctx, query, id).Scan(
		&s.ID, &s.BankAccountID, &s.BankAccountName,
		&s.PeriodStart, &s.PeriodEnd,
		&stmtBal, &glBal,
		&s.ClearedCount, &clearTotal,
		&s.OutstandingCount, &outTotal,
		&diff, &s.Status, &s.CompletedBy, &s.CompletedAt, &s.CreatedAt,
	)
	if err != nil {
		return nil, fmt.Errorf("failed to get reconciliation session: %w", err)
	}
	s.StatementBalance = int64(stmtBal*100.0 + 0.5)
	s.GLBalance = int64(glBal*100.0 + 0.5)
	s.ClearedTotal = int64(clearTotal*100.0 + 0.5)
	s.OutstandingTotal = int64(outTotal*100.0 + 0.5)
	s.Difference = int64(diff*100.0 + 0.5)
	return &s, nil
}

func (r *PostgresRepository) UpdateSession(ctx context.Context, s *ReconciliationSession) error {
	query := `
		UPDATE reconciliation_sessions
		SET statement_balance = $2, gl_balance = $3,
			cleared_count = $4, cleared_total = $5,
			outstanding_count = $6, outstanding_total = $7,
			difference = $8, status = $9, completed_by = $10, completed_at = $11
		WHERE id = $1
	`
	_, err := r.db.GetExecutor(ctx).Exec(ctx, query,
		s.ID, float64(s.StatementBalance)/100.0, float64(s.GLBalance)/100.0,
		s.ClearedCount, float64(s.ClearedTotal)/100.0,
		s.OutstandingCount, float64(s.OutstandingTotal)/100.0,
		float64(s.Difference)/100.0, s.Status, s.CompletedBy, s.CompletedAt,
	)
	if err != nil {
		return fmt.Errorf("failed to update reconciliation session: %w", err)
	}
	return nil
}

func (r *PostgresRepository) ListSessions(ctx context.Context, bankAccountID *uuid.UUID) ([]ReconciliationSession, error) {
	query := `
		SELECT rs.id, rs.bank_account_id, COALESCE(ba.name, '') as bank_account_name,
			rs.period_start, rs.period_end,
			rs.statement_balance, rs.gl_balance,
			rs.cleared_count, rs.cleared_total,
			rs.outstanding_count, rs.outstanding_total,
			rs.difference, rs.status, rs.created_at
		FROM reconciliation_sessions rs
		LEFT JOIN bank_accounts ba ON ba.id = rs.bank_account_id
		WHERE ($1::uuid IS NULL OR rs.bank_account_id = $1)
		ORDER BY rs.created_at DESC
	`
	rows, err := r.db.GetExecutor(ctx).Query(ctx, query, bankAccountID)
	if err != nil {
		return nil, fmt.Errorf("failed to list sessions: %w", err)
	}
	defer rows.Close()

	var sessions []ReconciliationSession
	for rows.Next() {
		var s ReconciliationSession
		var stmtBal, glBal, clearTotal, outTotal, diff float64
		if err := rows.Scan(
			&s.ID, &s.BankAccountID, &s.BankAccountName,
			&s.PeriodStart, &s.PeriodEnd,
			&stmtBal, &glBal,
			&s.ClearedCount, &clearTotal,
			&s.OutstandingCount, &outTotal,
			&diff, &s.Status, &s.CreatedAt,
		); err != nil {
			return nil, fmt.Errorf("failed to scan session: %w", err)
		}
		s.StatementBalance = int64(stmtBal*100.0 + 0.5)
		s.GLBalance = int64(glBal*100.0 + 0.5)
		s.ClearedTotal = int64(clearTotal*100.0 + 0.5)
		s.OutstandingTotal = int64(outTotal*100.0 + 0.5)
		s.Difference = int64(diff*100.0 + 0.5)
		sessions = append(sessions, s)
	}
	return sessions, nil
}
