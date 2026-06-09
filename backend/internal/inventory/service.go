package inventory

import (
	"context"
	"fmt"
	"sort"

	"github.com/gablelbm/gable/pkg/branchctx"
	"github.com/google/uuid"
)

type Service struct {
	repo Repository
}

func NewService(repo Repository) *Service {
	return &Service{repo: repo}
}

// AdjustStock handles receipt (Add) or cycle count (Set/Adjust)
func (s *Service) AdjustStock(ctx context.Context, req StockAdjustmentRequest) error {
	// 1. Check if inventory record exists
	inv, err := s.repo.GetInventory(ctx, req.ProductID, req.LocationID)
	if err != nil {
		return err
	}

	if inv == nil {
		// Create new record. On a non-existent record a delta starts from base 0.
		newQty := req.Quantity
		if newQty < 0 {
			return fmt.Errorf("adjustment would create negative stock for product %s (resulting quantity %g)", req.ProductID, newQty)
		}

		inv = &Inventory{
			ProductID:  req.ProductID,
			LocationID: req.LocationID,
			Quantity:   newQty,
			Location:   "", // Legacy field empty
		}
		return s.repo.CreateInventory(ctx, inv)
	}

	// Update existing
	if req.IsDelta {
		inv.Quantity += req.Quantity
	} else {
		inv.Quantity = req.Quantity
	}

	// Floor on-hand stock at zero. A negative result means an out-adjustment (or
	// over-large move) exceeded what is physically on hand — reject it rather
	// than persist negative inventory, which corrupts availability math
	// downstream (Allocate/Fulfill) and the double-entry move total.
	if inv.Quantity < 0 {
		return fmt.Errorf("adjustment would drive stock negative for product %s (resulting quantity %g)", req.ProductID, inv.Quantity)
	}

	return s.repo.UpdateInventory(ctx, inv)
}

func (s *Service) MoveStock(ctx context.Context, req StockMovementRequest) error {
	// Cross-branch moves are not supported. Require both endpoints to share
	// a branch_id (looked up from the locations table). A nil source location
	// means "unassigned/legacy" which we treat as branch-unknown and reject
	// unless the destination is also unassigned.
	var fromBranch, toBranch *uuid.UUID
	var err error
	if req.FromLocationID != nil {
		fromBranch, err = s.repo.LocationBranchID(ctx, *req.FromLocationID)
		if err != nil {
			return fmt.Errorf("failed to resolve source branch: %w", err)
		}
	}
	toBranch, err = s.repo.LocationBranchID(ctx, req.ToLocationID)
	if err != nil {
		return fmt.Errorf("failed to resolve destination branch: %w", err)
	}
	if fromBranch != nil && toBranch != nil && *fromBranch != *toBranch {
		return fmt.Errorf("cross-branch stock moves are not allowed: source=%s destination=%s", fromBranch, toBranch)
	}

	if req.Quantity <= 0 {
		return fmt.Errorf("move quantity must be positive")
	}

	// Only unallocated (available) stock may be relocated. Moving reserved stock
	// would strand the allocation at the source (available goes negative) while
	// the moved units arrive unreserved at the destination and can be re-sold —
	// double-promising the same physical units.
	if req.FromLocationID != nil {
		src, err := s.repo.GetInventory(ctx, req.ProductID, req.FromLocationID)
		if err != nil {
			return fmt.Errorf("failed to read source inventory: %w", err)
		}
		if src == nil {
			return fmt.Errorf("no inventory at source location for product %s", req.ProductID)
		}
		if avail := src.Quantity - src.Allocated; req.Quantity > avail {
			return fmt.Errorf("cannot move %g: only %g unallocated at source (reserved stock cannot be moved)", req.Quantity, avail)
		}
	}

	return s.repo.ExecuteInTx(ctx, func(ctx context.Context) error {
		// Subtract from source
		err := s.AdjustStock(ctx, StockAdjustmentRequest{
			ProductID:  req.ProductID,
			LocationID: req.FromLocationID,
			Quantity:   -req.Quantity,
			IsDelta:    true,
			Reason:     "Move Out: " + req.Reason,
		})
		if err != nil {
			return fmt.Errorf("failed to remove stock from source: %w", err)
		}

		// Add to dest
		err = s.AdjustStock(ctx, StockAdjustmentRequest{
			ProductID:  req.ProductID,
			LocationID: &req.ToLocationID,
			Quantity:   req.Quantity,
			IsDelta:    true,
			Reason:     "Move In: " + req.Reason,
		})
		if err != nil {
			return fmt.Errorf("failed to add stock to destination: %w", err)
		}

		return nil
	})
}

// Allocate reserves stock for a product, spanning multiple locations within the
// active branch when no single location has enough free stock (mirroring how
// Fulfill consumes across locations). A nil branch context means "all branches".
func (s *Service) Allocate(ctx context.Context, productID uuid.UUID, quantity float64) error {
	if quantity <= 0 {
		return fmt.Errorf("allocation quantity must be positive")
	}

	items, err := s.repo.ListInventoryByProductAndBranch(ctx, productID, branchctx.IDForQuery(ctx))
	if err != nil {
		return fmt.Errorf("failed to list inventory: %w", err)
	}

	if len(items) == 0 {
		return fmt.Errorf("no inventory found for product %s", productID)
	}

	// Reject up-front if total available across all locations is insufficient,
	// so we never leave a partial allocation on a non-transactional caller.
	var totalAvail float64
	for i := range items {
		if a := items[i].Quantity - items[i].Allocated; a > 0 {
			totalAvail += a
		}
	}
	if totalAvail < quantity {
		return fmt.Errorf("insufficient available stock for product %s: need %g, have %g across %d location(s)", productID, quantity, totalAvail, len(items))
	}

	// Allocate fullest-location-first until the quantity is satisfied. Each
	// AllocateStock is atomic with a `(quantity-allocated) >= delta` guard, so a
	// concurrent allocation that drains a row surfaces as an error and (within
	// the caller's transaction) rolls back the whole allocation.
	sort.SliceStable(items, func(a, b int) bool {
		return (items[a].Quantity - items[a].Allocated) > (items[b].Quantity - items[b].Allocated)
	})

	remaining := quantity
	for i := range items {
		if remaining <= 0 {
			break
		}
		avail := items[i].Quantity - items[i].Allocated
		if avail <= 0 {
			continue
		}
		take := remaining
		if avail < remaining {
			take = avail
		}
		if err := s.repo.AllocateStock(ctx, items[i].ID, take); err != nil {
			return fmt.Errorf("failed to allocate %g from inventory %s: %w", take, items[i].ID, err)
		}
		remaining -= take
	}

	if remaining > 0 {
		return fmt.Errorf("insufficient available stock for product %s (could not allocate remaining %g)", productID, remaining)
	}
	return nil
}

func (s *Service) Release(ctx context.Context, productID uuid.UUID, quantity float64) error {
	if quantity <= 0 {
		return fmt.Errorf("release quantity must be positive")
	}

	items, err := s.repo.ListInventoryByProductAndBranch(ctx, productID, branchctx.IDForQuery(ctx))
	if err != nil {
		return fmt.Errorf("failed to list inventory: %w", err)
	}

	if len(items) == 0 {
		return fmt.Errorf("no inventory found for product %s", productID)
	}

	// Pick the item with the most allocated stock
	var best *Inventory
	var maxAlloc float64 = -1

	for i := range items {
		if items[i].Allocated > maxAlloc {
			maxAlloc = items[i].Allocated
			best = &items[i]
		}
	}

	if best == nil || best.Allocated <= 0 {
		return fmt.Errorf("no allocated stock found for product %s", productID)
	}

	return s.repo.DeallocateStock(ctx, best.ID, quantity)
}

func (s *Service) ListByProduct(ctx context.Context, productIDStr string) ([]Inventory, error) {
	id, err := uuid.Parse(productIDStr)
	if err != nil {
		return nil, fmt.Errorf("invalid product id: %w", err)
	}
	return s.repo.ListInventoryByProduct(ctx, id)
}

func (s *Service) Fulfill(ctx context.Context, productID uuid.UUID, quantity float64) error {
	if quantity <= 0 {
		return fmt.Errorf("quantity must be positive")
	}

	items, err := s.repo.ListInventoryByProductAndBranch(ctx, productID, branchctx.IDForQuery(ctx))
	if err != nil {
		return fmt.Errorf("failed to list inventory: %w", err)
	}

	remaining := quantity

	// Consume allocated stock
	for i := range items {
		if remaining <= 0 {
			break
		}

		// We prefer to take from where it was allocated.
		available := items[i].Allocated
		if available > 0 {
			take := remaining
			if available < remaining {
				take = available
			}

			if err := s.repo.FulfillStock(ctx, items[i].ID, take); err != nil {
				return createError(fmt.Errorf("failed to fulfill stock from inv %s: %w", items[i].ID, err))
			}
			remaining -= take
		}
	}

	if remaining > 0 {
		return fmt.Errorf("insufficient allocated stock to fulfill %f (remaining: %f)", quantity, remaining)
	}

	return nil
}

func (s *Service) RevertFulfillment(ctx context.Context, productID uuid.UUID, quantity float64) error {
	if quantity <= 0 {
		return fmt.Errorf("revert quantity must be positive")
	}

	items, err := s.repo.ListInventoryByProductAndBranch(ctx, productID, branchctx.IDForQuery(ctx))
	if err != nil {
		return fmt.Errorf("failed to list inventory: %w", err)
	}

	if len(items) == 0 {
		return fmt.Errorf("no inventory found for product %s", productID)
	}

	// Pick the first item to revert fulfillment into
	// In a more sophisticated system this would track which item was fulfilled from
	return s.repo.RevertFulfillStock(ctx, items[0].ID, quantity)
}

func createError(err error) error {
	// Helper to handle error wrapping
	return err
}
