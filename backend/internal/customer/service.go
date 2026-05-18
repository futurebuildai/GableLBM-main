package customer

import (
	"context"
	"errors"

	"github.com/google/uuid"
)

var (
	// ErrPolicyInvalid covers any validation failure on UpdatePolicy.
	ErrPolicyInvalid = errors.New("invalid escalation policy payload")
)

type Service struct {
	repo Repository
}

func NewService(repo Repository) *Service {
	return &Service{repo: repo}
}

func (s *Service) CreateCustomer(ctx context.Context, c *Customer) error {
	return s.repo.CreateCustomer(ctx, c)
}

func (s *Service) GetCustomer(ctx context.Context, id uuid.UUID) (*Customer, error) {
	return s.repo.GetCustomer(ctx, id)
}

func (s *Service) ListCustomers(ctx context.Context) ([]Customer, error) {
	return s.repo.ListCustomers(ctx)
}

func (s *Service) ListCustomersPaginated(ctx context.Context, limit, offset int) ([]Customer, int, error) {
	return s.repo.ListCustomersPaginated(ctx, limit, offset)
}

func (s *Service) ListPriceLevels(ctx context.Context) ([]PriceLevel, error) {
	return s.repo.ListPriceLevels(ctx)
}

func (s *Service) UpdateBalance(ctx context.Context, id uuid.UUID, delta float64) error {
	return s.repo.UpdateBalance(ctx, id, delta)
}

func (s *Service) UpdateSalesperson(ctx context.Context, customerID uuid.UUID, salespersonID *uuid.UUID) error {
	return s.repo.UpdateSalesperson(ctx, customerID, salespersonID)
}

// GetPolicy returns the customer's price-escalation policy.
func (s *Service) GetPolicy(ctx context.Context, customerID uuid.UUID) (*EscalationPolicy, error) {
	return s.repo.GetPolicy(ctx, customerID)
}

// UpdatePolicy validates and stores the customer's price-escalation policy.
// Service-layer validation gives nice error messages; the DB CHECK
// constraints (migration 054) are the authoritative enforcement and would
// reject any bypass attempts directly.
func (s *Service) UpdatePolicy(ctx context.Context, customerID uuid.UUID, p EscalationPolicy) error {
	switch p.PriceEscalationPolicy {
	case "FLAG_FOR_REQUOTE", "REQUIRE_ACK":
		// ok
	case "AUTO_ESCALATE":
		if p.EscalationAgreementSignedAt == nil || p.EscalationAgreementRef == "" {
			return errors.New("AUTO_ESCALATE requires escalation_agreement_signed_at and escalation_agreement_ref")
		}
	default:
		return errors.New("invalid price_escalation_policy")
	}
	if p.EscalationThresholdPct <= 0 || p.EscalationThresholdPct > 50 {
		return errors.New("escalation_threshold_pct must be > 0 and ≤ 50")
	}
	p.CustomerID = customerID
	return s.repo.UpdatePolicy(ctx, customerID, p)
}

// Contact management

func (s *Service) CreateContact(ctx context.Context, c *Contact) error {
	return s.repo.CreateContact(ctx, c)
}

func (s *Service) GetContact(ctx context.Context, id uuid.UUID) (*Contact, error) {
	return s.repo.GetContact(ctx, id)
}

func (s *Service) ListContactsByCustomer(ctx context.Context, customerID uuid.UUID) ([]Contact, error) {
	return s.repo.ListContactsByCustomer(ctx, customerID)
}

func (s *Service) UpdateContact(ctx context.Context, c *Contact) error {
	return s.repo.UpdateContact(ctx, c)
}

func (s *Service) DeleteContact(ctx context.Context, id uuid.UUID) error {
	return s.repo.DeleteContact(ctx, id)
}
