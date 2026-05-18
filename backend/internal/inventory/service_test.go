package inventory

import (
	"context"
	"strings"
	"testing"

	"github.com/gablelbm/gable/pkg/branchctx"
	"github.com/google/uuid"
)

// MockRepository implements Repository for testing
type MockRepository struct {
	invs     map[string]*Inventory
	branches map[uuid.UUID]uuid.UUID // location_id → branch_id
}

func (m *MockRepository) GetInventory(ctx context.Context, productID uuid.UUID, locationID *uuid.UUID) (*Inventory, error) {
	if locationID == nil {
		return nil, nil // Not needed for transfer test logic which specifies location
	}
	key := productID.String() + ":" + locationID.String()
	if i, ok := m.invs[key]; ok {
		return i, nil
	}
	return nil, nil
}

func (m *MockRepository) CreateInventory(ctx context.Context, inv *Inventory) error {
	key := inv.ProductID.String() + ":" + inv.LocationID.String()
	m.invs[key] = inv
	return nil
}

func (m *MockRepository) UpdateInventory(ctx context.Context, inv *Inventory) error {
	key := inv.ProductID.String() + ":" + inv.LocationID.String()
	m.invs[key] = inv
	return nil
}

func (m *MockRepository) ExecuteInTx(ctx context.Context, fn func(context.Context) error) error {
	// Just run function directly (mock transaction)
	return fn(ctx)
}

// Stubs
func (m *MockRepository) ListInventoryByProduct(ctx context.Context, productID uuid.UUID) ([]Inventory, error) {
	return nil, nil
}
func (m *MockRepository) ListInventoryByProductAndBranch(ctx context.Context, productID uuid.UUID, branchID *uuid.UUID) ([]Inventory, error) {
	out := make([]Inventory, 0)
	for _, inv := range m.invs {
		if inv.ProductID != productID {
			continue
		}
		if branchID != nil && inv.LocationID != nil {
			if locBranch, ok := m.branches[*inv.LocationID]; !ok || locBranch != *branchID {
				continue
			}
		}
		out = append(out, *inv)
	}
	return out, nil
}
func (m *MockRepository) LocationBranchID(ctx context.Context, locationID uuid.UUID) (*uuid.UUID, error) {
	if b, ok := m.branches[locationID]; ok {
		return &b, nil
	}
	return nil, nil
}
func (m *MockRepository) AllocateStock(ctx context.Context, inventoryID uuid.UUID, delta float64) error {
	return nil
}
func (m *MockRepository) DeallocateStock(ctx context.Context, inventoryID uuid.UUID, delta float64) error {
	return nil
}
func (m *MockRepository) FulfillStock(ctx context.Context, inventoryID uuid.UUID, delta float64) error {
	return nil
}
func (m *MockRepository) RevertFulfillStock(ctx context.Context, inventoryID uuid.UUID, delta float64) error {
	return nil
}

func TestTransferStock(t *testing.T) {
	repo := &MockRepository{
		invs:     make(map[string]*Inventory),
		branches: make(map[uuid.UUID]uuid.UUID),
	}
	svc := NewService(repo)

	prodID := uuid.New()
	loc1 := uuid.New()
	loc2 := uuid.New()

	// Setup initial stock in loc1
	repo.invs[prodID.String()+":"+loc1.String()] = &Inventory{
		ProductID:  prodID,
		LocationID: &loc1,
		Quantity:   100,
	}

	// Move 50 from loc1 to loc2
	err := svc.MoveStock(context.Background(), StockMovementRequest{
		ProductID:      prodID,
		FromLocationID: &loc1,
		ToLocationID:   loc2,
		Quantity:       50,
		Reason:         "Test",
	})

	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	// Verify loc1 has 50
	i1 := repo.invs[prodID.String()+":"+loc1.String()]
	if i1.Quantity != 50 {
		t.Errorf("expected loc1 to have 50, got %f", i1.Quantity)
	}

	// Verify loc2 has 50
	i2 := repo.invs[prodID.String()+":"+loc2.String()]
	if i2 == nil {
		t.Fatal("expected loc2 to be created")
	}
	if i2.Quantity != 50 {
		t.Errorf("expected loc2 to have 50, got %f", i2.Quantity)
	}
}

// TestMoveStock_SameBranchAllowed verifies that a move between two locations
// in the same branch succeeds.
func TestMoveStock_SameBranchAllowed(t *testing.T) {
	branchA := uuid.New()
	locA1 := uuid.New()
	locA2 := uuid.New()

	repo := &MockRepository{
		invs: make(map[string]*Inventory),
		branches: map[uuid.UUID]uuid.UUID{
			locA1: branchA,
			locA2: branchA,
		},
	}
	svc := NewService(repo)

	prodID := uuid.New()
	repo.invs[prodID.String()+":"+locA1.String()] = &Inventory{
		ProductID: prodID, LocationID: &locA1, Quantity: 80,
	}

	err := svc.MoveStock(context.Background(), StockMovementRequest{
		ProductID:      prodID,
		FromLocationID: &locA1,
		ToLocationID:   locA2,
		Quantity:       30,
	})
	if err != nil {
		t.Fatalf("same-branch move should succeed, got %v", err)
	}
}

// TestMoveStock_CrossBranchRejected verifies that a move between locations in
// different branches is rejected up front with no inventory mutation.
func TestMoveStock_CrossBranchRejected(t *testing.T) {
	branchA := uuid.New()
	branchB := uuid.New()
	locA := uuid.New()
	locB := uuid.New()

	repo := &MockRepository{
		invs: make(map[string]*Inventory),
		branches: map[uuid.UUID]uuid.UUID{
			locA: branchA,
			locB: branchB,
		},
	}
	svc := NewService(repo)

	prodID := uuid.New()
	repo.invs[prodID.String()+":"+locA.String()] = &Inventory{
		ProductID: prodID, LocationID: &locA, Quantity: 100,
	}

	err := svc.MoveStock(context.Background(), StockMovementRequest{
		ProductID:      prodID,
		FromLocationID: &locA,
		ToLocationID:   locB,
		Quantity:       25,
	})
	if err == nil {
		t.Fatal("cross-branch move must be rejected, got nil error")
	}
	if !strings.Contains(err.Error(), "cross-branch") {
		t.Errorf("expected cross-branch error, got %v", err)
	}

	// Source must be untouched.
	if got := repo.invs[prodID.String()+":"+locA.String()].Quantity; got != 100 {
		t.Errorf("source inventory was mutated; expected 100, got %f", got)
	}
	// Destination must not exist.
	if _, ok := repo.invs[prodID.String()+":"+locB.String()]; ok {
		t.Errorf("destination inventory should not have been created")
	}
}

// TestAllocate_HonorsBranchContext verifies that Allocate only sees inventory
// in the active branch.
func TestAllocate_HonorsBranchContext(t *testing.T) {
	branchA := uuid.New()
	branchB := uuid.New()
	locA := uuid.New()
	locB := uuid.New()

	repo := &MockRepository{
		invs: make(map[string]*Inventory),
		branches: map[uuid.UUID]uuid.UUID{
			locA: branchA,
			locB: branchB,
		},
	}
	svc := NewService(repo)

	prodID := uuid.New()
	// Only branch B has stock for this product.
	repo.invs[prodID.String()+":"+locB.String()] = &Inventory{
		ID: uuid.New(), ProductID: prodID, LocationID: &locB, Quantity: 50,
	}

	// Request scoped to branch A → no inventory visible.
	ctx := branchctx.With(context.Background(), &branchctx.Context{BranchID: &branchA})
	err := svc.Allocate(ctx, prodID, 5)
	if err == nil {
		t.Fatal("expected 'no inventory found' error when product only exists in another branch")
	}

	// Request scoped to branch B → succeeds (AllocateStock stub returns nil).
	ctx = branchctx.With(context.Background(), &branchctx.Context{BranchID: &branchB})
	if err := svc.Allocate(ctx, prodID, 5); err != nil {
		t.Fatalf("expected branch-B allocation to succeed, got %v", err)
	}
}
