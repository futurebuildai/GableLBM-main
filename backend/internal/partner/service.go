package partner

import (
	"context"
	"fmt"
	"log/slog"

	"github.com/gablelbm/gable/internal/customer"
	"github.com/gablelbm/gable/internal/quote"
	"github.com/google/uuid"
)

type Service struct {
	customerRepo customer.Repository
	quoteRepo    quote.Repository
	// orderSvc     *order.Service // For approving quotes later
	logger *slog.Logger
}

func NewService(customerRepo customer.Repository, quoteRepo quote.Repository, logger *slog.Logger) *Service {
	return &Service{
		customerRepo: customerRepo,
		quoteRepo:    quoteRepo,
		logger:       logger,
	}
}

type DashboardDTO struct {
	BalanceDue  float64 `json:"balance_due"`
	CreditLimit float64 `json:"credit_limit"`
	// ActiveJobs  int     `json:"active_jobs"` // Placeholder
}

func (s *Service) GetDashboard(ctx context.Context, customerID uuid.UUID) (*DashboardDTO, error) {
	cust, err := s.customerRepo.GetCustomer(ctx, customerID)
	if err != nil {
		return nil, fmt.Errorf("failed to get customer: %w", err)
	}

	return &DashboardDTO{
		BalanceDue:  cust.BalanceDue,
		CreditLimit: cust.CreditLimit,
	}, nil
}

func (s *Service) ListQuotes(ctx context.Context, customerID uuid.UUID) ([]quote.Quote, error) {
	return s.quoteRepo.ListQuotesByCustomer(ctx, customerID)
}

func (s *Service) GetQuote(ctx context.Context, customerID uuid.UUID, quoteID uuid.UUID) (*quote.Quote, error) {
	q, err := s.quoteRepo.GetQuote(ctx, quoteID)
	if err != nil {
		return nil, err
	}

	// SECURITY: Ensure quote belongs to this customer
	if q.CustomerID != customerID {
		s.logger.Warn("Security Alert: Customer attempted to access quote of another", "customer_id", customerID, "quote_id", quoteID)
		return nil, fmt.Errorf("quote not found") // Mask existence
	}

	return q, nil
}
