package customer

import (
	"context"
	"errors"
	"time"

	"github.com/google/uuid"
)

// ErrAgreementRequired is returned when a caller sets AUTO_ESCALATE without a
// signed agreement. Mapped to HTTP 400 by the handler.
var ErrAgreementRequired = errors.New("AUTO_ESCALATE policy requires a signed escalation agreement")

// ErrInvalidPolicy is returned for an unrecognized policy mode.
var ErrInvalidPolicy = errors.New("invalid escalation policy")

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

// GetEscalationPolicy returns the customer's lumber-index price-protection
// policy. Returns nil if the customer is not found.
func (s *Service) GetEscalationPolicy(ctx context.Context, customerID uuid.UUID) (*EscalationPolicy, error) {
	return s.repo.GetEscalationPolicy(ctx, customerID)
}

// SetEscalationPolicy validates and persists the policy. AUTO_ESCALATE is
// only permitted when a signed agreement timestamp is present; the threshold
// must be within (0, 50].
func (s *Service) SetEscalationPolicy(ctx context.Context, p *EscalationPolicy) error {
	switch p.Policy {
	case PolicyAutoEscalate, PolicyFlagForRequote, PolicyRequireAck:
		// ok
	default:
		return ErrInvalidPolicy
	}
	if p.ThresholdPct <= 0 || p.ThresholdPct > 50 {
		return ErrInvalidPolicy
	}
	if p.Policy == PolicyAutoEscalate && p.AgreementSignedAt == nil {
		return ErrAgreementRequired
	}
	// Non-AUTO policies clear any pending agreement reference is not required;
	// preserve whatever the caller passes. Stamp signed-at to now if a ref was
	// provided without an explicit timestamp.
	if p.AgreementSignedAt == nil && p.AgreementRef != "" {
		now := time.Now()
		p.AgreementSignedAt = &now
	}
	return s.repo.SetEscalationPolicy(ctx, p)
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
