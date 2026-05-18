package millwork

import (
	"context"
	"fmt"

	"github.com/gablelbm/gable/pkg/database"
)

type Repository struct {
	db *database.DB
}

func NewRepository(db *database.DB) *Repository {
	return &Repository{db: db}
}

func (r *Repository) CreateOption(ctx context.Context, opt *MillworkOption) error {
	query := `
		INSERT INTO millwork_options (id, category, name, price_adjustment, attributes)
		VALUES ($1, $2, $3, $4, $5)
		RETURNING created_at, updated_at
	`
	return r.db.GetExecutor(ctx).QueryRow(ctx, query,
		opt.ID,
		opt.Category,
		opt.Name,
		opt.PriceAdjustment,
		opt.Attributes,
	).Scan(&opt.CreatedAt, &opt.UpdatedAt)
}

func (r *Repository) GetOptionsByCategory(ctx context.Context, category string) ([]MillworkOption, error) {
	query := `
		SELECT id, category, name, price_adjustment, attributes, created_at, updated_at
		FROM millwork_options
		WHERE category = $1
		ORDER BY name ASC
	`
	rows, err := r.db.GetExecutor(ctx).Query(ctx, query, category)
	if err != nil {
		return nil, fmt.Errorf("failed to query options: %w", err)
	}
	defer rows.Close()

	var options []MillworkOption
	for rows.Next() {
		var opt MillworkOption
		if err := rows.Scan(
			&opt.ID,
			&opt.Category,
			&opt.Name,
			&opt.PriceAdjustment,
			&opt.Attributes,
			&opt.CreatedAt,
			&opt.UpdatedAt,
		); err != nil {
			return nil, fmt.Errorf("failed to scan option: %w", err)
		}
		options = append(options, opt)
	}
	return options, nil
}
