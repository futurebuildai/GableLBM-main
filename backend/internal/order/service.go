package order

import (
	"context"
	"fmt"
	"math"

	"github.com/gablelbm/gable/internal/customer"
	"github.com/gablelbm/gable/internal/inventory"
	"github.com/gablelbm/gable/internal/invoice"
	"github.com/gablelbm/gable/internal/purchase_order"
	"github.com/gablelbm/gable/pkg/audit"
	"github.com/gablelbm/gable/pkg/database"
	"github.com/google/uuid"
)

type Service struct {
	repo         Repository
	db           *database.DB
	inventorySvc *inventory.Service
	invoiceSvc   *invoice.Service
	customerSvc  *customer.Service
	poSvc        *purchase_order.Service
	auditLog     *audit.Logger
}

func NewService(repo Repository, inventorySvc *inventory.Service, invoiceSvc *invoice.Service, customerSvc *customer.Service, poSvc *purchase_order.Service, db ...*database.DB) *Service {
	s := &Service{
		repo:         repo,
		inventorySvc: inventorySvc,
		invoiceSvc:   invoiceSvc,
		customerSvc:  customerSvc,
		poSvc:        poSvc,
	}
	if len(db) > 0 {
		s.db = db[0]
	}
	return s
}

// WithAuditLog sets the audit logger for financial operation tracking.
func (s *Service) WithAuditLog(l *audit.Logger) *Service {
	s.auditLog = l
	return s
}

func (s *Service) CreateOrder(ctx context.Context, req CreateOrderRequest) (*Order, error) {
	// 1. Validate inputs
	if req.CustomerID == uuid.Nil {
		return nil, fmt.Errorf("customer_id is required")
	}

	if len(req.Lines) == 0 {
		return nil, fmt.Errorf("order must have at least one line item")
	}

	o := &Order{
		CustomerID: req.CustomerID,
		QuoteID:    req.QuoteID,
		Status:     StatusDraft,
	}

	// Auto-populate salesperson from the customer's assigned rep
	cust, err := s.customerSvc.GetCustomer(ctx, req.CustomerID)
	if err == nil && cust.SalespersonID != nil {
		o.SalespersonID = cust.SalespersonID
	}

	var totalCents int64
	for _, l := range req.Lines {
		if l.Quantity <= 0 {
			return nil, fmt.Errorf("line quantity must be positive")
		}
		if l.PriceEach < 0 {
			return nil, fmt.Errorf("line price must be non-negative")
		}

		line := OrderLine{
			ID:               uuid.New(), // Generate ID upfront for linking
			ProductID:        l.ProductID,
			Quantity:         l.Quantity,
			PriceEach:        l.PriceEach,
			IsSpecialOrder:   l.IsSpecialOrder,
			VendorID:         l.VendorID,
			SpecialOrderCost: l.SpecialOrderCost,
		}
		o.Lines = append(o.Lines, line)
		totalCents += int64(math.Round(l.Quantity * float64(l.PriceEach)))
	}
	o.TotalAmount = totalCents

	// 2. Persist Order + POs in a single transaction
	if s.db != nil {
		err := s.db.RunInTx(ctx, func(txCtx context.Context) error {
			if err := s.repo.CreateOrder(txCtx, o); err != nil {
				return fmt.Errorf("failed to create order: %w", err)
			}
			for _, line := range o.Lines {
				if line.IsSpecialOrder && line.VendorID != nil {
					description := fmt.Sprintf("Special Order for Customer %s (Order %s)", o.CustomerID, o.ID)
					// TODO: align with int64 cents — CreateFromSOLine accepts float64 dollars
					soCostDollars := float64(line.SpecialOrderCost) / 100.0
					if err := s.poSvc.CreateFromSOLine(txCtx, line.ID, line.VendorID, description, line.Quantity, soCostDollars); err != nil {
						return fmt.Errorf("failed to create PO for special order line: %w", err)
					}
				}
			}
			return nil
		})
		if err != nil {
			return nil, err
		}
	} else {
		// Fallback for tests without DB handle
		if err := s.repo.CreateOrder(ctx, o); err != nil {
			return nil, fmt.Errorf("failed to create order: %w", err)
		}
		for _, line := range o.Lines {
			if line.IsSpecialOrder && line.VendorID != nil {
				description := fmt.Sprintf("Special Order for Customer %s (Order %s)", o.CustomerID, o.ID)
				// TODO: align with int64 cents — CreateFromSOLine accepts float64 dollars
				soCostDollars := float64(line.SpecialOrderCost) / 100.0
				if err := s.poSvc.CreateFromSOLine(ctx, line.ID, line.VendorID, description, line.Quantity, soCostDollars); err != nil {
					return nil, fmt.Errorf("failed to create PO for special order line: %w", err)
				}
			}
		}
	}

	return o, nil
}

func (s *Service) ConfirmOrder(ctx context.Context, id uuid.UUID) error {
	// 1. Get Order
	o, err := s.repo.GetOrder(ctx, id)
	if err != nil {
		return err
	}

	if o.Status != StatusDraft {
		return fmt.Errorf("cannot confirm order in status %s", o.Status)
	}

	// 1.5 Check Credit Limit
	cust, err := s.customerSvc.GetCustomer(ctx, o.CustomerID)
	if err != nil {
		return fmt.Errorf("failed to get customer details: %w", err)
	}

	// If Credit Limit is set (> 0) and (Balance + OrderTotal > Limit)
	// TODO: align with int64 cents — customer.CreditLimit and BalanceDue are still float64 dollars
	orderDollars := float64(o.TotalAmount) / 100.0
	if cust.CreditLimit > 0 && (cust.BalanceDue+orderDollars) > cust.CreditLimit {
		// Place On Hold
		if err := s.repo.UpdateStatus(ctx, id, StatusOnHold); err != nil {
			return fmt.Errorf("failed to update order status to ON_HOLD: %w", err)
		}
		return fmt.Errorf("credit limit exceeded: order placed ON HOLD")
	}

	// 2. Wrap inventory allocation + status update in a single transaction
	txFn := func(txCtx context.Context) error {
		var allocated []OrderLine

		for _, line := range o.Lines {
			if err := s.inventorySvc.Allocate(txCtx, line.ProductID, line.Quantity); err != nil {
				// Rollback previous allocations within the tx
				for _, prev := range allocated {
					_ = s.inventorySvc.Release(txCtx, prev.ProductID, prev.Quantity)
				}
				return fmt.Errorf("failed to allocate stock for product %s: %w", line.ProductID, err)
			}
			allocated = append(allocated, line)
		}

		// 3. Update Status
		if err := s.repo.UpdateStatus(txCtx, id, StatusConfirmed); err != nil {
			return fmt.Errorf("failed to update order status: %w", err)
		}

		return nil
	}

	if s.db != nil {
		if err := s.db.RunInTx(ctx, txFn); err != nil {
			return err
		}
	} else {
		// Fallback for tests without DB handle
		if err := txFn(ctx); err != nil {
			return err
		}
	}

	// Audit log: order confirmed (non-transactional, after commit)
	if s.auditLog != nil {
		s.auditLog.Log(ctx, audit.Entry{
			Action:     "order.confirmed",
			EntityType: "order",
			EntityID:   id,
			Changes: map[string]interface{}{
				"customer_id":  o.CustomerID,
				"total_amount": o.TotalAmount,
				"line_count":   len(o.Lines),
			},
		})
	}

	return nil
}

func (s *Service) ListOrders(ctx context.Context) ([]Order, error) {
	return s.repo.ListOrders(ctx)
}

func (s *Service) ListOrdersPaginated(ctx context.Context, limit, offset int) ([]Order, int, error) {
	return s.repo.ListOrdersPaginated(ctx, limit, offset)
}

func (s *Service) GetOrder(ctx context.Context, id uuid.UUID) (*Order, error) {
	return s.repo.GetOrder(ctx, id)
}

func (s *Service) FulfillOrder(ctx context.Context, id uuid.UUID) error {
	// 1. Get Order
	o, err := s.repo.GetOrder(ctx, id)
	if err != nil {
		return err
	}

	if o.Status != StatusConfirmed {
		return fmt.Errorf("cannot fulfill order in status %s (must be CONFIRMED)", o.Status)
	}

	// 1.5 Check Credit Limit
	cust, err := s.customerSvc.GetCustomer(ctx, o.CustomerID)
	if err != nil {
		return fmt.Errorf("failed to get customer: %w", err)
	}
	// TODO: align with int64 cents — customer.CreditLimit and BalanceDue are still float64 dollars
	fulfillOrderDollars := float64(o.TotalAmount) / 100.0
	if cust.CreditLimit > 0 && (cust.BalanceDue+fulfillOrderDollars) > cust.CreditLimit {
		return fmt.Errorf("credit limit exceeded: balance %.2f + order %.2f > limit %.2f", cust.BalanceDue, fulfillOrderDollars, cust.CreditLimit)
	}

	// 2. Wrap all DB mutations in a single transaction:
	//    inventory fulfill, invoice creation, customer balance update, order status update.
	//    If any step fails, the entire transaction rolls back automatically.
	txFn := func(txCtx context.Context) error {
		// 2a. Fulfill Inventory
		var fulfilled []OrderLine
		for _, line := range o.Lines {
			if err := s.inventorySvc.Fulfill(txCtx, line.ProductID, line.Quantity); err != nil {
				// Rollback previous fulfillments within the tx
				for _, prev := range fulfilled {
					_ = s.inventorySvc.RevertFulfillment(txCtx, prev.ProductID, prev.Quantity)
				}
				return fmt.Errorf("failed to fulfill inventory for product %s: %w", line.ProductID, err)
			}
			fulfilled = append(fulfilled, line)
		}

		// 2b. Create Invoice — TotalAmount and PriceEach are already in cents
		inv := &invoice.Invoice{
			OrderID:     o.ID,
			CustomerID:  o.CustomerID,
			TotalAmount: o.TotalAmount,
			Status:      invoice.InvoiceStatusUnpaid,
		}
		for _, ol := range o.Lines {
			inv.Lines = append(inv.Lines, invoice.InvoiceLine{
				ProductID: ol.ProductID,
				Quantity:  ol.Quantity,
				PriceEach: ol.PriceEach,
			})
		}
		if err := s.invoiceSvc.CreateInvoice(txCtx, inv); err != nil {
			return fmt.Errorf("failed to create invoice: %w", err)
		}

		// 2c. Update Customer Balance
		// TODO: align with int64 cents — customer.UpdateBalance accepts float64 dollars
		balanceDelta := float64(o.TotalAmount) / 100.0
		if err := s.customerSvc.UpdateBalance(txCtx, o.CustomerID, balanceDelta); err != nil {
			return fmt.Errorf("failed to update customer balance: %w", err)
		}

		// 2d. Update Order Status
		if err := s.repo.UpdateStatus(txCtx, id, StatusFulfilled); err != nil {
			return fmt.Errorf("failed to update order status: %w", err)
		}

		return nil
	}

	if s.db != nil {
		if err := s.db.RunInTx(ctx, txFn); err != nil {
			return err
		}
	} else {
		// Fallback for tests without DB handle
		if err := txFn(ctx); err != nil {
			return err
		}
	}

	return nil
}
