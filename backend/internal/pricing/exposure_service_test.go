package pricing

import (
	"context"
	"errors"
	"log/slog"
	"testing"

	"github.com/google/uuid"
)

// fakeChecker implements ExposureChecker. The acknowledge / override service
// methods call CheckQuoteExposure to find the current state before deciding
// whether to write the event.
type fakeChecker struct {
	state ExposureState
	dollars float64
}

func (f *fakeChecker) CheckQuoteExposure(_ context.Context, qid uuid.UUID) (ExposureStatus, error) {
	return ExposureStatus{
		QuoteID:         qid,
		State:           f.state,
		ExposureDollars: f.dollars,
	}, nil
}
func (f *fakeChecker) RequireClearForOrder(_ context.Context, _ uuid.UUID) error { return nil }

// minimal escalator repo for the exposure service — only ListEscalatorsForQuote
// is exercised by the Acknowledge / Override paths (via flipAllActiveEscalators).
type emptyEscalatorRepo struct{}

func (emptyEscalatorRepo) ListMarketIndices(context.Context) ([]MarketIndex, error)       { return nil, nil }
func (emptyEscalatorRepo) GetMarketIndex(context.Context, uuid.UUID) (*MarketIndex, error) {
	return nil, nil
}
func (emptyEscalatorRepo) GetMarketIndexByCode(context.Context, string) (*MarketIndex, error) {
	return nil, nil
}
func (emptyEscalatorRepo) CreateMarketIndex(context.Context, *MarketIndex) error              { return nil }
func (emptyEscalatorRepo) UpdateMarketIndex(context.Context, *MarketIndex) error              { return nil }
func (emptyEscalatorRepo) UpdateMarketIndexMetadata(context.Context, uuid.UUID, string, string, bool) error {
	return nil
}
func (emptyEscalatorRepo) CreateEscalator(context.Context, *PriceEscalator) error             { return nil }
func (emptyEscalatorRepo) GetEscalatorByQuoteLine(context.Context, uuid.UUID) (*PriceEscalator, error) {
	return nil, nil
}
func (emptyEscalatorRepo) SnapshotEscalators(context.Context, []PriceEscalator) error         { return nil }
func (emptyEscalatorRepo) ListEscalatorsForQuote(context.Context, uuid.UUID) ([]PriceEscalator, error) {
	return nil, nil
}

func newTestExposureService(t *testing.T, checker *fakeChecker) (*ExposureService, *fakeExposureRepo, *fakeQuoteRepo, *fakeAudit) {
	t.Helper()
	er := newFakeExposureRepo()
	qr := newFakeQuoteRepo()
	au := &fakeAudit{}
	svc := NewExposureService(er, emptyEscalatorRepo{}, qr, &fakeNotifier{}, au, checker, slog.New(slog.NewTextHandler(testWriter{t: t}, nil)))
	return svc, er, qr, au
}

// ---------- Acknowledge ----------

func TestAcknowledge_HappyPath(t *testing.T) {
	checker := &fakeChecker{state: ExposureStateAckRequired, dollars: 1400}
	svc, er, qr, au := newTestExposureService(t, checker)
	quoteID := uuid.New()

	ev, err := svc.Acknowledge(context.Background(), quoteID, AcknowledgmentRequest{
		Method:          AckMethodVerbal,
		CustomerContact: "Sanjay",
		Notes:           "Customer agreed at 9:45am 5/15, will email confirmation",
	}, "marcus-uuid", "sales")
	if err != nil {
		t.Fatalf("acknowledge failed: %v", err)
	}
	if ev == nil || ev.EventType != EventAcknowledged {
		t.Fatalf("expected ACKNOWLEDGED event, got %+v", ev)
	}
	if len(er.events) != 1 || er.events[0].EventType != EventAcknowledged {
		t.Errorf("events ledger should hold one ACKNOWLEDGED; got %+v", er.events)
	}
	upd, ok := qr.exposureUpdates[quoteID]
	if !ok || upd.State != string(ExposureStateAcknowledged) {
		t.Errorf("quote rollup should flip to ACKNOWLEDGED; got %+v", upd)
	}
	if len(au.entries) != 1 || au.entries[0].Action != string(EventAcknowledged) {
		t.Errorf("audit entry missing or wrong action: %+v", au.entries)
	}
}

func TestAcknowledge_NotesTooShort(t *testing.T) {
	checker := &fakeChecker{state: ExposureStateAckRequired}
	svc, _, _, _ := newTestExposureService(t, checker)

	_, err := svc.Acknowledge(context.Background(), uuid.New(), AcknowledgmentRequest{
		Method: AckMethodVerbal,
		Notes:  "too short",
	}, "u", "sales")
	if !errors.Is(err, errNotesTooShort) {
		t.Errorf("expected errNotesTooShort, got %v", err)
	}
}

func TestAcknowledge_InvalidMethod(t *testing.T) {
	checker := &fakeChecker{state: ExposureStateAckRequired}
	svc, _, _, _ := newTestExposureService(t, checker)

	_, err := svc.Acknowledge(context.Background(), uuid.New(), AcknowledgmentRequest{
		Method: "WHATEVER",
		Notes:  "Some sufficiently long notes content here.",
	}, "u", "sales")
	if !errors.Is(err, errInvalidAckMethod) {
		t.Errorf("expected errInvalidAckMethod, got %v", err)
	}
}

func TestAcknowledge_AlreadyCleared(t *testing.T) {
	// Quote already in OK state — calling acknowledge again should return 409.
	checker := &fakeChecker{state: ExposureStateOK}
	svc, er, _, _ := newTestExposureService(t, checker)

	_, err := svc.Acknowledge(context.Background(), uuid.New(), AcknowledgmentRequest{
		Method: AckMethodVerbal,
		Notes:  "Customer agreed at 9:45am 5/15 — fine.",
	}, "u", "sales")
	if !errors.Is(err, errAlreadyCleared) {
		t.Errorf("expected errAlreadyCleared, got %v", err)
	}
	if len(er.events) != 0 {
		t.Errorf("no event should be written on already-cleared; got %d", len(er.events))
	}
}

func TestAcknowledge_PreservesExposureDollarsInEvent(t *testing.T) {
	// Status's exposure_dollars should be captured into the event for audit.
	checker := &fakeChecker{state: ExposureStateAckRequired, dollars: 2150.50}
	svc, er, _, _ := newTestExposureService(t, checker)

	_, err := svc.Acknowledge(context.Background(), uuid.New(), AcknowledgmentRequest{
		Method: AckMethodEmail,
		Notes:  "Customer confirmed by email — sufficient.",
	}, "u", "sales")
	if err != nil {
		t.Fatal(err)
	}
	if len(er.events) != 1 {
		t.Fatalf("expected one event")
	}
	if er.events[0].ExposureDollars == nil || *er.events[0].ExposureDollars != 2150.50 {
		t.Errorf("expected exposure_dollars 2150.50 on event, got %v", er.events[0].ExposureDollars)
	}
}

// ---------- RequestAck ----------

func TestRequestAck_WritesEventAndNotifies(t *testing.T) {
	checker := &fakeChecker{state: ExposureStateAckRequired, dollars: 1400}
	svc, er, _, au := newTestExposureService(t, checker)

	ev, err := svc.RequestAck(context.Background(), uuid.New(), "carla-uuid", "sales")
	if err != nil {
		t.Fatalf("request-ack failed: %v", err)
	}
	if ev.EventType != EventAckRequested {
		t.Errorf("expected ACK_REQUESTED event")
	}
	if len(er.events) != 1 {
		t.Errorf("expected one event, got %d", len(er.events))
	}
	if len(au.entries) != 1 {
		t.Errorf("expected one audit entry, got %d", len(au.entries))
	}
}

// ---------- Override ----------

func TestOverride_HappyPath(t *testing.T) {
	checker := &fakeChecker{state: ExposureStateBlocked, dollars: 1400}
	svc, er, qr, au := newTestExposureService(t, checker)
	quoteID := uuid.New()

	ev, err := svc.Override(context.Background(), quoteID, OverrideRequest{
		Notes: "Customer agreed verbally; formal ack to follow Monday.",
	}, "linda-uuid", "owner")
	if err != nil {
		t.Fatalf("override: %v", err)
	}
	if ev.EventType != EventOverridden {
		t.Errorf("expected OVERRIDDEN event")
	}
	upd := qr.exposureUpdates[quoteID]
	if upd.State != string(ExposureStateOverridden) {
		t.Errorf("expected rollup flip to OVERRIDDEN, got %q", upd.State)
	}
	if len(er.events) != 1 || len(au.entries) != 1 {
		t.Errorf("events/audit mismatch: events=%d audit=%d", len(er.events), len(au.entries))
	}
}

func TestOverride_NotesTooShort(t *testing.T) {
	checker := &fakeChecker{state: ExposureStateBlocked}
	svc, _, _, _ := newTestExposureService(t, checker)

	_, err := svc.Override(context.Background(), uuid.New(), OverrideRequest{Notes: "oops"}, "u", "owner")
	if !errors.Is(err, errNotesTooShort) {
		t.Errorf("expected errNotesTooShort, got %v", err)
	}
}

func TestOverride_AlreadyCleared_RejectedForOKState(t *testing.T) {
	// Owner cannot override a quote whose exposure is already OK / ACKNOWLEDGED /
	// OVERRIDDEN — would write spurious audit entries and unnecessarily flip
	// every escalator to OVERRIDDEN, blocking future scanner re-detection.
	for _, st := range []ExposureState{ExposureStateOK, ExposureStateAcknowledged, ExposureStateOverridden} {
		t.Run(string(st), func(t *testing.T) {
			checker := &fakeChecker{state: st}
			svc, er, qr, _ := newTestExposureService(t, checker)

			_, err := svc.Override(context.Background(), uuid.New(), OverrideRequest{
				Notes: "Trying to override an already-resolved quote",
			}, "linda-uuid", "owner")
			if !errors.Is(err, errAlreadyCleared) {
				t.Errorf("expected errAlreadyCleared for state %s, got %v", st, err)
			}
			if len(er.events) != 0 {
				t.Errorf("must not write event when already cleared; got %d", len(er.events))
			}
			if len(qr.exposureUpdates) != 0 {
				t.Errorf("must not flip rollup when already cleared; got %+v", qr.exposureUpdates)
			}
		})
	}
}

// ---------- EscalateNowPreview ----------

func TestEscalateNowPreview_NilProjection_ReturnsEmptyResult(t *testing.T) {
	// When the fake quote repo returns (nil, nil), the service must not panic.
	// It should return an empty result for the caller to render gracefully.
	checker := &fakeChecker{state: ExposureStateOK}
	svc, _, _, _ := newTestExposureService(t, checker)

	res, err := svc.EscalateNowPreview(context.Background(), uuid.New())
	if err != nil {
		t.Fatalf("expected nil-safe handling, got error: %v", err)
	}
	if res == nil {
		t.Fatal("expected non-nil result")
	}
	if len(res.Lines) != 0 {
		t.Errorf("expected empty Lines slice for nil projection, got %d", len(res.Lines))
	}
}
