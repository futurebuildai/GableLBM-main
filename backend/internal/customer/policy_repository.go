package customer

import (
	"context"
	"fmt"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
)

// EscalationPolicy is the small projection returned by GetPolicy / required
// by UpdatePolicy. Kept separate from the full Customer struct so callers
// (pricing's snapshot service, the policy endpoint) only see the fields
// relevant to this feature.
type EscalationPolicy struct {
	CustomerID                  uuid.UUID  `json:"customer_id"`
	PriceEscalationPolicy       string     `json:"price_escalation_policy"`
	EscalationThresholdPct      float64    `json:"escalation_threshold_pct"`
	EscalationAgreementSignedAt *time.Time `json:"escalation_agreement_signed_at,omitempty"`
	EscalationAgreementRef      string     `json:"escalation_agreement_ref,omitempty"`
}

// GetPolicy reads a single customer's escalation policy.
func (r *PostgresRepository) GetPolicy(ctx context.Context, id uuid.UUID) (*EscalationPolicy, error) {
	q := `SELECT id,
	             COALESCE(price_escalation_policy, 'FLAG_FOR_REQUOTE'),
	             COALESCE(escalation_threshold_pct, 5.0),
	             escalation_agreement_signed_at,
	             COALESCE(escalation_agreement_ref, '')
	      FROM customers WHERE id = $1`

	var p EscalationPolicy
	err := r.db.GetExecutor(ctx).QueryRow(ctx, q, id).Scan(
		&p.CustomerID, &p.PriceEscalationPolicy, &p.EscalationThresholdPct,
		&p.EscalationAgreementSignedAt, &p.EscalationAgreementRef,
	)
	if err != nil {
		if err == pgx.ErrNoRows {
			return nil, nil
		}
		return nil, fmt.Errorf("get customer policy: %w", err)
	}
	return &p, nil
}

// UpdatePolicy updates the escalation-policy fields on a customer. The DB-level
// CHECK constraint `customers_auto_escalate_requires_agreement` enforces that
// AUTO_ESCALATE is only valid when escalation_agreement_signed_at IS NOT NULL,
// so attempting to set AUTO_ESCALATE without an agreement will return a 23514
// constraint violation here.
func (r *PostgresRepository) UpdatePolicy(ctx context.Context, id uuid.UUID, p EscalationPolicy) error {
	q := `UPDATE customers
	      SET price_escalation_policy = $2,
	          escalation_threshold_pct = $3,
	          escalation_agreement_signed_at = $4,
	          escalation_agreement_ref = NULLIF($5, ''),
	          updated_at = NOW()
	      WHERE id = $1`
	tag, err := r.db.GetExecutor(ctx).Exec(ctx, q,
		id, p.PriceEscalationPolicy, p.EscalationThresholdPct,
		p.EscalationAgreementSignedAt, p.EscalationAgreementRef,
	)
	if err != nil {
		return fmt.Errorf("update customer policy: %w", err)
	}
	if tag.RowsAffected() == 0 {
		return fmt.Errorf("customer %s not found", id)
	}
	return nil
}
