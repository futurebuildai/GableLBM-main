package location

import (
	"context"
	"fmt"

	"github.com/gablelbm/gable/pkg/database"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
)

type Repository interface {
	CreateLocation(ctx context.Context, loc *Location) error
	GetLocation(ctx context.Context, id uuid.UUID) (*Location, error)
	ListLocations(ctx context.Context) ([]Location, error)
	// Add other methods as needed: delete, update, etc.
}

type PostgresRepository struct {
	db *database.DB
}

func NewRepository(db *database.DB) *PostgresRepository {
	return &PostgresRepository{db: db}
}

func (r *PostgresRepository) CreateLocation(ctx context.Context, loc *Location) error {
	query := `
		INSERT INTO locations (parent_id, path, type, code, description)
		VALUES ($1, $2, $3, $4, $5)
		RETURNING id, created_at, updated_at
	`

	err := r.db.GetExecutor(ctx).QueryRow(ctx, query, loc.ParentID, loc.Path, loc.Type, loc.Code, loc.Description).Scan(
		&loc.ID,
		&loc.CreatedAt,
		&loc.UpdatedAt,
	)

	if err != nil {
		return fmt.Errorf("failed to create location: %w", err)
	}

	return nil
}

func (r *PostgresRepository) GetLocation(ctx context.Context, id uuid.UUID) (*Location, error) {
	query := `
		SELECT id, parent_id, path, type, code, description, created_at, updated_at
		FROM locations
		WHERE id = $1
	`

	var loc Location
	err := r.db.GetExecutor(ctx).QueryRow(ctx, query, id).Scan(
		&loc.ID,
		&loc.ParentID,
		&loc.Path,
		&loc.Type,
		&loc.Code,
		&loc.Description,
		&loc.CreatedAt,
		&loc.UpdatedAt,
	)

	if err != nil {
		if err == pgx.ErrNoRows {
			return nil, fmt.Errorf("location not found")
		}
		return nil, fmt.Errorf("failed to get location: %w", err)
	}

	return &loc, nil
}

func (r *PostgresRepository) ListLocations(ctx context.Context) ([]Location, error) {
	query := `
		SELECT id, parent_id, path, type, code, description, created_at, updated_at
		FROM locations
		ORDER BY path ASC
	`

	rows, err := r.db.GetExecutor(ctx).Query(ctx, query)
	if err != nil {
		return nil, fmt.Errorf("failed to list locations: %w", err)
	}
	defer rows.Close()

	var locations []Location
	for rows.Next() {
		var loc Location
		if err := rows.Scan(
			&loc.ID,
			&loc.ParentID,
			&loc.Path,
			&loc.Type,
			&loc.Code,
			&loc.Description,
			&loc.CreatedAt,
			&loc.UpdatedAt,
		); err != nil {
			return nil, fmt.Errorf("failed to scan location: %w", err)
		}
		locations = append(locations, loc)
	}

	return locations, nil
}
