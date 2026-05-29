package pricing

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"log/slog"
	"math"
	"strings"
	"time"

	"github.com/gablelbm/gable/internal/quote"
	"github.com/gablelbm/gable/pkg/eventbus"
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
	bus        eventbus.Publisher // optional; nil disables event publishing
	audit      AuditWriter
	checker    ExposureChecker
	logger     *slog.Logger
}

func NewExposureService(
	exposure ExposureRepository,
	escalators EscalatorRepository,
	quoteRepo quote.QuoteLineReader,
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
		audit:      audit,
		checker:    checker,
		logger:     logger,
	}
}

// WithEventBus wires the publisher used for post-write notification events.
// Optional: a nil bus disables publishing entirely.
func (s *ExposureService) WithEventBus(bus eventbus.Publisher) *ExposureService {
	s.bus = bus
	return s
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

	s.writeAudit(ctx, ev)
	s.publishStatus(ctx, EventAcknowledged, status)
	return ev, nil
}

// RequestAck records that an acknowledgment has been requested (typically from
// the quote-to-order block modal). Publishes an ack-required notification to
// the assigned salesperson.
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

	// Notify the salesperson — best-effort. Publish as an ACK_REQUIRED subject
	// so the notifier's per-(salesperson, index) routing engages.
	s.publishStatus(ctx, EventAckRequired, status)

	s.writeAudit(ctx, ev)
	return ev, nil
}

// Override is the owner-only emergency unblock. Requires notes ≥ 10 chars
// and that the quote actually has unresolved exposure to override —
// overriding an OK/ACKNOWLEDGED/OVERRIDDEN quote is rejected to prevent
// spurious audit entries and accidental escalator-state flips.
// Role enforcement is at the handler layer; service trusts the role string.
func (s *ExposureService) Override(ctx context.Context, quoteID uuid.UUID, req OverrideRequest, actor, role string) (*QuoteExposureEvent, error) {
	if len(strings.TrimSpace(req.Notes)) < 10 {
		return nil, errNotesTooShort
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
	// Only flip escalators that were actively raised — leave OK escalators
	// (i.e. lines that were never above threshold) alone, otherwise the
	// scanner can never re-detect them.
	if err := s.flipActiveRaisedEscalators(ctx, quoteID, ExposureStateOverridden, now); err != nil {
		return ev, fmt.Errorf("override: flip escalators: %w", err)
	}

	s.writeAudit(ctx, ev)
	return ev, nil
}

// OverrideForOrder is the order/delivery pre-ship gate override. It resolves
// the order's source quote and records an OVERRIDDEN exposure event (which
// also writes an audit entry via Override). Returns nil with no event when the
// order has no source quote or its exposure is already cleared — in both cases
// the gate should let the order proceed.
func (s *ExposureService) OverrideForOrder(ctx context.Context, orderID uuid.UUID, notes, actor, role string) (*QuoteExposureEvent, error) {
	quoteID, err := s.checker.QuoteIDForOrder(ctx, orderID)
	if err != nil {
		return nil, err
	}
	if quoteID == nil {
		return nil, nil
	}
	ev, err := s.Override(ctx, *quoteID, OverrideRequest{Notes: notes}, actor, role)
	if err != nil {
		if errors.Is(err, errAlreadyCleared) {
			return nil, nil
		}
		return nil, err
	}
	return ev, nil
}

// GetQuoteExposureDetail returns the current status plus the full event ledger
// for a quote, powering the quote-detail exposure banner + history drawer.
type QuoteExposureDetail struct {
	Status ExposureStatus       `json:"status"`
	Events []QuoteExposureEvent `json:"events"`
}

func (s *ExposureService) GetQuoteExposureDetail(ctx context.Context, quoteID uuid.UUID) (*QuoteExposureDetail, error) {
	status, err := s.checker.CheckQuoteExposure(ctx, quoteID)
	if err != nil {
		return nil, err
	}
	events, err := s.exposure.GetEventsByQuote(ctx, quoteID)
	if err != nil {
		return nil, fmt.Errorf("exposure detail: events: %w", err)
	}
	return &QuoteExposureDetail{Status: status, Events: events}, nil
}

// ListAtRisk returns the salesperson at-risk quotes view. A nil salesperson
// filter returns across the whole book (caller enforces role).
func (s *ExposureService) ListAtRisk(ctx context.Context, f ExposureFilter) ([]ExposureRow, error) {
	return s.exposure.ListExposureForOwner(ctx, f)
}

// Portfolio returns the owner rollup. A nil salesperson filter is the
// company-wide view; non-nil scopes to one salesperson's book.
func (s *ExposureService) Portfolio(ctx context.Context, salespersonFilter *uuid.UUID) (*PortfolioSummary, error) {
	return s.exposure.PortfolioRollup(ctx, salespersonFilter)
}

// EscalateNowLine / EscalateNowResult power the "Re-quote at Market" preview.
type EscalateNowLine struct {
	QuoteLineID        uuid.UUID `json:"quote_line_id"`
	CurrentUnitPrice   float64   `json:"current_unit_price"`
	SuggestedUnitPrice float64   `json:"suggested_unit_price"`
	DeltaPct           float64   `json:"delta_pct"`
}

type EscalateNowResult struct {
	QuoteID           uuid.UUID         `json:"quote_id"`
	Lines             []EscalateNowLine `json:"lines"`
	EstimatedNewTotal float64           `json:"estimated_new_total"`
}

// EscalateNowPreview computes per-line new prices = old * (current_index / base_index).
// Dry-run only; persists nothing.
func (s *ExposureService) EscalateNowPreview(ctx context.Context, quoteID uuid.UUID) (*EscalateNowResult, error) {
	escalators, err := s.exposure.ListEscalatorsForQuote(ctx, quoteID)
	if err != nil {
		return nil, fmt.Errorf("escalate-now: list escalators: %w", err)
	}
	q, err := s.quoteRepo.GetQuoteWithLinesAndCustomer(ctx, quoteID)
	if err != nil {
		return nil, fmt.Errorf("escalate-now: load quote: %w", err)
	}
	if q == nil {
		return &EscalateNowResult{QuoteID: quoteID}, nil
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
	escalators, err := s.exposure.ListEscalatorsForQuote(ctx, quoteID)
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

// flipActiveRaisedEscalators flips only those escalators that are currently
// in a "raised" state (FLAGGED / ESCALATED / ACK_REQUIRED / BLOCKED) to the
// given new state. Escalators in OK state are left alone — used by the
// override path so that quietly-OK lines remain detectable by the scanner.
func (s *ExposureService) flipActiveRaisedEscalators(ctx context.Context, quoteID uuid.UUID, state ExposureState, at time.Time) error {
	escalators, err := s.exposure.ListEscalatorsForQuote(ctx, quoteID)
	if err != nil {
		return err
	}
	for _, pe := range escalators {
		switch ExposureState(pe.CurrentState) {
		case ExposureStateFlagged, ExposureStateEscalated, ExposureStateAckRequired, ExposureStateBlocked:
			if err := s.exposure.UpdateEscalatorState(ctx, pe.ID, string(state), at); err != nil {
				return err
			}
		}
	}
	return nil
}

// publishStatus emits an ExposureNotification derived from an ExposureStatus
// to the subject mapped from the event type. Best-effort; no-ops when the bus
// is unconfigured or the event has no subject.
func (s *ExposureService) publishStatus(ctx context.Context, eventType EventType, status ExposureStatus) {
	if s.bus == nil {
		return
	}
	subject := SubjectForEvent(eventType)
	if subject == "" {
		return
	}
	indexCode := ""
	if len(status.Indexes) > 0 {
		indexCode = status.Indexes[0]
	}
	notif := ExposureNotification{
		EventType:       eventType,
		QuoteID:         status.QuoteID,
		QuoteShortID:    status.QuoteShortID,
		SalespersonID:   status.SalespersonID,
		SalespersonName: status.SalespersonName,
		IndexCode:       indexCode,
		ExposureDollars: status.ExposureDollars,
	}
	payload, err := json.Marshal(notif)
	if err != nil {
		s.logger.Warn("exposure-service: marshal notification", "err", err)
		return
	}
	if err := s.bus.Publish(ctx, subject, payload); err != nil {
		s.logger.Warn("exposure-service: publish notification", "subject", subject, "err", err)
	}
}

// writeAudit fires the audit log entry. The caller's context is NOT passed
// through directly because we don't want HTTP-request cancellation (mid-flight
// client disconnect) to drop audit-trail writes. We preserve values (tracing
// IDs, claims) via context.WithoutCancel and impose a short bounded timeout so
// a stalled DB can't accumulate goroutines.
func (s *ExposureService) writeAudit(parentCtx context.Context, ev *QuoteExposureEvent) {
	if s.audit == nil {
		return
	}
	if ev.EventType == EventDetected {
		return
	}
	ctx, cancel := context.WithTimeout(context.WithoutCancel(parentCtx), 5*time.Second)
	defer cancel()
	s.audit.LogEntry(ctx, AuditEntry{
		Action:     string(ev.EventType),
		EntityType: "quote_exposure_event",
		EntityID:   ev.ID.String(),
		UserID:     ev.ActorUserID,
		Changes: map[string]any{
			"quote_id":   ev.QuoteID,
			"event_type": ev.EventType,
			"method":     ev.Method,
			"actor_role": ev.ActorRole,
			"notes":      ev.Notes,
		},
	})
}

// userEventKey builds an idempotency key for a user-driven event. The
// timestamp is bucketed to 5-second windows so a duplicate POST from a flaky
// network or accidental double-click within the same window dedupes
// transparently. Two intentional acknowledgments more than 5 seconds apart
// produce distinct keys, which is correct for genuinely separate actions.
const userEventBucketSeconds = 5

func userEventKey(quoteID uuid.UUID, et EventType, actor string, t time.Time) string {
	bucket := t.Unix() / userEventBucketSeconds
	in := fmt.Sprintf("user|%s|%s|%s|%d", quoteID, et, actor, bucket)
	h := sha256.Sum256([]byte(in))
	return hex.EncodeToString(h[:])
}

func float64Ptr(v float64) *float64 { return &v }
