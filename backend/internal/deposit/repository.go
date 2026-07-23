package deposit

import (
	"context"
	"fmt"
	"time"

	"github.com/gablelbm/gable/pkg/database"
	"github.com/google/uuid"
)

// Repository persists customer deposits and their applications. Money is
// stored NUMERIC(12,2) dollars in the DB and int64 cents in app code.
type Repository interface {
	Create(ctx context.Context, d *CustomerDeposit) error
	Get(ctx context.Context, id uuid.UUID) (*CustomerDeposit, error)
	ListByCustomer(ctx context.Context, customerID uuid.UUID) ([]CustomerDeposit, error)
	// RecordApplication inserts the application row and advances the parent
	// deposit's applied_amount/status in one call (run within the caller's tx).
	RecordApplication(ctx context.Context, app *DepositApplication, newApplied int64, newStatus string) error
	OpenBalance(ctx context.Context, customerID uuid.UUID) (int64, error)
}

type PostgresRepository struct{ db *database.DB }

func NewRepository(db *database.DB) *PostgresRepository { return &PostgresRepository{db: db} }

func (r *PostgresRepository) Create(ctx context.Context, d *CustomerDeposit) error {
	if d.ID == uuid.Nil {
		d.ID = uuid.New()
	}
	now := time.Now()
	d.CreatedAt = now
	d.UpdatedAt = now
	_, err := r.db.GetExecutor(ctx).Exec(ctx, `
		INSERT INTO customer_deposits
			(id, customer_id, branch_id, amount, applied_amount, status, method, reference, note, gl_entry_id, created_at, updated_at)
		VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)`,
		d.ID, d.CustomerID, d.BranchID,
		float64(d.Amount)/100.0, float64(d.AppliedAmount)/100.0,
		d.Status, d.Method, d.Reference, d.Note, d.GLEntryID, d.CreatedAt, d.UpdatedAt,
	)
	if err != nil {
		return fmt.Errorf("failed to create customer deposit: %w", err)
	}
	return nil
}

const depositColumns = `id, customer_id, branch_id, amount, applied_amount, status, method, reference, note, gl_entry_id, created_at, updated_at`

func (r *PostgresRepository) scan(row interface {
	Scan(dest ...any) error
}) (*CustomerDeposit, error) {
	var d CustomerDeposit
	var amount, applied float64
	if err := row.Scan(
		&d.ID, &d.CustomerID, &d.BranchID, &amount, &applied, &d.Status,
		&d.Method, &d.Reference, &d.Note, &d.GLEntryID, &d.CreatedAt, &d.UpdatedAt,
	); err != nil {
		return nil, err
	}
	d.Amount = int64(amount*100.0 + 0.5)
	d.AppliedAmount = int64(applied*100.0 + 0.5)
	d.Remaining = d.Amount - d.AppliedAmount
	return &d, nil
}

func (r *PostgresRepository) Get(ctx context.Context, id uuid.UUID) (*CustomerDeposit, error) {
	row := r.db.GetExecutor(ctx).QueryRow(ctx,
		`SELECT `+depositColumns+` FROM customer_deposits WHERE id = $1`, id)
	d, err := r.scan(row)
	if err != nil {
		return nil, fmt.Errorf("failed to get customer deposit: %w", err)
	}
	return d, nil
}

func (r *PostgresRepository) ListByCustomer(ctx context.Context, customerID uuid.UUID) ([]CustomerDeposit, error) {
	rows, err := r.db.GetExecutor(ctx).Query(ctx,
		`SELECT `+depositColumns+` FROM customer_deposits WHERE customer_id = $1 ORDER BY created_at DESC`, customerID)
	if err != nil {
		return nil, fmt.Errorf("failed to list customer deposits: %w", err)
	}
	defer rows.Close()
	var out []CustomerDeposit
	for rows.Next() {
		d, err := r.scan(rows)
		if err != nil {
			return nil, fmt.Errorf("failed to scan customer deposit: %w", err)
		}
		out = append(out, *d)
	}
	return out, rows.Err()
}

func (r *PostgresRepository) RecordApplication(ctx context.Context, app *DepositApplication, newApplied int64, newStatus string) error {
	if app.ID == uuid.Nil {
		app.ID = uuid.New()
	}
	app.CreatedAt = time.Now()
	if _, err := r.db.GetExecutor(ctx).Exec(ctx, `
		INSERT INTO customer_deposit_applications
			(id, deposit_id, customer_id, amount, invoice_id, gl_entry_id, created_at)
		VALUES ($1,$2,$3,$4,$5,$6,$7)`,
		app.ID, app.DepositID, app.CustomerID, float64(app.Amount)/100.0, app.InvoiceID, app.GLEntryID, app.CreatedAt,
	); err != nil {
		return fmt.Errorf("failed to record deposit application: %w", err)
	}
	if _, err := r.db.GetExecutor(ctx).Exec(ctx, `
		UPDATE customer_deposits
		SET applied_amount = $2, status = $3, updated_at = NOW()
		WHERE id = $1`,
		app.DepositID, float64(newApplied)/100.0, newStatus,
	); err != nil {
		return fmt.Errorf("failed to advance deposit after application: %w", err)
	}
	return nil
}

func (r *PostgresRepository) OpenBalance(ctx context.Context, customerID uuid.UUID) (int64, error) {
	var dollars float64
	err := r.db.GetExecutor(ctx).QueryRow(ctx, `
		SELECT COALESCE(SUM(amount - applied_amount), 0)
		FROM customer_deposits
		WHERE customer_id = $1 AND status = 'OPEN'`, customerID).Scan(&dollars)
	if err != nil {
		return 0, fmt.Errorf("failed to compute open deposit balance: %w", err)
	}
	return int64(dollars*100.0 + 0.5), nil
}
