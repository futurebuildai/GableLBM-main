package pos

import (
	"context"
	"errors"
	"fmt"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/google/uuid"
)

// GetRegisterBranch resolves a register's branch (via its assigned location).
// Returns (nil, nil) when the register has no location/branch mapping.
func (r *PostgresRepository) GetRegisterBranch(ctx context.Context, registerID string) (*uuid.UUID, error) {
	var branchID *uuid.UUID
	err := r.db.GetExecutor(ctx).QueryRow(ctx,
		`SELECT l.branch_id
		 FROM pos_registers r
		 LEFT JOIN locations l ON l.id = r.location_id
		 WHERE r.id = $1`, registerID).Scan(&branchID)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, nil
		}
		return nil, fmt.Errorf("failed to resolve register branch: %w", err)
	}
	return branchID, nil
}

// CreateReturn inserts a return and its lines. Money is stored NUMERIC(12,2)
// dollars (POS convention); the header and lines persist atomically within the
// caller's transaction.
func (r *PostgresRepository) CreateReturn(ctx context.Context, ret *POSReturn) error {
	if ret.ID == uuid.Nil {
		ret.ID = uuid.New()
	}
	ret.CreatedAt = time.Now()

	_, err := r.db.GetExecutor(ctx).Exec(ctx, `
		INSERT INTO pos_returns
			(id, register_id, till_session_id, original_transaction_id, customer_id, branch_id,
			 cashier_id, subtotal, tax_amount, total, refund_method, reason, status, created_at)
		VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)`,
		ret.ID, ret.RegisterID, ret.TillSessionID, ret.OriginalTransactionID, ret.CustomerID, ret.BranchID,
		ret.CashierID,
		float64(ret.Subtotal)/100.0, float64(ret.TaxAmount)/100.0, float64(ret.Total)/100.0,
		ret.RefundMethod, ret.Reason, ret.Status, ret.CreatedAt,
	)
	if err != nil {
		return fmt.Errorf("failed to create return: %w", err)
	}

	for i := range ret.Lines {
		l := &ret.Lines[i]
		if l.ID == uuid.Nil {
			l.ID = uuid.New()
		}
		l.ReturnID = ret.ID
		_, err := r.db.GetExecutor(ctx).Exec(ctx, `
			INSERT INTO pos_return_lines
				(id, return_id, product_id, description, quantity, uom, unit_price, line_total, restock)
			VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
			l.ID, l.ReturnID, l.ProductID, l.Description, l.Quantity, l.UOM,
			float64(l.UnitPrice)/100.0, float64(l.LineTotal)/100.0, l.Restock,
		)
		if err != nil {
			return fmt.Errorf("failed to create return line: %w", err)
		}
	}
	return nil
}

// SetReturnGLEntry links a return to its reversal journal entry.
func (r *PostgresRepository) SetReturnGLEntry(ctx context.Context, returnID, glEntryID uuid.UUID) error {
	_, err := r.db.GetExecutor(ctx).Exec(ctx,
		`UPDATE pos_returns SET gl_entry_id = $2 WHERE id = $1`, returnID, glEntryID)
	if err != nil {
		return fmt.Errorf("failed to link return to GL entry: %w", err)
	}
	return nil
}

const returnColumns = `id, register_id, till_session_id, original_transaction_id, customer_id, branch_id, cashier_id, subtotal, tax_amount, total, refund_method, reason, status, gl_entry_id, created_at`

func (r *PostgresRepository) scanReturn(row pgx.Row) (*POSReturn, error) {
	var ret POSReturn
	var subtotal, taxAmount, total float64
	if err := row.Scan(
		&ret.ID, &ret.RegisterID, &ret.TillSessionID, &ret.OriginalTransactionID, &ret.CustomerID, &ret.BranchID,
		&ret.CashierID, &subtotal, &taxAmount, &total, &ret.RefundMethod, &ret.Reason, &ret.Status,
		&ret.GLEntryID, &ret.CreatedAt,
	); err != nil {
		return nil, err
	}
	ret.Subtotal = int64(subtotal*100.0 + 0.5)
	ret.TaxAmount = int64(taxAmount*100.0 + 0.5)
	ret.Total = int64(total*100.0 + 0.5)
	return &ret, nil
}

func (r *PostgresRepository) GetReturn(ctx context.Context, id uuid.UUID) (*POSReturn, error) {
	row := r.db.GetExecutor(ctx).QueryRow(ctx,
		`SELECT `+returnColumns+` FROM pos_returns WHERE id = $1`, id)
	ret, err := r.scanReturn(row)
	if err != nil {
		return nil, fmt.Errorf("failed to get return: %w", err)
	}
	lines, err := r.getReturnLines(ctx, id)
	if err != nil {
		return nil, err
	}
	ret.Lines = lines
	return ret, nil
}

func (r *PostgresRepository) getReturnLines(ctx context.Context, returnID uuid.UUID) ([]POSReturnLine, error) {
	rows, err := r.db.GetExecutor(ctx).Query(ctx, `
		SELECT id, return_id, product_id, description, quantity, uom, unit_price, line_total, restock
		FROM pos_return_lines WHERE return_id = $1 ORDER BY id`, returnID)
	if err != nil {
		return nil, fmt.Errorf("failed to get return lines: %w", err)
	}
	defer rows.Close()
	var out []POSReturnLine
	for rows.Next() {
		var l POSReturnLine
		var unitPrice, lineTotal float64
		if err := rows.Scan(&l.ID, &l.ReturnID, &l.ProductID, &l.Description, &l.Quantity, &l.UOM, &unitPrice, &lineTotal, &l.Restock); err != nil {
			return nil, fmt.Errorf("failed to scan return line: %w", err)
		}
		l.UnitPrice = int64(unitPrice*100.0 + 0.5)
		l.LineTotal = int64(lineTotal*100.0 + 0.5)
		out = append(out, l)
	}
	return out, rows.Err()
}

func (r *PostgresRepository) ListReturns(ctx context.Context, registerID string, date time.Time) ([]POSReturn, error) {
	q := `SELECT ` + returnColumns + ` FROM pos_returns WHERE ($1 = '' OR register_id = $1)`
	args := []any{registerID}
	if !date.IsZero() {
		start := time.Date(date.Year(), date.Month(), date.Day(), 0, 0, 0, 0, date.Location())
		q += ` AND created_at >= $2 AND created_at < $3`
		args = append(args, start, start.Add(24*time.Hour))
	}
	q += ` ORDER BY created_at DESC`
	rows, err := r.db.GetExecutor(ctx).Query(ctx, q, args...)
	if err != nil {
		return nil, fmt.Errorf("failed to list returns: %w", err)
	}
	defer rows.Close()
	var out []POSReturn
	for rows.Next() {
		ret, err := r.scanReturn(rows)
		if err != nil {
			return nil, fmt.Errorf("failed to scan return: %w", err)
		}
		out = append(out, *ret)
	}
	return out, rows.Err()
}
