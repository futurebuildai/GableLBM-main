package pricing

import (
	"context"
	"fmt"
	"time"

	"github.com/gablelbm/gable/pkg/database"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
)

// EscalatorRepository defines the data access interface for escalator operations.
type EscalatorRepository interface {
	ListMarketIndices(ctx context.Context) ([]MarketIndex, error)
	GetMarketIndex(ctx context.Context, id uuid.UUID) (*MarketIndex, error)
	CreateMarketIndex(ctx context.Context, idx *MarketIndex) error
	UpdateMarketIndex(ctx context.Context, idx *MarketIndex) error
	CreateEscalator(ctx context.Context, esc *PriceEscalator) error
	GetEscalatorByQuoteLine(ctx context.Context, quoteLineID uuid.UUID) (*PriceEscalator, error)

	// Added for migration-054 price protection feature:
	GetMarketIndexByCode(ctx context.Context, code string) (*MarketIndex, error)
	UpdateMarketIndexMetadata(ctx context.Context, id uuid.UUID, name, description string, isActive bool) error
	SnapshotEscalators(ctx context.Context, escalators []PriceEscalator) error
	ListEscalatorsForQuote(ctx context.Context, quoteID uuid.UUID) ([]PriceEscalator, error)
}

// PostgresEscalatorRepository implements EscalatorRepository with PostgreSQL.
type PostgresEscalatorRepository struct {
	db *database.DB
}

// NewEscalatorRepository creates a new escalator repository.
func NewEscalatorRepository(db *database.DB) *PostgresEscalatorRepository {
	return &PostgresEscalatorRepository{db: db}
}

func (r *PostgresEscalatorRepository) ListMarketIndices(ctx context.Context) ([]MarketIndex, error) {
	query := `
		SELECT id, COALESCE(index_code, ''), name, source, current_value, previous_value, unit,
		       COALESCE(commodity_kind, ''), COALESCE(description, ''), COALESCE(is_active, TRUE),
		       last_updated_at, created_at
		FROM market_indices
		WHERE COALESCE(is_active, TRUE) = TRUE
		ORDER BY name ASC`

	rows, err := r.db.GetExecutor(ctx).Query(ctx, query)
	if err != nil {
		return nil, fmt.Errorf("failed to list market indices: %w", err)
	}
	defer rows.Close()

	var indices []MarketIndex
	for rows.Next() {
		var idx MarketIndex
		if err := rows.Scan(
			&idx.ID, &idx.IndexCode, &idx.Name, &idx.Source, &idx.CurrentValue,
			&idx.PreviousValue, &idx.Unit, &idx.CommodityKind, &idx.Description,
			&idx.IsActive, &idx.LastUpdatedAt, &idx.CreatedAt,
		); err != nil {
			return nil, fmt.Errorf("failed to scan market index: %w", err)
		}
		indices = append(indices, idx)
	}
	return indices, nil
}

func (r *PostgresEscalatorRepository) GetMarketIndex(ctx context.Context, id uuid.UUID) (*MarketIndex, error) {
	query := `
		SELECT id, COALESCE(index_code, ''), name, source, current_value, previous_value, unit,
		       COALESCE(commodity_kind, ''), COALESCE(description, ''), COALESCE(is_active, TRUE),
		       last_updated_at, created_at
		FROM market_indices
		WHERE id = $1`

	var idx MarketIndex
	err := r.db.GetExecutor(ctx).QueryRow(ctx, query, id).Scan(
		&idx.ID, &idx.IndexCode, &idx.Name, &idx.Source, &idx.CurrentValue,
		&idx.PreviousValue, &idx.Unit, &idx.CommodityKind, &idx.Description,
		&idx.IsActive, &idx.LastUpdatedAt, &idx.CreatedAt,
	)
	if err != nil {
		if err == pgx.ErrNoRows {
			return nil, nil
		}
		return nil, fmt.Errorf("failed to get market index: %w", err)
	}
	return &idx, nil
}

// GetMarketIndexByCode looks up a market index by its stable machine-readable
// index_code (e.g., "RL_SPF_2X4"). Returns (nil, nil) when not found.
func (r *PostgresEscalatorRepository) GetMarketIndexByCode(ctx context.Context, code string) (*MarketIndex, error) {
	query := `
		SELECT id, COALESCE(index_code, ''), name, source, current_value, previous_value, unit,
		       COALESCE(commodity_kind, ''), COALESCE(description, ''), COALESCE(is_active, TRUE),
		       last_updated_at, created_at
		FROM market_indices
		WHERE index_code = $1`

	var idx MarketIndex
	err := r.db.GetExecutor(ctx).QueryRow(ctx, query, code).Scan(
		&idx.ID, &idx.IndexCode, &idx.Name, &idx.Source, &idx.CurrentValue,
		&idx.PreviousValue, &idx.Unit, &idx.CommodityKind, &idx.Description,
		&idx.IsActive, &idx.LastUpdatedAt, &idx.CreatedAt,
	)
	if err != nil {
		if err == pgx.ErrNoRows {
			return nil, nil
		}
		return nil, fmt.Errorf("failed to get market index by code: %w", err)
	}
	return &idx, nil
}

// UpdateMarketIndexMetadata updates display attributes (name, description, active
// flag) on an index. Value changes go through UpdateMarketIndex / the refresh flow.
func (r *PostgresEscalatorRepository) UpdateMarketIndexMetadata(ctx context.Context, id uuid.UUID, name, description string, isActive bool) error {
	q := `UPDATE market_indices
	      SET name = COALESCE(NULLIF($2, ''), name),
	          description = $3,
	          is_active = $4,
	          last_updated_at = NOW()
	      WHERE id = $1`
	_, err := r.db.GetExecutor(ctx).Exec(ctx, q, id, name, description, isActive)
	if err != nil {
		return fmt.Errorf("update market index metadata: %w", err)
	}
	return nil
}

// SnapshotEscalators inserts a batch of price_escalators rows in a single
// transaction. Used by SnapshotService when a quote transitions to SENT.
func (r *PostgresEscalatorRepository) SnapshotEscalators(ctx context.Context, escalators []PriceEscalator) error {
	if len(escalators) == 0 {
		return nil
	}
	now := time.Now()
	return r.db.RunInTx(ctx, func(txCtx context.Context) error {
		exec := r.db.GetExecutor(txCtx)
		q := `
			INSERT INTO price_escalators (
				id, quote_line_id, market_index_id, escalation_type, escalation_rate,
				base_price, base_index_value, base_index_recorded_at,
				current_state, policy_at_snapshot, threshold_pct_at_snapshot,
				effective_date, expiration_date, is_active, created_at, updated_at
			) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16)`
		for i := range escalators {
			esc := &escalators[i]
			if esc.ID == uuid.Nil {
				esc.ID = uuid.New()
			}
			if esc.CurrentState == "" {
				esc.CurrentState = string(ExposureStateOK)
			}
			esc.CreatedAt = now
			esc.UpdatedAt = now
			_, err := exec.Exec(txCtx, q,
				esc.ID, esc.QuoteLineID, esc.MarketIndexID, esc.EscalationType, esc.EscalationRate,
				esc.BasePrice, esc.BaseIndexValue, esc.BaseIndexRecordedAt,
				esc.CurrentState, esc.PolicyAtSnapshot, esc.ThresholdPctAtSnapshot,
				esc.EffectiveDate, esc.ExpirationDate, esc.IsActive, esc.CreatedAt, esc.UpdatedAt,
			)
			if err != nil {
				return fmt.Errorf("snapshot escalator: %w", err)
			}
		}
		return nil
	})
}

// ListEscalatorsForQuote returns every active escalator row tied to a quote's
// lines. Used by the per-quote exposure detail endpoint.
func (r *PostgresEscalatorRepository) ListEscalatorsForQuote(ctx context.Context, quoteID uuid.UUID) ([]PriceEscalator, error) {
	q := `
		SELECT pe.id, pe.quote_line_id, pe.market_index_id, pe.escalation_type, pe.escalation_rate,
		       pe.base_price, pe.base_index_value, pe.base_index_recorded_at, pe.last_checked_at,
		       pe.current_state, COALESCE(pe.policy_at_snapshot, ''), COALESCE(pe.threshold_pct_at_snapshot, 0),
		       pe.effective_date, pe.expiration_date, pe.is_active, pe.created_at, pe.updated_at
		FROM price_escalators pe
		JOIN quote_lines ql ON ql.id = pe.quote_line_id
		WHERE ql.quote_id = $1 AND pe.is_active = TRUE`
	rows, err := r.db.GetExecutor(ctx).Query(ctx, q, quoteID)
	if err != nil {
		return nil, fmt.Errorf("list escalators for quote: %w", err)
	}
	defer rows.Close()

	var out []PriceEscalator
	for rows.Next() {
		var pe PriceEscalator
		if err := rows.Scan(
			&pe.ID, &pe.QuoteLineID, &pe.MarketIndexID, &pe.EscalationType, &pe.EscalationRate,
			&pe.BasePrice, &pe.BaseIndexValue, &pe.BaseIndexRecordedAt, &pe.LastCheckedAt,
			&pe.CurrentState, &pe.PolicyAtSnapshot, &pe.ThresholdPctAtSnapshot,
			&pe.EffectiveDate, &pe.ExpirationDate, &pe.IsActive, &pe.CreatedAt, &pe.UpdatedAt,
		); err != nil {
			return nil, fmt.Errorf("scan escalator: %w", err)
		}
		out = append(out, pe)
	}
	return out, nil
}

func (r *PostgresEscalatorRepository) CreateMarketIndex(ctx context.Context, idx *MarketIndex) error {
	if idx.ID == uuid.Nil {
		idx.ID = uuid.New()
	}
	idx.CreatedAt = time.Now()
	idx.LastUpdatedAt = idx.CreatedAt

	query := `
		INSERT INTO market_indices (id, name, source, current_value, previous_value, unit, last_updated_at, created_at)
		VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`

	_, err := r.db.GetExecutor(ctx).Exec(ctx, query,
		idx.ID, idx.Name, idx.Source, idx.CurrentValue,
		idx.PreviousValue, idx.Unit, idx.LastUpdatedAt, idx.CreatedAt,
	)
	if err != nil {
		return fmt.Errorf("failed to create market index: %w", err)
	}
	return nil
}

func (r *PostgresEscalatorRepository) UpdateMarketIndex(ctx context.Context, idx *MarketIndex) error {
	idx.LastUpdatedAt = time.Now()

	// Use transaction wrapping for the multi-column update
	tx, err := r.db.Pool.Begin(ctx)
	if err != nil {
		return fmt.Errorf("failed to begin transaction: %w", err)
	}
	defer tx.Rollback(ctx)

	query := `
		UPDATE market_indices
		SET current_value = $2, previous_value = $3, last_updated_at = $4
		WHERE id = $1`

	_, err = tx.Exec(ctx, query, idx.ID, idx.CurrentValue, idx.PreviousValue, idx.LastUpdatedAt)
	if err != nil {
		return fmt.Errorf("failed to update market index: %w", err)
	}

	return tx.Commit(ctx)
}

func (r *PostgresEscalatorRepository) CreateEscalator(ctx context.Context, esc *PriceEscalator) error {
	if esc.ID == uuid.Nil {
		esc.ID = uuid.New()
	}
	now := time.Now()
	esc.CreatedAt = now
	esc.UpdatedAt = now

	// Transaction wrapping for referential integrity
	tx, err := r.db.Pool.Begin(ctx)
	if err != nil {
		return fmt.Errorf("failed to begin transaction: %w", err)
	}
	defer tx.Rollback(ctx)

	query := `
		INSERT INTO price_escalators (id, quote_line_id, market_index_id, escalation_type,
			escalation_rate, base_price, base_index_value, effective_date, expiration_date,
			is_active, created_at, updated_at)
		VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)`

	_, err = tx.Exec(ctx, query,
		esc.ID, esc.QuoteLineID, esc.MarketIndexID, esc.EscalationType,
		esc.EscalationRate, esc.BasePrice, esc.BaseIndexValue,
		esc.EffectiveDate, esc.ExpirationDate,
		esc.IsActive, esc.CreatedAt, esc.UpdatedAt,
	)
	if err != nil {
		return fmt.Errorf("failed to create escalator: %w", err)
	}

	return tx.Commit(ctx)
}

func (r *PostgresEscalatorRepository) GetEscalatorByQuoteLine(ctx context.Context, quoteLineID uuid.UUID) (*PriceEscalator, error) {
	query := `
		SELECT id, quote_line_id, market_index_id, escalation_type,
			escalation_rate, base_price, base_index_value, effective_date, expiration_date,
			is_active, created_at, updated_at
		FROM price_escalators
		WHERE quote_line_id = $1 AND is_active = true
		ORDER BY created_at DESC
		LIMIT 1`

	var esc PriceEscalator
	err := r.db.GetExecutor(ctx).QueryRow(ctx, query, quoteLineID).Scan(
		&esc.ID, &esc.QuoteLineID, &esc.MarketIndexID, &esc.EscalationType,
		&esc.EscalationRate, &esc.BasePrice, &esc.BaseIndexValue,
		&esc.EffectiveDate, &esc.ExpirationDate,
		&esc.IsActive, &esc.CreatedAt, &esc.UpdatedAt,
	)
	if err != nil {
		if err == pgx.ErrNoRows {
			return nil, nil
		}
		return nil, fmt.Errorf("failed to get escalator: %w", err)
	}
	return &esc, nil
}
