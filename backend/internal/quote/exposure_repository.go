package quote

import (
	"context"
	"fmt"
	"math"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
)

// exposureRepo extends the existing PostgresRepository with exposure-related
// operations needed by the pricing.ExposureScanner and SnapshotService.
//
// These methods deliberately live in a separate file so the existing
// repository.go is untouched. The methods together implement the
// QuoteLineReader interface declared in exposure_hook.go (pricing adapters
// in cmd/server/main.go bind them).

// GetQuoteWithLinesAndCustomer returns the minimal projection pricing needs
// at quote-send time: header, lines (with product commodity flag), and the
// customer's escalation policy.
func (r *PostgresRepository) GetQuoteWithLinesAndCustomer(ctx context.Context, quoteID uuid.UUID) (*QuoteForSnapshot, error) {
	headerQ := `
		SELECT q.id, SUBSTRING(q.id::text FROM 1 FOR 8),
		       q.customer_id, COALESCE(c.name, ''), c.salesperson_id,
		       COALESCE(c.price_escalation_policy, 'FLAG_FOR_REQUOTE'),
		       COALESCE(c.escalation_threshold_pct, 5.0),
		       c.escalation_agreement_signed_at,
		       COALESCE(c.escalation_agreement_ref, '')
		FROM quotes q
		JOIN customers c ON c.id = q.customer_id
		WHERE q.id = $1`

	out := &QuoteForSnapshot{}
	err := r.db.GetExecutor(ctx).QueryRow(ctx, headerQ, quoteID).Scan(
		&out.ID, &out.ShortID,
		&out.CustomerID, &out.CustomerName, &out.SalespersonID,
		&out.CustomerPolicy.Policy,
		&out.CustomerPolicy.ThresholdPct,
		&out.CustomerPolicy.AgreementSignedAt,
		&out.CustomerPolicy.AgreementRef,
	)
	if err != nil {
		if err == pgx.ErrNoRows {
			return nil, fmt.Errorf("quote %s not found", quoteID)
		}
		return nil, fmt.Errorf("get quote for snapshot: %w", err)
	}

	linesQ := `
		SELECT ql.id, ql.product_id, ql.sku, ql.quantity, ql.unit_price,
		       COALESCE(p.is_commodity, FALSE), p.market_index_id
		FROM quote_lines ql
		JOIN products p ON p.id = ql.product_id
		WHERE ql.quote_id = $1
		ORDER BY ql.created_at`
	rows, err := r.db.GetExecutor(ctx).Query(ctx, linesQ, quoteID)
	if err != nil {
		return nil, fmt.Errorf("list quote lines for snapshot: %w", err)
	}
	defer rows.Close()

	for rows.Next() {
		var l QuoteLineForSnapshot
		if err := rows.Scan(&l.ID, &l.ProductID, &l.SKU, &l.Quantity, &l.UnitPrice,
			&l.IsCommodity, &l.MarketIndexID); err != nil {
			return nil, fmt.Errorf("scan quote line for snapshot: %w", err)
		}
		out.Lines = append(out.Lines, l)
	}
	return out, nil
}

// UpdateQuoteExposure updates the denormalized exposure rollup columns on a quote.
// Called by the scanner after evaluating exposure for the quote's lines.
func (r *PostgresRepository) UpdateQuoteExposure(ctx context.Context, quoteID uuid.UUID, state string, dollars float64, lastCheckedAt time.Time) error {
	q := `UPDATE quotes
	      SET exposure_state = $2,
	          exposure_dollars = $3,
	          exposure_last_checked_at = $4,
	          updated_at = NOW()
	      WHERE id = $1`
	_, err := r.db.GetExecutor(ctx).Exec(ctx, q, quoteID, state, roundCents(dollars), lastCheckedAt)
	if err != nil {
		return fmt.Errorf("update quote exposure: %w", err)
	}
	return nil
}

// UpdateLineUnitPrice updates a single quote line's unit_price and line_total.
// Used on the AUTO_ESCALATE path. Caller is responsible for invoking
// RecomputeQuoteTotal afterward to update the parent quote's total_amount.
func (r *PostgresRepository) UpdateLineUnitPrice(ctx context.Context, lineID uuid.UUID, newUnitPrice float64) error {
	q := `UPDATE quote_lines
	      SET unit_price = $2,
	          line_total = quantity * $2
	      WHERE id = $1`
	_, err := r.db.GetExecutor(ctx).Exec(ctx, q, lineID, newUnitPrice)
	if err != nil {
		return fmt.Errorf("update quote line price: %w", err)
	}
	return nil
}

// RecomputeQuoteTotal recalculates a quote's total_amount as
// SUM(line.quantity * line.unit_price) + freight_amount. Used after line price
// changes (e.g., AUTO_ESCALATE).
func (r *PostgresRepository) RecomputeQuoteTotal(ctx context.Context, quoteID uuid.UUID) error {
	q := `UPDATE quotes q
	      SET total_amount = COALESCE((
	              SELECT SUM(ql.quantity * ql.unit_price)
	              FROM quote_lines ql
	              WHERE ql.quote_id = q.id
	          ), 0) + COALESCE(q.freight_amount, 0),
	          updated_at = NOW()
	      WHERE q.id = $1`
	_, err := r.db.GetExecutor(ctx).Exec(ctx, q, quoteID)
	if err != nil {
		return fmt.Errorf("recompute quote total: %w", err)
	}
	return nil
}

// roundCents rounds a dollar amount to 2 decimals using banker-safe math.Round.
func roundCents(v float64) float64 {
	return math.Round(v*100) / 100
}
