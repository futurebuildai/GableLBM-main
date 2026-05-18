package quote

import (
	"context"
	"fmt"
	"time"

	"github.com/gablelbm/gable/pkg/database"
	"github.com/gablelbm/gable/pkg/middleware"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
)

type Repository interface {
	CreateQuote(ctx context.Context, q *Quote) error
	GetQuote(ctx context.Context, id uuid.UUID) (*Quote, error)
	UpdateQuote(ctx context.Context, q *Quote) error
	UpdateQuoteWithLines(ctx context.Context, q *Quote) error
	ListQuotes(ctx context.Context) ([]Quote, error)
	ListQuotesPaginated(ctx context.Context, limit, offset int) ([]Quote, int, error)
	ListQuotesByCustomer(ctx context.Context, customerID uuid.UUID) ([]Quote, error)
	GetQuoteAnalytics(ctx context.Context) (*QuoteAnalytics, error)
	GetOriginalFile(ctx context.Context, id uuid.UUID) ([]byte, string, string, error)
}

type PostgresRepository struct {
	db *database.DB
}

func NewRepository(db *database.DB) *PostgresRepository {
	return &PostgresRepository{db: db}
}

func (r *PostgresRepository) CreateQuote(ctx context.Context, q *Quote) error {
	if q.ID == uuid.Nil {
		q.ID = uuid.New()
	}
	if q.State == "" {
		q.State = QuoteStateDraft
	}
	now := time.Now()
	q.CreatedAt = now
	q.UpdatedAt = now

	// Set source default
	if q.Source == "" {
		q.Source = "manual"
	}
	if q.DeliveryType == "" {
		q.DeliveryType = "PICKUP"
	}

	return r.db.RunInTx(ctx, func(txCtx context.Context) error {
		exec := r.db.GetExecutor(txCtx)

		// Insert Header — branch_id falls back to default when caller hasn't set one.
		var branchArg any
		if q.BranchID != uuid.Nil {
			branchArg = q.BranchID
		} else if bid := middleware.BranchIDForQuery(txCtx); bid != nil {
			branchArg = *bid
			q.BranchID = *bid
		}
		queryHeader := `
			INSERT INTO quotes (
				id, customer_id, job_id, state, total_amount, expires_at, created_at, updated_at,
				margin_total, source, original_file, original_filename, original_content_type, parse_map,
				delivery_type, freight_amount, vehicle_id, branch_id
			) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17,
				COALESCE($18::uuid, (SELECT value::uuid FROM system_settings WHERE key = 'default_branch_id')))
		`
		_, err := exec.Exec(txCtx, queryHeader,
			q.ID, q.CustomerID, q.JobID, q.State, q.TotalAmount, q.ExpiresAt, q.CreatedAt, q.UpdatedAt,
			q.MarginTotal, q.Source, q.OriginalFile, q.OriginalFilename, q.OriginalContentType, q.ParseMap,
			q.DeliveryType, q.FreightAmount, q.VehicleID, branchArg,
		)
		if err != nil {
			return fmt.Errorf("failed to insert quote header: %w", err)
		}

		// Insert Lines
		queryLine := `
			INSERT INTO quote_lines (
				id, quote_id, product_id, sku, description, quantity, uom, unit_price, line_total, created_at
			) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
		`

		for i := range q.Lines {
			line := &q.Lines[i]
			if line.ID == uuid.Nil {
				line.ID = uuid.New()
			}
			line.QuoteID = q.ID
			line.CreatedAt = now

			_, err = exec.Exec(txCtx, queryLine,
				line.ID, line.QuoteID, line.ProductID, line.SKU, line.Description,
				line.Quantity, line.UOM, line.UnitPrice, line.LineTotal, line.CreatedAt,
			)
			if err != nil {
				return fmt.Errorf("failed to insert quote line: %w", err)
			}
		}

		return nil
	})
}

func (r *PostgresRepository) GetQuote(ctx context.Context, id uuid.UUID) (*Quote, error) {
	q := &Quote{}

	// Get Header
	branchID := middleware.BranchIDForQuery(ctx)
	queryHeader := `
		SELECT q.id, q.customer_id, COALESCE(c.name, ''), q.job_id, q.state, q.total_amount, q.expires_at, q.created_at, q.updated_at,
			q.sent_at, q.accepted_at, q.rejected_at, COALESCE(q.margin_total, 0), COALESCE(q.source, 'manual'),
			COALESCE(q.original_filename, ''), COALESCE(q.original_content_type, ''), q.parse_map,
			COALESCE(q.delivery_type, 'PICKUP'), COALESCE(q.freight_amount, 0), q.vehicle_id, COALESCE(v.name, ''), q.branch_id
		FROM quotes q
		LEFT JOIN customers c ON c.id = q.customer_id
		LEFT JOIN vehicles v ON v.id = q.vehicle_id
		WHERE q.id = $1
		  AND ($2::uuid IS NULL OR q.branch_id = $2)
	`
	err := r.db.GetExecutor(ctx).QueryRow(ctx, queryHeader, id, branchID).Scan(
		&q.ID, &q.CustomerID, &q.CustomerName, &q.JobID, &q.State, &q.TotalAmount, &q.ExpiresAt, &q.CreatedAt, &q.UpdatedAt,
		&q.SentAt, &q.AcceptedAt, &q.RejectedAt, &q.MarginTotal, &q.Source,
		&q.OriginalFilename, &q.OriginalContentType, &q.ParseMap,
		&q.DeliveryType, &q.FreightAmount, &q.VehicleID, &q.VehicleName, &q.BranchID,
	)
	if err != nil {
		if err == pgx.ErrNoRows {
			return nil, fmt.Errorf("quote not found")
		}
		return nil, fmt.Errorf("failed to get quote header: %w", err)
	}

	// Get Lines (join products for average_unit_cost)
	queryLines := `
		SELECT ql.id, ql.quote_id, ql.product_id, ql.sku, ql.description, ql.quantity, ql.uom,
		       ql.unit_price, COALESCE(p.average_unit_cost, 0), ql.line_total, ql.created_at
		FROM quote_lines ql
		LEFT JOIN products p ON p.id = ql.product_id
		WHERE ql.quote_id = $1
		ORDER BY ql.created_at ASC
	`
	rows, err := r.db.GetExecutor(ctx).Query(ctx, queryLines, id)
	if err != nil {
		return nil, fmt.Errorf("failed to get quote lines: %w", err)
	}
	defer rows.Close()

	for rows.Next() {
		var l QuoteLine
		if err := rows.Scan(
			&l.ID, &l.QuoteID, &l.ProductID, &l.SKU, &l.Description,
			&l.Quantity, &l.UOM, &l.UnitPrice, &l.UnitCost, &l.LineTotal, &l.CreatedAt,
		); err != nil {
			return nil, fmt.Errorf("failed to scan quote line: %w", err)
		}
		q.Lines = append(q.Lines, l)
	}

	return q, nil
}

func (r *PostgresRepository) UpdateQuote(ctx context.Context, q *Quote) error {
	q.UpdatedAt = time.Now()

	query := `
		UPDATE quotes
		SET customer_id = $2, job_id = $3, state = $4, total_amount = $5, expires_at = $6, updated_at = $7,
			sent_at = $8, accepted_at = $9, rejected_at = $10
		WHERE id = $1
	`
	_, err := r.db.GetExecutor(ctx).Exec(ctx, query,
		q.ID, q.CustomerID, q.JobID, q.State, q.TotalAmount, q.ExpiresAt, q.UpdatedAt,
		q.SentAt, q.AcceptedAt, q.RejectedAt,
	)
	if err != nil {
		return fmt.Errorf("failed to update quote: %w", err)
	}
	return nil
}

// UpdateQuoteWithLines replaces the quote header and all lines in a single transaction.
func (r *PostgresRepository) UpdateQuoteWithLines(ctx context.Context, q *Quote) error {
	q.UpdatedAt = time.Now()

	return r.db.RunInTx(ctx, func(txCtx context.Context) error {
		exec := r.db.GetExecutor(txCtx)

		// Update header
		headerQuery := `
			UPDATE quotes
			SET customer_id = $2, job_id = $3, state = $4, total_amount = $5, expires_at = $6, updated_at = $7,
				delivery_type = $8, freight_amount = $9, vehicle_id = $10
			WHERE id = $1
		`
		_, err := exec.Exec(txCtx, headerQuery,
			q.ID, q.CustomerID, q.JobID, q.State, q.TotalAmount, q.ExpiresAt, q.UpdatedAt,
			q.DeliveryType, q.FreightAmount, q.VehicleID,
		)
		if err != nil {
			return fmt.Errorf("failed to update quote header: %w", err)
		}

		// Delete old lines
		_, err = exec.Exec(txCtx, "DELETE FROM quote_lines WHERE quote_id = $1", q.ID)
		if err != nil {
			return fmt.Errorf("failed to delete old lines: %w", err)
		}

		// Insert new lines
		lineQuery := `
			INSERT INTO quote_lines (id, quote_id, product_id, sku, description, quantity, uom, unit_price, line_total, created_at)
			VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
		`
		now := time.Now()
		for i := range q.Lines {
			line := &q.Lines[i]
			if line.ID == uuid.Nil {
				line.ID = uuid.New()
			}
			line.QuoteID = q.ID
			if line.CreatedAt.IsZero() {
				line.CreatedAt = now
			}
			_, err = exec.Exec(txCtx, lineQuery,
				line.ID, line.QuoteID, line.ProductID, line.SKU, line.Description,
				line.Quantity, line.UOM, line.UnitPrice, line.LineTotal, line.CreatedAt,
			)
			if err != nil {
				return fmt.Errorf("failed to insert quote line: %w", err)
			}
		}

		return nil
	})
}

func (r *PostgresRepository) ListQuotes(ctx context.Context) ([]Quote, error) {
	branchID := middleware.BranchIDForQuery(ctx)
	query := `
		SELECT q.id, q.customer_id, COALESCE(c.name, ''), q.job_id, q.state, q.total_amount, q.expires_at, q.created_at, q.updated_at,
			q.sent_at, q.accepted_at, q.rejected_at, COALESCE(q.margin_total, 0), COALESCE(q.source, 'manual'),
			COALESCE(q.delivery_type, 'PICKUP'), COALESCE(q.freight_amount, 0), q.vehicle_id, COALESCE(v.name, ''), q.branch_id
		FROM quotes q
		LEFT JOIN customers c ON c.id = q.customer_id
		LEFT JOIN vehicles v ON v.id = q.vehicle_id
		WHERE ($1::uuid IS NULL OR q.branch_id = $1)
		ORDER BY q.created_at DESC
	`
	rows, err := r.db.GetExecutor(ctx).Query(ctx, query, branchID)
	if err != nil {
		return nil, fmt.Errorf("failed to list quotes: %w", err)
	}
	defer rows.Close()

	var quotes []Quote
	for rows.Next() {
		var q Quote
		if err := rows.Scan(
			&q.ID, &q.CustomerID, &q.CustomerName, &q.JobID, &q.State, &q.TotalAmount, &q.ExpiresAt, &q.CreatedAt, &q.UpdatedAt,
			&q.SentAt, &q.AcceptedAt, &q.RejectedAt, &q.MarginTotal, &q.Source,
			&q.DeliveryType, &q.FreightAmount, &q.VehicleID, &q.VehicleName, &q.BranchID,
		); err != nil {
			return nil, fmt.Errorf("failed to scan quote: %w", err)
		}
		quotes = append(quotes, q)
	}
	return quotes, nil
}

func (r *PostgresRepository) ListQuotesPaginated(ctx context.Context, limit, offset int) ([]Quote, int, error) {
	branchID := middleware.BranchIDForQuery(ctx)
	// Get total count
	countQuery := `SELECT COUNT(*) FROM quotes WHERE ($1::uuid IS NULL OR branch_id = $1)`
	var total int
	if err := r.db.GetExecutor(ctx).QueryRow(ctx, countQuery, branchID).Scan(&total); err != nil {
		return nil, 0, fmt.Errorf("failed to count quotes: %w", err)
	}

	query := `
		SELECT q.id, q.customer_id, COALESCE(c.name, ''), q.job_id, q.state, q.total_amount, q.expires_at, q.created_at, q.updated_at,
			q.sent_at, q.accepted_at, q.rejected_at, COALESCE(q.margin_total, 0), COALESCE(q.source, 'manual'),
			COALESCE(q.delivery_type, 'PICKUP'), COALESCE(q.freight_amount, 0), q.vehicle_id, COALESCE(v.name, ''), q.branch_id
		FROM quotes q
		LEFT JOIN customers c ON c.id = q.customer_id
		LEFT JOIN vehicles v ON v.id = q.vehicle_id
		WHERE ($1::uuid IS NULL OR q.branch_id = $1)
		ORDER BY q.created_at DESC
		LIMIT $2 OFFSET $3
	`
	rows, err := r.db.GetExecutor(ctx).Query(ctx, query, branchID, limit, offset)
	if err != nil {
		return nil, 0, fmt.Errorf("failed to list quotes: %w", err)
	}
	defer rows.Close()

	var quotes []Quote
	for rows.Next() {
		var q Quote
		if err := rows.Scan(
			&q.ID, &q.CustomerID, &q.CustomerName, &q.JobID, &q.State, &q.TotalAmount, &q.ExpiresAt, &q.CreatedAt, &q.UpdatedAt,
			&q.SentAt, &q.AcceptedAt, &q.RejectedAt, &q.MarginTotal, &q.Source,
			&q.DeliveryType, &q.FreightAmount, &q.VehicleID, &q.VehicleName, &q.BranchID,
		); err != nil {
			return nil, 0, fmt.Errorf("failed to scan quote: %w", err)
		}
		quotes = append(quotes, q)
	}
	return quotes, total, nil
}

func (r *PostgresRepository) ListQuotesByCustomer(ctx context.Context, customerID uuid.UUID) ([]Quote, error) {
	branchID := middleware.BranchIDForQuery(ctx)
	query := `
		SELECT id, customer_id, job_id, state, total_amount, expires_at, created_at, updated_at, branch_id
		FROM quotes
		WHERE customer_id = $1
		  AND ($2::uuid IS NULL OR branch_id = $2)
		ORDER BY created_at DESC
	`
	rows, err := r.db.GetExecutor(ctx).Query(ctx, query, customerID, branchID)
	if err != nil {
		return nil, fmt.Errorf("failed to list quotes: %w", err)
	}
	defer rows.Close()

	var quotes []Quote
	for rows.Next() {
		var q Quote
		if err := rows.Scan(
			&q.ID, &q.CustomerID, &q.JobID, &q.State, &q.TotalAmount, &q.ExpiresAt, &q.CreatedAt, &q.UpdatedAt, &q.BranchID,
		); err != nil {
			return nil, fmt.Errorf("failed to scan quote: %w", err)
		}
		quotes = append(quotes, q)
	}
	return quotes, nil
}

// GetOriginalFile retrieves the original uploaded file for a quote.
func (r *PostgresRepository) GetOriginalFile(ctx context.Context, id uuid.UUID) ([]byte, string, string, error) {
	var data []byte
	var filename, contentType string
	query := `SELECT original_file, COALESCE(original_filename, ''), COALESCE(original_content_type, '') FROM quotes WHERE id = $1`
	err := r.db.GetExecutor(ctx).QueryRow(ctx, query, id).Scan(&data, &filename, &contentType)
	if err != nil {
		return nil, "", "", fmt.Errorf("failed to get original file: %w", err)
	}
	return data, filename, contentType, nil
}

// GetQuoteAnalytics returns aggregated quote analytics.
func (r *PostgresRepository) GetQuoteAnalytics(ctx context.Context) (*QuoteAnalytics, error) {
	a := &QuoteAnalytics{}

	// State counts and totals
	countQuery := `
		SELECT
			COUNT(*) as total,
			COUNT(*) FILTER (WHERE state = 'DRAFT') as draft,
			COUNT(*) FILTER (WHERE state = 'SENT') as sent,
			COUNT(*) FILTER (WHERE state = 'ACCEPTED') as accepted,
			COUNT(*) FILTER (WHERE state = 'REJECTED') as rejected,
			COUNT(*) FILTER (WHERE state = 'EXPIRED') as expired,
			COALESCE(SUM(total_amount), 0) as total_value,
			COALESCE(SUM(total_amount) FILTER (WHERE state = 'ACCEPTED'), 0) as accepted_value,
			COALESCE(AVG(COALESCE(margin_total, 0)) FILTER (WHERE state = 'ACCEPTED'), 0) as avg_margin_accepted,
			COALESCE(AVG(COALESCE(margin_total, 0)) FILTER (WHERE state = 'REJECTED'), 0) as avg_margin_rejected,
			COUNT(*) FILTER (WHERE COALESCE(source, 'manual') = 'ai') as ai_count,
			COUNT(*) FILTER (WHERE COALESCE(source, 'manual') = 'ai' AND state = 'ACCEPTED') as ai_accepted,
			COUNT(*) FILTER (WHERE COALESCE(source, 'manual') != 'ai' AND state = 'ACCEPTED') as manual_accepted,
			COUNT(*) FILTER (WHERE COALESCE(source, 'manual') != 'ai') as manual_count
		FROM quotes
		WHERE created_at >= NOW() - INTERVAL '90 days'
	`
	var aiAccepted, manualAccepted, manualCount int
	err := r.db.GetExecutor(ctx).QueryRow(ctx, countQuery).Scan(
		&a.TotalQuotes, &a.DraftCount, &a.SentCount, &a.AcceptedCount, &a.RejectedCount, &a.ExpiredCount,
		&a.TotalQuoteValue, &a.TotalAcceptedValue,
		&a.AvgMarginAccepted, &a.AvgMarginRejected,
		&a.AISourcedCount, &aiAccepted, &manualAccepted, &manualCount,
	)
	if err != nil {
		return nil, fmt.Errorf("failed to get analytics counts: %w", err)
	}

	// Conversion rates
	closedCount := a.AcceptedCount + a.RejectedCount + a.ExpiredCount
	if closedCount > 0 {
		a.ConversionRate = float64(a.AcceptedCount) / float64(closedCount) * 100
	}
	if a.AISourcedCount > 0 {
		a.AIConversionRate = float64(aiAccepted) / float64(a.AISourcedCount) * 100
	}
	if manualCount > 0 {
		a.ManualConversionRate = float64(manualAccepted) / float64(manualCount) * 100
	}

	// Average days to close
	daysQuery := `
		SELECT COALESCE(AVG(EXTRACT(EPOCH FROM (accepted_at - created_at)) / 86400), 0)
		FROM quotes
		WHERE state = 'ACCEPTED' AND accepted_at IS NOT NULL
		AND created_at >= NOW() - INTERVAL '90 days'
	`
	err = r.db.GetExecutor(ctx).QueryRow(ctx, daysQuery).Scan(&a.AvgDaysToClose)
	if err != nil {
		a.AvgDaysToClose = 0
	}

	// Trend data (last 30 days)
	trendQuery := `
		SELECT
			d::date as date,
			COUNT(q.id) FILTER (WHERE q.id IS NOT NULL) as created,
			COUNT(q.id) FILTER (WHERE q.state = 'ACCEPTED') as accepted,
			COUNT(q.id) FILTER (WHERE q.state = 'REJECTED') as rejected,
			COALESCE(SUM(q.total_amount), 0) as total_value,
			COALESCE(SUM(q.total_amount) FILTER (WHERE q.state = 'ACCEPTED'), 0) as accepted_value
		FROM generate_series(
			(NOW() - INTERVAL '29 days')::date,
			NOW()::date,
			'1 day'::interval
		) d
		LEFT JOIN quotes q ON q.created_at::date = d::date
		GROUP BY d::date
		ORDER BY d::date
	`
	rows, err := r.db.GetExecutor(ctx).Query(ctx, trendQuery)
	if err != nil {
		return nil, fmt.Errorf("failed to get trend data: %w", err)
	}
	defer rows.Close()

	for rows.Next() {
		var t QuoteAnalyticsTrend
		var date time.Time
		if err := rows.Scan(&date, &t.Created, &t.Accepted, &t.Rejected, &t.TotalValue, &t.AcceptedValue); err != nil {
			return nil, fmt.Errorf("failed to scan trend: %w", err)
		}
		t.Date = date.Format("2006-01-02")
		a.TrendData = append(a.TrendData, t)
	}

	return a, nil
}
