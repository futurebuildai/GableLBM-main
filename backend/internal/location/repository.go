package location

import (
	"context"
	"errors"
	"fmt"

	"github.com/gablelbm/gable/pkg/database"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
)

// ErrNotFound is returned when a lookup by id finds no row.
var ErrNotFound = errors.New("location not found")

// locationColumns lists the columns selected by every SELECT so the scanner
// stays in sync with model.Location.
const locationColumns = `
    id, parent_id, path, type, code, description,
    name, address, city, state, zip, phone,
    tax_jurisdiction_code, default_tax_rate, timezone, active, branch_id,
    created_at, updated_at
`

type Repository interface {
	CreateLocation(ctx context.Context, loc *Location) error
	GetLocation(ctx context.Context, id uuid.UUID) (*Location, error)
	UpdateLocation(ctx context.Context, loc *Location) error
	DeleteLocation(ctx context.Context, id uuid.UUID) error // soft delete: active=false
	ListLocations(ctx context.Context) ([]Location, error)
	ListBranches(ctx context.Context, includeInactive bool) ([]Location, error)
	GetBranchTree(ctx context.Context, branchID uuid.UUID) ([]Location, error)
	IsBranch(ctx context.Context, id uuid.UUID) (bool, error)
}

type PostgresRepository struct {
	db *database.DB
}

func NewRepository(db *database.DB) *PostgresRepository {
	return &PostgresRepository{db: db}
}

func scanLocation(row pgx.Row, loc *Location) error {
	return row.Scan(
		&loc.ID,
		&loc.ParentID,
		&loc.Path,
		&loc.Type,
		&loc.Code,
		&loc.Description,
		&loc.Name,
		&loc.Address,
		&loc.City,
		&loc.State,
		&loc.Zip,
		&loc.Phone,
		&loc.TaxJurisdictionCode,
		&loc.DefaultTaxRate,
		&loc.Timezone,
		&loc.Active,
		&loc.BranchID,
		&loc.CreatedAt,
		&loc.UpdatedAt,
	)
}

func (r *PostgresRepository) CreateLocation(ctx context.Context, loc *Location) error {
	if loc.Timezone == "" {
		loc.Timezone = "America/New_York"
	}
	query := `
		INSERT INTO locations (
			parent_id, path, type, code, description,
			name, address, city, state, zip, phone,
			tax_jurisdiction_code, default_tax_rate, timezone, active
		)
		VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,COALESCE($15,TRUE))
		RETURNING ` + locationColumns

	row := r.db.GetExecutor(ctx).QueryRow(ctx, query,
		loc.ParentID, loc.Path, loc.Type, loc.Code, loc.Description,
		loc.Name, loc.Address, loc.City, loc.State, loc.Zip, loc.Phone,
		loc.TaxJurisdictionCode, loc.DefaultTaxRate, loc.Timezone, loc.Active,
	)
	if err := scanLocation(row, loc); err != nil {
		return fmt.Errorf("create location: %w", err)
	}
	return nil
}

func (r *PostgresRepository) GetLocation(ctx context.Context, id uuid.UUID) (*Location, error) {
	query := `SELECT ` + locationColumns + ` FROM locations WHERE id = $1`
	var loc Location
	if err := scanLocation(r.db.GetExecutor(ctx).QueryRow(ctx, query, id), &loc); err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, ErrNotFound
		}
		return nil, fmt.Errorf("get location: %w", err)
	}
	return &loc, nil
}

func (r *PostgresRepository) UpdateLocation(ctx context.Context, loc *Location) error {
	query := `
		UPDATE locations SET
			path = $2,
			code = $3,
			description = $4,
			name = $5,
			address = $6,
			city = $7,
			state = $8,
			zip = $9,
			phone = $10,
			tax_jurisdiction_code = $11,
			default_tax_rate = $12,
			timezone = COALESCE(NULLIF($13,''), timezone),
			active = $14,
			updated_at = NOW()
		WHERE id = $1
		RETURNING ` + locationColumns

	row := r.db.GetExecutor(ctx).QueryRow(ctx, query,
		loc.ID, loc.Path, loc.Code, loc.Description,
		loc.Name, loc.Address, loc.City, loc.State, loc.Zip, loc.Phone,
		loc.TaxJurisdictionCode, loc.DefaultTaxRate, loc.Timezone, loc.Active,
	)
	if err := scanLocation(row, loc); err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return ErrNotFound
		}
		return fmt.Errorf("update location: %w", err)
	}
	return nil
}

// DeleteLocation soft-deletes by setting active=false. Branches can be
// archived this way; bins typically shouldn't be soft-deleted (use a hard
// delete via DELETE FROM if needed).
func (r *PostgresRepository) DeleteLocation(ctx context.Context, id uuid.UUID) error {
	tag, err := r.db.GetExecutor(ctx).Exec(ctx,
		`UPDATE locations SET active = FALSE, updated_at = NOW() WHERE id = $1`, id)
	if err != nil {
		return fmt.Errorf("delete location: %w", err)
	}
	if tag.RowsAffected() == 0 {
		return ErrNotFound
	}
	return nil
}

func (r *PostgresRepository) ListLocations(ctx context.Context) ([]Location, error) {
	return r.listWhere(ctx, ``)
}

func (r *PostgresRepository) ListBranches(ctx context.Context, includeInactive bool) ([]Location, error) {
	where := `WHERE type = 'BRANCH'`
	if !includeInactive {
		where += ` AND active = TRUE`
	}
	return r.listWhere(ctx, where)
}

// GetBranchTree returns the branch row plus all of its descendants ordered
// by path. The caller is responsible for stitching them into a tree if
// needed; the materialized `path` column is sufficient for most UI use cases.
func (r *PostgresRepository) GetBranchTree(ctx context.Context, branchID uuid.UUID) ([]Location, error) {
	query := `SELECT ` + locationColumns + ` FROM locations
	          WHERE branch_id = $1 OR id = $1
	          ORDER BY path ASC`
	rows, err := r.db.GetExecutor(ctx).Query(ctx, query, branchID)
	if err != nil {
		return nil, fmt.Errorf("get branch tree: %w", err)
	}
	return scanLocations(rows)
}

func (r *PostgresRepository) IsBranch(ctx context.Context, id uuid.UUID) (bool, error) {
	var t string
	err := r.db.GetExecutor(ctx).QueryRow(ctx,
		`SELECT type FROM locations WHERE id = $1`, id).Scan(&t)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return false, ErrNotFound
		}
		return false, fmt.Errorf("is branch: %w", err)
	}
	return t == string(LocTypeBranch), nil
}

// listWhere accepts an optional WHERE clause beginning with "WHERE" (or empty).
func (r *PostgresRepository) listWhere(ctx context.Context, where string) ([]Location, error) {
	query := `SELECT ` + locationColumns + ` FROM locations ` + where + ` ORDER BY path ASC`
	rows, err := r.db.GetExecutor(ctx).Query(ctx, query)
	if err != nil {
		return nil, fmt.Errorf("list locations: %w", err)
	}
	return scanLocations(rows)
}

func scanLocations(rows pgx.Rows) ([]Location, error) {
	defer rows.Close()
	var locs []Location
	for rows.Next() {
		var loc Location
		if err := scanLocation(rows, &loc); err != nil {
			return nil, fmt.Errorf("scan location: %w", err)
		}
		locs = append(locs, loc)
	}
	return locs, rows.Err()
}
