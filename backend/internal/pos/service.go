package pos

import (
	"context"
	"fmt"
	"log/slog"
	"math"
	"time"

	"github.com/gablelbm/gable/internal/inventory"
	"github.com/gablelbm/gable/internal/invoice"
	"github.com/gablelbm/gable/internal/payment"
	"github.com/gablelbm/gable/internal/product"
	"github.com/gablelbm/gable/pkg/database"
	"github.com/google/uuid"
)

// PriceCalculator resolves customer-specific pricing for a product.
type PriceCalculator interface {
	CalculateItemPrice(ctx context.Context, customerID uuid.UUID, productID uuid.UUID, basePrice float64, quantity float64) (float64, error)
}

// Service handles POS business logic.
type Service struct {
	db           *database.DB
	repo         Repository
	productSvc   *product.Service
	inventorySvc *inventory.Service
	invoiceSvc   *invoice.Service
	paymentSvc   *payment.Service
	priceCalc    PriceCalculator
	logger       *slog.Logger
}

// WithPricing enables customer-specific pricing resolution for POS line items.
func (s *Service) WithPricing(calc PriceCalculator) {
	s.priceCalc = calc
}

// NewService creates a new POS service.
func NewService(
	db *database.DB,
	repo Repository,
	productSvc *product.Service,
	inventorySvc *inventory.Service,
	invoiceSvc *invoice.Service,
	paymentSvc *payment.Service,
	logger *slog.Logger,
) *Service {
	return &Service{
		db:           db,
		repo:         repo,
		productSvc:   productSvc,
		inventorySvc: inventorySvc,
		invoiceSvc:   invoiceSvc,
		paymentSvc:   paymentSvc,
		logger:       logger,
	}
}

// StartTransaction creates a new open POS transaction.
func (s *Service) StartTransaction(ctx context.Context, registerID string, cashierID uuid.UUID, customerID *uuid.UUID) (*POSTransaction, error) {
	tx := &POSTransaction{
		RegisterID: registerID,
		CashierID:  cashierID,
		CustomerID: customerID,
		Subtotal:   0,
		TaxAmount:  0,
		Total:      0,
		Status:     TransactionStatusOpen,
	}

	if err := s.repo.CreateTransaction(ctx, tx); err != nil {
		return nil, err
	}

	s.logger.Info("POS transaction started", "id", tx.ID, "register", registerID)
	return tx, nil
}

// AddItem adds a product to the transaction cart.
func (s *Service) AddItem(ctx context.Context, txID uuid.UUID, req AddLineItemRequest) (*POSTransaction, error) {
	// Get the product to populate description and pricing
	prod, err := s.productSvc.GetProduct(ctx, req.ProductID)
	if err != nil {
		return nil, fmt.Errorf("product not found: %w", err)
	}

	// Resolve effective price (customer-specific if available)
	effectivePrice := prod.BasePrice
	if s.priceCalc != nil {
		// Get the transaction to check for customer association
		tx, txErr := s.repo.GetTransaction(ctx, txID)
		if txErr == nil && tx.CustomerID != nil {
			if resolved, pErr := s.priceCalc.CalculateItemPrice(ctx, *tx.CustomerID, req.ProductID, prod.BasePrice, req.Quantity); pErr == nil {
				effectivePrice = resolved
			}
		}
	}

	unitPriceCents := int64(effectivePrice*100.0 + 0.5)
	lineTotalCents := int64(math.Round(float64(unitPriceCents) * req.Quantity))

	item := &POSLineItem{
		TransactionID: txID,
		ProductID:     req.ProductID,
		Description:   prod.Description,
		Quantity:      req.Quantity,
		UOM:           req.UOM,
		UnitPrice:     unitPriceCents,
		LineTotal:     lineTotalCents,
	}

	if item.UOM == "" {
		item.UOM = string(prod.UOMPrimary)
	}

	if err := s.repo.AddLineItem(ctx, item); err != nil {
		return nil, err
	}

	// Recalculate totals
	return s.recalculateTotals(ctx, txID)
}

// RemoveItem removes a line item from the transaction.
func (s *Service) RemoveItem(ctx context.Context, txID uuid.UUID, itemID uuid.UUID) (*POSTransaction, error) {
	if err := s.repo.RemoveLineItem(ctx, itemID); err != nil {
		return nil, err
	}
	return s.recalculateTotals(ctx, txID)
}

// CompleteTransaction finalizes the sale: applies tenders, deducts inventory, creates invoice.
func (s *Service) CompleteTransaction(ctx context.Context, txID uuid.UUID, tenders []AddTenderRequest) (*POSTransaction, error) {
	var result *POSTransaction

	err := s.db.RunInTx(ctx, func(ctx context.Context) error {
		// 1. Get the transaction
		tx, err := s.repo.GetTransaction(ctx, txID)
		if err != nil {
			return err
		}
		if tx.Status != TransactionStatusOpen && tx.Status != TransactionStatusHeld {
			return fmt.Errorf("transaction is not open (status: %s)", tx.Status)
		}

		// 2. Validate tender amounts
		var totalTendered int64
		for _, t := range tenders {
			totalTendered += int64(t.Amount*100.0 + 0.5)
		}
		if totalTendered < tx.Total {
			return fmt.Errorf("insufficient tender: need %d cents, got %d cents", tx.Total, totalTendered)
		}

		// 3. Record tenders
		for _, t := range tenders {
			tender := &POSTender{
				TransactionID: txID,
				Method:        t.Method,
				Amount:        int64(t.Amount*100.0 + 0.5),
				Reference:     t.Reference,
			}
			if err := s.repo.AddTender(ctx, tender); err != nil {
				return err
			}
		}

		// 4. Get line items for inventory deduction
		items, err := s.repo.GetLineItems(ctx, txID)
		if err != nil {
			return err
		}

		// 5. Deduct inventory for each line item
		for _, item := range items {
			if err := s.inventorySvc.AdjustStock(ctx, inventory.StockAdjustmentRequest{
				ProductID:  item.ProductID,
				LocationID: nil, // Default location
				Quantity:   -item.Quantity,
				IsDelta:    true,
			}); err != nil {
				s.logger.Error("Inventory deduction failed for POS item — aborting sale",
					"product_id", item.ProductID,
					"quantity", item.Quantity,
					"transaction_id", txID,
					"error", err,
				)
				return fmt.Errorf("inventory deduction failed for product %s: %w", item.ProductID, err)
			}
		}

		// 6. Complete the transaction
		now := time.Now()
		tx.Status = TransactionStatusCompleted
		tx.CompletedAt = &now
		if err := s.repo.UpdateTransaction(ctx, tx); err != nil {
			return err
		}

		// Populate for response
		tx.LineItems = items
		txTenders, _ := s.repo.GetTenders(ctx, txID)
		tx.Tenders = txTenders
		result = tx

		s.logger.Info("POS transaction completed",
			"id", txID,
			"total_cents", tx.Total,
			"tenders", len(tenders),
		)
		return nil
	})

	if err != nil {
		return nil, err
	}
	return result, nil
}

// VoidTransaction voids an open or completed transaction.
// All DB operations (inventory reversal + status update) run in a single transaction.
func (s *Service) VoidTransaction(ctx context.Context, txID uuid.UUID) (*POSTransaction, error) {
	var result *POSTransaction

	err := s.db.RunInTx(ctx, func(ctx context.Context) error {
		tx, err := s.repo.GetTransaction(ctx, txID)
		if err != nil {
			return err
		}

		if tx.Status == TransactionStatusVoided {
			result = tx
			return nil
		}

		// If completed, we need to reverse inventory
		if tx.Status == TransactionStatusCompleted {
			items, err := s.repo.GetLineItems(ctx, txID)
			if err != nil {
				return fmt.Errorf("failed to get line items for void: %w", err)
			}
			for _, item := range items {
				if err := s.inventorySvc.AdjustStock(ctx, inventory.StockAdjustmentRequest{
					ProductID:  item.ProductID,
					LocationID: nil,
					Quantity:   item.Quantity, // Positive to restore
					IsDelta:    true,
				}); err != nil {
					return fmt.Errorf("failed to reverse inventory for product %s: %w", item.ProductID, err)
				}
			}
		}

		tx.Status = TransactionStatusVoided
		if err := s.repo.UpdateTransaction(ctx, tx); err != nil {
			return err
		}

		result = tx
		return nil
	})

	if err != nil {
		return nil, err
	}

	s.logger.Info("POS transaction voided", "id", txID)
	return result, nil
}

// GetTransaction returns a full transaction with line items and tenders.
func (s *Service) GetTransaction(ctx context.Context, txID uuid.UUID) (*POSTransaction, error) {
	tx, err := s.repo.GetTransaction(ctx, txID)
	if err != nil {
		return nil, err
	}

	tx.LineItems, _ = s.repo.GetLineItems(ctx, txID)
	tx.Tenders, _ = s.repo.GetTenders(ctx, txID)
	return tx, nil
}

// ListTransactions returns transaction summaries for a register and date.
func (s *Service) ListTransactions(ctx context.Context, registerID string, date time.Time) ([]TransactionSummary, error) {
	return s.repo.ListTransactions(ctx, registerID, date)
}

// SearchProducts performs typeahead product search for the POS.
func (s *Service) SearchProducts(ctx context.Context, query string) ([]QuickSearchResult, error) {
	if len(query) < 2 {
		return nil, nil
	}
	return s.repo.SearchProducts(ctx, query, 20)
}

// recalculateTotals sums line items and updates the transaction.
func (s *Service) recalculateTotals(ctx context.Context, txID uuid.UUID) (*POSTransaction, error) {
	tx, err := s.repo.GetTransaction(ctx, txID)
	if err != nil {
		return nil, err
	}

	items, err := s.repo.GetLineItems(ctx, txID)
	if err != nil {
		return nil, err
	}

	var subtotal int64
	for _, item := range items {
		subtotal += item.LineTotal
	}

	tx.Subtotal = subtotal
	// TODO: Calculate tax via Avalara (Sprint 29). For now, tax is $0.
	tx.TaxAmount = 0
	tx.Total = subtotal + tx.TaxAmount

	if err := s.repo.UpdateTransaction(ctx, tx); err != nil {
		return nil, err
	}

	tx.LineItems = items
	return tx, nil
}

// --- Offline Sync ---

// SyncOfflineTransactions replays a batch of offline POS transactions.
// It uses client-generated UUIDs for idempotency (duplicate detection).
func (s *Service) SyncOfflineTransactions(ctx context.Context, req OfflineSyncRequest) (*OfflineSyncResponse, error) {
	resp := &OfflineSyncResponse{
		BatchID: req.BatchID,
	}

	syncTag := "offline-v1"

	for _, offlineTx := range req.Items {
		// 1. Idempotency check — skip if already synced
		exists, err := s.repo.TransactionExists(ctx, offlineTx.ClientID)
		if err != nil {
			s.logger.Error("sync: existence check failed", "client_id", offlineTx.ClientID, "error", err)
			resp.ErrorCount++
			resp.Errors = append(resp.Errors, SyncError{
				ClientID: offlineTx.ClientID.String(),
				Reason:   fmt.Sprintf("existence check: %v", err),
			})
			continue
		}
		if exists {
			resp.DuplicateCount++
			continue
		}

		// 2. Create the transaction with offline metadata
		registerID := offlineTx.RegisterID
		if registerID == "" {
			registerID = req.RegisterID
		}

		tx := &POSTransaction{
			ID:              offlineTx.ClientID,
			RegisterID:      registerID,
			CashierID:       offlineTx.CashierID,
			CustomerID:      offlineTx.CustomerID,
			Status:          TransactionStatusOpen,
			SyncedFrom:      &syncTag,
			ClientCreatedAt: &offlineTx.ClientCreatedAt,
		}

		if err := s.repo.CreateTransaction(ctx, tx); err != nil {
			s.logger.Error("sync: create transaction failed", "client_id", offlineTx.ClientID, "error", err)
			resp.ErrorCount++
			resp.Errors = append(resp.Errors, SyncError{
				ClientID: offlineTx.ClientID.String(),
				Reason:   fmt.Sprintf("create: %v", err),
			})
			continue
		}

		// 3. Replay line items
		itemErr := false
		for _, item := range offlineTx.Items {
			if _, err := s.AddItem(ctx, tx.ID, item); err != nil {
				s.logger.Warn("sync: add item failed", "client_id", offlineTx.ClientID, "product_id", item.ProductID, "error", err)
				itemErr = true
			}
		}

		// 4. Complete the transaction with tenders
		if !itemErr && len(offlineTx.Tenders) > 0 {
			if _, err := s.CompleteTransaction(ctx, tx.ID, offlineTx.Tenders); err != nil {
				s.logger.Warn("sync: complete transaction failed", "client_id", offlineTx.ClientID, "error", err)
				resp.ErrorCount++
				resp.Errors = append(resp.Errors, SyncError{
					ClientID: offlineTx.ClientID.String(),
					Reason:   fmt.Sprintf("complete: %v", err),
				})
				continue
			}
		}

		resp.SyncedCount++
	}

	// 5. Log the sync batch
	if err := s.repo.LogSyncBatch(ctx, req.BatchID, req.RegisterID, resp.SyncedCount, resp.DuplicateCount, resp.ErrorCount, resp.Errors); err != nil {
		s.logger.Error("sync: failed to log batch", "batch_id", req.BatchID, "error", err)
	}

	return resp, nil
}

// GetProductCatalog returns full product catalog for offline caching.
func (s *Service) GetProductCatalog(ctx context.Context) ([]CatalogProduct, error) {
	return s.repo.GetProductCatalog(ctx)
}
