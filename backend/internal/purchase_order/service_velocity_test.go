package purchase_order

import (
	"context"
	"testing"

	"github.com/gablelbm/gable/internal/product"
	"github.com/google/uuid"
)

// fakeVelocity is a salesVelocityLister stub for unit tests so we don't have
// to stand up an order_lines fixture.
type fakeVelocity struct {
	rows []SalesVelocity
}

func (f *fakeVelocity) ListSalesVelocity(_ context.Context, _ int) ([]SalesVelocity, error) {
	return f.rows, nil
}

// fakeProductRepo implements product.Repository in-memory so we can drive
// RefreshReorderTargets without a pgx connection. Only the methods the
// service path actually calls are non-trivial.
type fakeProductRepo struct {
	products []product.Product
	updates  map[uuid.UUID][2]float64 // id -> {reorder_point, reorder_qty}
}

func (f *fakeProductRepo) CreateProduct(_ context.Context, _ *product.Product) error { return nil }
func (f *fakeProductRepo) GetProduct(_ context.Context, id uuid.UUID) (*product.Product, error) {
	for i := range f.products {
		if f.products[i].ID == id {
			return &f.products[i], nil
		}
	}
	return nil, nil
}
func (f *fakeProductRepo) ListProducts(_ context.Context) ([]product.Product, error) {
	return f.products, nil
}
func (f *fakeProductRepo) ListProductsPaginated(_ context.Context, _, _ int) ([]product.Product, int, error) {
	return f.products, len(f.products), nil
}
func (f *fakeProductRepo) ListBelowReorder(_ context.Context) ([]product.ReorderAlert, error) {
	return nil, nil
}
func (f *fakeProductRepo) UpdateAverageCost(_ context.Context, _ uuid.UUID, _ float64) error {
	return nil
}
func (f *fakeProductRepo) UpdateMarginRules(_ context.Context, _ uuid.UUID, _, _ float64) error {
	return nil
}
func (f *fakeProductRepo) UpdateReorderTargets(_ context.Context, id uuid.UUID, point, qty float64) error {
	if f.updates == nil {
		f.updates = make(map[uuid.UUID][2]float64)
	}
	f.updates[id] = [2]float64{point, qty}
	return nil
}
func (f *fakeProductRepo) UpdateVendor(_ context.Context, _ uuid.UUID, _ *string, _ *uuid.UUID) error {
	return nil
}

// TestRefreshReorderTargets_Math pins the reorder-point formula
// (avg_daily * lead_time * 1.5, ceil'd) for a known velocity. If a refactor
// changes the safety factor or the lookback divisor, this test surfaces the
// behavior change before it ships.
func TestRefreshReorderTargets_Math(t *testing.T) {
	prodID := uuid.New()
	repo := &fakeProductRepo{
		products: []product.Product{{ID: prodID, SKU: "FAST-SELLER", ReorderPoint: 0, ReorderQty: 0}},
	}
	prodSvc := product.NewService(repo)

	// 900 units in 90-day lookback -> 10 units/day.
	// reorder_point = ceil(10 * 7 * 1.5) = 105
	// reorder_qty   = ceil(10 * 30)      = 300
	svc := &Service{
		productSvc:   prodSvc,
		velocityRepo: &fakeVelocity{rows: []SalesVelocity{{ProductID: prodID, UnitsSold: 900, DaysWithSales: 60}}},
	}

	res, err := svc.RefreshReorderTargets(context.Background(), false, 90)
	if err != nil {
		t.Fatalf("RefreshReorderTargets: %v", err)
	}
	if res.ProductsUpdated != 1 {
		t.Fatalf("products_updated: want 1, got %d", res.ProductsUpdated)
	}
	got, ok := repo.updates[prodID]
	if !ok {
		t.Fatalf("expected an UpdateReorderTargets call for product %s", prodID)
	}
	if got[0] != 105 {
		t.Errorf("reorder_point: want 105, got %v", got[0])
	}
	if got[1] != 300 {
		t.Errorf("reorder_qty: want 300, got %v", got[1])
	}
}

// TestRefreshReorderTargets_SkipsZeroVelocity verifies that products with no
// sales in the lookback window are not touched — we don't want to auto-zero
// a slow seasonal SKU mid-summer.
func TestRefreshReorderTargets_SkipsZeroVelocity(t *testing.T) {
	prodID := uuid.New()
	repo := &fakeProductRepo{
		products: []product.Product{{ID: prodID, SKU: "SLOW", ReorderPoint: 50, ReorderQty: 100}},
	}
	prodSvc := product.NewService(repo)
	svc := &Service{
		productSvc:   prodSvc,
		velocityRepo: &fakeVelocity{rows: nil}, // no rows -> no sales
	}

	res, err := svc.RefreshReorderTargets(context.Background(), false, 90)
	if err != nil {
		t.Fatalf("RefreshReorderTargets: %v", err)
	}
	if res.ProductsUpdated != 0 {
		t.Errorf("products_updated: want 0, got %d", res.ProductsUpdated)
	}
	if res.ProductsSkipped != 1 {
		t.Errorf("products_skipped: want 1, got %d", res.ProductsSkipped)
	}
	if _, ok := repo.updates[prodID]; ok {
		t.Errorf("zero-velocity product %s should not have been written to", prodID)
	}
}

// TestRefreshReorderTargets_DryRunNoWrites asserts the dry-run contract:
// counts and proposals match the write-mode behavior, but no UpdateReorderTargets
// calls actually happen.
func TestRefreshReorderTargets_DryRunNoWrites(t *testing.T) {
	prodID := uuid.New()
	repo := &fakeProductRepo{
		products: []product.Product{{ID: prodID, SKU: "FAST", ReorderPoint: 0, ReorderQty: 0}},
	}
	prodSvc := product.NewService(repo)
	svc := &Service{
		productSvc:   prodSvc,
		velocityRepo: &fakeVelocity{rows: []SalesVelocity{{ProductID: prodID, UnitsSold: 900, DaysWithSales: 60}}},
	}

	res, err := svc.RefreshReorderTargets(context.Background(), true, 90)
	if err != nil {
		t.Fatalf("RefreshReorderTargets: %v", err)
	}
	if !res.DryRun {
		t.Errorf("DryRun: want true, got false")
	}
	if res.ProductsUpdated != 1 {
		t.Errorf("products_updated counter should still increment in dry-run: want 1, got %d", res.ProductsUpdated)
	}
	if len(res.Proposals) != 1 {
		t.Errorf("proposals: want 1, got %d", len(res.Proposals))
	}
	if len(repo.updates) != 0 {
		t.Errorf("dry-run must not write to repo, got %d updates", len(repo.updates))
	}
}

// TestRefreshReorderTargets_NoChangeIsSkipped verifies that products whose
// recomputed targets equal their existing values are reported as skipped, not
// updated. Avoids spurious "updated" counts on a stable catalog.
func TestRefreshReorderTargets_NoChangeIsSkipped(t *testing.T) {
	prodID := uuid.New()
	// 900 units / 90 days = 10/day -> point=105 qty=300 (same as above)
	repo := &fakeProductRepo{
		products: []product.Product{{ID: prodID, SKU: "STABLE", ReorderPoint: 105, ReorderQty: 300}},
	}
	prodSvc := product.NewService(repo)
	svc := &Service{
		productSvc:   prodSvc,
		velocityRepo: &fakeVelocity{rows: []SalesVelocity{{ProductID: prodID, UnitsSold: 900}}},
	}

	res, err := svc.RefreshReorderTargets(context.Background(), false, 90)
	if err != nil {
		t.Fatalf("RefreshReorderTargets: %v", err)
	}
	if res.ProductsUpdated != 0 {
		t.Errorf("products_updated: want 0 (no change), got %d", res.ProductsUpdated)
	}
	if res.ProductsSkipped != 1 {
		t.Errorf("products_skipped: want 1, got %d", res.ProductsSkipped)
	}
}
