package pricing

import (
	"context"
	"log/slog"
	"testing"
	"time"

	"github.com/gablelbm/gable/internal/quote"
	"github.com/google/uuid"
)

// snapshotEscalatorRepo records what SnapshotEscalators is called with and
// implements the existing EscalatorRepository interface. The single tracked
// call lets each test assert what would land in price_escalators.
type snapshotEscalatorRepo struct {
	indices       map[uuid.UUID]*MarketIndex
	snapshotCalls [][]PriceEscalator
}

func (r *snapshotEscalatorRepo) ListMarketIndices(context.Context) ([]MarketIndex, error) { return nil, nil }
func (r *snapshotEscalatorRepo) GetMarketIndex(_ context.Context, id uuid.UUID) (*MarketIndex, error) {
	return r.indices[id], nil
}
func (r *snapshotEscalatorRepo) GetMarketIndexByCode(context.Context, string) (*MarketIndex, error) {
	return nil, nil
}
func (r *snapshotEscalatorRepo) CreateMarketIndex(context.Context, *MarketIndex) error { return nil }
func (r *snapshotEscalatorRepo) UpdateMarketIndex(context.Context, *MarketIndex) error { return nil }
func (r *snapshotEscalatorRepo) UpdateMarketIndexMetadata(context.Context, uuid.UUID, string, string, bool) error {
	return nil
}
func (r *snapshotEscalatorRepo) CreateEscalator(context.Context, *PriceEscalator) error { return nil }
func (r *snapshotEscalatorRepo) GetEscalatorByQuoteLine(context.Context, uuid.UUID) (*PriceEscalator, error) {
	return nil, nil
}
func (r *snapshotEscalatorRepo) SnapshotEscalators(_ context.Context, esc []PriceEscalator) error {
	cp := make([]PriceEscalator, len(esc))
	copy(cp, esc)
	r.snapshotCalls = append(r.snapshotCalls, cp)
	return nil
}
func (r *snapshotEscalatorRepo) ListEscalatorsForQuote(context.Context, uuid.UUID) ([]PriceEscalator, error) {
	return nil, nil
}

// stubQuoteRepo returns a fixed projection from GetQuoteWithLinesAndCustomer.
type stubQuoteRepo struct {
	projection *quote.QuoteForSnapshot
	exposureUpdates map[uuid.UUID]string
}

func (s *stubQuoteRepo) GetQuoteWithLinesAndCustomer(_ context.Context, _ uuid.UUID) (*quote.QuoteForSnapshot, error) {
	return s.projection, nil
}
func (s *stubQuoteRepo) UpdateQuoteExposure(_ context.Context, qid uuid.UUID, state string, _ float64, _ time.Time) error {
	if s.exposureUpdates == nil {
		s.exposureUpdates = map[uuid.UUID]string{}
	}
	s.exposureUpdates[qid] = state
	return nil
}
func (s *stubQuoteRepo) UpdateLineUnitPrice(context.Context, uuid.UUID, float64) error { return nil }
func (s *stubQuoteRepo) RecomputeQuoteTotal(context.Context, uuid.UUID) error          { return nil }

func newTestSnapshotService(t *testing.T, projection *quote.QuoteForSnapshot, indices map[uuid.UUID]*MarketIndex, resolveIndex map[uuid.UUID]*uuid.UUID) (*SnapshotService, *fakeExposureRepo, *snapshotEscalatorRepo, *stubQuoteRepo) {
	t.Helper()
	er := newFakeExposureRepo()
	er.resolveIndex = resolveIndex
	esc := &snapshotEscalatorRepo{indices: indices}
	qr := &stubQuoteRepo{projection: projection}
	s := NewSnapshotService(esc, er, qr, slog.New(slog.NewTextHandler(testWriter{t: t}, nil)))
	return s, er, esc, qr
}

func TestSnapshot_CommodityLineCreatesEscalator(t *testing.T) {
	idxID := uuid.New()
	productID := uuid.New()
	lineID := uuid.New()
	quoteID := uuid.New()

	projection := &quote.QuoteForSnapshot{
		ID:         quoteID,
		CustomerID: uuid.New(),
		CustomerPolicy: quote.CustomerPolicyForSnapshot{
			Policy:       "FLAG_FOR_REQUOTE",
			ThresholdPct: 5.0,
		},
		Lines: []quote.QuoteLineForSnapshot{
			{
				ID:            lineID,
				ProductID:     productID,
				SKU:           "SPF-2x4",
				Quantity:      500,
				UnitPrice:     6.00,
				IsCommodity:   true,
				MarketIndexID: &idxID, // per-product override
			},
		},
	}
	indices := map[uuid.UUID]*MarketIndex{idxID: {
		ID: idxID, CurrentValue: 412.0, IsActive: true, IndexCode: "RL_SPF_2X4",
	}}

	svc, _, esc, qr := newTestSnapshotService(t, projection, indices, nil)
	if err := svc.SnapshotQuoteLines(context.Background(), quoteID); err != nil {
		t.Fatalf("snapshot: %v", err)
	}

	if len(esc.snapshotCalls) != 1 || len(esc.snapshotCalls[0]) != 1 {
		t.Fatalf("expected one batch with one escalator, got %+v", esc.snapshotCalls)
	}
	got := esc.snapshotCalls[0][0]
	if got.QuoteLineID == nil || *got.QuoteLineID != lineID {
		t.Errorf("quote_line_id wrong")
	}
	if got.MarketIndexID == nil || *got.MarketIndexID != idxID {
		t.Errorf("market_index_id wrong")
	}
	if got.BasePrice != 6.00 {
		t.Errorf("base_price wrong: %v", got.BasePrice)
	}
	if got.BaseIndexValue == nil || *got.BaseIndexValue != 412.0 {
		t.Errorf("base_index_value wrong: %v", got.BaseIndexValue)
	}
	if got.PolicyAtSnapshot != "FLAG_FOR_REQUOTE" || got.ThresholdPctAtSnapshot != 5.0 {
		t.Errorf("snapshot policy/threshold not frozen: %+v", got)
	}
	if got.CurrentState != string(ExposureStateOK) {
		t.Errorf("expected initial state OK, got %q", got.CurrentState)
	}
	if !got.IsActive {
		t.Errorf("snapshot must be active")
	}
	if qr.exposureUpdates[quoteID] != string(ExposureStateOK) {
		t.Errorf("quote should be flipped to OK after snapshot, got %q", qr.exposureUpdates[quoteID])
	}
}

func TestSnapshot_NonCommodityLinesSkipped(t *testing.T) {
	quoteID := uuid.New()
	projection := &quote.QuoteForSnapshot{
		ID:             quoteID,
		CustomerID:     uuid.New(),
		CustomerPolicy: quote.CustomerPolicyForSnapshot{Policy: "FLAG_FOR_REQUOTE", ThresholdPct: 5.0},
		Lines: []quote.QuoteLineForSnapshot{
			{ID: uuid.New(), ProductID: uuid.New(), Quantity: 10, UnitPrice: 1.0, IsCommodity: false},
		},
	}
	svc, _, esc, _ := newTestSnapshotService(t, projection, nil, nil)
	if err := svc.SnapshotQuoteLines(context.Background(), quoteID); err != nil {
		t.Fatal(err)
	}
	if len(esc.snapshotCalls) != 0 {
		t.Errorf("expected no snapshot for non-commodity line, got %+v", esc.snapshotCalls)
	}
}

func TestSnapshot_FallsBackToCategoryDefault(t *testing.T) {
	idxID := uuid.New()
	productID := uuid.New()
	quoteID := uuid.New()

	projection := &quote.QuoteForSnapshot{
		ID:             quoteID,
		CustomerID:     uuid.New(),
		CustomerPolicy: quote.CustomerPolicyForSnapshot{Policy: "FLAG_FOR_REQUOTE", ThresholdPct: 5.0},
		Lines: []quote.QuoteLineForSnapshot{
			{
				ID: uuid.New(), ProductID: productID, Quantity: 100, UnitPrice: 6.0,
				IsCommodity:   true,
				MarketIndexID: nil, // no per-product override → falls back to ResolveIndexForProduct
			},
		},
	}
	indices := map[uuid.UUID]*MarketIndex{idxID: {ID: idxID, CurrentValue: 412.0, IsActive: true}}
	resolve := map[uuid.UUID]*uuid.UUID{productID: &idxID}

	svc, _, esc, _ := newTestSnapshotService(t, projection, indices, resolve)
	if err := svc.SnapshotQuoteLines(context.Background(), quoteID); err != nil {
		t.Fatal(err)
	}
	if len(esc.snapshotCalls) != 1 || len(esc.snapshotCalls[0]) != 1 {
		t.Fatalf("expected one snapshot via category fallback, got %+v", esc.snapshotCalls)
	}
}

func TestSnapshot_NoResolvableIndex_SkipsLine(t *testing.T) {
	quoteID := uuid.New()
	projection := &quote.QuoteForSnapshot{
		ID:             quoteID,
		CustomerID:     uuid.New(),
		CustomerPolicy: quote.CustomerPolicyForSnapshot{Policy: "FLAG_FOR_REQUOTE", ThresholdPct: 5.0},
		Lines: []quote.QuoteLineForSnapshot{
			{
				ID:            uuid.New(),
				ProductID:     uuid.New(),
				IsCommodity:   true,
				MarketIndexID: nil, // and no category default returned
				Quantity:      100, UnitPrice: 6.0,
			},
		},
	}
	svc, _, esc, qr := newTestSnapshotService(t, projection, nil, map[uuid.UUID]*uuid.UUID{})
	if err := svc.SnapshotQuoteLines(context.Background(), quoteID); err != nil {
		t.Fatal(err)
	}
	if len(esc.snapshotCalls) != 0 {
		t.Errorf("expected zero snapshots for unresolved commodity, got %+v", esc.snapshotCalls)
	}
	// Quote rollup should still be updated to OK.
	if qr.exposureUpdates[quoteID] != string(ExposureStateOK) {
		t.Errorf("expected quote rollup to be OK, got %q", qr.exposureUpdates[quoteID])
	}
}

func TestSnapshot_UnknownPolicy_FallsBackToDefault(t *testing.T) {
	idxID := uuid.New()
	productID := uuid.New()
	quoteID := uuid.New()

	projection := &quote.QuoteForSnapshot{
		ID:             quoteID,
		CustomerID:     uuid.New(),
		CustomerPolicy: quote.CustomerPolicyForSnapshot{Policy: "GIBBERISH", ThresholdPct: 0},
		Lines: []quote.QuoteLineForSnapshot{
			{ID: uuid.New(), ProductID: productID, IsCommodity: true, MarketIndexID: &idxID, Quantity: 1, UnitPrice: 1},
		},
	}
	indices := map[uuid.UUID]*MarketIndex{idxID: {ID: idxID, CurrentValue: 100, IsActive: true}}
	svc, _, esc, _ := newTestSnapshotService(t, projection, indices, nil)
	if err := svc.SnapshotQuoteLines(context.Background(), quoteID); err != nil {
		t.Fatal(err)
	}
	if len(esc.snapshotCalls) != 1 {
		t.Fatalf("expected snapshot to be created with fallback policy")
	}
	got := esc.snapshotCalls[0][0]
	if got.PolicyAtSnapshot != string(PolicyFlagForRequote) {
		t.Errorf("unknown policy must fall back to FLAG_FOR_REQUOTE, got %q", got.PolicyAtSnapshot)
	}
	if got.ThresholdPctAtSnapshot != 5.0 {
		t.Errorf("zero threshold must fall back to 5.0, got %v", got.ThresholdPctAtSnapshot)
	}
}

func TestSnapshot_InactiveIndex_SkipsLine(t *testing.T) {
	idxID := uuid.New()
	productID := uuid.New()
	quoteID := uuid.New()

	projection := &quote.QuoteForSnapshot{
		ID:             quoteID,
		CustomerID:     uuid.New(),
		CustomerPolicy: quote.CustomerPolicyForSnapshot{Policy: "FLAG_FOR_REQUOTE", ThresholdPct: 5.0},
		Lines: []quote.QuoteLineForSnapshot{
			{ID: uuid.New(), ProductID: productID, IsCommodity: true, MarketIndexID: &idxID, Quantity: 1, UnitPrice: 1},
		},
	}
	indices := map[uuid.UUID]*MarketIndex{idxID: {ID: idxID, CurrentValue: 100, IsActive: false}}
	svc, _, esc, _ := newTestSnapshotService(t, projection, indices, nil)
	if err := svc.SnapshotQuoteLines(context.Background(), quoteID); err != nil {
		t.Fatal(err)
	}
	if len(esc.snapshotCalls) != 0 {
		t.Errorf("inactive index must not snapshot; got %+v", esc.snapshotCalls)
	}
}

func TestSnapshot_QuoteNotFound_ReturnsError(t *testing.T) {
	svc, _, _, _ := newTestSnapshotService(t, nil, nil, nil)
	err := svc.SnapshotQuoteLines(context.Background(), uuid.New())
	if err == nil {
		t.Error("expected error when quote not found")
	}
}
