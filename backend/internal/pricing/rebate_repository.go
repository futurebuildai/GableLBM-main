package pricing

import (
	"context"
	"fmt"
	"time"

	"github.com/gablelbm/gable/pkg/database"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
)

type RebateRepository interface {
	CreateProgram(ctx context.Context, p *RebateProgram) error
	GetProgram(ctx context.Context, id uuid.UUID) (*RebateProgram, error)
	ListPrograms(ctx context.Context, vendorID *uuid.UUID) ([]RebateProgram, error)

	CreateTiers(ctx context.Context, programID uuid.UUID, tiers []RebateTier) error
	GetTiersByProgram(ctx context.Context, programID uuid.UUID) ([]RebateTier, error)

	CreateClaim(ctx context.Context, c *RebateClaim) error
	ListClaims(ctx context.Context, programID *uuid.UUID) ([]RebateClaim, error)
}

type postgresRebateRepository struct {
	db *database.DB
}

func NewRebateRepository(db *database.DB) RebateRepository {
	return &postgresRebateRepository{db: db}
}

func (r *postgresRebateRepository) CreateProgram(ctx context.Context, p *RebateProgram) error {
	if p.ID == uuid.Nil {
		p.ID = uuid.New()
	}
	now := time.Now()
	p.CreatedAt = now

	query := `
		INSERT INTO rebate_programs (id, vendor_id, name, program_type, start_date, end_date, is_active, created_at)
		VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
	`
	_, err := r.db.GetExecutor(ctx).Exec(ctx, query,
		p.ID, p.VendorID, p.Name, p.ProgramType, p.StartDate, p.EndDate, p.IsActive, p.CreatedAt,
	)
	if err != nil {
		return fmt.Errorf("failed to create rebate program: %w", err)
	}
	return nil
}

func (r *postgresRebateRepository) GetProgram(ctx context.Context, id uuid.UUID) (*RebateProgram, error) {
	query := `
		SELECT id, vendor_id, name, program_type, start_date, end_date, is_active, created_at
		FROM rebate_programs
		WHERE id = $1
	`
	var p RebateProgram
	err := r.db.GetExecutor(ctx).QueryRow(ctx, query, id).Scan(
		&p.ID, &p.VendorID, &p.Name, &p.ProgramType, &p.StartDate, &p.EndDate, &p.IsActive, &p.CreatedAt,
	)
	if err != nil {
		if err == pgx.ErrNoRows {
			return nil, nil // Not found
		}
		return nil, fmt.Errorf("failed to get rebate program: %w", err)
	}
	return &p, nil
}

func (r *postgresRebateRepository) ListPrograms(ctx context.Context, vendorID *uuid.UUID) ([]RebateProgram, error) {
	query := `
		SELECT id, vendor_id, name, program_type, start_date, end_date, is_active, created_at
		FROM rebate_programs
		WHERE ($1::uuid IS NULL OR vendor_id = $1)
		ORDER BY created_at DESC
	`
	rows, err := r.db.GetExecutor(ctx).Query(ctx, query, vendorID)
	if err != nil {
		return nil, fmt.Errorf("failed to list rebate programs: %w", err)
	}
	defer rows.Close()

	var programs []RebateProgram
	for rows.Next() {
		var p RebateProgram
		if err := rows.Scan(
			&p.ID, &p.VendorID, &p.Name, &p.ProgramType, &p.StartDate, &p.EndDate, &p.IsActive, &p.CreatedAt,
		); err != nil {
			return nil, fmt.Errorf("failed to scan rebate program: %w", err)
		}
		programs = append(programs, p)
	}
	return programs, nil
}

func (r *postgresRebateRepository) CreateTiers(ctx context.Context, programID uuid.UUID, tiers []RebateTier) error {
	for _, t := range tiers {
		if t.ID == uuid.Nil {
			t.ID = uuid.New()
		}
		t.ProgramID = programID
		t.CreatedAt = time.Time{} // Defaults effectively skip overrides in simplest case

		query := `
			INSERT INTO rebate_tiers (id, program_id, min_volume, max_volume, rebate_pct)
			VALUES ($1, $2, $3, $4, $5)
		`
		_, err := r.db.GetExecutor(ctx).Exec(ctx, query, t.ID, t.ProgramID, t.MinVolume, t.MaxVolume, t.RebatePct)
		if err != nil {
			return fmt.Errorf("failed to create tier: %w", err)
		}
	}
	return nil
}

func (r *postgresRebateRepository) GetTiersByProgram(ctx context.Context, programID uuid.UUID) ([]RebateTier, error) {
	query := `
		SELECT id, program_id, min_volume, max_volume, rebate_pct, created_at
		FROM rebate_tiers
		WHERE program_id = $1
		ORDER BY min_volume ASC
	`
	rows, err := r.db.GetExecutor(ctx).Query(ctx, query, programID)
	if err != nil {
		return nil, fmt.Errorf("failed to get tiers: %w", err)
	}
	defer rows.Close()

	var tiers []RebateTier
	for rows.Next() {
		var t RebateTier
		if err := rows.Scan(&t.ID, &t.ProgramID, &t.MinVolume, &t.MaxVolume, &t.RebatePct, &t.CreatedAt); err != nil {
			return nil, fmt.Errorf("failed to scan tier: %w", err)
		}
		tiers = append(tiers, t)
	}
	return tiers, nil
}

func (r *postgresRebateRepository) CreateClaim(ctx context.Context, c *RebateClaim) error {
	if c.ID == uuid.Nil {
		c.ID = uuid.New()
	}
	c.CreatedAt = time.Now()

	query := `
		INSERT INTO rebate_claims (id, program_id, period_start, period_end, qualifying_volume, rebate_amount, status, claimed_at, created_at)
		VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
	`
	_, err := r.db.GetExecutor(ctx).Exec(ctx, query,
		c.ID, c.ProgramID, c.PeriodStart, c.PeriodEnd, c.QualifyingVolume, c.RebateAmount, c.Status, c.ClaimedAt, c.CreatedAt,
	)
	if err != nil {
		return fmt.Errorf("failed to create rebate claim: %w", err)
	}
	return nil
}

func (r *postgresRebateRepository) ListClaims(ctx context.Context, programID *uuid.UUID) ([]RebateClaim, error) {
	query := `
		SELECT id, program_id, period_start, period_end, qualifying_volume, rebate_amount, status, claimed_at, created_at
		FROM rebate_claims
		WHERE ($1::uuid IS NULL OR program_id = $1)
		ORDER BY period_end DESC
	`
	rows, err := r.db.GetExecutor(ctx).Query(ctx, query, programID)
	if err != nil {
		return nil, fmt.Errorf("failed to list rebate claims: %w", err)
	}
	defer rows.Close()

	var claims []RebateClaim
	for rows.Next() {
		var c RebateClaim
		if err := rows.Scan(
			&c.ID, &c.ProgramID, &c.PeriodStart, &c.PeriodEnd, &c.QualifyingVolume, &c.RebateAmount, &c.Status, &c.ClaimedAt, &c.CreatedAt,
		); err != nil {
			return nil, fmt.Errorf("failed to scan rebate claim: %w", err)
		}
		claims = append(claims, c)
	}
	return claims, nil
}
