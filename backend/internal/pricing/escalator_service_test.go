package pricing

import (
	"context"
	"math"
	"testing"
	"time"

	"github.com/google/uuid"
)

// MockEscalatorRepository is a mock implementation for testing.
type MockEscalatorRepository struct {
	indices    map[uuid.UUID]MarketIndex
	escalators map[uuid.UUID]PriceEscalator
}

func newMockEscalatorRepo() *MockEscalatorRepository {
	return &MockEscalatorRepository{
		indices:    make(map[uuid.UUID]MarketIndex),
		escalators: make(map[uuid.UUID]PriceEscalator),
	}
}

func (m *MockEscalatorRepository) ListMarketIndices(_ context.Context) ([]MarketIndex, error) {
	var result []MarketIndex
	for _, idx := range m.indices {
		result = append(result, idx)
	}
	return result, nil
}

func (m *MockEscalatorRepository) GetMarketIndex(_ context.Context, id uuid.UUID) (*MarketIndex, error) {
	if idx, ok := m.indices[id]; ok {
		return &idx, nil
	}
	return nil, nil
}

func (m *MockEscalatorRepository) CreateMarketIndex(_ context.Context, idx *MarketIndex) error {
	if idx.ID == uuid.Nil {
		idx.ID = uuid.New()
	}
	m.indices[idx.ID] = *idx
	return nil
}

func (m *MockEscalatorRepository) UpdateMarketIndex(_ context.Context, idx *MarketIndex) error {
	m.indices[idx.ID] = *idx
	return nil
}

func (m *MockEscalatorRepository) CreateEscalator(_ context.Context, esc *PriceEscalator) error {
	if esc.ID == uuid.Nil {
		esc.ID = uuid.New()
	}
	m.escalators[esc.ID] = *esc
	return nil
}

func (m *MockEscalatorRepository) GetEscalatorByQuoteLine(_ context.Context, quoteLineID uuid.UUID) (*PriceEscalator, error) {
	for _, esc := range m.escalators {
		if esc.QuoteLineID != nil && *esc.QuoteLineID == quoteLineID {
			return &esc, nil
		}
	}
	return nil, nil
}

func TestCalculateEscalation_Percentage(t *testing.T) {
	repo := newMockEscalatorRepo()
	svc := NewEscalatorService(repo)

	// 2x4x8 at $5.00, 5% monthly, 3 months out
	// Expected: 5.00 * (1.05)^3 = 5.00 * 1.157625 = 5.79
	req := EscalationRequest{
		BasePrice:      5.00,
		EscalationType: EscalationPercentage,
		EscalationRate: 5.0,
		EffectiveDate:  "2026-01-01",
		TargetDate:     "2026-04-01",
	}

	result, err := svc.CalculateEscalation(context.Background(), req)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	expectedPrice := 5.79
	if result.FuturePrice != expectedPrice {
		t.Errorf("expected future price %.2f, got %.2f", expectedPrice, result.FuturePrice)
	}
	if result.MonthsOut != 3 {
		t.Errorf("expected 3 months, got %d", result.MonthsOut)
	}
	if result.EscalationType != "PERCENTAGE" {
		t.Errorf("expected PERCENTAGE type, got %s", result.EscalationType)
	}
}

func TestCalculateEscalation_IndexDelta(t *testing.T) {
	repo := newMockEscalatorRepo()
	svc := NewEscalatorService(repo)

	// Create a market index: base=100, current=110 → 10% increase
	indexID := uuid.New()
	prevValue := 100.0
	repo.indices[indexID] = MarketIndex{
		ID:            indexID,
		Name:          "Test Index",
		Source:        "MANUAL",
		CurrentValue:  110.0,
		PreviousValue: &prevValue,
		Unit:          "MBF",
	}

	req := EscalationRequest{
		BasePrice:      10.00,
		EscalationType: EscalationIndexDelta,
		EscalationRate: 100.0, // Base index value
		EffectiveDate:  "2026-01-01",
		TargetDate:     "2026-06-01",
		MarketIndexID:  &indexID,
	}

	result, err := svc.CalculateEscalation(context.Background(), req)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	expectedPrice := 11.00
	if result.FuturePrice != expectedPrice {
		t.Errorf("expected future price %.2f, got %.2f", expectedPrice, result.FuturePrice)
	}
	if result.DeltaPercent != 10.0 {
		t.Errorf("expected 10%% delta, got %.2f%%", result.DeltaPercent)
	}
}

func TestCalculateEscalation_Staleness(t *testing.T) {
	repo := newMockEscalatorRepo()
	svc := NewEscalatorService(repo)

	// Index moved from 100 → 108 (8% change, above 2% threshold → stale)
	indexID := uuid.New()
	prevValue := 100.0
	repo.indices[indexID] = MarketIndex{
		ID:            indexID,
		Name:          "Stale Index",
		Source:        "MANUAL",
		CurrentValue:  108.0,
		PreviousValue: &prevValue,
		Unit:          "MBF",
	}

	req := EscalationRequest{
		BasePrice:      10.00,
		EscalationType: EscalationIndexDelta,
		EscalationRate: 100.0, // Base index
		EffectiveDate:  "2026-01-01",
		TargetDate:     "2026-03-01",
		MarketIndexID:  &indexID,
	}

	result, err := svc.CalculateEscalation(context.Background(), req)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	if !result.IsStale {
		t.Error("expected IsStale=true, got false")
	}
	if result.StaleDeltaPct != 8.0 {
		t.Errorf("expected stale delta 8.0%%, got %.2f%%", result.StaleDeltaPct)
	}
}

func TestCalculateEscalation_Expired(t *testing.T) {
	repo := newMockEscalatorRepo()
	svc := NewEscalatorService(repo)

	// Target date is before effective date → should return base price
	req := EscalationRequest{
		BasePrice:      5.00,
		EscalationType: EscalationPercentage,
		EscalationRate: 5.0,
		EffectiveDate:  "2026-06-01",
		TargetDate:     "2026-01-01",
	}

	result, err := svc.CalculateEscalation(context.Background(), req)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	if result.FuturePrice != 5.00 {
		t.Errorf("expected base price 5.00, got %.2f", result.FuturePrice)
	}
}

func TestCheckStaleness(t *testing.T) {
	repo := newMockEscalatorRepo()
	svc := NewEscalatorService(repo)

	indexID := uuid.New()
	repo.indices[indexID] = MarketIndex{
		ID:           indexID,
		Name:         "Staleness Check",
		Source:       "MANUAL",
		CurrentValue: 108.0,
		Unit:         "MBF",
	}

	isStale, deltaPct, err := svc.CheckStaleness(context.Background(), 100.0, indexID)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if !isStale {
		t.Error("expected stale=true")
	}
	if deltaPct != 8.0 {
		t.Errorf("expected 8.0%% delta, got %.2f%%", deltaPct)
	}
}

func TestMonthsBetween(t *testing.T) {
	tests := []struct {
		name     string
		start    string
		end      string
		expected int
	}{
		{"Same month", "2026-01-01", "2026-01-31", 0},
		{"3 months", "2026-01-01", "2026-04-01", 3},
		{"12 months", "2026-01-01", "2027-01-01", 12},
		{"Cross year", "2025-11-01", "2026-02-01", 3},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			start, _ := time.Parse("2006-01-02", tt.start)
			end, _ := time.Parse("2006-01-02", tt.end)
			got := monthsBetween(start, end)
			if got != tt.expected {
				t.Errorf("expected %d months, got %d", tt.expected, got)
			}
		})
	}
}

func TestPercentageEdgeCases(t *testing.T) {
	repo := newMockEscalatorRepo()
	svc := NewEscalatorService(repo)

	// 0% escalation → price should stay the same
	t.Run("Zero Rate", func(t *testing.T) {
		req := EscalationRequest{
			BasePrice:      10.00,
			EscalationType: EscalationPercentage,
			EscalationRate: 0,
			EffectiveDate:  "2026-01-01",
			TargetDate:     "2026-12-01",
		}
		result, err := svc.CalculateEscalation(context.Background(), req)
		if err != nil {
			t.Fatalf("unexpected error: %v", err)
		}
		if result.FuturePrice != 10.00 {
			t.Errorf("expected 10.00, got %.2f", result.FuturePrice)
		}
	})

	// Large escalation
	t.Run("Large Rate 12 months", func(t *testing.T) {
		req := EscalationRequest{
			BasePrice:      100.00,
			EscalationType: EscalationPercentage,
			EscalationRate: 10.0,
			EffectiveDate:  "2026-01-01",
			TargetDate:     "2027-01-01",
		}
		result, err := svc.CalculateEscalation(context.Background(), req)
		if err != nil {
			t.Fatalf("unexpected error: %v", err)
		}
		// 100 * (1.1)^12 = 313.84
		expected := math.Round(100*math.Pow(1.1, 12)*100) / 100
		if result.FuturePrice != expected {
			t.Errorf("expected %.2f, got %.2f", expected, result.FuturePrice)
		}
	})
}
