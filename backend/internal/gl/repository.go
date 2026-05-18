package gl

import (
	"context"
	"fmt"
	"time"

	"github.com/gablelbm/gable/pkg/database"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
)

// Repository defines the data access interface for the GL module.
type Repository interface {
	// Accounts
	ListAccounts(ctx context.Context) ([]GLAccount, error)
	GetAccount(ctx context.Context, id uuid.UUID) (*GLAccount, error)
	CreateAccount(ctx context.Context, acct *GLAccount) error
	UpdateAccount(ctx context.Context, acct *GLAccount) error

	// Journal Entries
	CreateJournalEntry(ctx context.Context, entry *JournalEntry) error
	GetJournalEntry(ctx context.Context, id uuid.UUID) (*JournalEntry, error)
	ListJournalEntries(ctx context.Context) ([]JournalEntry, error)
	UpdateJournalEntryStatus(ctx context.Context, id uuid.UUID, status string, postedBy string) error

	// Trial Balance
	GetTrialBalance(ctx context.Context, asOfDate time.Time) ([]TrialBalanceRow, error)

	// Fiscal Periods
	ListFiscalPeriods(ctx context.Context) ([]FiscalPeriod, error)
	GetFiscalPeriodForDate(ctx context.Context, date time.Time) (*FiscalPeriod, error)
	CloseFiscalPeriod(ctx context.Context, id uuid.UUID, closedBy string) error
}

// PostgresRepository implements Repository backed by PostgreSQL.
type PostgresRepository struct {
	db *database.DB
}

// NewRepository creates a new PostgresRepository.
func NewRepository(db *database.DB) *PostgresRepository {
	return &PostgresRepository{db: db}
}

// --- Accounts ---

func (r *PostgresRepository) ListAccounts(ctx context.Context) ([]GLAccount, error) {
	query := `
		SELECT a.id, a.code, a.name, a.type, COALESCE(a.subtype, ''), a.parent_id,
		       a.normal_balance, a.is_active, COALESCE(a.description, ''),
		       COALESCE(
		           (SELECT SUM(l.debit) - SUM(l.credit)
		            FROM gl_journal_lines l
		            JOIN gl_journal_entries e ON e.id = l.journal_entry_id
		            WHERE l.account_id = a.id AND e.status = 'POSTED'), 0
		       ) AS balance,
		       a.created_at, a.updated_at
		FROM gl_accounts a
		ORDER BY a.code
	`
	rows, err := r.db.GetExecutor(ctx).Query(ctx, query)
	if err != nil {
		return nil, fmt.Errorf("failed to list accounts: %w", err)
	}
	defer rows.Close()

	var accounts []GLAccount
	for rows.Next() {
		var a GLAccount
		var balanceFloat float64
		if err := rows.Scan(
			&a.ID, &a.Code, &a.Name, &a.Type, &a.Subtype, &a.ParentID,
			&a.NormalBalance, &a.IsActive, &a.Description,
			&balanceFloat,
			&a.CreatedAt, &a.UpdatedAt,
		); err != nil {
			return nil, fmt.Errorf("failed to scan account: %w", err)
		}
		a.Balance = int64(balanceFloat*100.0 + 0.5)
		accounts = append(accounts, a)
	}
	return accounts, nil
}

func (r *PostgresRepository) GetAccount(ctx context.Context, id uuid.UUID) (*GLAccount, error) {
	query := `
		SELECT a.id, a.code, a.name, a.type, COALESCE(a.subtype, ''), a.parent_id,
		       a.normal_balance, a.is_active, COALESCE(a.description, ''),
		       COALESCE(
		           (SELECT SUM(l.debit) - SUM(l.credit)
		            FROM gl_journal_lines l
		            JOIN gl_journal_entries e ON e.id = l.journal_entry_id
		            WHERE l.account_id = a.id AND e.status = 'POSTED'), 0
		       ) AS balance,
		       a.created_at, a.updated_at
		FROM gl_accounts a
		WHERE a.id = $1
	`
	var a GLAccount
	var balanceFloat float64
	err := r.db.GetExecutor(ctx).QueryRow(ctx, query, id).Scan(
		&a.ID, &a.Code, &a.Name, &a.Type, &a.Subtype, &a.ParentID,
		&a.NormalBalance, &a.IsActive, &a.Description,
		&balanceFloat,
		&a.CreatedAt, &a.UpdatedAt,
	)
	if err != nil {
		if err == pgx.ErrNoRows {
			return nil, fmt.Errorf("account not found")
		}
		return nil, fmt.Errorf("failed to get account: %w", err)
	}
	a.Balance = int64(balanceFloat*100.0 + 0.5)
	return &a, nil
}

func (r *PostgresRepository) CreateAccount(ctx context.Context, acct *GLAccount) error {
	if acct.ID == uuid.Nil {
		acct.ID = uuid.New()
	}
	now := time.Now()
	acct.CreatedAt = now
	acct.UpdatedAt = now

	query := `
		INSERT INTO gl_accounts (id, code, name, type, subtype, parent_id, normal_balance, is_active, description, created_at, updated_at)
		VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
	`
	_, err := r.db.GetExecutor(ctx).Exec(ctx, query,
		acct.ID, acct.Code, acct.Name, acct.Type, acct.Subtype,
		acct.ParentID, acct.NormalBalance, acct.IsActive, acct.Description,
		acct.CreatedAt, acct.UpdatedAt,
	)
	if err != nil {
		return fmt.Errorf("failed to create account: %w", err)
	}
	return nil
}

func (r *PostgresRepository) UpdateAccount(ctx context.Context, acct *GLAccount) error {
	acct.UpdatedAt = time.Now()
	query := `
		UPDATE gl_accounts
		SET code = $1, name = $2, type = $3, subtype = $4, parent_id = $5,
		    normal_balance = $6, is_active = $7, description = $8, updated_at = $9
		WHERE id = $10
	`
	_, err := r.db.GetExecutor(ctx).Exec(ctx, query,
		acct.Code, acct.Name, acct.Type, acct.Subtype, acct.ParentID,
		acct.NormalBalance, acct.IsActive, acct.Description, acct.UpdatedAt,
		acct.ID,
	)
	if err != nil {
		return fmt.Errorf("failed to update account: %w", err)
	}
	return nil
}

// --- Journal Entries ---

func (r *PostgresRepository) CreateJournalEntry(ctx context.Context, entry *JournalEntry) error {
	tx, err := r.db.Pool.Begin(ctx)
	if err != nil {
		return fmt.Errorf("failed to begin transaction: %w", err)
	}
	defer tx.Rollback(ctx)

	if entry.ID == uuid.Nil {
		entry.ID = uuid.New()
	}
	now := time.Now()
	entry.CreatedAt = now
	entry.UpdatedAt = now

	queryHeader := `
		INSERT INTO gl_journal_entries (id, entry_date, memo, source, source_ref_id, status, posted_by, created_at, updated_at)
		VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
		RETURNING entry_number
	`
	err = tx.QueryRow(ctx, queryHeader,
		entry.ID, entry.EntryDate, entry.Memo, entry.Source, entry.SourceRefID,
		entry.Status, entry.PostedBy, entry.CreatedAt, entry.UpdatedAt,
	).Scan(&entry.EntryNumber)
	if err != nil {
		return fmt.Errorf("failed to insert journal entry: %w", err)
	}

	queryLine := `
		INSERT INTO gl_journal_lines (id, journal_entry_id, account_id, description, debit, credit)
		VALUES ($1, $2, $3, $4, $5, $6)
	`
	for i := range entry.Lines {
		line := &entry.Lines[i]
		if line.ID == uuid.Nil {
			line.ID = uuid.New()
		}
		line.EntryID = entry.ID

		debitFloat := float64(line.Debit) / 100.0
		creditFloat := float64(line.Credit) / 100.0

		_, err = tx.Exec(ctx, queryLine,
			line.ID, line.EntryID, line.AccountID, line.Description, debitFloat, creditFloat,
		)
		if err != nil {
			return fmt.Errorf("failed to insert journal line: %w", err)
		}
	}

	return tx.Commit(ctx)
}

func (r *PostgresRepository) GetJournalEntry(ctx context.Context, id uuid.UUID) (*JournalEntry, error) {
	queryHeader := `
		SELECT id, entry_number, entry_date, memo, source, source_ref_id, status, COALESCE(posted_by, ''), created_at, updated_at
		FROM gl_journal_entries
		WHERE id = $1
	`
	var e JournalEntry
	err := r.db.GetExecutor(ctx).QueryRow(ctx, queryHeader, id).Scan(
		&e.ID, &e.EntryNumber, &e.EntryDate, &e.Memo, &e.Source,
		&e.SourceRefID, &e.Status, &e.PostedBy, &e.CreatedAt, &e.UpdatedAt,
	)
	if err != nil {
		if err == pgx.ErrNoRows {
			return nil, fmt.Errorf("journal entry not found")
		}
		return nil, fmt.Errorf("failed to get journal entry: %w", err)
	}

	queryLines := `
		SELECT l.id, l.journal_entry_id, l.account_id, COALESCE(a.code, ''), COALESCE(a.name, ''),
		       COALESCE(l.description, ''), l.debit, l.credit
		FROM gl_journal_lines l
		LEFT JOIN gl_accounts a ON a.id = l.account_id
		WHERE l.journal_entry_id = $1
		ORDER BY l.debit DESC
	`
	rows, err := r.db.GetExecutor(ctx).Query(ctx, queryLines, id)
	if err != nil {
		return nil, fmt.Errorf("failed to get journal lines: %w", err)
	}
	defer rows.Close()

	var totalDebit, totalCredit float64
	for rows.Next() {
		var l JournalLine
		var debitFloat, creditFloat float64
		if err := rows.Scan(&l.ID, &l.EntryID, &l.AccountID, &l.AccountCode, &l.AccountName, &l.Description, &debitFloat, &creditFloat); err != nil {
			return nil, fmt.Errorf("failed to scan journal line: %w", err)
		}
		l.Debit = int64(debitFloat*100.0 + 0.5)
		l.Credit = int64(creditFloat*100.0 + 0.5)
		totalDebit += debitFloat
		totalCredit += creditFloat
		e.Lines = append(e.Lines, l)
	}
	e.TotalDebit = int64(totalDebit*100.0 + 0.5)
	e.TotalCredit = int64(totalCredit*100.0 + 0.5)

	return &e, nil
}

func (r *PostgresRepository) ListJournalEntries(ctx context.Context) ([]JournalEntry, error) {
	query := `
		SELECT e.id, e.entry_number, e.entry_date, e.memo, e.source, e.source_ref_id,
		       e.status, COALESCE(e.posted_by, ''),
		       COALESCE((SELECT SUM(l.debit) FROM gl_journal_lines l WHERE l.journal_entry_id = e.id), 0) AS total_debit,
		       COALESCE((SELECT SUM(l.credit) FROM gl_journal_lines l WHERE l.journal_entry_id = e.id), 0) AS total_credit,
		       e.created_at, e.updated_at
		FROM gl_journal_entries e
		ORDER BY e.entry_date DESC, e.entry_number DESC
	`
	rows, err := r.db.GetExecutor(ctx).Query(ctx, query)
	if err != nil {
		return nil, fmt.Errorf("failed to list journal entries: %w", err)
	}
	defer rows.Close()

	var entries []JournalEntry
	for rows.Next() {
		var e JournalEntry
		var totalDebitFloat, totalCreditFloat float64
		if err := rows.Scan(
			&e.ID, &e.EntryNumber, &e.EntryDate, &e.Memo, &e.Source, &e.SourceRefID,
			&e.Status, &e.PostedBy,
			&totalDebitFloat, &totalCreditFloat,
			&e.CreatedAt, &e.UpdatedAt,
		); err != nil {
			return nil, fmt.Errorf("failed to scan journal entry: %w", err)
		}
		e.TotalDebit = int64(totalDebitFloat*100.0 + 0.5)
		e.TotalCredit = int64(totalCreditFloat*100.0 + 0.5)
		entries = append(entries, e)
	}
	return entries, nil
}

func (r *PostgresRepository) UpdateJournalEntryStatus(ctx context.Context, id uuid.UUID, status string, postedBy string) error {
	query := `UPDATE gl_journal_entries SET status = $1, posted_by = $2, updated_at = NOW() WHERE id = $3`
	_, err := r.db.GetExecutor(ctx).Exec(ctx, query, status, postedBy, id)
	if err != nil {
		return fmt.Errorf("failed to update journal entry status: %w", err)
	}
	return nil
}

// --- Trial Balance ---

func (r *PostgresRepository) GetTrialBalance(ctx context.Context, asOfDate time.Time) ([]TrialBalanceRow, error) {
	query := `
		SELECT a.id, a.code, a.name, a.type,
		       COALESCE(SUM(l.debit), 0) AS total_debit,
		       COALESCE(SUM(l.credit), 0) AS total_credit
		FROM gl_accounts a
		LEFT JOIN gl_journal_lines l ON l.account_id = a.id
		LEFT JOIN gl_journal_entries e ON e.id = l.journal_entry_id AND e.status = 'POSTED' AND e.entry_date <= $1
		WHERE a.is_active = TRUE
		GROUP BY a.id, a.code, a.name, a.type
		HAVING COALESCE(SUM(l.debit), 0) > 0 OR COALESCE(SUM(l.credit), 0) > 0
		ORDER BY a.code
	`
	rows, err := r.db.GetExecutor(ctx).Query(ctx, query, asOfDate)
	if err != nil {
		return nil, fmt.Errorf("failed to get trial balance: %w", err)
	}
	defer rows.Close()

	var result []TrialBalanceRow
	for rows.Next() {
		var row TrialBalanceRow
		var debitFloat, creditFloat float64
		if err := rows.Scan(&row.AccountID, &row.AccountCode, &row.AccountName, &row.AccountType, &debitFloat, &creditFloat); err != nil {
			return nil, fmt.Errorf("failed to scan trial balance row: %w", err)
		}
		row.Debit = int64(debitFloat*100.0 + 0.5)
		row.Credit = int64(creditFloat*100.0 + 0.5)
		result = append(result, row)
	}
	return result, nil
}

// --- Fiscal Periods ---

func (r *PostgresRepository) ListFiscalPeriods(ctx context.Context) ([]FiscalPeriod, error) {
	query := `
		SELECT id, name, start_date, end_date, status, closed_at, COALESCE(closed_by, ''), created_at
		FROM gl_fiscal_periods
		ORDER BY start_date
	`
	rows, err := r.db.GetExecutor(ctx).Query(ctx, query)
	if err != nil {
		return nil, fmt.Errorf("failed to list fiscal periods: %w", err)
	}
	defer rows.Close()

	var periods []FiscalPeriod
	for rows.Next() {
		var p FiscalPeriod
		if err := rows.Scan(&p.ID, &p.Name, &p.StartDate, &p.EndDate, &p.Status, &p.ClosedAt, &p.ClosedBy, &p.CreatedAt); err != nil {
			return nil, fmt.Errorf("failed to scan fiscal period: %w", err)
		}
		periods = append(periods, p)
	}
	return periods, nil
}

func (r *PostgresRepository) GetFiscalPeriodForDate(ctx context.Context, date time.Time) (*FiscalPeriod, error) {
	query := `
		SELECT id, name, start_date, end_date, status, closed_at, COALESCE(closed_by, ''), created_at
		FROM gl_fiscal_periods
		WHERE $1 BETWEEN start_date AND end_date
		LIMIT 1
	`
	var p FiscalPeriod
	err := r.db.GetExecutor(ctx).QueryRow(ctx, query, date).Scan(&p.ID, &p.Name, &p.StartDate, &p.EndDate, &p.Status, &p.ClosedAt, &p.ClosedBy, &p.CreatedAt)
	if err != nil {
		if err == pgx.ErrNoRows {
			return nil, nil // No fiscal period defined for this date
		}
		return nil, fmt.Errorf("failed to get fiscal period: %w", err)
	}
	return &p, nil
}

func (r *PostgresRepository) CloseFiscalPeriod(ctx context.Context, id uuid.UUID, closedBy string) error {
	query := `UPDATE gl_fiscal_periods SET status = 'CLOSED', closed_at = NOW(), closed_by = $1 WHERE id = $2 AND status = 'OPEN'`
	result, err := r.db.GetExecutor(ctx).Exec(ctx, query, closedBy, id)
	if err != nil {
		return fmt.Errorf("failed to close fiscal period: %w", err)
	}
	if result.RowsAffected() == 0 {
		return fmt.Errorf("fiscal period not found or already closed")
	}
	return nil
}
