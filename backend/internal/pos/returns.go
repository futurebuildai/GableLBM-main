package pos

import (
	"context"
	"fmt"
	"math"
	"strings"
	"time"

	"github.com/gablelbm/gable/internal/inventory"
	"github.com/gablelbm/gable/internal/payment"
	"github.com/gablelbm/gable/pkg/audit"
	"github.com/google/uuid"
)

// ReturnRefundMethod is how a return is refunded to the customer.
type ReturnRefundMethod string

const (
	RefundCash    ReturnRefundMethod = "CASH"    // out of the drawer
	RefundCard    ReturnRefundMethod = "CARD"    // reversed on the card (gateway)
	RefundAccount ReturnRefundMethod = "ACCOUNT" // store credit against AR
)

// POSReturn is a completed merchandise return at the till. Its lines restock
// sellable inventory; its total books a GL reversal of the original sale
// (DR Sales Revenue / CR Cash for a drawer refund, DR Revenue / CR AR for
// store credit).
type POSReturn struct {
	ID                    uuid.UUID  `json:"id" db:"id"`
	RegisterID            string     `json:"register_id" db:"register_id"`
	TillSessionID         *uuid.UUID `json:"till_session_id,omitempty" db:"till_session_id"`
	OriginalTransactionID *uuid.UUID `json:"original_transaction_id,omitempty" db:"original_transaction_id"`
	CustomerID            *uuid.UUID `json:"customer_id,omitempty" db:"customer_id"`
	BranchID              *uuid.UUID `json:"branch_id,omitempty" db:"branch_id"`
	CashierID             uuid.UUID  `json:"cashier_id" db:"cashier_id"`
	Subtotal              int64      `json:"subtotal" db:"subtotal"`     // Cents
	TaxAmount             int64      `json:"tax_amount" db:"tax_amount"` // Cents
	Total                 int64      `json:"total" db:"total"`           // Cents
	RefundMethod          string     `json:"refund_method" db:"refund_method"`
	Reason                string     `json:"reason" db:"reason"`
	Status                string     `json:"status" db:"status"`
	GLEntryID             *uuid.UUID `json:"gl_entry_id,omitempty" db:"gl_entry_id"`
	CreatedAt             time.Time  `json:"created_at" db:"created_at"`

	Lines []POSReturnLine `json:"lines,omitempty"`
}

// POSReturnLine is one returned product line.
type POSReturnLine struct {
	ID          uuid.UUID `json:"id" db:"id"`
	ReturnID    uuid.UUID `json:"return_id" db:"return_id"`
	ProductID   uuid.UUID `json:"product_id" db:"product_id"`
	Description string    `json:"description" db:"description"`
	Quantity    float64   `json:"quantity" db:"quantity"`
	UOM         string    `json:"uom" db:"uom"`
	UnitPrice   int64     `json:"unit_price" db:"unit_price"` // Cents
	LineTotal   int64     `json:"line_total" db:"line_total"` // Cents
	Restock     bool      `json:"restock" db:"restock"`
}

// ReturnLineRequest is one line of a return request (money in dollars, matching
// the POS wire convention).
type ReturnLineRequest struct {
	ProductID   uuid.UUID `json:"product_id"`
	Description string    `json:"description,omitempty"`
	Quantity    float64   `json:"quantity"`   // positive units returned
	UOM         string    `json:"uom,omitempty"`
	UnitPrice   float64   `json:"unit_price"` // Dollars
	Restock     *bool     `json:"restock,omitempty"` // default true; false for damaged goods
}

// ReturnRequest initiates a merchandise return.
type ReturnRequest struct {
	RegisterID            string              `json:"register_id"`
	OriginalTransactionID *uuid.UUID          `json:"original_transaction_id,omitempty"`
	CustomerID            *uuid.UUID          `json:"customer_id,omitempty"`
	RefundMethod          string              `json:"refund_method"` // CASH | CARD | ACCOUNT
	Reason                string              `json:"reason,omitempty"`
	GatewayTxID           string              `json:"gateway_tx_id,omitempty"` // original card tx to reverse
	Lines                 []ReturnLineRequest `json:"lines"`
}

// ReturnSale records a merchandise return: it restocks the sellable lines,
// refunds via the chosen method, and books the GL reversal of the sale. Cash
// and card refunds unwind against Cash (DR Revenue / CR Cash); account refunds
// issue store credit (DR Revenue / CR AR) and lower the customer's balance.
//
// Ordering mirrors CompleteTransaction: the card reversal (slow, external, not
// transactional) happens BEFORE the DB transaction; restock + persistence
// commit together; GL posting is best-effort AFTER commit so a ledger hiccup
// never unwinds a refund the customer already received.
func (s *Service) ReturnSale(ctx context.Context, cashierID uuid.UUID, req ReturnRequest) (*POSReturn, error) {
	if req.RegisterID == "" {
		return nil, fmt.Errorf("register_id is required")
	}
	if len(req.Lines) == 0 {
		return nil, fmt.Errorf("a return needs at least one line")
	}
	method := ReturnRefundMethod(strings.ToUpper(strings.TrimSpace(req.RefundMethod)))
	if method == "" {
		method = RefundCash
	}
	switch method {
	case RefundCash, RefundCard, RefundAccount:
	default:
		return nil, fmt.Errorf("invalid refund_method %q (want CASH, CARD, or ACCOUNT)", req.RefundMethod)
	}
	if method == RefundAccount && req.CustomerID == nil {
		return nil, fmt.Errorf("ACCOUNT refund requires a customer on the return")
	}

	// Build lines + subtotal.
	lines := make([]POSReturnLine, 0, len(req.Lines))
	taxItems := make([]POSLineItem, 0, len(req.Lines))
	var subtotal int64
	for _, l := range req.Lines {
		if l.Quantity <= 0 {
			return nil, fmt.Errorf("return quantity must be positive (product %s)", l.ProductID)
		}
		unit := int64(l.UnitPrice*100.0 + 0.5)
		lineTotal := int64(math.Round(float64(unit) * l.Quantity))
		restock := true
		if l.Restock != nil {
			restock = *l.Restock
		}
		uom := l.UOM
		if uom == "" {
			uom = "EA"
		}
		lines = append(lines, POSReturnLine{
			ProductID: l.ProductID, Description: l.Description, Quantity: l.Quantity,
			UOM: uom, UnitPrice: unit, LineTotal: lineTotal, Restock: restock,
		})
		taxItems = append(taxItems, POSLineItem{
			ProductID: l.ProductID, Description: l.Description, Quantity: l.Quantity, LineTotal: lineTotal,
		})
		subtotal += lineTotal
	}
	if subtotal <= 0 {
		return nil, fmt.Errorf("return total must be positive")
	}

	// Resolve the register's branch (for tax and stamping); best-effort.
	branchID, _ := s.repo.GetRegisterBranch(ctx, req.RegisterID)

	// Tax mirrors the sale path so a full return refunds the tax the sale
	// charged (same exemption-aware, branch-rate calculation).
	taxTmp := &POSTransaction{CustomerID: req.CustomerID, Subtotal: subtotal}
	if branchID != nil {
		taxTmp.BranchID = *branchID
	}
	taxAmount := s.calculateTax(ctx, taxTmp, taxItems)
	total := subtotal + taxAmount

	// Attach the register's open drawer so cash refunds reconcile against it.
	var tillSessionID *uuid.UUID
	if sess, err := s.repo.GetOpenTillSession(ctx, req.RegisterID); err == nil && sess != nil {
		tillSessionID = &sess.ID
	}

	ret := &POSReturn{
		RegisterID:            req.RegisterID,
		TillSessionID:         tillSessionID,
		OriginalTransactionID: req.OriginalTransactionID,
		CustomerID:            req.CustomerID,
		BranchID:              branchID,
		CashierID:             cashierID,
		Subtotal:              subtotal,
		TaxAmount:             taxAmount,
		Total:                 total,
		RefundMethod:          string(method),
		Reason:                req.Reason,
		Status:                "COMPLETED",
		Lines:                 lines,
	}

	// Card reversal is external and non-transactional — do it before the DB
	// transaction so a decline aborts cleanly with nothing persisted.
	if method == RefundCard && req.GatewayTxID != "" {
		if s.gateway == nil {
			return nil, fmt.Errorf("card refund requested but no terminal gateway is configured on this register")
		}
		res, err := s.gateway.Refund(ctx, req.GatewayTxID, total)
		if err != nil {
			return nil, fmt.Errorf("card refund failed: %w", err)
		}
		if res.Status != payment.GatewayStatusRefunded && res.Status != payment.GatewayStatusApproved {
			return nil, fmt.Errorf("card refund not accepted (%s)", res.Status)
		}
	}

	// Persist the return + restock sellable lines in one transaction.
	if err := s.db.RunInTx(ctx, func(ctx context.Context) error {
		if err := s.repo.CreateReturn(ctx, ret); err != nil {
			return err
		}
		for _, l := range ret.Lines {
			if !l.Restock {
				continue
			}
			if err := s.inventorySvc.AdjustStock(ctx, inventory.StockAdjustmentRequest{
				ProductID:  l.ProductID,
				LocationID: nil,
				Quantity:   l.Quantity, // positive delta — goods come back
				IsDelta:    true,
				Reason:     "POS return " + ret.ID.String(),
			}); err != nil {
				return fmt.Errorf("restock failed for product %s: %w", l.ProductID, err)
			}
		}
		return nil
	}); err != nil {
		return nil, err
	}

	// Post-commit GL (best-effort — a refunded customer must not be blocked by
	// a ledger hiccup; a failure is logged for manual reconciliation).
	if s.invoiceSvc != nil && total > 0 {
		if method == RefundAccount {
			if glID, err := s.invoiceSvc.PostAccountReturnToLedger(ctx, *ret.CustomerID, ret.ID, total); err != nil {
				s.logger.Error("CRITICAL: POS account return booked no ledger — reconcile manually",
					"return", ret.ID, "customer", *ret.CustomerID, "amount_cents", total, "error", err)
			} else {
				s.linkReturnGL(ctx, ret, glID)
			}
		} else { // CASH, CARD — both settle against the cash bucket in v1
			if glID, err := s.invoiceSvc.PostCashReturnToGL(ctx, ret.ID.String(), total); err != nil {
				s.logger.Error("failed to post POS cash return to GL", "return", ret.ID, "amount_cents", total, "error", err)
			} else {
				s.linkReturnGL(ctx, ret, glID)
			}
		}
	}

	if s.auditLog != nil {
		s.auditLog.Log(ctx, audit.Entry{
			Action:     "pos.return.completed",
			EntityType: "pos_return",
			EntityID:   ret.ID,
			Changes: map[string]interface{}{
				"register_id":   ret.RegisterID,
				"refund_method": ret.RefundMethod,
				"total_cents":   ret.Total,
				"customer_id":   ret.CustomerID,
				"line_count":    len(ret.Lines),
			},
		})
	}
	s.logger.Info("POS return completed", "id", ret.ID, "register", ret.RegisterID, "method", ret.RefundMethod, "total_cents", ret.Total)
	return ret, nil
}

// linkReturnGL records the return's reversal entry back onto the return row.
func (s *Service) linkReturnGL(ctx context.Context, ret *POSReturn, glID uuid.UUID) {
	if glID == uuid.Nil {
		return
	}
	if err := s.repo.SetReturnGLEntry(ctx, ret.ID, glID); err != nil {
		s.logger.Error("return posted to GL but link update failed", "return", ret.ID, "gl_entry_id", glID, "error", err)
		return
	}
	ret.GLEntryID = &glID
}

// GetReturn returns a full return with its lines.
func (s *Service) GetReturn(ctx context.Context, id uuid.UUID) (*POSReturn, error) {
	return s.repo.GetReturn(ctx, id)
}

// ListReturns lists returns for a register on a date (both optional).
func (s *Service) ListReturns(ctx context.Context, registerID string, date time.Time) ([]POSReturn, error) {
	return s.repo.ListReturns(ctx, registerID, date)
}
