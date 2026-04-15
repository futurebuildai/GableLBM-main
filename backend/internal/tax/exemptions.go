package tax

import (
	"context"
	"fmt"
	"time"

	"github.com/gablelbm/gable/pkg/database"
	"github.com/google/uuid"
)

// ExemptionRepo handles persistence of tax exemption certificates.
type ExemptionRepo interface {
	GetByCustomer(ctx context.Context, customerID uuid.UUID) ([]TaxExemption, error)
	GetActiveByCustomer(ctx context.Context, customerID uuid.UUID) ([]TaxExemption, error)
	Create(ctx context.Context, ex *TaxExemption) error
	Delete(ctx context.Context, id uuid.UUID) error
}

// PostgresExemptionRepo implements ExemptionRepo with PostgreSQL.
type PostgresExemptionRepo struct {
	db *database.DB
}

// NewExemptionRepo creates a new PostgresExemptionRepo.
func NewExemptionRepo(db *database.DB) *PostgresExemptionRepo {
	return &PostgresExemptionRepo{db: db}
}

func (r *PostgresExemptionRepo) GetByCustomer(ctx context.Context, customerID uuid.UUID) ([]TaxExemption, error) {
	query := `
		SELECT id, customer_id, exempt_reason, certificate_number, issuing_state,
		       effective_date, expiry_date, is_active, created_at
		FROM tax_exemptions
		WHERE customer_id = $1
		ORDER BY created_at DESC`

	rows, err := r.db.GetExecutor(ctx).Query(ctx, query, customerID)
	if err != nil {
		return nil, fmt.Errorf("query exemptions: %w", err)
	}
	defer rows.Close()

	var exemptions []TaxExemption
	for rows.Next() {
		var ex TaxExemption
		if err := rows.Scan(
			&ex.ID, &ex.CustomerID, &ex.ExemptReason, &ex.CertificateNumber,
			&ex.IssuingState, &ex.EffectiveDate, &ex.ExpiryDate, &ex.IsActive, &ex.CreatedAt,
		); err != nil {
			return nil, fmt.Errorf("scan exemption: %w", err)
		}
		exemptions = append(exemptions, ex)
	}
	return exemptions, nil
}

func (r *PostgresExemptionRepo) GetActiveByCustomer(ctx context.Context, customerID uuid.UUID) ([]TaxExemption, error) {
	query := `
		SELECT id, customer_id, exempt_reason, certificate_number, issuing_state,
		       effective_date, expiry_date, is_active, created_at
		FROM tax_exemptions
		WHERE customer_id = $1
		  AND is_active = true
		  AND effective_date <= CURRENT_DATE
		  AND (expiry_date IS NULL OR expiry_date >= CURRENT_DATE)
		ORDER BY created_at DESC`

	rows, err := r.db.GetExecutor(ctx).Query(ctx, query, customerID)
	if err != nil {
		return nil, fmt.Errorf("query active exemptions: %w", err)
	}
	defer rows.Close()

	var exemptions []TaxExemption
	for rows.Next() {
		var ex TaxExemption
		if err := rows.Scan(
			&ex.ID, &ex.CustomerID, &ex.ExemptReason, &ex.CertificateNumber,
			&ex.IssuingState, &ex.EffectiveDate, &ex.ExpiryDate, &ex.IsActive, &ex.CreatedAt,
		); err != nil {
			return nil, fmt.Errorf("scan active exemption: %w", err)
		}
		exemptions = append(exemptions, ex)
	}
	return exemptions, nil
}

func (r *PostgresExemptionRepo) Create(ctx context.Context, ex *TaxExemption) error {
	if ex.ID == uuid.Nil {
		ex.ID = uuid.New()
	}
	if ex.CreatedAt.IsZero() {
		ex.CreatedAt = time.Now()
	}
	if ex.EffectiveDate.IsZero() {
		ex.EffectiveDate = time.Now()
	}

	query := `
		INSERT INTO tax_exemptions (id, customer_id, exempt_reason, certificate_number,
		                            issuing_state, effective_date, expiry_date, is_active, created_at)
		VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`

	_, err := r.db.GetExecutor(ctx).Exec(ctx, query,
		ex.ID, ex.CustomerID, ex.ExemptReason, ex.CertificateNumber,
		ex.IssuingState, ex.EffectiveDate, ex.ExpiryDate, ex.IsActive, ex.CreatedAt,
	)
	if err != nil {
		return fmt.Errorf("insert exemption: %w", err)
	}
	return nil
}

func (r *PostgresExemptionRepo) Delete(ctx context.Context, id uuid.UUID) error {
	_, err := r.db.GetExecutor(ctx).Exec(ctx, `DELETE FROM tax_exemptions WHERE id = $1`, id)
	if err != nil {
		return fmt.Errorf("delete exemption: %w", err)
	}
	return nil
}
