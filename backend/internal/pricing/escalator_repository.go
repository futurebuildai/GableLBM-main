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

// EscalatorRepository defines the data access interface for escalator operations.
type EscalatorRepository interface {
	ListMarketIndices(ctx context.Context) ([]MarketIndex, error)
	GetMarketIndex(ctx context.Context, id uuid.UUID) (*MarketIndex, error)
	GetMarketIndexByCode(ctx context.Context, code string) (*MarketIndex, error)
	CreateMarketIndex(ctx context.Context, idx *MarketIndex) error
	UpdateMarketIndex(ctx context.Context, idx *MarketIndex) error
	UpdateMarketIndexMetadata(ctx context.Context, id uuid.UUID, name, description string, isActive bool) error
	CreateEscalator(ctx context.Context, esc *PriceEscalator) error
	SnapshotEscalators(ctx context.Context, escalators []PriceEscalator) error
	GetEscalatorByQuoteLine(ctx context.Context, quoteLineID uuid.UUID) (*PriceEscalator, error)
}

// marketIndexColumns is the canonical SELECT list for market_indices, shared by
// the by-id, by-code, and list reads so scan order stays in lockstep.
const marketIndexColumns = `id, name, source, current_value, previous_value, unit,
	last_updated_at, created_at, index_code, commodity_kind, description, is_active`

// scanMarketIndex scans a row produced by a SELECT of marketIndexColumns.
func scanMarketIndex(row pgx.Row, idx *MarketIndex) error {
	return row.Scan(
		&idx.ID, &idx.Name, &idx.Source, &idx.CurrentValue, &idx.PreviousValue,
		&idx.Unit, &idx.LastUpdatedAt, &idx.CreatedAt,
		&idx.IndexCode, &idx.CommodityKind, &idx.Description, &idx.IsActive,
	)
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
	query := `SELECT ` + marketIndexColumns + ` FROM market_indices ORDER BY name ASC`

	rows, err := r.db.GetExecutor(ctx).Query(ctx, query)
	if err != nil {
		return nil, fmt.Errorf("failed to list market indices: %w", err)
	}
	defer rows.Close()

	var indices []MarketIndex
	for rows.Next() {
		var idx MarketIndex
		if err := scanMarketIndex(rows, &idx); err != nil {
			return nil, fmt.Errorf("failed to scan market index: %w", err)
		}
		indices = append(indices, idx)
	}
	return indices, nil
}

func (r *PostgresEscalatorRepository) GetMarketIndex(ctx context.Context, id uuid.UUID) (*MarketIndex, error) {
	query := `SELECT ` + marketIndexColumns + ` FROM market_indices WHERE id = $1`

	var idx MarketIndex
	err := scanMarketIndex(r.db.GetExecutor(ctx).QueryRow(ctx, query, id), &idx)
	if err != nil {
		if err == pgx.ErrNoRows {
			return nil, nil
		}
		return nil, fmt.Errorf("failed to get market index: %w", err)
	}
	return &idx, nil
}

func (r *PostgresEscalatorRepository) GetMarketIndexByCode(ctx context.Context, code string) (*MarketIndex, error) {
	query := `SELECT ` + marketIndexColumns + ` FROM market_indices WHERE index_code = $1`

	var idx MarketIndex
	err := scanMarketIndex(r.db.GetExecutor(ctx).QueryRow(ctx, query, code), &idx)
	if err != nil {
		if err == pgx.ErrNoRows {
			return nil, nil
		}
		return nil, fmt.Errorf("failed to get market index by code: %w", err)
	}
	return &idx, nil
}

func (r *PostgresEscalatorRepository) CreateMarketIndex(ctx context.Context, idx *MarketIndex) error {
	if idx.ID == uuid.Nil {
		idx.ID = uuid.New()
	}
	idx.CreatedAt = time.Now()
	idx.LastUpdatedAt = idx.CreatedAt
	if !idx.IsActive {
		idx.IsActive = true
	}

	query := `
		INSERT INTO market_indices (id, name, source, current_value, previous_value, unit,
			last_updated_at, created_at, index_code, commodity_kind, description, is_active)
		VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)`

	_, err := r.db.GetExecutor(ctx).Exec(ctx, query,
		idx.ID, idx.Name, idx.Source, idx.CurrentValue,
		idx.PreviousValue, idx.Unit, idx.LastUpdatedAt, idx.CreatedAt,
		idx.IndexCode, idx.CommodityKind, idx.Description, idx.IsActive,
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

// UpdateMarketIndexMetadata edits display metadata + active flag without
// touching current_value (value changes go through the refresh path so they
// always write a history row). Empty name/description are treated as
// "leave unchanged" via COALESCE on NULLIF.
func (r *PostgresEscalatorRepository) UpdateMarketIndexMetadata(ctx context.Context, id uuid.UUID, name, description string, isActive bool) error {
	query := `
		UPDATE market_indices
		SET name        = COALESCE(NULLIF($2, ''), name),
		    description = COALESCE(NULLIF($3, ''), description),
		    is_active   = $4,
		    last_updated_at = NOW()
		WHERE id = $1`
	if _, err := r.db.GetExecutor(ctx).Exec(ctx, query, id, name, description, isActive); err != nil {
		return fmt.Errorf("update market index metadata: %w", err)
	}
	return nil
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

	if esc.CurrentState == "" {
		esc.CurrentState = "OK"
	}

	query := `
		INSERT INTO price_escalators (id, quote_line_id, market_index_id, escalation_type,
			escalation_rate, base_price, base_index_value, effective_date, expiration_date,
			is_active, created_at, updated_at,
			base_index_recorded_at, last_checked_at, current_state,
			policy_at_snapshot, threshold_pct_at_snapshot)
		VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17)`

	_, err = tx.Exec(ctx, query,
		esc.ID, esc.QuoteLineID, esc.MarketIndexID, esc.EscalationType,
		esc.EscalationRate, esc.BasePrice, esc.BaseIndexValue,
		esc.EffectiveDate, esc.ExpirationDate,
		esc.IsActive, esc.CreatedAt, esc.UpdatedAt,
		esc.BaseIndexRecordedAt, esc.LastCheckedAt, esc.CurrentState,
		esc.PolicyAtSnapshot, esc.ThresholdPctAtSnapshot,
	)
	if err != nil {
		return fmt.Errorf("failed to create escalator: %w", err)
	}

	return tx.Commit(ctx)
}

// SnapshotEscalators inserts a batch of price_escalators rows. Uses the
// caller's executor (so it participates in an enclosing RunInTx) and a single
// multi-row INSERT so the snapshot is atomic with the surrounding deactivate +
// rollup-reset in SnapshotService. Missing IDs/timestamps are filled in.
func (r *PostgresEscalatorRepository) SnapshotEscalators(ctx context.Context, escalators []PriceEscalator) error {
	if len(escalators) == 0 {
		return nil
	}
	now := time.Now()
	const cols = 17
	args := make([]any, 0, len(escalators)*cols)
	placeholders := make([]string, 0, len(escalators))
	for i := range escalators {
		esc := &escalators[i]
		if esc.ID == uuid.Nil {
			esc.ID = uuid.New()
		}
		if esc.CreatedAt.IsZero() {
			esc.CreatedAt = now
		}
		esc.UpdatedAt = now
		if esc.CurrentState == "" {
			esc.CurrentState = "OK"
		}
		base := i * cols
		ph := make([]string, cols)
		for j := 0; j < cols; j++ {
			ph[j] = fmt.Sprintf("$%d", base+j+1)
		}
		placeholders = append(placeholders, "("+strings.Join(ph, ", ")+")")
		args = append(args,
			esc.ID, esc.QuoteLineID, esc.MarketIndexID, esc.EscalationType,
			esc.EscalationRate, esc.BasePrice, esc.BaseIndexValue,
			esc.EffectiveDate, esc.ExpirationDate,
			esc.IsActive, esc.CreatedAt, esc.UpdatedAt,
			esc.BaseIndexRecordedAt, esc.LastCheckedAt, esc.CurrentState,
			esc.PolicyAtSnapshot, esc.ThresholdPctAtSnapshot,
		)
	}
	query := `
		INSERT INTO price_escalators (id, quote_line_id, market_index_id, escalation_type,
			escalation_rate, base_price, base_index_value, effective_date, expiration_date,
			is_active, created_at, updated_at,
			base_index_recorded_at, last_checked_at, current_state,
			policy_at_snapshot, threshold_pct_at_snapshot)
		VALUES ` + strings.Join(placeholders, ", ")
	if _, err := r.db.GetExecutor(ctx).Exec(ctx, query, args...); err != nil {
		return fmt.Errorf("snapshot escalators: %w", err)
	}
	return nil
}

// escalatorColumns is the canonical SELECT list for price_escalators.
const escalatorColumns = `id, quote_line_id, market_index_id, escalation_type,
	escalation_rate, base_price, base_index_value, effective_date, expiration_date,
	is_active, created_at, updated_at,
	base_index_recorded_at, last_checked_at, current_state,
	policy_at_snapshot, threshold_pct_at_snapshot`

// scanEscalator scans a row produced by a SELECT of escalatorColumns.
func scanEscalator(row pgx.Row, esc *PriceEscalator) error {
	return row.Scan(
		&esc.ID, &esc.QuoteLineID, &esc.MarketIndexID, &esc.EscalationType,
		&esc.EscalationRate, &esc.BasePrice, &esc.BaseIndexValue,
		&esc.EffectiveDate, &esc.ExpirationDate,
		&esc.IsActive, &esc.CreatedAt, &esc.UpdatedAt,
		&esc.BaseIndexRecordedAt, &esc.LastCheckedAt, &esc.CurrentState,
		&esc.PolicyAtSnapshot, &esc.ThresholdPctAtSnapshot,
	)
}

func (r *PostgresEscalatorRepository) GetEscalatorByQuoteLine(ctx context.Context, quoteLineID uuid.UUID) (*PriceEscalator, error) {
	query := `SELECT ` + escalatorColumns + `
		FROM price_escalators
		WHERE quote_line_id = $1 AND is_active = true
		ORDER BY created_at DESC
		LIMIT 1`

	var esc PriceEscalator
	err := scanEscalator(r.db.GetExecutor(ctx).QueryRow(ctx, query, quoteLineID), &esc)
	if err != nil {
		if err == pgx.ErrNoRows {
			return nil, nil
		}
		return nil, fmt.Errorf("failed to get escalator: %w", err)
	}
	return &esc, nil
}
