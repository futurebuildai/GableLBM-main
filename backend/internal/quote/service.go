package quote

import (
	"context"
	"fmt"
	"log/slog"
	"time"

	"github.com/google/uuid"
)

// AutoPOService is an optional interface for triggering purchase orders from accepted quotes.
type AutoPOService interface {
	CreatePOFromSpecialOrderLine(ctx context.Context, productID uuid.UUID, vendorID *uuid.UUID, quantity float64, unitCost float64, linkedSOLineID uuid.UUID) error
}

type Service struct {
	repo    Repository
	poSvc   AutoPOService
	logger  *slog.Logger
}

func NewService(repo Repository) *Service {
	return &Service{repo: repo, logger: slog.Default()}
}

// WithAutoPO injects the purchase order service for auto-PO on quote accept.
func (s *Service) WithAutoPO(poSvc AutoPOService) {
	s.poSvc = poSvc
}

func (s *Service) CreateQuote(ctx context.Context, q *Quote) error {
	// 1. Calculate Totals
	var total float64
	for i := range q.Lines {
		line := &q.Lines[i]
		line.LineTotal = line.Quantity * line.UnitPrice
		total += line.LineTotal
	}
	// Include freight in total
	total += q.FreightAmount
	q.TotalAmount = total

	// 2. Set Defaults
	if q.State == "" {
		q.State = QuoteStateDraft
	}
	if q.Source == "" {
		q.Source = "manual"
	}
	if q.DeliveryType == "" {
		q.DeliveryType = "PICKUP"
	}
	// Clear vehicle if pickup
	if q.DeliveryType == "PICKUP" {
		q.VehicleID = nil
		q.FreightAmount = 0
	}

	return s.repo.CreateQuote(ctx, q)
}

func (s *Service) GetQuote(ctx context.Context, id uuid.UUID) (*Quote, error) {
	return s.repo.GetQuote(ctx, id)
}

func (s *Service) ListQuotes(ctx context.Context) ([]Quote, error) {
	return s.repo.ListQuotes(ctx)
}

func (s *Service) ListQuotesPaginated(ctx context.Context, limit, offset int) ([]Quote, int, error) {
	return s.repo.ListQuotesPaginated(ctx, limit, offset)
}

func (s *Service) UpdateState(ctx context.Context, id uuid.UUID, state QuoteState) error {
	q, err := s.repo.GetQuote(ctx, id)
	if err != nil {
		return err
	}

	// Validate state transition
	if err := validateStateTransition(q.State, state); err != nil {
		return err
	}

	now := time.Now()
	q.State = state

	// Set lifecycle timestamp based on target state
	switch state {
	case QuoteStateSent:
		q.SentAt = &now
	case QuoteStateAccepted:
		q.AcceptedAt = &now
	case QuoteStateRejected:
		q.RejectedAt = &now
	}

	if err := s.repo.UpdateQuote(ctx, q); err != nil {
		return err
	}

	// Auto-PO: when accepted, trigger POs for special-order items
	if state == QuoteStateAccepted && s.poSvc != nil {
		s.triggerAutoPO(ctx, q)
	}

	return nil
}

// triggerAutoPO creates purchase orders for special-order quote lines.
// This is fire-and-forget — failures are logged but don't block acceptance.
func (s *Service) triggerAutoPO(ctx context.Context, q *Quote) {
	for _, line := range q.Lines {
		// Only create POs for lines that have a unit cost (special order indicator)
		if line.UnitCost > 0 {
			err := s.poSvc.CreatePOFromSpecialOrderLine(
				ctx, line.ProductID, nil, line.Quantity, line.UnitCost, line.ID,
			)
			if err != nil {
				s.logger.Warn("auto-PO failed for quote line",
					"quote_id", q.ID,
					"line_id", line.ID,
					"product_id", line.ProductID,
					"error", err,
				)
			} else {
				s.logger.Info("auto-PO created for quote line",
					"quote_id", q.ID,
					"line_id", line.ID,
					"product_id", line.ProductID,
				)
			}
		}
	}
}

func (s *Service) UpdateQuote(ctx context.Context, q *Quote) error {
	existing, err := s.repo.GetQuote(ctx, q.ID)
	if err != nil {
		return fmt.Errorf("quote not found: %w", err)
	}
	if existing.State != QuoteStateDraft {
		return fmt.Errorf("only DRAFT quotes can be edited")
	}

	// Recalculate totals
	var total float64
	for i := range q.Lines {
		line := &q.Lines[i]
		line.LineTotal = line.Quantity * line.UnitPrice
		total += line.LineTotal
	}
	// Include freight in total
	total += q.FreightAmount
	q.TotalAmount = total
	q.State = QuoteStateDraft

	// Clear vehicle if pickup
	if q.DeliveryType == "PICKUP" {
		q.VehicleID = nil
		q.FreightAmount = 0
	}

	return s.repo.UpdateQuoteWithLines(ctx, q)
}

func (s *Service) GetAnalytics(ctx context.Context) (*QuoteAnalytics, error) {
	return s.repo.GetQuoteAnalytics(ctx)
}

func (s *Service) GetOriginalFile(ctx context.Context, id uuid.UUID) ([]byte, string, string, error) {
	return s.repo.GetOriginalFile(ctx, id)
}

// validateStateTransition ensures the state change is valid.
func validateStateTransition(from, to QuoteState) error {
	allowed := map[QuoteState][]QuoteState{
		QuoteStateDraft:    {QuoteStateSent, QuoteStateAccepted, QuoteStateRejected, QuoteStateExpired},
		QuoteStateSent:     {QuoteStateAccepted, QuoteStateRejected, QuoteStateExpired},
		QuoteStateAccepted: {}, // terminal
		QuoteStateRejected: {QuoteStateDraft}, // allow re-opening
		QuoteStateExpired:  {QuoteStateDraft}, // allow re-opening
	}

	targets, ok := allowed[from]
	if !ok {
		return fmt.Errorf("unknown current state: %s", from)
	}

	for _, t := range targets {
		if t == to {
			return nil
		}
	}
	return fmt.Errorf("cannot transition from %s to %s", from, to)
}
