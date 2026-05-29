package customer

import (
	"context"
	"fmt"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
)

// GetEscalationPolicy reads the per-customer lumber-index price-protection
// policy (migration 072). Returns nil if the customer does not exist.
func (r *PostgresRepository) GetEscalationPolicy(ctx context.Context, customerID uuid.UUID) (*EscalationPolicy, error) {
	p := &EscalationPolicy{CustomerID: customerID}
	var ref *string
	query := `
		SELECT COALESCE(price_escalation_policy, 'FLAG_FOR_REQUOTE'),
			COALESCE(escalation_threshold_pct, 5.0),
			escalation_agreement_signed_at,
			escalation_agreement_ref
		FROM customers
		WHERE id = $1
	`
	err := r.db.GetExecutor(ctx).QueryRow(ctx, query, customerID).Scan(
		&p.Policy, &p.ThresholdPct, &p.AgreementSignedAt, &ref,
	)
	if err != nil {
		if err == pgx.ErrNoRows {
			return nil, nil
		}
		return nil, fmt.Errorf("failed to get escalation policy: %w", err)
	}
	if ref != nil {
		p.AgreementRef = *ref
	}
	return p, nil
}

// SetEscalationPolicy writes the policy fields. The migration-072 CHECK
// constraint enforces that AUTO_ESCALATE requires a signed agreement, but the
// service layer validates first to return a clean 400 instead of a DB error.
func (r *PostgresRepository) SetEscalationPolicy(ctx context.Context, p *EscalationPolicy) error {
	var ref any
	if p.AgreementRef != "" {
		ref = p.AgreementRef
	}
	query := `
		UPDATE customers
		SET price_escalation_policy = $2,
			escalation_threshold_pct = $3,
			escalation_agreement_signed_at = $4,
			escalation_agreement_ref = $5,
			updated_at = NOW()
		WHERE id = $1
	`
	_, err := r.db.GetExecutor(ctx).Exec(ctx, query,
		p.CustomerID, p.Policy, p.ThresholdPct, p.AgreementSignedAt, ref,
	)
	if err != nil {
		return fmt.Errorf("failed to set escalation policy: %w", err)
	}
	return nil
}
