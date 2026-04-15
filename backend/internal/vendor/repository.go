package vendor

import (
	"context"

	"github.com/gablelbm/gable/pkg/database"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
)

type Repository interface {
	ListVendors(ctx context.Context) ([]Vendor, error)
	GetVendor(ctx context.Context, id uuid.UUID) (*Vendor, error)
	CreateVendor(ctx context.Context, v *Vendor) error
	UpdateStats(ctx context.Context, id uuid.UUID, leadTime float64, fillRate float64, spend float64) error
	GetVendorByName(ctx context.Context, name string) (*Vendor, error)
}

type PostgresRepository struct {
	db *database.DB
}

func NewRepository(db *database.DB) *PostgresRepository {
	return &PostgresRepository{db: db}
}

func (r *PostgresRepository) ListVendors(ctx context.Context) ([]Vendor, error) {
	query := `
		SELECT id, name, contact_email, phone, address_line1, city, state, zip, payment_terms,
		       average_lead_time_days, fill_rate, total_spend_ytd, created_at, updated_at
		FROM vendors
		ORDER BY name ASC
	`
	rows, err := r.db.GetExecutor(ctx).Query(ctx, query)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var vendors []Vendor
	for rows.Next() {
		var v Vendor
		if err := rows.Scan(
			&v.ID, &v.Name, &v.ContactEmail, &v.Phone,
			&v.AddressLine1, &v.City, &v.State, &v.Zip, &v.PaymentTerms,
			&v.AverageLeadTimeDays, &v.FillRate, &v.TotalSpendYTD,
			&v.CreatedAt, &v.UpdatedAt,
		); err != nil {
			return nil, err
		}
		vendors = append(vendors, v)
	}
	return vendors, nil
}

func (r *PostgresRepository) GetVendor(ctx context.Context, id uuid.UUID) (*Vendor, error) {
	query := `
		SELECT id, name, contact_email, phone, address_line1, city, state, zip, payment_terms,
		       average_lead_time_days, fill_rate, total_spend_ytd, created_at, updated_at
		FROM vendors
		WHERE id = $1
	`
	var v Vendor
	err := r.db.GetExecutor(ctx).QueryRow(ctx, query, id).Scan(
		&v.ID, &v.Name, &v.ContactEmail, &v.Phone,
		&v.AddressLine1, &v.City, &v.State, &v.Zip, &v.PaymentTerms,
		&v.AverageLeadTimeDays, &v.FillRate, &v.TotalSpendYTD,
		&v.CreatedAt, &v.UpdatedAt,
	)
	if err != nil {
		if err == pgx.ErrNoRows {
			return nil, nil // Not found
		}
		return nil, err
	}
	return &v, nil
}

func (r *PostgresRepository) GetVendorByName(ctx context.Context, name string) (*Vendor, error) {
	query := `
       SELECT id, name, contact_email, phone, address_line1, city, state, zip, payment_terms,
              average_lead_time_days, fill_rate, total_spend_ytd, created_at, updated_at
       FROM vendors
       WHERE name = $1
   `
	var v Vendor
	err := r.db.GetExecutor(ctx).QueryRow(ctx, query, name).Scan(
		&v.ID, &v.Name, &v.ContactEmail, &v.Phone,
		&v.AddressLine1, &v.City, &v.State, &v.Zip, &v.PaymentTerms,
		&v.AverageLeadTimeDays, &v.FillRate, &v.TotalSpendYTD,
		&v.CreatedAt, &v.UpdatedAt,
	)
	if err != nil {
		if err == pgx.ErrNoRows {
			return nil, nil // Not found
		}
		return nil, err
	}
	return &v, nil
}

func (r *PostgresRepository) CreateVendor(ctx context.Context, v *Vendor) error {
	query := `
		INSERT INTO vendors (name, contact_email, phone, payment_terms)
		VALUES ($1, $2, $3, $4)
		RETURNING id, created_at, updated_at
	`
	return r.db.GetExecutor(ctx).QueryRow(ctx, query, v.Name, v.ContactEmail, v.Phone, v.PaymentTerms).Scan(
		&v.ID, &v.CreatedAt, &v.UpdatedAt,
	)
}

func (r *PostgresRepository) UpdateStats(ctx context.Context, id uuid.UUID, leadTime float64, fillRate float64, spend float64) error {
	query := `
		UPDATE vendors
		SET average_lead_time_days = $1, fill_rate = $2, total_spend_ytd = $3, updated_at = NOW()
		WHERE id = $4
	`
	_, err := r.db.GetExecutor(ctx).Exec(ctx, query, leadTime, fillRate, spend, id)
	return err
}
