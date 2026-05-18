package parsing

import (
	"context"
	"testing"

	"github.com/gablelbm/gable/internal/product"
	"github.com/google/uuid"
)

// mockProductRepo implements product.Repository for testing.
type mockProductRepo struct {
	products []product.Product
}

func (m *mockProductRepo) CreateProduct(_ context.Context, _ *product.Product) error {
	return nil
}

func (m *mockProductRepo) GetProduct(_ context.Context, id uuid.UUID) (*product.Product, error) {
	for _, p := range m.products {
		if p.ID == id {
			return &p, nil
		}
	}
	return nil, nil
}

func (m *mockProductRepo) ListProducts(_ context.Context) ([]product.Product, error) {
	return m.products, nil
}

func (m *mockProductRepo) ListBelowReorder(_ context.Context) ([]product.ReorderAlert, error) {
	return nil, nil // Not used in this test
}

func (m *mockProductRepo) UpdateAverageCost(ctx context.Context, id uuid.UUID, avgCost float64) error {
	return nil
}

func (m *mockProductRepo) UpdateMarginRules(ctx context.Context, id uuid.UUID, targetMargin float64, commissionRate float64) error {
	return nil
}

func (m *mockProductRepo) UpdateReorderTargets(_ context.Context, _ uuid.UUID, _ float64, _ float64) error {
	return nil
}

func (m *mockProductRepo) UpdateVendor(_ context.Context, _ uuid.UUID, _ *string, _ *uuid.UUID) error {
	return nil
}

func (m *mockProductRepo) ListProductsPaginated(_ context.Context, limit, offset int) ([]product.Product, int, error) {
	// Simple pagination over in-memory products
	total := len(m.products)
	if offset >= total {
		return nil, total, nil
	}
	end := offset + limit
	if end > total {
		end = total
	}
	return m.products[offset:end], total, nil
}

// testCatalog returns a realistic LBM product catalog for matching tests.
func testCatalog() []product.Product {
	return []product.Product{
		{ID: uuid.MustParse("10000000-0000-0000-0000-000000000001"), SKU: "2X4-8-SPF", Description: "2x4x8 SPF Stud Grade", UOMPrimary: "PCS", BasePrice: 4.99},
		{ID: uuid.MustParse("10000000-0000-0000-0000-000000000002"), SKU: "2X6-12-DF2", Description: "2x6x12 Doug Fir #2", UOMPrimary: "PCS", BasePrice: 12.49},
		{ID: uuid.MustParse("10000000-0000-0000-0000-000000000003"), SKU: "OSB-716-4X8", Description: "OSB 7/16 4x8 Sheathing", UOMPrimary: "PCS", BasePrice: 18.99},
		{ID: uuid.MustParse("10000000-0000-0000-0000-000000000004"), SKU: "CDX-12-4X8", Description: "CDX Plywood 1/2 4x8", UOMPrimary: "PCS", BasePrice: 32.50},
		{ID: uuid.MustParse("10000000-0000-0000-0000-000000000005"), SKU: "2X10-16-HF", Description: "2x10x16 Hem Fir #2", UOMPrimary: "PCS", BasePrice: 22.75},
		{ID: uuid.MustParse("10000000-0000-0000-0000-000000000006"), SKU: "QUIK-80", Description: "Quikrete 80lb Concrete Mix", UOMPrimary: "BAG", BasePrice: 5.99},
		{ID: uuid.MustParse("10000000-0000-0000-0000-000000000007"), SKU: "TYVEK-9X150", Description: "Tyvek HomeWrap 9x150", UOMPrimary: "RL", BasePrice: 169.00},
		{ID: uuid.MustParse("10000000-0000-0000-0000-000000000008"), SKU: "2X4-PT-8", Description: "2x4x8 Pressure Treated #2", UOMPrimary: "PCS", BasePrice: 8.99},
	}
}

func TestExtractItems_BasicLumberList(t *testing.T) {
	svc := NewService(&mockProductRepo{}, nil)

	input := `50 pcs - 2x4x8 SPF Stud
25 - 2x6x12 Doug Fir
10 sheets OSB 7/16`

	items := svc.ExtractItems(input)

	if len(items) != 3 {
		t.Fatalf("expected 3 items, got %d", len(items))
	}

	// Check quantity extraction
	if items[0].quantity != 50 {
		t.Errorf("item 0 quantity: expected 50, got %f", items[0].quantity)
	}
	if items[1].quantity != 25 {
		t.Errorf("item 1 quantity: expected 25, got %f", items[1].quantity)
	}
	if items[2].quantity != 10 {
		t.Errorf("item 2 quantity: expected 10, got %f", items[2].quantity)
	}
}

func TestMatchProducts_HighConfidence(t *testing.T) {
	catalog := testCatalog()
	svc := NewService(&mockProductRepo{products: catalog}, nil)

	extracted := svc.ExtractItems("50 pcs - 2x4x8 SPF Stud")
	items, err := svc.MatchProducts(context.Background(), extracted)
	if err != nil {
		t.Fatal(err)
	}

	if len(items) != 1 {
		t.Fatalf("expected 1 item, got %d", len(items))
	}

	item := items[0]
	if item.MatchedProduct == nil {
		t.Fatal("expected a matched product, got nil")
	}
	if item.MatchedProduct.SKU != "2X4-8-SPF" {
		t.Errorf("expected SKU '2X4-8-SPF', got '%s'", item.MatchedProduct.SKU)
	}
	if item.Confidence < 0.90 {
		t.Errorf("expected high confidence >= 0.90, got %f", item.Confidence)
	}
	if item.IsSpecialOrder {
		t.Error("expected NOT special order for high confidence match")
	}
}

func TestMatchProducts_SpecialOrder(t *testing.T) {
	catalog := testCatalog()
	svc := NewService(&mockProductRepo{products: catalog}, nil)

	// This item should not match anything in the catalog
	extracted := svc.ExtractItems("Custom powder-coat railing 12ft bronze")
	items, err := svc.MatchProducts(context.Background(), extracted)
	if err != nil {
		t.Fatal(err)
	}

	if len(items) != 1 {
		t.Fatalf("expected 1 item, got %d", len(items))
	}

	item := items[0]
	if !item.IsSpecialOrder {
		t.Error("expected special order for unmatched item")
	}
	if item.Confidence >= 0.50 {
		t.Errorf("expected confidence < 0.50 for special order, got %f", item.Confidence)
	}
}

func TestMatchProducts_EmptyCatalog(t *testing.T) {
	svc := NewService(&mockProductRepo{products: nil}, nil)

	extracted := svc.ExtractItems("10 pcs - 2x4x8")
	items, err := svc.MatchProducts(context.Background(), extracted)
	if err != nil {
		t.Fatal(err)
	}

	if len(items) != 1 {
		t.Fatalf("expected 1 item, got %d", len(items))
	}

	if !items[0].IsSpecialOrder {
		t.Error("expected special order when catalog is empty")
	}
}

func TestMatchProducts_LowConfidenceWithAlternatives(t *testing.T) {
	catalog := testCatalog()
	svc := NewService(&mockProductRepo{products: catalog}, nil)

	// "2x12x20" is not in catalog exactly — might partially match some lumber items
	extracted := svc.ExtractItems("8 pcs - 2x12x20")
	items, err := svc.MatchProducts(context.Background(), extracted)
	if err != nil {
		t.Fatal(err)
	}

	if len(items) != 1 {
		t.Fatalf("expected 1 item, got %d", len(items))
	}

	item := items[0]
	// It should either be special order or low confidence with alternatives
	if item.Confidence >= 0.90 && !item.IsSpecialOrder {
		// If it matched high confidence, it should have no alternatives
		if len(item.Alternatives) > 0 {
			t.Log("High confidence match with alternatives — unexpected but not wrong")
		}
	} else if !item.IsSpecialOrder && item.Confidence < 0.90 {
		// Low confidence — should have alternatives
		if len(item.Alternatives) == 0 {
			t.Error("expected alternatives for low confidence match")
		}
	}
}

func TestExtractItems_EmptyInput(t *testing.T) {
	svc := NewService(&mockProductRepo{}, nil)
	items := svc.ExtractItems("")
	if len(items) != 0 {
		t.Errorf("expected 0 items for empty input, got %d", len(items))
	}
}

func TestLevenshtein(t *testing.T) {
	tests := []struct {
		a, b     string
		expected int
	}{
		{"", "", 0},
		{"abc", "", 3},
		{"", "abc", 3},
		{"abc", "abc", 0},
		{"kitten", "sitting", 3},
		{"plywood", "plywod", 1},
	}
	for _, tt := range tests {
		got := levenshtein(tt.a, tt.b)
		if got != tt.expected {
			t.Errorf("levenshtein(%q, %q) = %d, want %d", tt.a, tt.b, got, tt.expected)
		}
	}
}
