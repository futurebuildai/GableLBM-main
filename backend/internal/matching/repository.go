package matching

import (
	"context"
	"fmt"
	"time"

	"github.com/gablelbm/gable/pkg/database"
	"github.com/google/uuid"
)

// Repository defines the data access interface for PO matching.
type Repository interface {
	// Match Results
	CreateMatchResult(ctx context.Context, m *MatchResult) error
	GetMatchResult(ctx context.Context, poID uuid.UUID) (*MatchResult, error)
	UpdateMatchResult(ctx context.Context, m *MatchResult) error
	ListExceptions(ctx context.Context) ([]MatchException, error)

	// Match Line Details
	CreateMatchLineDetail(ctx context.Context, d *MatchLineDetail) error
	GetMatchLineDetails(ctx context.Context, matchResultID uuid.UUID) ([]MatchLineDetail, error)
	DeleteMatchLineDetails(ctx context.Context, matchResultID uuid.UUID) error

	// Config
	GetConfig(ctx context.Context) (*MatchConfig, error)
	UpdateConfig(ctx context.Context, cfg *MatchConfig) error
}

// PostgresRepository implements Repository with Postgres.
type PostgresRepository struct {
	db *database.DB
}

// NewRepository creates a new matching repository.
func NewRepository(db *database.DB) *PostgresRepository {
	return &PostgresRepository{db: db}
}

func (r *PostgresRepository) CreateMatchResult(ctx context.Context, m *MatchResult) error {
	if m.ID == uuid.Nil {
		m.ID = uuid.New()
	}
	m.CreatedAt = time.Now()

	query := `
		INSERT INTO po_match_results (id, po_id, vendor_invoice_id, status, matched_at, matched_by, notes, created_at)
		VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
	`
	_, err := r.db.GetExecutor(ctx).Exec(ctx, query,
		m.ID, m.POID, m.VendorInvoiceID, m.Status, m.MatchedAt, m.MatchedBy, m.Notes, m.CreatedAt,
	)
	if err != nil {
		return fmt.Errorf("failed to create match result: %w", err)
	}
	return nil
}

func (r *PostgresRepository) GetMatchResult(ctx context.Context, poID uuid.UUID) (*MatchResult, error) {
	query := `
		SELECT id, po_id, vendor_invoice_id, status, matched_at, matched_by,
			COALESCE(notes, '') as notes, created_at
		FROM po_match_results
		WHERE po_id = $1
		ORDER BY created_at DESC
		LIMIT 1
	`
	var m MatchResult
	err := r.db.GetExecutor(ctx).QueryRow(ctx, query, poID).Scan(
		&m.ID, &m.POID, &m.VendorInvoiceID, &m.Status, &m.MatchedAt, &m.MatchedBy,
		&m.Notes, &m.CreatedAt,
	)
	if err != nil {
		return nil, fmt.Errorf("failed to get match result: %w", err)
	}
	return &m, nil
}

func (r *PostgresRepository) UpdateMatchResult(ctx context.Context, m *MatchResult) error {
	query := `
		UPDATE po_match_results
		SET status = $2, matched_at = $3, matched_by = $4, notes = $5, vendor_invoice_id = $6
		WHERE id = $1
	`
	_, err := r.db.GetExecutor(ctx).Exec(ctx, query,
		m.ID, m.Status, m.MatchedAt, m.MatchedBy, m.Notes, m.VendorInvoiceID,
	)
	if err != nil {
		return fmt.Errorf("failed to update match result: %w", err)
	}
	return nil
}

func (r *PostgresRepository) ListExceptions(ctx context.Context) ([]MatchException, error) {
	query := `
		SELECT mr.id, mr.po_id, mr.vendor_invoice_id, mr.status, COALESCE(mr.notes, '') as notes, mr.created_at,
			COUNT(mld.id) as line_count,
			COUNT(CASE WHEN mld.line_status = 'EXCEPTION' THEN 1 END) as exception_count
		FROM po_match_results mr
		LEFT JOIN po_match_line_details mld ON mld.match_result_id = mr.id
		WHERE mr.status IN ('EXCEPTION', 'PARTIAL')
		GROUP BY mr.id, mr.po_id, mr.vendor_invoice_id, mr.status, mr.notes, mr.created_at
		ORDER BY mr.created_at DESC
	`
	rows, err := r.db.GetExecutor(ctx).Query(ctx, query)
	if err != nil {
		return nil, fmt.Errorf("failed to list exceptions: %w", err)
	}
	defer rows.Close()

	var exceptions []MatchException
	for rows.Next() {
		var e MatchException
		if err := rows.Scan(
			&e.MatchResultID, &e.POID, &e.VendorInvoiceID, &e.Status, &e.Notes, &e.CreatedAt,
			&e.LineCount, &e.ExceptionCount,
		); err != nil {
			return nil, fmt.Errorf("failed to scan exception: %w", err)
		}
		exceptions = append(exceptions, e)
	}
	return exceptions, nil
}

func (r *PostgresRepository) CreateMatchLineDetail(ctx context.Context, d *MatchLineDetail) error {
	if d.ID == uuid.Nil {
		d.ID = uuid.New()
	}
	d.CreatedAt = time.Now()

	query := `
		INSERT INTO po_match_line_details (id, match_result_id, po_line_id, description,
			po_qty, received_qty, invoiced_qty, po_unit_cost, invoice_unit_price,
			qty_variance_pct, price_variance_pct, line_status, created_at)
		VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
	`
	_, err := r.db.GetExecutor(ctx).Exec(ctx, query,
		d.ID, d.MatchResultID, d.POLineID, d.Description,
		d.POQty, d.ReceivedQty, d.InvoicedQty,
		float64(d.POUnitCost)/100.0, float64(d.InvoiceUnitPrice)/100.0,
		d.QtyVariancePct, d.PriceVariancePct, d.LineStatus, d.CreatedAt,
	)
	if err != nil {
		return fmt.Errorf("failed to create match line detail: %w", err)
	}
	return nil
}

func (r *PostgresRepository) GetMatchLineDetails(ctx context.Context, matchResultID uuid.UUID) ([]MatchLineDetail, error) {
	query := `
		SELECT id, match_result_id, po_line_id, description,
			po_qty, received_qty, invoiced_qty, po_unit_cost, invoice_unit_price,
			qty_variance_pct, price_variance_pct, line_status, created_at
		FROM po_match_line_details
		WHERE match_result_id = $1
		ORDER BY created_at ASC
	`
	rows, err := r.db.GetExecutor(ctx).Query(ctx, query, matchResultID)
	if err != nil {
		return nil, fmt.Errorf("failed to get match line details: %w", err)
	}
	defer rows.Close()

	var details []MatchLineDetail
	for rows.Next() {
		var d MatchLineDetail
		var poUnitCost, invoiceUnitPrice float64
		if err := rows.Scan(
			&d.ID, &d.MatchResultID, &d.POLineID, &d.Description,
			&d.POQty, &d.ReceivedQty, &d.InvoicedQty,
			&poUnitCost, &invoiceUnitPrice,
			&d.QtyVariancePct, &d.PriceVariancePct, &d.LineStatus, &d.CreatedAt,
		); err != nil {
			return nil, fmt.Errorf("failed to scan match line detail: %w", err)
		}
		d.POUnitCost = int64(poUnitCost*100.0 + 0.5)
		d.InvoiceUnitPrice = int64(invoiceUnitPrice*100.0 + 0.5)
		details = append(details, d)
	}
	return details, nil
}

func (r *PostgresRepository) DeleteMatchLineDetails(ctx context.Context, matchResultID uuid.UUID) error {
	query := `DELETE FROM po_match_line_details WHERE match_result_id = $1`
	_, err := r.db.GetExecutor(ctx).Exec(ctx, query, matchResultID)
	if err != nil {
		return fmt.Errorf("failed to delete match line details: %w", err)
	}
	return nil
}

func (r *PostgresRepository) GetConfig(ctx context.Context) (*MatchConfig, error) {
	query := `
		SELECT id, qty_tolerance_pct, price_tolerance_pct, dollar_tolerance,
			auto_approve_on_match, updated_at
		FROM po_match_config
		LIMIT 1
	`
	var cfg MatchConfig
	var dollarTolerance float64
	err := r.db.GetExecutor(ctx).QueryRow(ctx, query).Scan(
		&cfg.ID, &cfg.QtyTolerancePct, &cfg.PriceTolerancePct,
		&dollarTolerance, &cfg.AutoApproveOnMatch, &cfg.UpdatedAt,
	)
	if err != nil {
		return nil, fmt.Errorf("failed to get match config: %w", err)
	}
	cfg.DollarTolerance = int64(dollarTolerance*100.0 + 0.5)
	return &cfg, nil
}

func (r *PostgresRepository) UpdateConfig(ctx context.Context, cfg *MatchConfig) error {
	cfg.UpdatedAt = time.Now()
	query := `
		UPDATE po_match_config
		SET qty_tolerance_pct = $2, price_tolerance_pct = $3, dollar_tolerance = $4,
			auto_approve_on_match = $5, updated_at = $6
		WHERE id = $1
	`
	_, err := r.db.GetExecutor(ctx).Exec(ctx, query,
		cfg.ID, cfg.QtyTolerancePct, cfg.PriceTolerancePct,
		float64(cfg.DollarTolerance)/100.0, cfg.AutoApproveOnMatch, cfg.UpdatedAt,
	)
	if err != nil {
		return fmt.Errorf("failed to update match config: %w", err)
	}
	return nil
}
