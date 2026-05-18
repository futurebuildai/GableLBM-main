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
		SELECT id, name, source, current_value, previous_value, unit, last_updated_at, created_at
		FROM market_indices
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
			&idx.ID, &idx.Name, &idx.Source, &idx.CurrentValue,
			&idx.PreviousValue, &idx.Unit, &idx.LastUpdatedAt, &idx.CreatedAt,
		); err != nil {
			return nil, fmt.Errorf("failed to scan market index: %w", err)
		}
		indices = append(indices, idx)
	}
	return indices, nil
}

func (r *PostgresEscalatorRepository) GetMarketIndex(ctx context.Context, id uuid.UUID) (*MarketIndex, error) {
	query := `
		SELECT id, name, source, current_value, previous_value, unit, last_updated_at, created_at
		FROM market_indices
		WHERE id = $1`

	var idx MarketIndex
	err := r.db.GetExecutor(ctx).QueryRow(ctx, query, id).Scan(
		&idx.ID, &idx.Name, &idx.Source, &idx.CurrentValue,
		&idx.PreviousValue, &idx.Unit, &idx.LastUpdatedAt, &idx.CreatedAt,
	)
	if err != nil {
		if err == pgx.ErrNoRows {
			return nil, nil
		}
		return nil, fmt.Errorf("failed to get market index: %w", err)
	}
	return &idx, nil
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
