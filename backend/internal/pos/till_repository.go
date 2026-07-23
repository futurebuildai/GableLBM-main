package pos

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/google/uuid"
)

// TillAggregate is the raw sums for a session's completed sales.
type TillAggregate struct {
	SaleCount        int
	SalesTotal       int64 // Cents
	TaxTotal         int64 // Cents
	ChangeGiven      int64 // Cents
	TenderedByMethod map[string]int64
}

func (r *PostgresRepository) CreateTillSession(ctx context.Context, s *TillSession) error {
	if s.ID == uuid.Nil {
		s.ID = uuid.New()
	}
	s.OpenedAt = time.Now()
	// Resolve the register's branch first (same pattern as CreateTransaction;
	// reusing a parameter inside a subquery trips PG's type inference).
	if s.BranchID == nil {
		var registerBranch *uuid.UUID
		err := r.db.GetExecutor(ctx).QueryRow(ctx,
			`SELECT l.branch_id
			 FROM pos_registers r
			 LEFT JOIN locations l ON l.id = r.location_id
			 WHERE r.id = $1`, s.RegisterID).Scan(&registerBranch)
		if err != nil {
			return fmt.Errorf("failed to resolve register branch for till: %w", err)
		}
		s.BranchID = registerBranch
	}

	query := `
		INSERT INTO till_sessions (id, register_id, branch_id, cashier_id, status, opening_float, opened_at)
		VALUES ($1, $2, $3, $4, $5, $6, $7)
	`
	_, err := r.db.GetExecutor(ctx).Exec(ctx, query,
		s.ID, s.RegisterID, s.BranchID, s.CashierID, s.Status,
		float64(s.OpeningFloat)/100.0, s.OpenedAt,
	)
	if err != nil {
		return fmt.Errorf("failed to open till session: %w", err)
	}
	return nil
}

func (r *PostgresRepository) scanTillSession(row pgx.Row) (*TillSession, error) {
	var s TillSession
	var openingFloat float64
	var overShort *float64
	var expectedJSON, countedJSON []byte
	err := row.Scan(
		&s.ID, &s.RegisterID, &s.BranchID, &s.CashierID, &s.Status,
		&openingFloat, &s.OpenedAt, &s.ClosedAt,
		&expectedJSON, &countedJSON, &overShort, &s.GLEntryID, &s.Notes,
	)
	if err != nil {
		return nil, err
	}
	s.OpeningFloat = int64(openingFloat*100.0 + 0.5)
	if overShort != nil {
		cents := int64(*overShort * 100.0)
		if *overShort >= 0 {
			cents = int64(*overShort*100.0 + 0.5)
		} else {
			cents = int64(*overShort*100.0 - 0.5)
		}
		s.OverShort = &cents
	}
	if len(expectedJSON) > 0 {
		_ = json.Unmarshal(expectedJSON, &s.ExpectedByMethod)
	}
	if len(countedJSON) > 0 {
		_ = json.Unmarshal(countedJSON, &s.CountedByMethod)
	}
	return &s, nil
}

const tillSessionColumns = `id, register_id, branch_id, cashier_id, status, opening_float, opened_at, closed_at, expected_by_method, counted_by_method, over_short, gl_entry_id, notes`

func (r *PostgresRepository) GetTillSession(ctx context.Context, id uuid.UUID) (*TillSession, error) {
	row := r.db.GetExecutor(ctx).QueryRow(ctx,
		`SELECT `+tillSessionColumns+` FROM till_sessions WHERE id = $1`, id)
	s, err := r.scanTillSession(row)
	if err != nil {
		return nil, fmt.Errorf("failed to get till session: %w", err)
	}
	return s, nil
}

// GetOpenTillSession returns the register's OPEN session, or (nil, nil).
func (r *PostgresRepository) GetOpenTillSession(ctx context.Context, registerID string) (*TillSession, error) {
	row := r.db.GetExecutor(ctx).QueryRow(ctx,
		`SELECT `+tillSessionColumns+` FROM till_sessions WHERE register_id = $1 AND status = 'OPEN'`, registerID)
	s, err := r.scanTillSession(row)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, nil
		}
		return nil, fmt.Errorf("failed to get open till session: %w", err)
	}
	return s, nil
}

func (r *PostgresRepository) CloseTillSession(ctx context.Context, s *TillSession) error {
	expectedJSON, err := json.Marshal(s.ExpectedByMethod)
	if err != nil {
		return fmt.Errorf("failed to marshal expected_by_method: %w", err)
	}
	countedJSON, err := json.Marshal(s.CountedByMethod)
	if err != nil {
		return fmt.Errorf("failed to marshal counted_by_method: %w", err)
	}
	var overShortDollars *float64
	if s.OverShort != nil {
		v := float64(*s.OverShort) / 100.0
		overShortDollars = &v
	}
	tag, err := r.db.GetExecutor(ctx).Exec(ctx, `
		UPDATE till_sessions
		SET status = $2, closed_at = $3, expected_by_method = $4::jsonb,
		    counted_by_method = $5::jsonb, over_short = $6, notes = $7
		WHERE id = $1 AND status = 'OPEN'`,
		s.ID, s.Status, s.ClosedAt, expectedJSON, countedJSON, overShortDollars, s.Notes,
	)
	if err != nil {
		return fmt.Errorf("failed to close till session: %w", err)
	}
	if tag.RowsAffected() == 0 {
		return fmt.Errorf("till session %s is not open", s.ID)
	}
	return nil
}

// SetTillSessionGLEntry links a closed session to its over/short journal entry.
func (r *PostgresRepository) SetTillSessionGLEntry(ctx context.Context, sessionID, glEntryID uuid.UUID) error {
	_, err := r.db.GetExecutor(ctx).Exec(ctx,
		`UPDATE till_sessions SET gl_entry_id = $2 WHERE id = $1`, sessionID, glEntryID)
	if err != nil {
		return fmt.Errorf("failed to link till session to GL entry: %w", err)
	}
	return nil
}

// AggregateTillSession sums the session's completed sales and tenders.
func (r *PostgresRepository) AggregateTillSession(ctx context.Context, sessionID uuid.UUID) (*TillAggregate, error) {
	agg := &TillAggregate{TenderedByMethod: map[string]int64{}}

	var salesTotal, taxTotal, changeGiven float64
	err := r.db.GetExecutor(ctx).QueryRow(ctx, `
		SELECT COUNT(*), COALESCE(SUM(total), 0), COALESCE(SUM(tax_amount), 0), COALESCE(SUM(change_due), 0)
		FROM pos_transactions
		WHERE till_session_id = $1 AND status = 'COMPLETED'`, sessionID,
	).Scan(&agg.SaleCount, &salesTotal, &taxTotal, &changeGiven)
	if err != nil {
		return nil, fmt.Errorf("failed to aggregate till sales: %w", err)
	}
	agg.SalesTotal = int64(salesTotal*100.0 + 0.5)
	agg.TaxTotal = int64(taxTotal*100.0 + 0.5)
	agg.ChangeGiven = int64(changeGiven*100.0 + 0.5)

	rows, err := r.db.GetExecutor(ctx).Query(ctx, `
		SELECT t.method, COALESCE(SUM(t.amount), 0)
		FROM pos_tenders t
		JOIN pos_transactions x ON x.id = t.transaction_id
		WHERE x.till_session_id = $1 AND x.status = 'COMPLETED'
		GROUP BY t.method`, sessionID)
	if err != nil {
		return nil, fmt.Errorf("failed to aggregate till tenders: %w", err)
	}
	defer rows.Close()
	for rows.Next() {
		var method string
		var amount float64
		if err := rows.Scan(&method, &amount); err != nil {
			return nil, fmt.Errorf("failed to scan till tender aggregate: %w", err)
		}
		agg.TenderedByMethod[method] = int64(amount*100.0 + 0.5)
	}
	return agg, rows.Err()
}

// --- Z-reports ---

func (r *PostgresRepository) CreateZReport(ctx context.Context, z *ZReport) error {
	if z.ID == uuid.Nil {
		z.ID = uuid.New()
	}
	_, err := r.db.GetExecutor(ctx).Exec(ctx, `
		INSERT INTO till_z_reports (id, till_session_id, register_id, branch_id, over_short, payload)
		VALUES ($1, $2, $3, $4, $5, $6::jsonb)
		ON CONFLICT (till_session_id) DO NOTHING`,
		z.ID, z.TillSessionID, z.RegisterID, z.BranchID, float64(z.OverShort)/100.0, string(z.Payload))
	if err != nil {
		return fmt.Errorf("failed to create Z-report: %w", err)
	}
	return nil
}

func (r *PostgresRepository) scanZReport(row pgx.Row) (*ZReport, error) {
	var z ZReport
	var overShort float64
	var payload []byte
	if err := row.Scan(&z.ID, &z.TillSessionID, &z.RegisterID, &z.BranchID, &overShort, &payload, &z.GeneratedAt); err != nil {
		return nil, err
	}
	if overShort >= 0 {
		z.OverShort = int64(overShort*100.0 + 0.5)
	} else {
		z.OverShort = int64(overShort*100.0 - 0.5)
	}
	z.Payload = payload
	return &z, nil
}

const zReportColumns = `id, till_session_id, register_id, branch_id, over_short, payload, generated_at`

func (r *PostgresRepository) GetZReportBySession(ctx context.Context, sessionID uuid.UUID) (*ZReport, error) {
	row := r.db.GetExecutor(ctx).QueryRow(ctx,
		`SELECT `+zReportColumns+` FROM till_z_reports WHERE till_session_id = $1`, sessionID)
	z, err := r.scanZReport(row)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, fmt.Errorf("no Z-report for session %s (not closed?)", sessionID)
		}
		return nil, fmt.Errorf("failed to get Z-report: %w", err)
	}
	return z, nil
}

func (r *PostgresRepository) ListZReports(ctx context.Context, registerID string, date time.Time) ([]ZReport, error) {
	q := `SELECT ` + zReportColumns + ` FROM till_z_reports WHERE ($1 = '' OR register_id = $1)`
	args := []any{registerID}
	if !date.IsZero() {
		start := time.Date(date.Year(), date.Month(), date.Day(), 0, 0, 0, 0, date.Location())
		q += ` AND generated_at >= $2 AND generated_at < $3`
		args = append(args, start, start.Add(24*time.Hour))
	}
	q += ` ORDER BY generated_at DESC`
	rows, err := r.db.GetExecutor(ctx).Query(ctx, q, args...)
	if err != nil {
		return nil, fmt.Errorf("failed to list Z-reports: %w", err)
	}
	defer rows.Close()
	var out []ZReport
	for rows.Next() {
		z, err := r.scanZReport(rows)
		if err != nil {
			return nil, fmt.Errorf("failed to scan Z-report: %w", err)
		}
		out = append(out, *z)
	}
	return out, rows.Err()
}
