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
	"github.com/gablelbm/gable/internal/tax"
	"github.com/gablelbm/gable/pkg/audit"
	"github.com/gablelbm/gable/pkg/branchctx"
	"github.com/gablelbm/gable/pkg/database"
	"github.com/google/uuid"
)

// PriceCalculator resolves customer-specific pricing for a product.
type PriceCalculator interface {
	CalculateItemPrice(ctx context.Context, customerID uuid.UUID, productID uuid.UUID, basePrice float64, quantity float64) (float64, error)
}

// TaxCalculator previews tax for a cart (implemented by tax.Service:
// exemptions first, Avalara when configured, flat/branch rate otherwise).
type TaxCalculator interface {
	PreviewTax(ctx context.Context, req *tax.TaxPreviewRequest) (*tax.TaxResult, error)
}

// BranchRateResolver resolves a branch's default sales-tax rate
// (implemented by the invoice repository over locations.default_tax_rate).
type BranchRateResolver interface {
	GetBranchTaxRate(ctx context.Context, branchID *uuid.UUID) (float64, bool)
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
	taxCalc      TaxCalculator
	branchRates  BranchRateResolver
	gateway      payment.PaymentGateway
	auditLog     *audit.Logger
	logger       *slog.Logger
}

// WithPricing enables customer-specific pricing resolution for POS line items.
func (s *Service) WithPricing(calc PriceCalculator) {
	s.priceCalc = calc
}

// WithTax wires real tax calculation into cart totals: exemption-aware via
// the tax service, with the branch's default rate as the flat fallback.
func (s *Service) WithTax(calc TaxCalculator, rates BranchRateResolver) *Service {
	s.taxCalc = calc
	s.branchRates = rates
	return s
}

// WithGateway enables card processing for CARD tenders carrying a token.
func (s *Service) WithGateway(gw payment.PaymentGateway) *Service {
	s.gateway = gw
	return s
}

// WithAuditLog attaches an audit logger so money-moving till operations
// (sale completion and voids) are recorded in the financial audit trail.
func (s *Service) WithAuditLog(l *audit.Logger) *Service {
	s.auditLog = l
	return s
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

// StartTransaction creates a new open POS transaction, attached to the
// register's open till session when one exists. (Sales without a session
// remain allowed for now so existing flows keep working; the terminal UI
// prompts to open the till. Hard enforcement is a config decision later.)
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

	if session, err := s.repo.GetOpenTillSession(ctx, registerID); err == nil && session != nil {
		tx.TillSessionID = &session.ID
	}

	if err := s.repo.CreateTransaction(ctx, tx); err != nil {
		return nil, err
	}

	s.logger.Info("POS transaction started", "id", tx.ID, "register", registerID, "till_session", tx.TillSessionID)
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

// CompleteTransaction finalizes the sale: charges card tenders through the
// gateway, applies tenders, deducts inventory, computes change, posts to the
// GL, and turns ACCOUNT tenders into a real invoice (AR).
func (s *Service) CompleteTransaction(ctx context.Context, txID uuid.UUID, tenders []AddTenderRequest) (*POSTransaction, error) {
	var result *POSTransaction

	// Phase 0 — pre-transaction validation + card charging. Gateway calls
	// happen OUTSIDE the DB transaction: they're slow, non-transactional,
	// and must not hold row locks. A post-charge DB failure is logged
	// CRITICAL for manual reconciliation (same policy as payment.Service).
	pre, err := s.repo.GetTransaction(ctx, txID)
	if err != nil {
		return nil, err
	}
	if pre.Status != TransactionStatusOpen && pre.Status != TransactionStatusHeld {
		return nil, fmt.Errorf("transaction is not open (status: %s)", pre.Status)
	}

	var totalTendered int64
	var accountPortion int64
	for _, t := range tenders {
		cents := int64(t.Amount*100.0 + 0.5)
		totalTendered += cents
		if t.Method == "ACCOUNT" {
			accountPortion += cents
		}
	}
	if totalTendered < pre.Total {
		return nil, fmt.Errorf("insufficient tender: need %d cents, got %d cents", pre.Total, totalTendered)
	}
	if accountPortion > 0 && pre.CustomerID == nil {
		return nil, fmt.Errorf("ACCOUNT tender requires a customer on the transaction")
	}
	// Change is only ever given from over-tendering; it comes out of the
	// cash drawer, so overpayment on non-cash methods is rejected.
	changeDue := totalTendered - pre.Total
	if changeDue > 0 {
		var cashTendered int64
		for _, t := range tenders {
			if t.Method == "CASH" {
				cashTendered += int64(t.Amount*100.0 + 0.5)
			}
		}
		if cashTendered < changeDue {
			return nil, fmt.Errorf("overpayment of %d cents exceeds cash tendered — only cash tenders can generate change", changeDue)
		}
	}

	// Card handling. POS counter cards ride the CARD-PRESENT rail (Clover
	// terminal): the device captures the card out-of-band and the tender is
	// recorded as externally-settled — no token, no online charge here. A
	// token is only ever present if a card-present terminal gateway is wired
	// via WithGateway; absent that, a token-bearing CARD tender is rejected
	// rather than silently recorded (it would imply an uncaptured charge).
	chargeResults := make([]*payment.GatewayResult, len(tenders))
	for i, t := range tenders {
		if t.Method != "CARD" || t.TokenID == "" {
			continue
		}
		if s.gateway == nil {
			return nil, fmt.Errorf("card-present terminal is not configured on this register; record the card tender without a token (the terminal settles it) or wire the Clover terminal gateway")
		}
		res, chargeErr := s.gateway.Charge(ctx, payment.ChargeRequest{
			TokenID:     t.TokenID,
			AmountCents: int64(t.Amount*100.0 + 0.5),
			Currency:    "USD",
			Description: fmt.Sprintf("POS sale %s", txID),
			InvoiceID:   txID.String(),
		})
		if chargeErr != nil {
			return nil, fmt.Errorf("card charge failed: %w", chargeErr)
		}
		if res.Status != payment.GatewayStatusApproved {
			return nil, fmt.Errorf("card declined (%s)", res.Status)
		}
		chargeResults[i] = res
	}

	err = s.db.RunInTx(ctx, func(ctx context.Context) error {
		// 1. Re-read inside the transaction
		tx, err := s.repo.GetTransaction(ctx, txID)
		if err != nil {
			return err
		}
		if tx.Status != TransactionStatusOpen && tx.Status != TransactionStatusHeld {
			return fmt.Errorf("transaction is not open (status: %s)", tx.Status)
		}

		// 2. Record tenders (with gateway results on charged cards)
		for i, t := range tenders {
			tender := &POSTender{
				TransactionID: txID,
				Method:        t.Method,
				Amount:        int64(t.Amount*100.0 + 0.5),
				Reference:     t.Reference,
			}
			if res := chargeResults[i]; res != nil {
				tender.GatewayTxID = res.TransactionID
				tender.AuthCode = res.AuthCode
				tender.CardLast4 = res.CardLast4
				tender.CardBrand = res.CardBrand
			}
			if err := s.repo.AddTender(ctx, tender); err != nil {
				return err
			}
		}
		tx.ChangeDue = changeDue

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

	// Post-commit financial effects. Best-effort by design: a GL or invoice
	// hiccup must never roll back a completed till sale (it's logged for
	// reconciliation instead).
	// NOTE: voiding a completed sale does not yet post a reversing GL entry — a
	// known follow-up; the dominant completed-sale path is now booked.
	if result != nil && result.Total > 0 {
		// 1. The ACCOUNT portion becomes a real invoice: AR the customer can
		//    see and pay, posted to the GL + subledger through the standard
		//    invoice path (DR Accounts Receivable / CR Sales Revenue).
		if accountPortion > 0 && s.invoiceSvc != nil && result.CustomerID != nil && len(result.LineItems) > 0 {
			inv := s.buildAccountInvoice(result, accountPortion)
			if err := s.invoiceSvc.CreateInvoice(ctx, inv); err != nil {
				s.logger.Error("CRITICAL: POS account-charge invoice creation failed — AR missing, reconcile manually",
					"transaction_id", txID, "customer_id", result.CustomerID, "amount_cents", accountPortion, "error", err)
			} else if err := s.invoiceSvc.PostInvoiceToLedger(ctx, inv); err != nil {
				s.logger.Error("CRITICAL: POS account-charge invoice created but ledger posting failed — reconcile manually",
					"transaction_id", txID, "invoice_id", inv.ID, "error", err)
			}
		}

		// 2. The cash-collected portion (cash + card + check, net of change)
		//    books as the cash sale (DR Cash / CR Sales Revenue). Card funds
		//    settle to the same cash bucket in v1 — a dedicated card-clearing
		//    account is a chart-of-accounts follow-up.
		cashCollected := result.Total - accountPortion
		if cashCollected > 0 && s.invoiceSvc != nil {
			if err := s.invoiceSvc.PostCashSaleToGL(ctx, txID.String(), cashCollected); err != nil {
				s.logger.Error("failed to post POS sale to GL", "transaction_id", txID, "error", err)
			}
		}
	}

	if s.auditLog != nil {
		s.auditLog.Log(ctx, audit.Entry{
			Action:     "pos.transaction.completed",
			EntityType: "pos_transaction",
			EntityID:   txID,
			Changes: map[string]interface{}{
				"total_cents": result.Total,
				"register_id": result.RegisterID,
				"customer_id": result.CustomerID,
				"tenders":     len(tenders),
			},
		})
	}

	return result, nil
}

// buildAccountInvoice constructs the invoice for the ACCOUNT portion of a
// POS sale. When the whole sale went on account, the invoice mirrors the
// cart lines; a split sale gets a single summary line (the tax math on a
// partial allocation is a per-line proration problem deferred until a
// dealer needs split account tenders).
func (s *Service) buildAccountInvoice(tx *POSTransaction, accountPortionCents int64) *invoice.Invoice {
	inv := &invoice.Invoice{
		BranchID:     tx.BranchID,
		CustomerID:   *tx.CustomerID,
		Status:       invoice.InvoiceStatusUnpaid,
		PaymentTerms: invoice.TermsNet30,
	}
	if accountPortionCents >= tx.Total && len(tx.LineItems) > 0 {
		for _, item := range tx.LineItems {
			inv.Lines = append(inv.Lines, invoice.InvoiceLine{
				ProductID: item.ProductID,
				Quantity:  item.Quantity,
				PriceEach: item.UnitPrice,
			})
		}
		inv.Subtotal = tx.Subtotal
		inv.TaxAmount = tx.TaxAmount
		inv.TotalAmount = tx.Total
		if tx.Subtotal > 0 {
			inv.TaxRate = float64(tx.TaxAmount) / float64(tx.Subtotal)
		}
	} else {
		// Split tender: one summary line for the on-account portion,
		// tax-inclusive (the register already charged the tax).
		inv.Lines = []invoice.InvoiceLine{{
			ProductID: tx.LineItems[0].ProductID,
			Quantity:  1,
			PriceEach: accountPortionCents,
		}}
		inv.Subtotal = accountPortionCents
		inv.TaxRate = 0
		inv.TaxAmount = 0
		inv.TotalAmount = accountPortionCents
	}
	return inv
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

	if s.auditLog != nil {
		s.auditLog.Log(ctx, audit.Entry{
			Action:     "pos.transaction.voided",
			EntityType: "pos_transaction",
			EntityID:   txID,
			Changes: map[string]interface{}{
				"total_cents": result.Total,
				"register_id": result.RegisterID,
			},
		})
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
	tx.TaxAmount = s.calculateTax(ctx, tx, items)
	tx.Total = subtotal + tx.TaxAmount

	if err := s.repo.UpdateTransaction(ctx, tx); err != nil {
		return nil, err
	}

	tx.LineItems = items
	return tx, nil
}

// calculateTax computes cart tax through the tax service (exemption-aware;
// Avalara when configured; otherwise the branch's default rate as a flat
// estimate — the same source invoices use, so till and invoice totals agree).
func (s *Service) calculateTax(ctx context.Context, tx *POSTransaction, items []POSLineItem) int64 {
	if tx.Subtotal == 0 {
		return 0
	}

	// Resolve the branch rate hint (branch of the transaction, else request
	// context, else the invoice-module default).
	rate := invoice.DefaultTaxRate
	if s.branchRates != nil {
		branchID := &tx.BranchID
		if tx.BranchID == uuid.Nil {
			branchID = branchctx.IDForQuery(ctx)
		}
		if r, ok := s.branchRates.GetBranchTaxRate(ctx, branchID); ok {
			rate = r
		}
	}

	if s.taxCalc == nil {
		return int64(math.Round(float64(tx.Subtotal) * rate))
	}

	req := &tax.TaxPreviewRequest{
		CustomerID:   tx.CustomerID,
		DocumentType: "SalesInvoice",
		RateHint:     rate,
	}
	for i, item := range items {
		req.Lines = append(req.Lines, tax.TaxLineInput{
			LineNumber:  i + 1,
			ItemCode:    item.ProductID.String(),
			Description: item.Description,
			Quantity:    item.Quantity,
			Amount:      item.LineTotal,
		})
	}

	res, err := s.taxCalc.PreviewTax(ctx, req)
	if err != nil {
		s.logger.Warn("POS tax preview failed; falling back to branch rate", "error", err)
		return int64(math.Round(float64(tx.Subtotal) * rate))
	}
	return res.TotalTax
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
