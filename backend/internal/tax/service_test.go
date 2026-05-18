package tax

import (
	"context"
	"log/slog"
	"os"
	"testing"

	"github.com/google/uuid"
)

// --- Mock ExemptionRepo ---

type mockExemptionRepo struct {
	exemptions map[uuid.UUID][]TaxExemption
}

func newMockExemptionRepo() *mockExemptionRepo {
	return &mockExemptionRepo{exemptions: make(map[uuid.UUID][]TaxExemption)}
}

func (m *mockExemptionRepo) GetByCustomer(_ context.Context, customerID uuid.UUID) ([]TaxExemption, error) {
	return m.exemptions[customerID], nil
}

func (m *mockExemptionRepo) GetActiveByCustomer(_ context.Context, customerID uuid.UUID) ([]TaxExemption, error) {
	var active []TaxExemption
	for _, ex := range m.exemptions[customerID] {
		if ex.IsActive {
			active = append(active, ex)
		}
	}
	return active, nil
}

func (m *mockExemptionRepo) Create(_ context.Context, ex *TaxExemption) error {
	m.exemptions[ex.CustomerID] = append(m.exemptions[ex.CustomerID], *ex)
	return nil
}

func (m *mockExemptionRepo) Delete(_ context.Context, id uuid.UUID) error {
	for cid, exs := range m.exemptions {
		for i, ex := range exs {
			if ex.ID == id {
				m.exemptions[cid] = append(exs[:i], exs[i+1:]...)
				return nil
			}
		}
	}
	return nil
}

// --- Tests ---

func TestFlatRateCalculation(t *testing.T) {
	logger := slog.New(slog.NewTextHandler(os.Stderr, nil))
	repo := newMockExemptionRepo()
	svc := NewService(repo, nil, "", 0.0825, logger) // 8.25% flat rate

	req := &TaxPreviewRequest{
		Lines: []TaxLineInput{
			{LineNumber: 1, ItemCode: "2x4x8", Description: "2x4x8 SPF #2", Quantity: 10, Amount: 6500}, // $65.00
			{LineNumber: 2, ItemCode: "2x6x12", Description: "2x6x12 DF #1", Quantity: 4, Amount: 8800}, // $88.00
			{LineNumber: 3, ItemCode: "HD2A", Description: "Simpson HD2A", Quantity: 20, Amount: 9400},  // $94.00
		},
	}

	result, err := svc.PreviewTax(context.Background(), req)
	if err != nil {
		t.Fatalf("PreviewTax failed: %v", err)
	}

	if result.TotalAmount != 24700 {
		t.Errorf("expected TotalAmount 24700, got %d", result.TotalAmount)
	}

	// Expected tax: 24700 * 0.0825 = 2037.75, rounds per line
	// Line 1: 6500 * 0.0825 = 536.25 ≈ 536
	// Line 2: 8800 * 0.0825 = 726.00 = 726
	// Line 3: 9400 * 0.0825 = 775.50 ≈ 776
	// Total: 536 + 726 + 776 = 2038
	expectedTax := int64(536 + 726 + 776)
	if result.TotalTax != expectedTax {
		t.Errorf("expected TotalTax %d, got %d", expectedTax, result.TotalTax)
	}

	if result.GrandTotal != result.TotalAmount+result.TotalTax {
		t.Errorf("GrandTotal mismatch: expected %d, got %d", result.TotalAmount+result.TotalTax, result.GrandTotal)
	}

	if !result.IsEstimate {
		t.Error("expected IsEstimate=true for flat rate calculation")
	}

	if len(result.Lines) != 3 {
		t.Fatalf("expected 3 lines, got %d", len(result.Lines))
	}

	// Verify per-line tax rates
	for _, line := range result.Lines {
		if line.TaxRate != 0.0825 {
			t.Errorf("line %d: expected TaxRate 0.0825, got %f", line.LineNumber, line.TaxRate)
		}
		if line.Exempt {
			t.Errorf("line %d: expected Exempt=false", line.LineNumber)
		}
	}
}

func TestZeroFlatRate(t *testing.T) {
	logger := slog.New(slog.NewTextHandler(os.Stderr, nil))
	repo := newMockExemptionRepo()
	svc := NewService(repo, nil, "", 0.0, logger) // 0% — dev/demo mode

	req := &TaxPreviewRequest{
		Lines: []TaxLineInput{
			{LineNumber: 1, Amount: 10000},
		},
	}

	result, err := svc.PreviewTax(context.Background(), req)
	if err != nil {
		t.Fatalf("PreviewTax failed: %v", err)
	}

	if result.TotalTax != 0 {
		t.Errorf("expected TotalTax 0, got %d", result.TotalTax)
	}
	if result.GrandTotal != 10000 {
		t.Errorf("expected GrandTotal 10000, got %d", result.GrandTotal)
	}
}

func TestExemptCustomerGetZeroTax(t *testing.T) {
	logger := slog.New(slog.NewTextHandler(os.Stderr, nil))
	repo := newMockExemptionRepo()

	customerID := uuid.New()
	repo.exemptions[customerID] = []TaxExemption{
		{ID: uuid.New(), CustomerID: customerID, ExemptReason: "RESALE", IsActive: true},
	}

	svc := NewService(repo, nil, "", 0.0825, logger)

	req := &TaxPreviewRequest{
		CustomerID: &customerID,
		Lines: []TaxLineInput{
			{LineNumber: 1, Amount: 50000},
		},
	}

	result, err := svc.PreviewTax(context.Background(), req)
	if err != nil {
		t.Fatalf("PreviewTax failed: %v", err)
	}

	if result.TotalTax != 0 {
		t.Errorf("expected TotalTax 0 for exempt customer, got %d", result.TotalTax)
	}

	if len(result.Lines) != 1 {
		t.Fatalf("expected 1 line, got %d", len(result.Lines))
	}

	if !result.Lines[0].Exempt {
		t.Error("expected line to be marked Exempt=true")
	}
}

func TestNonExemptCustomerGetsTaxed(t *testing.T) {
	logger := slog.New(slog.NewTextHandler(os.Stderr, nil))
	repo := newMockExemptionRepo()

	customerID := uuid.New()
	// No exemptions for this customer

	svc := NewService(repo, nil, "", 0.0825, logger)

	req := &TaxPreviewRequest{
		CustomerID: &customerID,
		Lines: []TaxLineInput{
			{LineNumber: 1, Amount: 10000},
		},
	}

	result, err := svc.PreviewTax(context.Background(), req)
	if err != nil {
		t.Fatalf("PreviewTax failed: %v", err)
	}

	if result.TotalTax == 0 {
		t.Error("expected non-zero tax for non-exempt customer")
	}

	expectedTax := int64(825) // 10000 * 0.0825
	if result.TotalTax != expectedTax {
		t.Errorf("expected TotalTax %d, got %d", expectedTax, result.TotalTax)
	}
}

func TestMultiLineAggregation(t *testing.T) {
	logger := slog.New(slog.NewTextHandler(os.Stderr, nil))
	repo := newMockExemptionRepo()
	svc := NewService(repo, nil, "", 0.10, logger) // 10% for easy math

	req := &TaxPreviewRequest{
		Lines: []TaxLineInput{
			{LineNumber: 1, Amount: 1000},
			{LineNumber: 2, Amount: 2000},
			{LineNumber: 3, Amount: 3000},
			{LineNumber: 4, Amount: 4000},
		},
	}

	result, err := svc.PreviewTax(context.Background(), req)
	if err != nil {
		t.Fatalf("PreviewTax failed: %v", err)
	}

	if result.TotalAmount != 10000 {
		t.Errorf("expected TotalAmount 10000, got %d", result.TotalAmount)
	}
	if result.TotalTax != 1000 {
		t.Errorf("expected TotalTax 1000, got %d", result.TotalTax)
	}
	if result.GrandTotal != 11000 {
		t.Errorf("expected GrandTotal 11000, got %d", result.GrandTotal)
	}
}

func TestSaveAndGetExemption(t *testing.T) {
	logger := slog.New(slog.NewTextHandler(os.Stderr, nil))
	repo := newMockExemptionRepo()
	svc := NewService(repo, nil, "", 0.0825, logger)

	customerID := uuid.New()
	req := &CreateExemptionRequest{
		CustomerID:        customerID,
		ExemptReason:      "RESALE",
		CertificateNumber: "TX-12345",
		IssuingState:      "TX",
	}

	ex, err := svc.SaveExemption(context.Background(), req)
	if err != nil {
		t.Fatalf("SaveExemption failed: %v", err)
	}

	if ex.CustomerID != customerID {
		t.Error("customer ID mismatch")
	}
	if ex.ExemptReason != "RESALE" {
		t.Errorf("expected reason RESALE, got %s", ex.ExemptReason)
	}

	// Verify retrieval
	exs, err := svc.GetExemptions(context.Background(), customerID)
	if err != nil {
		t.Fatalf("GetExemptions failed: %v", err)
	}
	if len(exs) != 1 {
		t.Errorf("expected 1 exemption, got %d", len(exs))
	}
}
