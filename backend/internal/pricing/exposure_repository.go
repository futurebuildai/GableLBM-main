package pricing

import (
	"context"
	"fmt"
	"strings"
	"time"

	"github.com/gablelbm/gable/pkg/database"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
)

// ExposureRepository is the data-access surface for the index-aware price
// protection feature. It is implemented by PostgresExposureRepository against
// the schema introduced by migration 054.
type ExposureRepository interface {
	// History
	InsertHistory(ctx context.Context, hist *MarketIndexHistory) error
	GetHistoryByID(ctx context.Context, id uuid.UUID) (*MarketIndexHistory, error)
	ListHistory(ctx context.Context, indexID uuid.UUID, from, to time.Time) ([]MarketIndexHistory, error)

	// Events (append-only ledger)
	InsertEvent(ctx context.Context, ev *QuoteExposureEvent) (inserted bool, err error)
	EventExists(ctx context.Context, idempotencyKey string) (bool, error)
	GetEventsByQuote(ctx context.Context, quoteID uuid.UUID) ([]QuoteExposureEvent, error)

	// Escalator state management (works in concert with the existing escalator repo)
	ListActiveEscalatorsForIndex(ctx context.Context, indexID uuid.UUID) ([]EscalatorWithContext, error)
	UpdateEscalatorState(ctx context.Context, id uuid.UUID, state string, lastCheckedAt time.Time) error
	DeactivateEscalatorsForLine(ctx context.Context, lineID uuid.UUID) error

	// Category defaults
	ListCategoryDefaults(ctx context.Context) ([]ProductCategoryIndexDefault, error)
	UpsertCategoryDefault(ctx context.Context, categoryID, indexID uuid.UUID) error
	DeleteCategoryDefault(ctx context.Context, categoryID uuid.UUID) error

	// Index resolution — product → category default fallback via ltree ancestry
	ResolveIndexForProduct(ctx context.Context, productID uuid.UUID) (*uuid.UUID, error)

	// Read projections for the salesperson + owner views
	ListExposureForOwner(ctx context.Context, filter ExposureFilter) ([]ExposureRow, error)
	PortfolioRollup(ctx context.Context, salespersonFilter *uuid.UUID) (*PortfolioSummary, error)
}

// PostgresExposureRepository implements ExposureRepository.
type PostgresExposureRepository struct {
	db *database.DB
}

func NewExposureRepository(db *database.DB) *PostgresExposureRepository {
	return &PostgresExposureRepository{db: db}
}

// ---------- History ----------

func (r *PostgresExposureRepository) InsertHistory(ctx context.Context, h *MarketIndexHistory) error {
	if h.ID == uuid.Nil {
		h.ID = uuid.New()
	}
	if h.RecordedAt.IsZero() {
		h.RecordedAt = time.Now()
	}
	if h.Source == "" {
		h.Source = "MANUAL"
	}
	q := `
		INSERT INTO market_index_history (id, market_index_id, value, recorded_at, recorded_by, source)
		VALUES ($1, $2, $3, $4, $5, $6)`
	_, err := r.db.GetExecutor(ctx).Exec(ctx, q,
		h.ID, h.MarketIndexID, h.Value, h.RecordedAt, h.RecordedBy, h.Source)
	if err != nil {
		return fmt.Errorf("insert market_index_history: %w", err)
	}
	return nil
}

func (r *PostgresExposureRepository) GetHistoryByID(ctx context.Context, id uuid.UUID) (*MarketIndexHistory, error) {
	q := `SELECT id, market_index_id, value, recorded_at, COALESCE(recorded_by, ''), source
	      FROM market_index_history WHERE id = $1`
	var h MarketIndexHistory
	err := r.db.GetExecutor(ctx).QueryRow(ctx, q, id).Scan(
		&h.ID, &h.MarketIndexID, &h.Value, &h.RecordedAt, &h.RecordedBy, &h.Source)
	if err != nil {
		if err == pgx.ErrNoRows {
			return nil, nil
		}
		return nil, fmt.Errorf("get market_index_history: %w", err)
	}
	return &h, nil
}

func (r *PostgresExposureRepository) ListHistory(ctx context.Context, indexID uuid.UUID, from, to time.Time) ([]MarketIndexHistory, error) {
	q := `SELECT id, market_index_id, value, recorded_at, COALESCE(recorded_by, ''), source
	      FROM market_index_history
	      WHERE market_index_id = $1 AND recorded_at >= $2 AND recorded_at <= $3
	      ORDER BY recorded_at DESC`
	rows, err := r.db.GetExecutor(ctx).Query(ctx, q, indexID, from, to)
	if err != nil {
		return nil, fmt.Errorf("list market_index_history: %w", err)
	}
	defer rows.Close()

	var out []MarketIndexHistory
	for rows.Next() {
		var h MarketIndexHistory
		if err := rows.Scan(&h.ID, &h.MarketIndexID, &h.Value, &h.RecordedAt, &h.RecordedBy, &h.Source); err != nil {
			return nil, fmt.Errorf("scan market_index_history: %w", err)
		}
		out = append(out, h)
	}
	return out, nil
}

// ---------- Events ----------

// InsertEvent writes a quote_exposure_events row. ON CONFLICT (idempotency_key) DO
// NOTHING — returns (inserted=false, nil) if the event was already recorded.
func (r *PostgresExposureRepository) InsertEvent(ctx context.Context, ev *QuoteExposureEvent) (bool, error) {
	if ev.ID == uuid.Nil {
		ev.ID = uuid.New()
	}
	if ev.CreatedAt.IsZero() {
		ev.CreatedAt = time.Now()
	}
	q := `
		INSERT INTO quote_exposure_events (
			id, quote_id, quote_line_id, market_index_id, market_index_history_id,
			event_type, base_index_value, current_index_value, delta_pct,
			exposure_dollars, threshold_pct, policy,
			actor_user_id, actor_role, method, notes,
			idempotency_key, created_at
		) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18)
		ON CONFLICT (idempotency_key) DO NOTHING`
	tag, err := r.db.GetExecutor(ctx).Exec(ctx, q,
		ev.ID, ev.QuoteID, ev.QuoteLineID, ev.MarketIndexID, ev.MarketIndexHistoryID,
		ev.EventType, ev.BaseIndexValue, ev.CurrentIndexValue, ev.DeltaPct,
		ev.ExposureDollars, ev.ThresholdPct, ev.Policy,
		ev.ActorUserID, ev.ActorRole, ev.Method, ev.Notes,
		ev.IdempotencyKey, ev.CreatedAt,
	)
	if err != nil {
		return false, fmt.Errorf("insert quote_exposure_events: %w", err)
	}
	return tag.RowsAffected() == 1, nil
}

func (r *PostgresExposureRepository) EventExists(ctx context.Context, key string) (bool, error) {
	var exists bool
	q := `SELECT EXISTS(SELECT 1 FROM quote_exposure_events WHERE idempotency_key = $1)`
	if err := r.db.GetExecutor(ctx).QueryRow(ctx, q, key).Scan(&exists); err != nil {
		return false, fmt.Errorf("check event idempotency: %w", err)
	}
	return exists, nil
}

func (r *PostgresExposureRepository) GetEventsByQuote(ctx context.Context, quoteID uuid.UUID) ([]QuoteExposureEvent, error) {
	q := `
		SELECT id, quote_id, quote_line_id, market_index_id, market_index_history_id,
		       event_type, base_index_value, current_index_value, delta_pct,
		       exposure_dollars, threshold_pct, COALESCE(policy, ''),
		       COALESCE(actor_user_id, ''), COALESCE(actor_role, ''),
		       COALESCE(method, ''), COALESCE(notes, ''),
		       idempotency_key, created_at
		FROM quote_exposure_events
		WHERE quote_id = $1
		ORDER BY created_at ASC`
	rows, err := r.db.GetExecutor(ctx).Query(ctx, q, quoteID)
	if err != nil {
		return nil, fmt.Errorf("list quote_exposure_events: %w", err)
	}
	defer rows.Close()

	var out []QuoteExposureEvent
	for rows.Next() {
		var ev QuoteExposureEvent
		if err := rows.Scan(
			&ev.ID, &ev.QuoteID, &ev.QuoteLineID, &ev.MarketIndexID, &ev.MarketIndexHistoryID,
			&ev.EventType, &ev.BaseIndexValue, &ev.CurrentIndexValue, &ev.DeltaPct,
			&ev.ExposureDollars, &ev.ThresholdPct, &ev.Policy,
			&ev.ActorUserID, &ev.ActorRole, &ev.Method, &ev.Notes,
			&ev.IdempotencyKey, &ev.CreatedAt,
		); err != nil {
			return nil, fmt.Errorf("scan quote_exposure_event: %w", err)
		}
		out = append(out, ev)
	}
	return out, nil
}

// ---------- Escalator state ----------

func (r *PostgresExposureRepository) ListActiveEscalatorsForIndex(ctx context.Context, indexID uuid.UUID) ([]EscalatorWithContext, error) {
	q := `
		SELECT
			pe.id, pe.quote_line_id, pe.market_index_id, pe.escalation_type, pe.escalation_rate,
			pe.base_price, pe.base_index_value, pe.base_index_recorded_at, pe.last_checked_at,
			pe.current_state, COALESCE(pe.policy_at_snapshot, ''), COALESCE(pe.threshold_pct_at_snapshot, 0),
			pe.effective_date, pe.expiration_date, pe.is_active, pe.created_at, pe.updated_at,
			q.id, q.state, COALESCE(q.id::text, ''),
			c.id, COALESCE(c.name, ''), c.salesperson_id, COALESCE(st.name, ''),
			ql.quantity, ql.unit_price,
			c.escalation_agreement_signed_at, COALESCE(c.escalation_agreement_ref, '')
		FROM price_escalators pe
		JOIN quote_lines ql  ON ql.id = pe.quote_line_id
		JOIN quotes q        ON q.id = ql.quote_id
		JOIN customers c     ON c.id = q.customer_id
		LEFT JOIN sales_team st ON st.id = c.salesperson_id
		WHERE pe.market_index_id = $1
		  AND pe.is_active = TRUE
		  AND q.state IN ('SENT', 'ACCEPTED')`
	rows, err := r.db.GetExecutor(ctx).Query(ctx, q, indexID)
	if err != nil {
		return nil, fmt.Errorf("list active escalators for index: %w", err)
	}
	defer rows.Close()

	var out []EscalatorWithContext
	for rows.Next() {
		var ewc EscalatorWithContext
		var pe = &ewc.Escalator
		if err := rows.Scan(
			&pe.ID, &pe.QuoteLineID, &pe.MarketIndexID, &pe.EscalationType, &pe.EscalationRate,
			&pe.BasePrice, &pe.BaseIndexValue, &pe.BaseIndexRecordedAt, &pe.LastCheckedAt,
			&pe.CurrentState, &pe.PolicyAtSnapshot, &pe.ThresholdPctAtSnapshot,
			&pe.EffectiveDate, &pe.ExpirationDate, &pe.IsActive, &pe.CreatedAt, &pe.UpdatedAt,
			&ewc.QuoteID, &ewc.QuoteState, &ewc.QuoteShortID,
			&ewc.CustomerID, &ewc.CustomerName, &ewc.SalespersonID, &ewc.SalespersonName,
			&ewc.LineQuantity, &ewc.LineUnitPrice,
			&ewc.CustomerAgreementSignedAt, &ewc.CustomerAgreementRef,
		); err != nil {
			return nil, fmt.Errorf("scan escalator with context: %w", err)
		}
		out = append(out, ewc)
	}
	return out, nil
}

func (r *PostgresExposureRepository) UpdateEscalatorState(ctx context.Context, id uuid.UUID, state string, lastCheckedAt time.Time) error {
	q := `UPDATE price_escalators
	      SET current_state = $2, last_checked_at = $3, updated_at = NOW()
	      WHERE id = $1`
	_, err := r.db.GetExecutor(ctx).Exec(ctx, q, id, state, lastCheckedAt)
	if err != nil {
		return fmt.Errorf("update escalator state: %w", err)
	}
	return nil
}

func (r *PostgresExposureRepository) DeactivateEscalatorsForLine(ctx context.Context, lineID uuid.UUID) error {
	q := `UPDATE price_escalators
	      SET is_active = FALSE, updated_at = NOW()
	      WHERE quote_line_id = $1 AND is_active = TRUE`
	_, err := r.db.GetExecutor(ctx).Exec(ctx, q, lineID)
	if err != nil {
		return fmt.Errorf("deactivate escalators for line: %w", err)
	}
	return nil
}

// ---------- Category defaults ----------

func (r *PostgresExposureRepository) ListCategoryDefaults(ctx context.Context) ([]ProductCategoryIndexDefault, error) {
	q := `SELECT id, category_id, market_index_id, is_active, created_at, updated_at
	      FROM product_category_index_defaults ORDER BY created_at`
	rows, err := r.db.GetExecutor(ctx).Query(ctx, q)
	if err != nil {
		return nil, fmt.Errorf("list category defaults: %w", err)
	}
	defer rows.Close()

	var out []ProductCategoryIndexDefault
	for rows.Next() {
		var d ProductCategoryIndexDefault
		if err := rows.Scan(&d.ID, &d.CategoryID, &d.MarketIndexID, &d.IsActive, &d.CreatedAt, &d.UpdatedAt); err != nil {
			return nil, fmt.Errorf("scan category default: %w", err)
		}
		out = append(out, d)
	}
	return out, nil
}

func (r *PostgresExposureRepository) UpsertCategoryDefault(ctx context.Context, categoryID, indexID uuid.UUID) error {
	q := `
		INSERT INTO product_category_index_defaults (category_id, market_index_id, is_active, created_at, updated_at)
		VALUES ($1, $2, TRUE, NOW(), NOW())
		ON CONFLICT (category_id) DO UPDATE
		SET market_index_id = EXCLUDED.market_index_id, is_active = TRUE, updated_at = NOW()`
	_, err := r.db.GetExecutor(ctx).Exec(ctx, q, categoryID, indexID)
	if err != nil {
		return fmt.Errorf("upsert category default: %w", err)
	}
	return nil
}

func (r *PostgresExposureRepository) DeleteCategoryDefault(ctx context.Context, categoryID uuid.UUID) error {
	_, err := r.db.GetExecutor(ctx).Exec(ctx,
		`DELETE FROM product_category_index_defaults WHERE category_id = $1`, categoryID)
	if err != nil {
		return fmt.Errorf("delete category default: %w", err)
	}
	return nil
}

// ResolveIndexForProduct resolves the market index a product line should be
// tagged with. Resolution order:
//  1. products.market_index_id (per-SKU override)
//  2. product_category_index_defaults walking the category's ltree path from
//     deepest ancestor back to root, taking the first match.
//
// Returns (nil, nil) if no index is resolvable — caller should skip snapshotting.
func (r *PostgresExposureRepository) ResolveIndexForProduct(ctx context.Context, productID uuid.UUID) (*uuid.UUID, error) {
	q := `
		WITH p AS (
			SELECT id, category_id, market_index_id, is_commodity
			FROM products WHERE id = $1
		),
		ancestors AS (
			-- Each level of the product's category path, longest match wins
			SELECT pc.id AS category_id, nlevel(pc.path) AS depth
			FROM p
			JOIN product_categories self ON self.id = p.category_id
			JOIN product_categories pc   ON pc.path @> self.path
		)
		SELECT
			COALESCE(
				(SELECT market_index_id FROM p WHERE market_index_id IS NOT NULL),
				(SELECT d.market_index_id
				   FROM ancestors a
				   JOIN product_category_index_defaults d ON d.category_id = a.category_id
				   WHERE d.is_active
				   ORDER BY a.depth DESC
				   LIMIT 1)
			) AS resolved_index_id`

	var resolved *uuid.UUID
	err := r.db.GetExecutor(ctx).QueryRow(ctx, q, productID).Scan(&resolved)
	if err != nil {
		if err == pgx.ErrNoRows {
			return nil, nil
		}
		return nil, fmt.Errorf("resolve index for product: %w", err)
	}
	return resolved, nil
}

// ---------- Read projections ----------

// ExposureFilter narrows ListExposureForOwner. Zero-valued fields are
// ignored; non-empty fields add WHERE clauses. CustomerID and IndexCode are
// optional; MinDollars is applied against the denormalized
// quotes.exposure_dollars column.
type ExposureFilter struct {
	SalespersonID *uuid.UUID
	States        []string
	CustomerID    *uuid.UUID
	IndexCode     string
	MinDollars    float64
	Limit         int
	Offset        int
}

// ListExposureForOwner returns the salesperson at-risk-quotes table. When
// SalespersonID is nil, returns across all owners (caller must enforce role).
// States defaults to all non-OK states if empty.
func (r *PostgresExposureRepository) ListExposureForOwner(ctx context.Context, f ExposureFilter) ([]ExposureRow, error) {
	limit := f.Limit
	if limit <= 0 {
		limit = 50
	}

	clauses := []string{"q.state IN ('SENT','ACCEPTED')"}
	args := []any{}
	idx := 1
	if f.SalespersonID != nil {
		clauses = append(clauses, fmt.Sprintf("c.salesperson_id = $%d", idx))
		args = append(args, *f.SalespersonID)
		idx++
	}
	if len(f.States) == 0 {
		clauses = append(clauses, "q.exposure_state <> 'OK'")
	} else {
		placeholders := []string{}
		for _, s := range f.States {
			placeholders = append(placeholders, fmt.Sprintf("$%d", idx))
			args = append(args, s)
			idx++
		}
		clauses = append(clauses, fmt.Sprintf("q.exposure_state IN (%s)", strings.Join(placeholders, ",")))
	}
	if f.CustomerID != nil {
		clauses = append(clauses, fmt.Sprintf("q.customer_id = $%d", idx))
		args = append(args, *f.CustomerID)
		idx++
	}
	if f.IndexCode != "" {
		// Subquery: only quotes that have an active escalator tagged to the
		// given index_code. Faster than joining at the top level.
		clauses = append(clauses, fmt.Sprintf(`q.id IN (
			SELECT ql.quote_id FROM price_escalators pe
			JOIN quote_lines ql ON ql.id = pe.quote_line_id
			JOIN market_indices mi ON mi.id = pe.market_index_id
			WHERE pe.is_active AND mi.index_code = $%d)`, idx))
		args = append(args, f.IndexCode)
		idx++
	}
	if f.MinDollars > 0 {
		clauses = append(clauses, fmt.Sprintf("q.exposure_dollars >= $%d", idx))
		args = append(args, f.MinDollars)
		idx++
	}
	args = append(args, limit, f.Offset)

	q := fmt.Sprintf(`
		SELECT
			q.id,
			SUBSTRING(q.id::text FROM 1 FOR 8),
			c.id, COALESCE(c.name, ''),
			c.salesperson_id, COALESCE(st.name, ''),
			GREATEST(0, EXTRACT(EPOCH FROM (NOW() - COALESCE(q.sent_at, q.created_at))) / 86400)::int AS days_open,
			COALESCE(
				(SELECT array_agg(DISTINCT mi.index_code)
				 FROM price_escalators pe
				 JOIN quote_lines ql ON ql.id = pe.quote_line_id
				 JOIN market_indices mi ON mi.id = pe.market_index_id
				 WHERE ql.quote_id = q.id AND pe.is_active),
				ARRAY[]::TEXT[]
			) AS indexes,
			COALESCE(
				(SELECT MAX(ABS(
					CASE WHEN pe.base_index_value > 0
					     THEN (mi.current_value - pe.base_index_value) / pe.base_index_value * 100
					     ELSE 0 END
				))
				 FROM price_escalators pe
				 JOIN quote_lines ql ON ql.id = pe.quote_line_id
				 JOIN market_indices mi ON mi.id = pe.market_index_id
				 WHERE ql.quote_id = q.id AND pe.is_active),
				0
			) AS max_delta_pct,
			q.exposure_dollars,
			c.price_escalation_policy,
			q.exposure_state
		FROM quotes q
		JOIN customers c ON c.id = q.customer_id
		LEFT JOIN sales_team st ON st.id = c.salesperson_id
		WHERE %s
		ORDER BY q.exposure_dollars DESC
		LIMIT $%d OFFSET $%d`,
		strings.Join(clauses, " AND "), idx, idx+1)

	rows, err := r.db.GetExecutor(ctx).Query(ctx, q, args...)
	if err != nil {
		return nil, fmt.Errorf("list exposure for owner: %w", err)
	}
	defer rows.Close()

	var out []ExposureRow
	for rows.Next() {
		var er ExposureRow
		if err := rows.Scan(
			&er.QuoteID, &er.ShortID,
			&er.CustomerID, &er.CustomerName,
			&er.SalespersonID, &er.SalespersonName,
			&er.DaysOpen, &er.Indexes, &er.MaxDeltaPct,
			&er.ExposureDollars, &er.Policy, &er.ExposureState,
		); err != nil {
			return nil, fmt.Errorf("scan exposure row: %w", err)
		}
		er.AvailableActions = availableActionsForState(er.ExposureState)
		out = append(out, er)
	}
	return out, nil
}

func availableActionsForState(state string) []string {
	switch state {
	case "FLAGGED":
		return []string{"requote", "acknowledge", "notify_customer"}
	case "ACK_REQUIRED":
		return []string{"acknowledge", "request_ack"}
	case "BLOCKED":
		return []string{"acknowledge", "override"}
	case "ESCALATED":
		return []string{"view_audit"}
	case "ACKNOWLEDGED", "OVERRIDDEN":
		return []string{"view_audit"}
	default:
		return []string{"open"}
	}
}

// PortfolioRollup computes the owner's exposure portfolio. If
// salespersonFilter is non-nil, the rollup is scoped to that salesperson's book.
func (r *PostgresExposureRepository) PortfolioRollup(ctx context.Context, salespersonFilter *uuid.UUID) (*PortfolioSummary, error) {
	exec := r.db.GetExecutor(ctx)

	salespersonClause := ""
	args := []any{}
	idx := 1
	if salespersonFilter != nil {
		salespersonClause = fmt.Sprintf(" AND c.salesperson_id = $%d", idx)
		args = append(args, *salespersonFilter)
		idx++
	}

	// Summary
	summaryQ := fmt.Sprintf(`
		SELECT
			COALESCE(SUM(q.exposure_dollars), 0)               AS total_dollars,
			COUNT(*) FILTER (WHERE q.exposure_state <> 'OK')   AS total_quotes,
			COUNT(DISTINCT q.customer_id)                      AS total_customers
		FROM quotes q
		JOIN customers c ON c.id = q.customer_id
		WHERE q.state IN ('SENT', 'ACCEPTED') AND q.exposure_state <> 'OK'%s`, salespersonClause)

	out := &PortfolioSummary{}
	if err := exec.QueryRow(ctx, summaryQ, args...).Scan(&out.TotalExposureDollars, &out.TotalQuotes, &out.TotalCustomers); err != nil {
		return nil, fmt.Errorf("portfolio summary: %w", err)
	}

	// By-customer breakdown
	byCustomerQ := fmt.Sprintf(`
		SELECT
			c.id, COALESCE(c.name, ''),
			COUNT(q.id),
			COALESCE(SUM(q.exposure_dollars), 0),
			COALESCE((
				SELECT mi.index_code
				FROM price_escalators pe
				JOIN quote_lines ql ON ql.id = pe.quote_line_id
				JOIN market_indices mi ON mi.id = pe.market_index_id
				WHERE ql.quote_id IN (SELECT id FROM quotes WHERE customer_id = c.id AND state IN ('SENT','ACCEPTED') AND exposure_state <> 'OK')
				  AND pe.is_active
				GROUP BY mi.index_code
				ORDER BY COUNT(*) DESC
				LIMIT 1
			), '') AS top_index_code,
			c.price_escalation_policy,
			MAX(q.exposure_last_checked_at) AS last_activity_at
		FROM customers c
		JOIN quotes q ON q.customer_id = c.id
		WHERE q.state IN ('SENT','ACCEPTED') AND q.exposure_state <> 'OK'%s
		GROUP BY c.id, c.name, c.price_escalation_policy
		ORDER BY SUM(q.exposure_dollars) DESC
		LIMIT 50`, salespersonClause)
	rows, err := exec.Query(ctx, byCustomerQ, args...)
	if err != nil {
		return nil, fmt.Errorf("portfolio by customer: %w", err)
	}
	defer rows.Close()
	for rows.Next() {
		var row PortfolioCustomerRow
		var lastActivity *time.Time
		if err := rows.Scan(&row.CustomerID, &row.CustomerName, &row.QuoteCount, &row.ExposureDollars,
			&row.TopIndexCode, &row.Policy, &lastActivity); err != nil {
			return nil, fmt.Errorf("scan portfolio customer: %w", err)
		}
		if lastActivity != nil {
			row.LastActivityAt = *lastActivity
		}
		out.ByCustomer = append(out.ByCustomer, row)
	}

	// By-salesperson breakdown (skip if filtered to one)
	if salespersonFilter == nil {
		bySpQ := `
			SELECT
				st.id, COALESCE(st.name, ''),
				COUNT(q.id),
				COALESCE(SUM(q.exposure_dollars), 0),
				COUNT(*) FILTER (WHERE q.exposure_state = 'FLAGGED'),
				COUNT(*) FILTER (WHERE q.exposure_state = 'ACK_REQUIRED')
			FROM sales_team st
			JOIN customers c ON c.salesperson_id = st.id
			JOIN quotes q ON q.customer_id = c.id
			WHERE q.state IN ('SENT','ACCEPTED') AND q.exposure_state <> 'OK'
			GROUP BY st.id, st.name
			ORDER BY SUM(q.exposure_dollars) DESC`
		spRows, err := exec.Query(ctx, bySpQ)
		if err != nil {
			return nil, fmt.Errorf("portfolio by salesperson: %w", err)
		}
		defer spRows.Close()
		for spRows.Next() {
			var row PortfolioSalespersonRow
			if err := spRows.Scan(&row.SalespersonID, &row.SalespersonName, &row.QuoteCount,
				&row.ExposureDollars, &row.FlaggedCount, &row.AckRequiredCount); err != nil {
				return nil, fmt.Errorf("scan portfolio salesperson: %w", err)
			}
			out.BySalesperson = append(out.BySalesperson, row)
		}
	}

	return out, nil
}
