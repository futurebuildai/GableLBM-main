package pricing

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"errors"
	"fmt"
	"log/slog"
	"math"
	"strings"
	"time"

	"github.com/gablelbm/gable/internal/quote"
	"github.com/google/uuid"
)

// ExposureService owns the user-driven exposure operations: recording
// acknowledgments, requesting an acknowledgment on the salesperson's behalf,
// owner overrides, and the "escalate now" preview that powers the re-quote
// flow.
type ExposureService struct {
	exposure   ExposureRepository
	escalators EscalatorRepository
	quoteRepo  quote.QuoteLineReader
	notifier   ExposureNotifier
	audit      AuditWriter
	checker    ExposureChecker
	logger     *slog.Logger
}

func NewExposureService(
	exposure ExposureRepository,
	escalators EscalatorRepository,
	quoteRepo quote.QuoteLineReader,
	notifier ExposureNotifier,
	audit AuditWriter,
	checker ExposureChecker,
	logger *slog.Logger,
) *ExposureService {
	if logger == nil {
		logger = slog.Default()
	}
	return &ExposureService{
		exposure:   exposure,
		escalators: escalators,
		quoteRepo:  quoteRepo,
		notifier:   notifier,
		audit:      audit,
		checker:    checker,
		logger:     logger,
	}
}

// ----- Acknowledge -----

var (
	errNotesTooShort    = errors.New("notes must be at least 10 characters")
	errInvalidAckMethod = errors.New("method must be VERBAL, EMAIL, or PORTAL")
	errAlreadyCleared   = errors.New("quote exposure already cleared")
)

// Acknowledge records a customer acknowledgment of the current exposure.
// actor is the user_id of the person submitting the form; role is their
// authorization role from the JWT claim.
func (s *ExposureService) Acknowledge(ctx context.Context, quoteID uuid.UUID, req AcknowledgmentRequest, actor, role string) (*QuoteExposureEvent, error) {
	if len(strings.TrimSpace(req.Notes)) < 10 {
		return nil, errNotesTooShort
	}
	switch req.Method {
	case AckMethodVerbal, AckMethodEmail, AckMethodPortal:
	default:
		return nil, errInvalidAckMethod
	}

	status, err := s.checker.CheckQuoteExposure(ctx, quoteID)
	if err != nil {
		return nil, err
	}
	switch status.State {
	case ExposureStateOK, ExposureStateAcknowledged, ExposureStateOverridden:
		return nil, errAlreadyCleared
	}

	now := time.Now()
	contact := req.CustomerContact
	notes := req.Notes
	if contact != "" {
		notes = fmt.Sprintf("contact=%s; %s", contact, notes)
	}

	ev := &QuoteExposureEvent{
		QuoteID:         quoteID,
		EventType:       EventAcknowledged,
		Method:          string(req.Method),
		Notes:           notes,
		ActorUserID:     actor,
		ActorRole:       role,
		IdempotencyKey:  userEventKey(quoteID, EventAcknowledged, actor, now),
		ExposureDollars: float64Ptr(status.ExposureDollars),
		CreatedAt:       now,
	}
	if _, err := s.exposure.InsertEvent(ctx, ev); err != nil {
		return nil, fmt.Errorf("acknowledge: insert event: %w", err)
	}

	// Flip rollup to ACKNOWLEDGED on the quote AND each active line escalator.
	if err := s.quoteRepo.UpdateQuoteExposure(ctx, quoteID, string(ExposureStateAcknowledged), 0, now); err != nil {
		return ev, fmt.Errorf("acknowledge: update quote rollup: %w", err)
	}
	if err := s.flipAllActiveEscalators(ctx, quoteID, ExposureStateAcknowledged, now); err != nil {
		return ev, fmt.Errorf("acknowledge: flip escalators: %w", err)
	}

	s.writeAudit(ev)
	return ev, nil
}

// RequestAck records that an acknowledgment has been requested (typically from
// the quote-to-order block modal). Sends an in-app notification to the
// assigned salesperson.
func (s *ExposureService) RequestAck(ctx context.Context, quoteID uuid.UUID, actor, role string) (*QuoteExposureEvent, error) {
	status, err := s.checker.CheckQuoteExposure(ctx, quoteID)
	if err != nil {
		return nil, err
	}

	now := time.Now()
	ev := &QuoteExposureEvent{
		QuoteID:        quoteID,
		EventType:      EventAckRequested,
		ActorUserID:    actor,
		ActorRole:      role,
		IdempotencyKey: userEventKey(quoteID, EventAckRequested, actor, now),
		CreatedAt:      now,
	}
	if _, err := s.exposure.InsertEvent(ctx, ev); err != nil {
		return nil, fmt.Errorf("request-ack: insert event: %w", err)
	}

	// Notify the salesperson — best-effort.
	if s.notifier != nil {
		_ = s.notifier.NotifyAckRequired(ctx, AckRequiredEvent{
			QuoteID:         quoteID,
			QuoteShortID:    status.QuoteShortID,
			SalespersonID:   status.SalespersonID,
			SalespersonName: status.SalespersonName,
			ExposureDollars: status.ExposureDollars,
		})
	}

	s.writeAudit(ev)
	return ev, nil
}

// Override is the owner-only emergency unblock. Requires notes ≥ 10 chars.
// Role enforcement is at the handler layer; service trusts the role string.
func (s *ExposureService) Override(ctx context.Context, quoteID uuid.UUID, req OverrideRequest, actor, role string) (*QuoteExposureEvent, error) {
	if len(strings.TrimSpace(req.Notes)) < 10 {
		return nil, errNotesTooShort
	}

	now := time.Now()
	ev := &QuoteExposureEvent{
		QuoteID:        quoteID,
		EventType:      EventOverridden,
		Notes:          req.Notes,
		ActorUserID:    actor,
		ActorRole:      role,
		IdempotencyKey: userEventKey(quoteID, EventOverridden, actor, now),
		CreatedAt:      now,
	}
	if _, err := s.exposure.InsertEvent(ctx, ev); err != nil {
		return nil, fmt.Errorf("override: insert event: %w", err)
	}

	if err := s.quoteRepo.UpdateQuoteExposure(ctx, quoteID, string(ExposureStateOverridden), 0, now); err != nil {
		return ev, fmt.Errorf("override: update quote rollup: %w", err)
	}
	if err := s.flipAllActiveEscalators(ctx, quoteID, ExposureStateOverridden, now); err != nil {
		return ev, fmt.Errorf("override: flip escalators: %w", err)
	}

	s.writeAudit(ev)
	return ev, nil
}

// EscalateNowPreview is a dry-run that returns the proposed new prices and
// per-line deltas without persisting anything. Used by the "Re-quote at
// Market" UI to populate the editor.
type EscalateNowLine struct {
	QuoteLineID        uuid.UUID `json:"quote_line_id"`
	CurrentUnitPrice   float64   `json:"current_unit_price"`
	SuggestedUnitPrice float64   `json:"suggested_unit_price"`
	DeltaPct           float64   `json:"delta_pct"`
}

type EscalateNowResult struct {
	QuoteID            uuid.UUID         `json:"quote_id"`
	Lines              []EscalateNowLine `json:"lines"`
	EstimatedNewTotal  float64           `json:"estimated_new_total"`
}

// EscalateNowPreview computes per-line new prices = old * (current_index / base_index).
func (s *ExposureService) EscalateNowPreview(ctx context.Context, quoteID uuid.UUID) (*EscalateNowResult, error) {
	escalators, err := s.escalators.ListEscalatorsForQuote(ctx, quoteID)
	if err != nil {
		return nil, fmt.Errorf("escalate-now: list escalators: %w", err)
	}
	q, err := s.quoteRepo.GetQuoteWithLinesAndCustomer(ctx, quoteID)
	if err != nil {
		return nil, fmt.Errorf("escalate-now: load quote: %w", err)
	}

	// Index escalators by line id for quick lookup.
	byLine := map[uuid.UUID]PriceEscalator{}
	for _, pe := range escalators {
		if pe.QuoteLineID != nil {
			byLine[*pe.QuoteLineID] = pe
		}
	}

	res := &EscalateNowResult{QuoteID: quoteID}
	total := 0.0
	for _, line := range q.Lines {
		pe, hasEsc := byLine[line.ID]
		current := line.UnitPrice
		suggested := current
		deltaPct := 0.0
		if hasEsc && pe.BaseIndexValue != nil && *pe.BaseIndexValue > 0 && pe.MarketIndexID != nil {
			idx, err := s.escalators.GetMarketIndex(ctx, *pe.MarketIndexID)
			if err == nil && idx != nil {
				suggested = pe.BasePrice * (idx.CurrentValue / *pe.BaseIndexValue)
				suggested = math.Round(suggested*10000) / 10000
				if pe.BasePrice > 0 {
					deltaPct = math.Round(((suggested-pe.BasePrice)/pe.BasePrice)*10000) / 100
				}
			}
		}
		res.Lines = append(res.Lines, EscalateNowLine{
			QuoteLineID:        line.ID,
			CurrentUnitPrice:   current,
			SuggestedUnitPrice: suggested,
			DeltaPct:           deltaPct,
		})
		total += suggested * line.Quantity
	}
	res.EstimatedNewTotal = math.Round(total*100) / 100
	return res, nil
}

// ----- helpers -----

func (s *ExposureService) flipAllActiveEscalators(ctx context.Context, quoteID uuid.UUID, state ExposureState, at time.Time) error {
	escalators, err := s.escalators.ListEscalatorsForQuote(ctx, quoteID)
	if err != nil {
		return err
	}
	for _, pe := range escalators {
		if err := s.exposure.UpdateEscalatorState(ctx, pe.ID, string(state), at); err != nil {
			return err
		}
	}
	return nil
}

func (s *ExposureService) writeAudit(ev *QuoteExposureEvent) {
	if s.audit == nil {
		return
	}
	if ev.EventType == EventDetected {
		return
	}
	// Audit writes on a fresh context so callers' cancellation doesn't drop
	// the audit trail mid-flight.
	ctx := context.Background()
	if err := s.audit.Write(ctx, "quote_exposure_events", ev.ID.String(), string(ev.EventType), ev.ActorUserID, nil, ev); err != nil {
		s.logger.Warn("exposure_service: audit write failed", "event_id", ev.ID, "err", err)
	}
}

// userEventKey builds a deterministic-but-unique idempotency key for a
// user-driven event. (quote_id, event_type, actor, ts-nanos) is sufficient
// because a real user won't double-click within the same nanosecond, and
// dedup of identical clicks is desirable.
func userEventKey(quoteID uuid.UUID, et EventType, actor string, t time.Time) string {
	in := fmt.Sprintf("user|%s|%s|%s|%d", quoteID, et, actor, t.UnixNano())
	h := sha256.Sum256([]byte(in))
	return hex.EncodeToString(h[:])
}

func float64Ptr(v float64) *float64 { return &v }
