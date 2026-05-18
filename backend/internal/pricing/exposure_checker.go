package pricing

import (
	"context"
	"fmt"

	"github.com/gablelbm/gable/pkg/database"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
)

// ExposureChecker is the sync read interface that order and delivery depend
// on. Defined here so cross-module callers do not have to import the pricing
// package's repository types.
type ExposureChecker interface {
	CheckQuoteExposure(ctx context.Context, quoteID uuid.UUID) (ExposureStatus, error)
	RequireClearForOrder(ctx context.Context, orderID uuid.UUID) error
}

// PostgresExposureChecker is the concrete implementation backed by a direct
// DB query that joins quotes + customers + sales_team. It deliberately
// bypasses the quote module's repository to avoid pricing → quote → pricing
// cyclic risk.
type PostgresExposureChecker struct {
	db *database.DB
}

func NewExposureChecker(db *database.DB) *PostgresExposureChecker {
	return &PostgresExposureChecker{db: db}
}

// CheckQuoteExposure returns the current exposure state of a quote. If the
// quote doesn't exist, returns an OK status (caller treats absent quote as
// non-blocking; this keeps the gate fail-open if the quote was deleted).
func (c *PostgresExposureChecker) CheckQuoteExposure(ctx context.Context, quoteID uuid.UUID) (ExposureStatus, error) {
	q := `
		SELECT
			q.id,
			SUBSTRING(q.id::text FROM 1 FOR 8),
			COALESCE(q.exposure_state, 'OK'),
			COALESCE(q.exposure_dollars, 0),
			c.salesperson_id,
			COALESCE(st.name, ''),
			q.exposure_last_checked_at,
			COALESCE((
				SELECT array_agg(DISTINCT mi.index_code)
				FROM price_escalators pe
				JOIN quote_lines ql ON ql.id = pe.quote_line_id
				JOIN market_indices mi ON mi.id = pe.market_index_id
				WHERE ql.quote_id = q.id AND pe.is_active
			), ARRAY[]::TEXT[])
		FROM quotes q
		JOIN customers c ON c.id = q.customer_id
		LEFT JOIN sales_team st ON st.id = c.salesperson_id
		WHERE q.id = $1`

	var s ExposureStatus
	var stateStr string
	err := c.db.GetExecutor(ctx).QueryRow(ctx, q, quoteID).Scan(
		&s.QuoteID, &s.QuoteShortID, &stateStr, &s.ExposureDollars,
		&s.SalespersonID, &s.SalespersonName, &s.LastCheckedAt, &s.Indexes,
	)
	if err != nil {
		if err == pgx.ErrNoRows {
			return ExposureStatus{QuoteID: quoteID, State: ExposureStateOK}, nil
		}
		return ExposureStatus{}, fmt.Errorf("check quote exposure: %w", err)
	}
	s.State = ExposureState(stateStr)
	s.RequiredAction = requiredActionForState(s.State)
	return s, nil
}

// RequireClearForOrder is the pre-ship gate. Called by order.ConfirmOrder and
// delivery route assignment. Returns *ErrUnresolvedExposure when the linked
// quote has ACK_REQUIRED or BLOCKED state; returns nil for OK / ACKNOWLEDGED /
// ESCALATED / OVERRIDDEN / FLAGGED (FLAGGED is advisory only).
func (c *PostgresExposureChecker) RequireClearForOrder(ctx context.Context, orderID uuid.UUID) error {
	// Look up the source quote_id on the order. Orders may not have one (e.g.,
	// walk-in counter orders), in which case there's nothing to gate on.
	var quoteID *uuid.UUID
	err := c.db.GetExecutor(ctx).QueryRow(ctx,
		`SELECT quote_id FROM orders WHERE id = $1`, orderID).Scan(&quoteID)
	if err != nil {
		if err == pgx.ErrNoRows {
			// Order not found — caller will handle the broader 404.
			return nil
		}
		return fmt.Errorf("require clear for order: lookup quote: %w", err)
	}
	if quoteID == nil {
		// No source quote → nothing to check.
		return nil
	}

	status, err := c.CheckQuoteExposure(ctx, *quoteID)
	if err != nil {
		return err
	}
	switch status.State {
	case ExposureStateAckRequired, ExposureStateBlocked:
		return &ErrUnresolvedExposure{Status: status}
	default:
		return nil
	}
}

func requiredActionForState(s ExposureState) string {
	switch s {
	case ExposureStateAckRequired:
		return "ACKNOWLEDGE"
	case ExposureStateBlocked:
		return "ACKNOWLEDGE_OR_OVERRIDE"
	case ExposureStateFlagged:
		return "REQUOTE_OR_ACKNOWLEDGE"
	default:
		return ""
	}
}
