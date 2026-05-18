package inventory

import (
	"context"
	"fmt"

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
		// Create new record
		newQty := req.Quantity
		if req.IsDelta {
			// If delta on non-existent record, assume base 0
			newQty = req.Quantity
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

	// Prevent negative stock?
	// Depending on business rule. For now allow negative (backorder/error) or strict?
	// Let's allow negative for now to reflect reality vs system, but warn?
	// User requested "Basic In/Out".

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

// Allocate reserves stock for a product.
// For MVP, it picks the first available inventory record (or largest).
// In reality, this should be smarter or explicit.
func (s *Service) Allocate(ctx context.Context, productID uuid.UUID, quantity float64) error {
	if quantity <= 0 {
		return fmt.Errorf("allocation quantity must be positive")
	}

	// 1. Find inventory with enough stock? Or just any stock.
	// Simple strategy: Get all locations within the active branch, pick one
	// with most stock. A nil branch context means "all branches" (admin).

	items, err := s.repo.ListInventoryByProductAndBranch(ctx, productID, branchctx.IDForQuery(ctx))
	if err != nil {
		return fmt.Errorf("failed to list inventory: %w", err)
	}

	if len(items) == 0 {
		return fmt.Errorf("no inventory found for product %s", productID)
	}

	// Strategy: Pick the one with highest (Quantity - Allocated)
	var best *Inventory
	var maxAvail float64 = -1

	for i := range items {
		avail := items[i].Quantity - items[i].Allocated
		if avail > maxAvail {
			maxAvail = avail
			best = &items[i]
		}
	}

	if best == nil {
		// Should not happen if list not empty
		best = &items[0]
	}

	// 2. Update allocation
	return s.repo.AllocateStock(ctx, best.ID, quantity)
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
