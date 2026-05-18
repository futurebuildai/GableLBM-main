package governance

import (
	"context"
	"fmt"
	"time"

	"github.com/gablelbm/gable/pkg/database"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
)

type Repository interface {
	CreateRFC(ctx context.Context, rfc *RFC) error
	GetRFC(ctx context.Context, id uuid.UUID) (*RFC, error)
	ListRFCs(ctx context.Context) ([]RFC, error)
	UpdateRFC(ctx context.Context, rfc *RFC) error
}

type PostgresRepository struct {
	db *database.DB
}

func NewRepository(db *database.DB) *PostgresRepository {
	return &PostgresRepository{db: db}
}

func (r *PostgresRepository) CreateRFC(ctx context.Context, rfc *RFC) error {
	query := `
		INSERT INTO rfcs (title, status, problem_statement, proposed_solution, content, author_id, created_at, updated_at)
		VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
		RETURNING id
	`
	rfc.CreatedAt = time.Now()
	rfc.UpdatedAt = time.Now()
	if rfc.Status == "" {
		rfc.Status = RFCStatusDraft
	}

	err := r.db.GetExecutor(ctx).QueryRow(ctx, query,
		rfc.Title,
		rfc.Status,
		rfc.ProblemStatement,
		rfc.ProposedSolution,
		rfc.Content,
		rfc.AuthorID,
		rfc.CreatedAt,
		rfc.UpdatedAt,
	).Scan(&rfc.ID)

	if err != nil {
		return fmt.Errorf("failed to create rfc: %w", err)
	}
	return nil
}

func (r *PostgresRepository) GetRFC(ctx context.Context, id uuid.UUID) (*RFC, error) {
	query := `
		SELECT id, title, status, problem_statement, proposed_solution, content, author_id, created_at, updated_at
		FROM rfcs
		WHERE id = $1
	`
	var rfc RFC
	err := r.db.GetExecutor(ctx).QueryRow(ctx, query, id).Scan(
		&rfc.ID,
		&rfc.Title,
		&rfc.Status,
		&rfc.ProblemStatement,
		&rfc.ProposedSolution,
		&rfc.Content,
		&rfc.AuthorID,
		&rfc.CreatedAt,
		&rfc.UpdatedAt,
	)
	if err != nil {
		if err == pgx.ErrNoRows {
			return nil, fmt.Errorf("rfc not found")
		}
		return nil, fmt.Errorf("failed to get rfc: %w", err)
	}
	return &rfc, nil
}

func (r *PostgresRepository) ListRFCs(ctx context.Context) ([]RFC, error) {
	query := `
		SELECT id, title, status, problem_statement, proposed_solution, content, author_id, created_at, updated_at
		FROM rfcs
		ORDER BY created_at DESC
	`
	rows, err := r.db.GetExecutor(ctx).Query(ctx, query)
	if err != nil {
		return nil, fmt.Errorf("failed to list rfcs: %w", err)
	}
	defer rows.Close()

	var rfcs []RFC
	for rows.Next() {
		var rfc RFC
		if err := rows.Scan(
			&rfc.ID,
			&rfc.Title,
			&rfc.Status,
			&rfc.ProblemStatement,
			&rfc.ProposedSolution,
			&rfc.Content,
			&rfc.AuthorID,
			&rfc.CreatedAt,
			&rfc.UpdatedAt,
		); err != nil {
			return nil, fmt.Errorf("failed to scan rfc: %w", err)
		}
		rfcs = append(rfcs, rfc)
	}
	return rfcs, nil
}

func (r *PostgresRepository) UpdateRFC(ctx context.Context, rfc *RFC) error {
	query := `
		UPDATE rfcs
		SET title = $1, status = $2, problem_statement = $3, proposed_solution = $4, content = $5, updated_at = $6
		WHERE id = $7
	`
	rfc.UpdatedAt = time.Now()
	tag, err := r.db.GetExecutor(ctx).Exec(ctx, query,
		rfc.Title,
		rfc.Status,
		rfc.ProblemStatement,
		rfc.ProposedSolution,
		rfc.Content,
		rfc.UpdatedAt,
		rfc.ID,
	)
	if err != nil {
		return fmt.Errorf("failed to update rfc: %w", err)
	}
	if tag.RowsAffected() == 0 {
		return fmt.Errorf("rfc not found")
	}
	return nil
}
