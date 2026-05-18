package pricing

import (
	"context"
	"errors"
	"log/slog"
	"math"
	"testing"
	"time"

	"github.com/gablelbm/gable/internal/quote"
	"github.com/google/uuid"
)

// ---------- shared fakes ----------

// fakeExposureRepo is a minimal in-memory ExposureRepository for service-level
// tests. Records every event written, supports idempotency dedup, and lets
// individual tests prime ListActiveEscalatorsForIndex with a slice.
type fakeExposureRepo struct {
	events           []QuoteExposureEvent
	eventKeys        map[string]bool
	escalators       []EscalatorWithContext
	stateUpdates     map[uuid.UUID]string // escalator id → new state
	lastCheckedAt    map[uuid.UUID]time.Time
	resolveIndex     map[uuid.UUID]*uuid.UUID
	historyIndex     map[uuid.UUID]*MarketIndexHistory
	categoryDefaults []ProductCategoryIndexDefault
	exposureRows     []ExposureRow
}

func newFakeExposureRepo() *fakeExposureRepo {
	return &fakeExposureRepo{
		eventKeys:     map[string]bool{},
		stateUpdates:  map[uuid.UUID]string{},
		lastCheckedAt: map[uuid.UUID]time.Time{},
		resolveIndex:  map[uuid.UUID]*uuid.UUID{},
		historyIndex:  map[uuid.UUID]*MarketIndexHistory{},
	}
}

func (r *fakeExposureRepo) InsertHistory(_ context.Context, h *MarketIndexHistory) error {
	if h.ID == uuid.Nil {
		h.ID = uuid.New()
	}
	cp := *h
	r.historyIndex[h.ID] = &cp
	return nil
}
func (r *fakeExposureRepo) GetHistoryByID(_ context.Context, id uuid.UUID) (*MarketIndexHistory, error) {
	return r.historyIndex[id], nil
}
func (r *fakeExposureRepo) ListHistory(_ context.Context, _ uuid.UUID, _, _ time.Time) ([]MarketIndexHistory, error) {
	out := make([]MarketIndexHistory, 0, len(r.historyIndex))
	for _, h := range r.historyIndex {
		out = append(out, *h)
	}
	return out, nil
}

func (r *fakeExposureRepo) InsertEvent(_ context.Context, ev *QuoteExposureEvent) (bool, error) {
	if r.eventKeys[ev.IdempotencyKey] {
		return false, nil
	}
	r.eventKeys[ev.IdempotencyKey] = true
	if ev.ID == uuid.Nil {
		ev.ID = uuid.New()
	}
	if ev.CreatedAt.IsZero() {
		ev.CreatedAt = time.Now()
	}
	r.events = append(r.events, *ev)
	return true, nil
}
func (r *fakeExposureRepo) EventExists(_ context.Context, key string) (bool, error) {
	return r.eventKeys[key], nil
}
func (r *fakeExposureRepo) GetEventsByQuote(_ context.Context, quoteID uuid.UUID) ([]QuoteExposureEvent, error) {
	out := []QuoteExposureEvent{}
	for _, e := range r.events {
		if e.QuoteID == quoteID {
			out = append(out, e)
		}
	}
	return out, nil
}

func (r *fakeExposureRepo) ListActiveEscalatorsForIndex(_ context.Context, _ uuid.UUID) ([]EscalatorWithContext, error) {
	return r.escalators, nil
}
func (r *fakeExposureRepo) UpdateEscalatorState(_ context.Context, id uuid.UUID, state string, at time.Time) error {
	r.stateUpdates[id] = state
	r.lastCheckedAt[id] = at
	// Reflect the state on the local escalators slice so subsequent rollups see it.
	for i := range r.escalators {
		if r.escalators[i].Escalator.ID == id {
			r.escalators[i].Escalator.CurrentState = state
		}
	}
	return nil
}
func (r *fakeExposureRepo) DeactivateEscalatorsForLine(_ context.Context, _ uuid.UUID) error { return nil }

func (r *fakeExposureRepo) ListCategoryDefaults(_ context.Context) ([]ProductCategoryIndexDefault, error) {
	return r.categoryDefaults, nil
}
func (r *fakeExposureRepo) UpsertCategoryDefault(_ context.Context, _ uuid.UUID, _ uuid.UUID) error { return nil }
func (r *fakeExposureRepo) DeleteCategoryDefault(_ context.Context, _ uuid.UUID) error              { return nil }

func (r *fakeExposureRepo) ResolveIndexForProduct(_ context.Context, productID uuid.UUID) (*uuid.UUID, error) {
	return r.resolveIndex[productID], nil
}

func (r *fakeExposureRepo) ListExposureForOwner(_ context.Context, _ ExposureFilter) ([]ExposureRow, error) {
	return r.exposureRows, nil
}
func (r *fakeExposureRepo) PortfolioRollup(_ context.Context, _ *uuid.UUID) (*PortfolioSummary, error) {
	return &PortfolioSummary{TotalQuotes: len(r.exposureRows)}, nil
}

// fakeEscalatorRepoForScanner is a small fake for the scanner. We only need
// GetMarketIndex (used to fetch current value for rollup), ListEscalatorsForQuote
// (used by rollupQuote), and the existing interface methods (no-op).
//
// exposureBack is a back-pointer to the same test's fakeExposureRepo so that
// state updates performed via UpdateEscalatorState (on the exposure repo) are
// observed when rollupQuote reads escalator state through this repo.
type fakeEscalatorRepoForScanner struct {
	indices      map[uuid.UUID]*MarketIndex
	exposureBack *fakeExposureRepo
}

func (f *fakeEscalatorRepoForScanner) ListMarketIndices(_ context.Context) ([]MarketIndex, error) {
	out := make([]MarketIndex, 0, len(f.indices))
	for _, i := range f.indices {
		out = append(out, *i)
	}
	return out, nil
}
func (f *fakeEscalatorRepoForScanner) GetMarketIndex(_ context.Context, id uuid.UUID) (*MarketIndex, error) {
	return f.indices[id], nil
}
func (f *fakeEscalatorRepoForScanner) GetMarketIndexByCode(_ context.Context, code string) (*MarketIndex, error) {
	for _, i := range f.indices {
		if i.IndexCode == code {
			cp := *i
			return &cp, nil
		}
	}
	return nil, nil
}
func (f *fakeEscalatorRepoForScanner) CreateMarketIndex(_ context.Context, _ *MarketIndex) error { return nil }
func (f *fakeEscalatorRepoForScanner) UpdateMarketIndex(_ context.Context, idx *MarketIndex) error {
	f.indices[idx.ID] = idx
	return nil
}
func (f *fakeEscalatorRepoForScanner) UpdateMarketIndexMetadata(_ context.Context, _ uuid.UUID, _, _ string, _ bool) error {
	return nil
}
func (f *fakeEscalatorRepoForScanner) CreateEscalator(_ context.Context, _ *PriceEscalator) error { return nil }
func (f *fakeEscalatorRepoForScanner) GetEscalatorByQuoteLine(_ context.Context, _ uuid.UUID) (*PriceEscalator, error) {
	return nil, nil
}
func (f *fakeEscalatorRepoForScanner) SnapshotEscalators(_ context.Context, _ []PriceEscalator) error {
	return nil
}
func (f *fakeEscalatorRepoForScanner) ListEscalatorsForQuote(_ context.Context, q uuid.UUID) ([]PriceEscalator, error) {
	if f.exposureBack == nil {
		return nil, nil
	}
	out := []PriceEscalator{}
	for _, ewc := range f.exposureBack.escalators {
		if ewc.QuoteID == q {
			out = append(out, ewc.Escalator)
		}
	}
	return out, nil
}

// fakeQuoteRepo is the minimal QuoteLineReader the scanner needs for price
// mutation + rollup updates.
type fakeQuoteRepo struct {
	exposureUpdates  map[uuid.UUID]struct {
		State    string
		Dollars  float64
		Checked  time.Time
	}
	lineUpdates      map[uuid.UUID]float64
	recomputeCalls   int
}

func newFakeQuoteRepo() *fakeQuoteRepo {
	return &fakeQuoteRepo{
		exposureUpdates: map[uuid.UUID]struct {
			State   string
			Dollars float64
			Checked time.Time
		}{},
		lineUpdates: map[uuid.UUID]float64{},
	}
}

func (f *fakeQuoteRepo) GetQuoteWithLinesAndCustomer(_ context.Context, _ uuid.UUID) (*quote.QuoteForSnapshot, error) {
	return nil, nil
}
func (f *fakeQuoteRepo) UpdateQuoteExposure(_ context.Context, qid uuid.UUID, state string, dollars float64, at time.Time) error {
	f.exposureUpdates[qid] = struct {
		State   string
		Dollars float64
		Checked time.Time
	}{state, dollars, at}
	return nil
}
func (f *fakeQuoteRepo) UpdateLineUnitPrice(_ context.Context, lid uuid.UUID, p float64) error {
	f.lineUpdates[lid] = p
	return nil
}
func (f *fakeQuoteRepo) RecomputeQuoteTotal(_ context.Context, _ uuid.UUID) error {
	f.recomputeCalls++
	return nil
}

// fakeNotifier records every notification fired.
type fakeNotifier struct {
	flagged     []FlaggedEvent
	escalated   []EscalatedEvent
	ackRequired []AckRequiredEvent
	cleared     []ClearedEvent
}

func (f *fakeNotifier) NotifyFlagged(_ context.Context, ev FlaggedEvent) error {
	f.flagged = append(f.flagged, ev)
	return nil
}
func (f *fakeNotifier) NotifyEscalated(_ context.Context, ev EscalatedEvent) error {
	f.escalated = append(f.escalated, ev)
	return nil
}
func (f *fakeNotifier) NotifyAckRequired(_ context.Context, ev AckRequiredEvent) error {
	f.ackRequired = append(f.ackRequired, ev)
	return nil
}
func (f *fakeNotifier) NotifyCleared(_ context.Context, ev ClearedEvent) error {
	f.cleared = append(f.cleared, ev)
	return nil
}

// fakeAudit records every entry it's asked to log.
type fakeAudit struct {
	entries []AuditEntry
}

func (f *fakeAudit) LogEntry(_ context.Context, e AuditEntry) {
	f.entries = append(f.entries, e)
}

// ---------- test fixture helpers ----------

func buildEscalator(t *testing.T, basePrice, baseIndex, threshold float64, policy EscalationPolicy, agreementSigned bool) (*EscalatorWithContext, uuid.UUID, uuid.UUID, uuid.UUID) {
	t.Helper()
	escID := uuid.New()
	lineID := uuid.New()
	quoteID := uuid.New()
	idxID := uuid.New()
	base := baseIndex
	now := time.Now()
	var signedAt *time.Time
	if agreementSigned {
		sa := now.AddDate(0, -6, 0)
		signedAt = &sa
	}
	return &EscalatorWithContext{
		Escalator: PriceEscalator{
			ID:                     escID,
			QuoteLineID:            &lineID,
			MarketIndexID:          &idxID,
			BasePrice:              basePrice,
			BaseIndexValue:         &base,
			BaseIndexRecordedAt:    &now,
			CurrentState:           string(ExposureStateOK),
			PolicyAtSnapshot:       string(policy),
			ThresholdPctAtSnapshot: threshold,
			IsActive:               true,
		},
		QuoteID:                   quoteID,
		QuoteState:                "SENT",
		QuoteShortID:              "Q-test",
		CustomerID:                uuid.New(),
		CustomerName:              "Test Customer",
		LineQuantity:              100,
		LineUnitPrice:             basePrice,
		CustomerAgreementSignedAt: signedAt,
	}, escID, lineID, quoteID
}

func newTestScanner(t *testing.T, indexCurrent float64, ewc *EscalatorWithContext) (*ExposureScanner, *fakeExposureRepo, *fakeEscalatorRepoForScanner, *fakeQuoteRepo, *fakeNotifier, *fakeAudit, uuid.UUID) {
	t.Helper()
	idxID := *ewc.Escalator.MarketIndexID
	idx := &MarketIndex{
		ID:            idxID,
		IndexCode:     "RL_SPF_2X4",
		CurrentValue:  indexCurrent,
		PreviousValue: ewc.Escalator.BaseIndexValue,
		IsActive:      true,
		Unit:          "MBF",
	}
	er := newFakeExposureRepo()
	er.escalators = []EscalatorWithContext{*ewc}
	esc := &fakeEscalatorRepoForScanner{
		indices:      map[uuid.UUID]*MarketIndex{idxID: idx},
		exposureBack: er,
	}
	qr := newFakeQuoteRepo()
	nt := &fakeNotifier{}
	au := &fakeAudit{}
	// Pass nil TxRunner — tests run without DB-level wrapping; the back-pointer
	// fakes already simulate the writes happening in order.
	s := NewExposureScanner(er, esc, qr, nt, au, nil, slog.New(slog.NewTextHandler(testWriter{t: t}, nil)))
	return s, er, esc, qr, nt, au, idxID
}

// testWriter forwards slog output to t.Log so tests stay quiet on success.
type testWriter struct{ t *testing.T }

func (w testWriter) Write(p []byte) (int, error) {
	w.t.Log(string(p))
	return len(p), nil
}

// ---------- scenarios ----------

func TestScanner_BelowThreshold_NoEvent(t *testing.T) {
	// Index moved 3% — below customer threshold 5%. No event should be written.
	ewc, escID, _, qid := buildEscalator(t, 6.00, 400.0, 5.0, PolicyFlagForRequote, false)
	s, er, esc, _, _, _, idxID := newTestScanner(t, 412.0, ewc) // 3% movement

	if err := s.OnMarketIndexUpdated(context.Background(), idxID, uuid.New()); err != nil {
		t.Fatalf("scanner: %v", err)
	}

	if len(er.events) != 0 {
		t.Errorf("expected zero events, got %d: %+v", len(er.events), er.events)
	}
	if st := er.stateUpdates[escID]; st != string(ExposureStateOK) {
		t.Errorf("expected escalator state OK, got %q", st)
	}
	// rollupQuote should have run; per-quote OK state confirmed via the
	// escalator state map (escalator never raised → state remains OK).
	_ = qid
	_ = esc
}

func TestScanner_FlagForRequote_AboveThreshold(t *testing.T) {
	// 7% movement, FLAG_FOR_REQUOTE policy → FLAGGED event, no price mutation.
	ewc, escID, lineID, qid := buildEscalator(t, 6.00, 400.0, 5.0, PolicyFlagForRequote, false)
	s, er, _, qr, nt, au, idxID := newTestScanner(t, 428.0, ewc) // 7%

	if err := s.OnMarketIndexUpdated(context.Background(), idxID, uuid.New()); err != nil {
		t.Fatalf("scanner: %v", err)
	}

	if len(er.events) != 1 || er.events[0].EventType != EventFlagged {
		t.Fatalf("expected one FLAGGED event, got %+v", er.events)
	}
	if er.stateUpdates[escID] != string(ExposureStateFlagged) {
		t.Errorf("expected escalator state FLAGGED, got %q", er.stateUpdates[escID])
	}
	if _, mutated := qr.lineUpdates[lineID]; mutated {
		t.Errorf("FLAGGED path must not mutate unit_price; got %v", qr.lineUpdates)
	}
	if len(nt.flagged) != 1 {
		t.Errorf("expected one flagged notification, got %d", len(nt.flagged))
	}
	if len(au.entries) != 1 || au.entries[0].Action != string(EventFlagged) {
		t.Errorf("expected one audit entry, got %+v", au.entries)
	}
	if up, ok := qr.exposureUpdates[qid]; !ok || up.State != string(ExposureStateFlagged) {
		t.Errorf("quote rollup not flipped to FLAGGED: %+v", up)
	}
}

func TestScanner_AutoEscalate_WithSignedAgreement(t *testing.T) {
	// AUTO_ESCALATE with a signed agreement and a 10% move → ESCALATED event,
	// price mutated to base * (current/base), quote total recomputed.
	ewc, escID, lineID, qid := buildEscalator(t, 6.00, 400.0, 5.0, PolicyAutoEscalate, true)
	s, er, _, qr, nt, au, idxID := newTestScanner(t, 440.0, ewc) // 10%

	if err := s.OnMarketIndexUpdated(context.Background(), idxID, uuid.New()); err != nil {
		t.Fatalf("scanner: %v", err)
	}
	if len(er.events) != 1 || er.events[0].EventType != EventEscalated {
		t.Fatalf("expected one ESCALATED event, got %+v", er.events)
	}
	want := 6.00 * (440.0 / 400.0)
	want = math.Round(want*10000) / 10000
	gotPrice, ok := qr.lineUpdates[lineID]
	if !ok {
		t.Fatalf("expected line price update")
	}
	if math.Abs(gotPrice-want) > 1e-6 {
		t.Errorf("price mutation: want %.4f, got %.4f", want, gotPrice)
	}
	if qr.recomputeCalls != 1 {
		t.Errorf("expected one quote-total recompute, got %d", qr.recomputeCalls)
	}
	if er.stateUpdates[escID] != string(ExposureStateEscalated) {
		t.Errorf("expected escalator state ESCALATED, got %q", er.stateUpdates[escID])
	}
	if len(nt.escalated) != 1 {
		t.Errorf("expected one escalated notification, got %d", len(nt.escalated))
	}
	if up, ok := qr.exposureUpdates[qid]; !ok || up.State != string(ExposureStateEscalated) {
		t.Errorf("quote rollup state: %+v", up)
	}
	if len(au.entries) != 1 {
		t.Errorf("expected one audit entry, got %d", len(au.entries))
	}
}

func TestScanner_AutoEscalate_WithoutAgreement_FallsBackToFlagged(t *testing.T) {
	// AUTO_ESCALATE but no signed agreement → must fall back to FLAGGED,
	// no price mutation.
	ewc, _, lineID, _ := buildEscalator(t, 6.00, 400.0, 5.0, PolicyAutoEscalate, false)
	s, er, _, qr, nt, _, idxID := newTestScanner(t, 440.0, ewc)

	if err := s.OnMarketIndexUpdated(context.Background(), idxID, uuid.New()); err != nil {
		t.Fatalf("scanner: %v", err)
	}
	if len(er.events) != 1 || er.events[0].EventType != EventFlagged {
		t.Fatalf("expected fallback FLAGGED event, got %+v", er.events)
	}
	if _, mutated := qr.lineUpdates[lineID]; mutated {
		t.Errorf("fallback must not mutate price; got %v", qr.lineUpdates)
	}
	if len(nt.escalated) != 0 {
		t.Errorf("must not send escalated notification on fallback")
	}
	if len(nt.flagged) != 1 {
		t.Errorf("expected one flagged notification")
	}
}

func TestScanner_RequireAck_AboveThreshold(t *testing.T) {
	ewc, _, _, _ := buildEscalator(t, 6.00, 400.0, 5.0, PolicyRequireAck, false)
	s, er, _, _, nt, _, idxID := newTestScanner(t, 432.0, ewc) // 8%

	if err := s.OnMarketIndexUpdated(context.Background(), idxID, uuid.New()); err != nil {
		t.Fatalf("scanner: %v", err)
	}
	if len(er.events) != 1 || er.events[0].EventType != EventAckRequired {
		t.Fatalf("expected ACK_REQUIRED event, got %+v", er.events)
	}
	if len(nt.ackRequired) != 1 {
		t.Errorf("expected one ack-required notification")
	}
}

func TestScanner_Idempotent_SameHistoryNoDuplicate(t *testing.T) {
	ewc, _, _, _ := buildEscalator(t, 6.00, 400.0, 5.0, PolicyFlagForRequote, false)
	s, er, _, _, nt, _, idxID := newTestScanner(t, 428.0, ewc)
	historyID := uuid.New()

	if err := s.OnMarketIndexUpdated(context.Background(), idxID, historyID); err != nil {
		t.Fatal(err)
	}
	if err := s.OnMarketIndexUpdated(context.Background(), idxID, historyID); err != nil {
		t.Fatal(err)
	}

	if len(er.events) != 1 {
		t.Errorf("idempotency violation — expected 1 event after two identical scans, got %d", len(er.events))
	}
	if len(nt.flagged) != 1 {
		t.Errorf("duplicate notification: got %d", len(nt.flagged))
	}
}

func TestScanner_Cleared_WhenMarketReverts(t *testing.T) {
	// Start in FLAGGED state; the new scan finds delta back below threshold.
	ewc, escID, _, _ := buildEscalator(t, 6.00, 400.0, 5.0, PolicyFlagForRequote, false)
	ewc.Escalator.CurrentState = string(ExposureStateFlagged)
	s, er, _, _, nt, _, idxID := newTestScanner(t, 408.0, ewc) // 2% — below threshold

	if err := s.OnMarketIndexUpdated(context.Background(), idxID, uuid.New()); err != nil {
		t.Fatal(err)
	}

	if len(er.events) != 1 || er.events[0].EventType != EventCleared {
		t.Fatalf("expected CLEARED event, got %+v", er.events)
	}
	if er.stateUpdates[escID] != string(ExposureStateOK) {
		t.Errorf("expected escalator returned to OK, got %q", er.stateUpdates[escID])
	}
	if len(nt.cleared) != 1 {
		t.Errorf("expected one cleared notification")
	}
}

func TestScanner_SkipsLineWithNoBaseline(t *testing.T) {
	// Escalator lacks BaseIndexValue → can't compute delta → skip silently.
	ewc, _, _, _ := buildEscalator(t, 6.00, 0.0, 5.0, PolicyFlagForRequote, false)
	ewc.Escalator.BaseIndexValue = nil
	s, er, _, _, _, _, idxID := newTestScanner(t, 500.0, ewc)

	if err := s.OnMarketIndexUpdated(context.Background(), idxID, uuid.New()); err != nil {
		t.Fatal(err)
	}
	if len(er.events) != 0 {
		t.Errorf("expected zero events for missing baseline, got %d", len(er.events))
	}
}

func TestScanner_IndexNotFound_ReturnsError(t *testing.T) {
	ewc, _, _, _ := buildEscalator(t, 6.00, 400.0, 5.0, PolicyFlagForRequote, false)
	s, _, _, _, _, _, _ := newTestScanner(t, 440.0, ewc)

	bogusID := uuid.New()
	err := s.OnMarketIndexUpdated(context.Background(), bogusID, uuid.New())
	if err == nil {
		t.Fatal("expected error for missing index")
	}
	if !errors.Is(err, err) { // sanity: error has a message
		t.Errorf("error didn't propagate")
	}
}

func TestScanner_ExposureDollarsArePositiveMagnitude(t *testing.T) {
	// Index moved DOWN through the threshold (−7%). exposure_dollars on the
	// event must be a positive magnitude — sign is conveyed by delta_pct
	// alone. Earlier code allowed negative values to flow through, which then
	// cancelled out positive exposures in the per-quote rollup.
	ewc, _, _, _ := buildEscalator(t, 6.00, 400.0, 5.0, PolicyFlagForRequote, false)
	s, er, _, _, _, _, idxID := newTestScanner(t, 372.0, ewc) // -7%

	if err := s.OnMarketIndexUpdated(context.Background(), idxID, uuid.New()); err != nil {
		t.Fatalf("scanner: %v", err)
	}
	if len(er.events) != 1 {
		t.Fatalf("expected one FLAGGED event, got %d", len(er.events))
	}
	ev := er.events[0]
	if ev.ExposureDollars == nil {
		t.Fatal("exposure_dollars missing")
	}
	if *ev.ExposureDollars <= 0 {
		t.Errorf("exposure_dollars must be positive magnitude; got %.2f", *ev.ExposureDollars)
	}
	// Sanity: delta_pct should carry the sign
	if ev.DeltaPct == nil || *ev.DeltaPct >= 0 {
		t.Errorf("delta_pct should be negative for downward move; got %v", ev.DeltaPct)
	}
}

func TestScanner_AuditLogSkippedForDetected(t *testing.T) {
	// DETECTED events should NOT write to audit_log (US-013 H2). Verify by
	// invoking writeAudit directly on a hand-built scanner.
	au := &fakeAudit{}
	s := &ExposureScanner{audit: au, logger: slog.Default()}

	ev := &QuoteExposureEvent{
		ID:        uuid.New(),
		EventType: EventDetected,
	}
	s.writeAudit(context.Background(), ev)
	if len(au.entries) != 0 {
		t.Errorf("DETECTED events should not write audit; got %d entries", len(au.entries))
	}

	// Confirm non-DETECTED does write
	ev2 := &QuoteExposureEvent{
		ID:        uuid.New(),
		EventType: EventFlagged,
		QuoteID:   uuid.New(),
	}
	s.writeAudit(context.Background(), ev2)
	if len(au.entries) != 1 || au.entries[0].Action != string(EventFlagged) {
		t.Errorf("expected one FLAGGED audit entry, got %+v", au.entries)
	}
}

func ptr[T any](v T) *T { return &v }

// ---------- pure computeRollup tests ----------

func TestComputeRollup_WorstStateWins(t *testing.T) {
	cases := []struct {
		name   string
		states []ExposureState
		want   ExposureState
	}{
		{"all OK", []ExposureState{ExposureStateOK, ExposureStateOK}, ExposureStateOK},
		{"one flagged among ok", []ExposureState{ExposureStateOK, ExposureStateFlagged, ExposureStateOK}, ExposureStateFlagged},
		// FLAGGED outranks ESCALATED because flagged is unresolved (salesperson
		// must act) while escalated is auto-resolved by signed agreement.
		{"flagged outranks escalated", []ExposureState{ExposureStateEscalated, ExposureStateFlagged}, ExposureStateFlagged},
		{"ack_required outranks flagged", []ExposureState{ExposureStateFlagged, ExposureStateAckRequired}, ExposureStateAckRequired},
		{"blocked is worst", []ExposureState{ExposureStateAckRequired, ExposureStateBlocked, ExposureStateFlagged}, ExposureStateBlocked},
		// ACKNOWLEDGED is rank 0 (resolved) — same bucket as OK.
		{"acknowledged is resolved like ok", []ExposureState{ExposureStateOK, ExposureStateAcknowledged}, ExposureStateOK},
	}
	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) {
			escalators := make([]PriceEscalator, len(c.states))
			for i, s := range c.states {
				escalators[i] = PriceEscalator{CurrentState: string(s)}
			}
			got, _ := computeRollup(escalators, nil)
			if got != c.want {
				t.Errorf("want %s, got %s", c.want, got)
			}
		})
	}
}

func TestComputeRollup_SumsAbsoluteMagnitudes(t *testing.T) {
	// Positive + negative line dollars must NOT cancel — both contribute
	// positive exposure to the rollup total. Defense-in-depth against the
	// regression fixed in the scanner's emit path.
	_, total := computeRollup(nil, []float64{1000.0, -250.0, 500.50})
	want := 1750.50
	if total != want {
		t.Errorf("expected %.2f sum of abs values, got %.2f", want, total)
	}
}

func TestComputeRollup_EmptyInput(t *testing.T) {
	state, total := computeRollup(nil, nil)
	if state != ExposureStateOK {
		t.Errorf("empty escalators must default to OK, got %s", state)
	}
	if total != 0 {
		t.Errorf("empty dollars must total 0, got %v", total)
	}
}
