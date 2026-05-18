package pricing

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"fmt"
	"log/slog"
	"math"
	"time"

	"github.com/gablelbm/gable/internal/quote"
	"github.com/google/uuid"
)

// ExposureNotifier is the interface implemented by the notification module's
// ExposureNotifier (paralleling DeliveryNotifier). All sends are best-effort:
// errors are logged but not returned, so a notifier failure cannot roll back
// the scanner's database writes.
type ExposureNotifier interface {
	NotifyFlagged(ctx context.Context, ev FlaggedEvent) error
	NotifyEscalated(ctx context.Context, ev EscalatedEvent) error
	NotifyAckRequired(ctx context.Context, ev AckRequiredEvent) error
	NotifyCleared(ctx context.Context, ev ClearedEvent) error
}

// AuditEntry mirrors pkg/audit.Entry. Re-declared in pricing to avoid the
// pricing package depending on pkg/audit (which would risk import cycles
// when pkg/audit grows). main.go's adapter bridges the two.
type AuditEntry struct {
	Action     string
	EntityType string
	EntityID   string
	UserID     string
	Changes    map[string]any
}

// AuditWriter is the narrow interface for audit_log inserts. Implemented by
// an adapter over pkg/audit.Logger in cmd/server/main.go.
type AuditWriter interface {
	LogEntry(ctx context.Context, e AuditEntry)
}

// ExposureScanner evaluates open quote lines against an updated market index
// and writes typed events based on the snapshotted customer policy.
type ExposureScanner struct {
	exposure   ExposureRepository
	escalators EscalatorRepository
	quoteRepo  quote.QuoteLineReader
	notifier   ExposureNotifier
	audit      AuditWriter
	logger     *slog.Logger
}

func NewExposureScanner(
	exposure ExposureRepository,
	escalators EscalatorRepository,
	quoteRepo quote.QuoteLineReader,
	notifier ExposureNotifier,
	audit AuditWriter,
	logger *slog.Logger,
) *ExposureScanner {
	if logger == nil {
		logger = slog.Default()
	}
	return &ExposureScanner{
		exposure:   exposure,
		escalators: escalators,
		quoteRepo:  quoteRepo,
		notifier:   notifier,
		audit:      audit,
		logger:     logger,
	}
}

// OnMarketIndexUpdated is the primary entry point — invoked synchronously by
// the index-refresh admin endpoint right after a new history row is written.
// Iterates every active escalator for the given index, computes the per-line
// delta vs. snapshot, and writes the appropriate event per snapshot policy.
//
// historyID is the market_index_history row that triggered this scan; it
// participates in the idempotency key so a replay of the same event becomes a
// no-op.
func (s *ExposureScanner) OnMarketIndexUpdated(ctx context.Context, indexID, historyID uuid.UUID) error {
	t0 := time.Now()
	idx, err := s.escalators.GetMarketIndex(ctx, indexID)
	if err != nil {
		return fmt.Errorf("scanner: get market index: %w", err)
	}
	if idx == nil {
		return fmt.Errorf("scanner: market index %s not found", indexID)
	}

	escalators, err := s.exposure.ListActiveEscalatorsForIndex(ctx, indexID)
	if err != nil {
		return fmt.Errorf("scanner: list active escalators: %w", err)
	}

	processed := 0
	eventsWritten := 0
	for i := range escalators {
		ewc := &escalators[i]
		newEvents, err := s.evaluateOne(ctx, ewc, idx.CurrentValue, idx.IndexCode, historyID, false)
		if err != nil {
			s.logger.Warn("scanner: evaluate failed", "quote_id", ewc.QuoteID, "line_id", ewc.Escalator.QuoteLineID, "err", err)
			continue
		}
		eventsWritten += newEvents
		processed++
	}

	s.logger.Info("scanner: processed market index update",
		"index_id", indexID, "index_code", idx.IndexCode,
		"processed_lines", processed, "events_written", eventsWritten,
		"duration_ms", time.Since(t0).Milliseconds(),
	)
	return nil
}

// RunSafetyNet runs a full re-evaluation against every active market index's
// current value. Invoked by the nightly cron in cmd/server/main.go.
func (s *ExposureScanner) RunSafetyNet(ctx context.Context) error {
	indices, err := s.escalators.ListMarketIndices(ctx)
	if err != nil {
		return fmt.Errorf("safety-net: list indices: %w", err)
	}
	for _, idx := range indices {
		// safety-net runs synthesize a "history id" of uuid.Nil; idempotency
		// keys for safety-net events use the current timestamp bucket
		// (per-day) so re-running on the same day is a no-op.
		if err := s.evaluateAllForIndex(ctx, idx); err != nil {
			s.logger.Warn("safety-net: evaluate index failed", "index_code", idx.IndexCode, "err", err)
		}
	}
	return nil
}

func (s *ExposureScanner) evaluateAllForIndex(ctx context.Context, idx MarketIndex) error {
	escalators, err := s.exposure.ListActiveEscalatorsForIndex(ctx, idx.ID)
	if err != nil {
		return err
	}
	for i := range escalators {
		_, _ = s.evaluateOne(ctx, &escalators[i], idx.CurrentValue, idx.IndexCode, uuid.Nil, true)
	}
	return nil
}

// evaluateOne is the core per-line decision routine. Returns the number of new
// event rows written (0 if below threshold and previously OK, or idempotency
// dedup'd it).
func (s *ExposureScanner) evaluateOne(
	ctx context.Context,
	ewc *EscalatorWithContext,
	currentIndex float64,
	indexCode string,
	historyID uuid.UUID,
	isSafetyNet bool,
) (int, error) {
	now := time.Now()
	pe := &ewc.Escalator

	if pe.QuoteLineID == nil {
		return 0, nil // shouldn't happen — escalator without a line
	}
	baseIndex := 0.0
	if pe.BaseIndexValue != nil {
		baseIndex = *pe.BaseIndexValue
	}
	if baseIndex <= 0 {
		// Can't compute a delta against zero/missing baseline. Log and skip.
		s.logger.Warn("scanner: skip line with no baseline",
			"line_id", *pe.QuoteLineID, "escalator_id", pe.ID)
		return 0, nil
	}

	deltaPct := (currentIndex - baseIndex) / baseIndex * 100
	absDelta := math.Abs(deltaPct)
	threshold := pe.ThresholdPctAtSnapshot
	if threshold <= 0 {
		threshold = 5.0
	}

	exposureDollars := (currentIndex/baseIndex - 1.0) * pe.BasePrice * ewc.LineQuantity
	exposureDollars = math.Round(exposureDollars*100) / 100
	policy := EscalationPolicy(pe.PolicyAtSnapshot)
	if policy == "" {
		policy = PolicyFlagForRequote
	}

	// Decide event type from delta + policy + prior state.
	var eventType EventType
	var newState ExposureState
	mutatePrice := false
	switch {
	case absDelta < threshold:
		// Below threshold — if previously raised, emit CLEARED. Otherwise no-op.
		switch ExposureState(pe.CurrentState) {
		case ExposureStateFlagged, ExposureStateAckRequired, ExposureStateEscalated:
			eventType = EventCleared
			newState = ExposureStateOK
		default:
			// Update last_checked_at and the per-quote rollup; no event.
			if err := s.exposure.UpdateEscalatorState(ctx, pe.ID, string(ExposureStateOK), now); err != nil {
				return 0, err
			}
			return 0, nil
		}
	default:
		switch policy {
		case PolicyAutoEscalate:
			if ewc.CustomerAgreementSignedAt == nil {
				// Fallback to FLAGGED when AUTO_ESCALATE customer lacks a
				// signed agreement (per PRD US-004 H4).
				eventType = EventFlagged
				newState = ExposureStateFlagged
			} else {
				eventType = EventEscalated
				newState = ExposureStateEscalated
				mutatePrice = true
			}
		case PolicyRequireAck:
			eventType = EventAckRequired
			newState = ExposureStateAckRequired
		default:
			eventType = EventFlagged
			newState = ExposureStateFlagged
		}
	}

	// Build idempotency key. For scanner events it's deterministic on
	// (history_id|line_id|event_type). Safety-net runs use a day-bucketed
	// timestamp instead of historyID to dedup across reruns same day.
	keyInput := fmt.Sprintf("%s|%s|%s", historyID, *pe.QuoteLineID, eventType)
	if isSafetyNet {
		keyInput = fmt.Sprintf("SAFETYNET|%s|%s|%s|%s", now.Format("2006-01-02"), *pe.QuoteLineID, eventType, indexCode)
	}
	keyHash := sha256.Sum256([]byte(keyInput))
	idemKey := hex.EncodeToString(keyHash[:])

	bv := baseIndex
	cv := currentIndex
	dp := math.Round(deltaPct*100) / 100
	ed := exposureDollars
	tp := threshold
	historyPtr := &historyID
	if historyID == uuid.Nil {
		historyPtr = nil
	}
	ev := &QuoteExposureEvent{
		QuoteID:              ewc.QuoteID,
		QuoteLineID:          pe.QuoteLineID,
		MarketIndexID:        pe.MarketIndexID,
		MarketIndexHistoryID: historyPtr,
		EventType:            eventType,
		BaseIndexValue:       &bv,
		CurrentIndexValue:    &cv,
		DeltaPct:             &dp,
		ExposureDollars:      &ed,
		ThresholdPct:         &tp,
		Policy:               string(policy),
		ActorUserID:          "system",
		ActorRole:            "scanner",
		IdempotencyKey:       idemKey,
	}
	inserted, err := s.exposure.InsertEvent(ctx, ev)
	if err != nil {
		return 0, fmt.Errorf("scanner: insert event: %w", err)
	}
	if !inserted {
		// Idempotency dedup — event already written; no state changes either.
		return 0, nil
	}

	// Update per-line state.
	if err := s.exposure.UpdateEscalatorState(ctx, pe.ID, string(newState), now); err != nil {
		return 1, fmt.Errorf("scanner: update escalator state: %w", err)
	}

	// AUTO_ESCALATE: mutate the quote line price and recompute the quote total.
	if mutatePrice {
		newPrice := pe.BasePrice * (currentIndex / baseIndex)
		newPrice = math.Round(newPrice*10000) / 10000
		if err := s.quoteRepo.UpdateLineUnitPrice(ctx, *pe.QuoteLineID, newPrice); err != nil {
			return 1, fmt.Errorf("scanner: update line price: %w", err)
		}
		if err := s.quoteRepo.RecomputeQuoteTotal(ctx, ewc.QuoteID); err != nil {
			return 1, fmt.Errorf("scanner: recompute total: %w", err)
		}
	}

	// Roll up the quote-level exposure state and dollars.
	if err := s.rollupQuote(ctx, ewc.QuoteID, now); err != nil {
		return 1, fmt.Errorf("scanner: rollup quote: %w", err)
	}

	// Audit + notification (best-effort; failures do not roll back).
	s.writeAudit(ctx, ev)
	s.notify(ctx, eventType, ewc, indexCode, exposureDollars, deltaPct, pe.BasePrice, baseIndex, currentIndex)

	return 1, nil
}

// rollupQuote updates the denormalized quotes.exposure_state /
// exposure_dollars from the line-level escalator rows. Worst state wins
// across the active escalators on the quote.
func (s *ExposureScanner) rollupQuote(ctx context.Context, quoteID uuid.UUID, t time.Time) error {
	escalators, err := s.escalators.ListEscalatorsForQuote(ctx, quoteID)
	if err != nil {
		return err
	}

	worstState := ExposureStateOK
	totalExposure := 0.0
	for _, pe := range escalators {
		st := ExposureState(pe.CurrentState)
		if stateRank(st) > stateRank(worstState) {
			worstState = st
		}
	}
	// Sum exposure dollars from the most-recent event per line.
	// For v1 we use a simpler approximation: scan all per-line states and
	// query the latest delta from the line's escalator. This avoids a
	// separate aggregation table.
	for _, pe := range escalators {
		if pe.BaseIndexValue == nil || *pe.BaseIndexValue <= 0 || pe.MarketIndexID == nil {
			continue
		}
		idx, err := s.escalators.GetMarketIndex(ctx, *pe.MarketIndexID)
		if err != nil || idx == nil {
			continue
		}
		ratio := (idx.CurrentValue - *pe.BaseIndexValue) / *pe.BaseIndexValue
		// Line quantity isn't joined here; we use a fallback approximation —
		// the per-line dollars are persisted on the event row, so for the
		// rollup we sum across recent events instead. v1 uses 0 fallback.
		_ = ratio
	}
	// Use the sum of exposure_dollars from the latest event per line.
	// Lightweight implementation: leverage the per-quote events list.
	totalExposure = s.sumLatestExposurePerLine(ctx, quoteID)

	return s.quoteRepo.UpdateQuoteExposure(ctx, quoteID, string(worstState), totalExposure, t)
}

func (s *ExposureScanner) sumLatestExposurePerLine(ctx context.Context, quoteID uuid.UUID) float64 {
	events, err := s.exposure.GetEventsByQuote(ctx, quoteID)
	if err != nil {
		return 0
	}
	// Walk events in order; keep the most recent non-CLEARED exposure_dollars per line.
	perLine := map[uuid.UUID]float64{}
	for _, ev := range events {
		if ev.QuoteLineID == nil || ev.ExposureDollars == nil {
			continue
		}
		switch ev.EventType {
		case EventCleared, EventAcknowledged, EventOverridden:
			// Clears (or post-resolution events) zero out the line.
			perLine[*ev.QuoteLineID] = 0
		default:
			perLine[*ev.QuoteLineID] = *ev.ExposureDollars
		}
	}
	total := 0.0
	for _, v := range perLine {
		total += v
	}
	return math.Round(math.Abs(total)*100) / 100
}

// stateRank returns a worst-state ordering. Higher = more severe / more
// actionable.
func stateRank(s ExposureState) int {
	switch s {
	case ExposureStateOK, ExposureStateAcknowledged, ExposureStateOverridden:
		return 0
	case ExposureStateEscalated:
		return 1
	case ExposureStateFlagged:
		return 2
	case ExposureStateAckRequired:
		return 3
	case ExposureStateBlocked:
		return 4
	default:
		return 0
	}
}

func (s *ExposureScanner) writeAudit(ctx context.Context, ev *QuoteExposureEvent) {
	if s.audit == nil {
		return
	}
	// DETECTED events are too noisy for the audit log per US-013 H2.
	if ev.EventType == EventDetected {
		return
	}
	s.audit.LogEntry(ctx, AuditEntry{
		Action:     string(ev.EventType),
		EntityType: "quote_exposure_event",
		EntityID:   ev.ID.String(),
		UserID:     ev.ActorUserID,
		Changes: map[string]any{
			"quote_id":         ev.QuoteID,
			"quote_line_id":    ev.QuoteLineID,
			"market_index_id":  ev.MarketIndexID,
			"event_type":       ev.EventType,
			"delta_pct":        ev.DeltaPct,
			"exposure_dollars": ev.ExposureDollars,
			"policy":           ev.Policy,
		},
	})
}

func (s *ExposureScanner) notify(
	ctx context.Context, eventType EventType, ewc *EscalatorWithContext,
	indexCode string, exposureDollars, deltaPct, basePrice, baseIndex, currentIndex float64,
) {
	if s.notifier == nil {
		return
	}
	switch eventType {
	case EventFlagged:
		_ = s.notifier.NotifyFlagged(ctx, FlaggedEvent{
			QuoteID:         ewc.QuoteID,
			QuoteShortID:    ewc.QuoteShortID,
			SalespersonID:   ewc.SalespersonID,
			SalespersonName: ewc.SalespersonName,
			CustomerName:    ewc.CustomerName,
			ExposureDollars: exposureDollars,
			IndexCode:       indexCode,
			DeltaPct:        deltaPct,
		})
	case EventEscalated:
		newPrice := basePrice * (currentIndex / baseIndex)
		_ = s.notifier.NotifyEscalated(ctx, EscalatedEvent{
			QuoteLineID:     uuidOrNil(ewc.Escalator.QuoteLineID),
			QuoteID:         ewc.QuoteID,
			QuoteShortID:    ewc.QuoteShortID,
			SalespersonID:   ewc.SalespersonID,
			SalespersonName: ewc.SalespersonName,
			CustomerName:    ewc.CustomerName,
			OldPrice:        basePrice,
			NewPrice:        math.Round(newPrice*10000) / 10000,
			IndexCode:       indexCode,
			BaseIndex:       baseIndex,
			CurrentIndex:    currentIndex,
		})
	case EventAckRequired:
		_ = s.notifier.NotifyAckRequired(ctx, AckRequiredEvent{
			QuoteID:         ewc.QuoteID,
			QuoteShortID:    ewc.QuoteShortID,
			SalespersonID:   ewc.SalespersonID,
			SalespersonName: ewc.SalespersonName,
			CustomerName:    ewc.CustomerName,
			ExposureDollars: exposureDollars,
			IndexCode:       indexCode,
		})
	case EventCleared:
		_ = s.notifier.NotifyCleared(ctx, ClearedEvent{
			QuoteID:         ewc.QuoteID,
			QuoteShortID:    ewc.QuoteShortID,
			SalespersonID:   ewc.SalespersonID,
			SalespersonName: ewc.SalespersonName,
			CustomerName:    ewc.CustomerName,
		})
	}
}

func uuidOrNil(p *uuid.UUID) uuid.UUID {
	if p == nil {
		return uuid.Nil
	}
	return *p
}
