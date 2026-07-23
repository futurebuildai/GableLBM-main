package invoice

import (
	"context"
	"fmt"
	"time"

	"github.com/gablelbm/gable/internal/account"
	"github.com/gablelbm/gable/internal/gl"
	"github.com/gablelbm/gable/pkg/audit"
	"github.com/gablelbm/gable/pkg/database"
	"github.com/google/uuid"
)

type Service struct {
	repo     Repository
	gl       *gl.Service
	account  account.Service
	auditLog *audit.Logger
	db       *database.DB
}

func NewService(repo Repository, glService *gl.Service, accountService account.Service, db *database.DB) *Service {
	return &Service{repo: repo, gl: glService, account: accountService, db: db}
}

// WithAuditLog sets the audit logger for financial operation tracking.
func (s *Service) WithAuditLog(l *audit.Logger) *Service {
	s.auditLog = l
	return s
}

// DefaultTaxRate is the default sales tax rate (configurable per jurisdiction)
const DefaultTaxRate = 0.0825 // 8.25%

func (s *Service) CreateInvoice(ctx context.Context, inv *Invoice) error {
	if len(inv.Lines) == 0 {
		return fmt.Errorf("invoice must have lines")
	}
	if inv.Status == "" {
		inv.Status = InvoiceStatusUnpaid
	}

	// C3: Calculate tax if not already set
	if inv.Subtotal == 0 {
		var subtotal int64
		for _, line := range inv.Lines {
			subtotal += int64(float64(line.PriceEach) * line.Quantity)
		}
		inv.Subtotal = subtotal
	}
	// Callers that pre-computed tax (e.g. POS account-charge sales, where the
	// register already ran the exemption-aware calculation) pass TotalAmount
	// set and are honored as-is. Everything else gets branch-rate tax here.
	if inv.TotalAmount == 0 {
		if inv.TaxRate == 0 {
			// Source the rate from the invoice's branch (locations.default_tax_rate),
			// so app-created invoices match the jurisdiction (e.g. 0.12 in BC) instead
			// of the hardcoded DefaultTaxRate fallback. branchID may be nil → the repo
			// falls back to the active/default branch.
			var branchID *uuid.UUID
			if inv.BranchID != uuid.Nil {
				branchID = &inv.BranchID
			}
			if rate, ok := s.repo.GetBranchTaxRate(ctx, branchID); ok {
				inv.TaxRate = rate
			} else {
				inv.TaxRate = DefaultTaxRate
			}
		}
		inv.TaxAmount = int64(float64(inv.Subtotal) * inv.TaxRate)
		inv.TotalAmount = inv.Subtotal + inv.TaxAmount
	}

	// C5: Calculate due date from payment terms
	if inv.PaymentTerms == "" {
		inv.PaymentTerms = TermsNet30
	}
	if inv.DueDate == nil {
		dueDate := calcDueDate(time.Now(), inv.PaymentTerms)
		inv.DueDate = &dueDate
	}

	if err := s.db.RunInTx(ctx, func(txCtx context.Context) error {
		if err := s.repo.CreateInvoice(txCtx, inv); err != nil {
			return err
		}
		return nil
	}); err != nil {
		return err
	}

	// Audit log: invoice created
	if s.auditLog != nil {
		s.auditLog.Log(ctx, audit.Entry{
			Action:     "invoice.created",
			EntityType: "invoice",
			EntityID:   inv.ID,
			Changes: map[string]interface{}{
				"customer_id":  inv.CustomerID,
				"order_id":     inv.OrderID,
				"total_amount": inv.TotalAmount,
				"status":       inv.Status,
			},
		})
	}

	return nil
}

func calcDueDate(from time.Time, terms string) time.Time {
	switch terms {
	case TermsCOD, TermsDueOnReceipt:
		return from
	case TermsNet30:
		return from.AddDate(0, 0, 30)
	case TermsNet60:
		return from.AddDate(0, 0, 60)
	case TermsNet90:
		return from.AddDate(0, 0, 90)
	default:
		return from.AddDate(0, 0, 30)
	}
}

func (s *Service) GetInvoice(ctx context.Context, id uuid.UUID) (*Invoice, error) {
	return s.repo.GetInvoice(ctx, id)
}

func (s *Service) ListInvoices(ctx context.Context) ([]Invoice, error) {
	return s.repo.ListInvoices(ctx)
}

func (s *Service) ListInvoicesPaginated(ctx context.Context, limit, offset int) ([]Invoice, int, error) {
	return s.repo.ListInvoicesPaginated(ctx, limit, offset)
}

func (s *Service) FinalizeInvoice(ctx context.Context, id uuid.UUID) error {
	inv, err := s.repo.GetInvoice(ctx, id)
	if err != nil {
		return err
	}

	return s.db.RunInTx(ctx, func(txCtx context.Context) error {
		// Post to GL
		if err := s.gl.SyncInvoice(txCtx, inv.ID.String(), inv.TotalAmount); err != nil {
			return fmt.Errorf("failed to sync to GL: %w", err)
		}

		// Post to Account Ledger (Debit)
		_, err := s.account.PostTransaction(txCtx, inv.CustomerID, account.TransactionTypeInvoice, inv.TotalAmount, &inv.ID, "Invoice #"+inv.ID.String())
		if err != nil {
			return fmt.Errorf("failed to post to account ledger: %w", err)
		}

		return nil
	})
}

// ExistsInvoiceForOrder reports whether the order already has an invoice.
func (s *Service) ExistsInvoiceForOrder(ctx context.Context, orderID uuid.UUID) (bool, error) {
	return s.repo.ExistsInvoiceForOrder(ctx, orderID)
}

// GetCustomerOpenBalanceCents returns the customer's live outstanding AR balance
// (sum of open invoices), in cents. Use this for credit-limit checks instead of
// the unmaintained customers.balance_due column.
func (s *Service) GetCustomerOpenBalanceCents(ctx context.Context, customerID uuid.UUID) (int64, error) {
	return s.repo.SumOpenBalanceCents(ctx, customerID)
}

// PostInvoiceToLedger posts an already-created invoice to the GL (DR Accounts
// Receivable / CR Sales Revenue) and the customer AR subledger (a debit + a
// customer_transactions row). It is intended to run inside the caller's
// transaction so the invoice, GL entry, and subledger commit atomically — both
// postings are required (the chart of accounts is seeded by migration 025).
// This is the single AR writer for the order-fulfilment path, replacing the old
// raw, pre-tax customers.balance_due bump that left the recorded balance
// disagreeing with the tax-inclusive invoice total.
func (s *Service) PostInvoiceToLedger(ctx context.Context, inv *Invoice) error {
	if s.gl != nil {
		if err := s.gl.SyncInvoice(ctx, inv.ID.String(), inv.TotalAmount); err != nil {
			return fmt.Errorf("failed to post invoice to GL: %w", err)
		}
	}
	if s.account != nil {
		if _, err := s.account.PostTransaction(ctx, inv.CustomerID, account.TransactionTypeInvoice, inv.TotalAmount, &inv.ID, "Invoice #"+inv.ID.String()); err != nil {
			return fmt.Errorf("failed to post invoice to account ledger: %w", err)
		}
	}
	return nil
}

// PostCashSaleToGL posts a POS cash sale to the GL (DR Cash / CR Sales Revenue).
// POS already depends on invoice.Service, so this lets the till book revenue
// without taking a direct GL dependency. Intended to be called best-effort
// AFTER the sale commits (a GL failure must never block a till transaction).
func (s *Service) PostCashSaleToGL(ctx context.Context, posTxID string, amountCents int64) error {
	if s.gl == nil {
		return nil
	}
	return s.gl.SyncCashSale(ctx, posTxID, amountCents)
}

// PostCashReturnToGL posts a POS cash refund to the GL (DR Sales Revenue /
// CR Cash), the exact mirror of PostCashSaleToGL. Lets the till book a refund
// without taking a direct GL dependency; best-effort, called AFTER the return
// commits (a GL hiccup must never block a completed refund). Returns the GL
// entry ID so the return row can link back to its ledger entry (uuid.Nil when
// no GL is wired).
func (s *Service) PostCashReturnToGL(ctx context.Context, returnID string, amountCents int64) (uuid.UUID, error) {
	if s.gl == nil {
		return uuid.Nil, nil
	}
	return s.gl.SyncCashReturn(ctx, returnID, amountCents)
}

// PostAccountReturnToLedger books a POS return refunded as store credit: the
// GL leg (DR Sales Revenue / CR Accounts Receivable) plus a balance-reducing
// subledger entry, the mirror of PostInvoiceToLedger. Store credit lowers what
// the customer owes, so the subledger amount is negative (payment-shaped).
// Best-effort at the POS layer, same policy as PostCashReturnToGL. Returns the
// GL entry ID (uuid.Nil when no GL is wired).
func (s *Service) PostAccountReturnToLedger(ctx context.Context, customerID, returnID uuid.UUID, amountCents int64) (uuid.UUID, error) {
	var glEntryID uuid.UUID
	if s.gl != nil {
		id, err := s.gl.SyncAccountReturn(ctx, returnID.String(), amountCents)
		if err != nil {
			return uuid.Nil, fmt.Errorf("failed to post account return to GL: %w", err)
		}
		glEntryID = id
	}
	if s.account != nil {
		if _, err := s.account.PostTransaction(ctx, customerID, account.TransactionTypeRefund, -amountCents, &returnID, "POS return credit #"+returnID.String()); err != nil {
			return glEntryID, fmt.Errorf("failed to post account return to subledger: %w", err)
		}
	}
	return glEntryID, nil
}

// C2: Credit memo workflow
func (s *Service) CreateCreditMemo(ctx context.Context, customerID uuid.UUID, invoiceID *uuid.UUID, amountCents int64, reason string) (*CreditMemo, error) {
	if amountCents <= 0 {
		return nil, fmt.Errorf("amount_cents must be positive")
	}

	cm := &CreditMemo{
		CustomerID: customerID,
		InvoiceID:  invoiceID,
		Amount:     amountCents,
		Reason:     reason,
		Status:     "PENDING",
	}

	if err := s.repo.CreateCreditMemo(ctx, cm); err != nil {
		return nil, err
	}

	return cm, nil
}

func (s *Service) ApplyCreditMemo(ctx context.Context, memoID uuid.UUID) error {
	// We need to get the memo from the DB. For now, use a simple approach.
	// The caller passes the memo ID; we'll fetch memos by looking up via service.
	// Since we don't have a GetCreditMemo, we'll add a lightweight approach.
	// Actually, let's just post the refund to the account ledger.

	// For the MVP, the handler will pass the credit memo details directly
	return nil
}

func (s *Service) ApplyCreditMemoFull(ctx context.Context, cm *CreditMemo) error {
	now := time.Now()
	cm.Status = "APPLIED"
	cm.AppliedAt = &now

	return s.db.RunInTx(ctx, func(txCtx context.Context) error {
		if err := s.repo.UpdateCreditMemo(txCtx, cm); err != nil {
			return fmt.Errorf("failed to update credit memo: %w", err)
		}

		// Post negative amount (credit) to customer account
		_, err := s.account.PostTransaction(txCtx, cm.CustomerID, account.TransactionTypeRefund, -cm.Amount, &cm.ID, "Credit Memo: "+cm.Reason)
		if err != nil {
			return fmt.Errorf("failed to post credit to account: %w", err)
		}

		return nil
	})
}

// CreateAndApplyCreditMemo atomically creates a credit memo and applies it in a single transaction.
func (s *Service) CreateAndApplyCreditMemo(ctx context.Context, customerID uuid.UUID, invoiceID *uuid.UUID, amountCents int64, reason string) (*CreditMemo, error) {
	if amountCents <= 0 {
		return nil, fmt.Errorf("amount_cents must be positive")
	}

	cm := &CreditMemo{
		CustomerID: customerID,
		InvoiceID:  invoiceID,
		Amount:     amountCents,
		Reason:     reason,
		Status:     "PENDING",
	}

	err := s.db.RunInTx(ctx, func(txCtx context.Context) error {
		if err := s.repo.CreateCreditMemo(txCtx, cm); err != nil {
			return fmt.Errorf("failed to create credit memo: %w", err)
		}

		now := time.Now()
		cm.Status = "APPLIED"
		cm.AppliedAt = &now

		if err := s.repo.UpdateCreditMemo(txCtx, cm); err != nil {
			return fmt.Errorf("failed to update credit memo: %w", err)
		}

		// Post negative amount (credit) to customer account
		_, err := s.account.PostTransaction(txCtx, cm.CustomerID, account.TransactionTypeRefund, -cm.Amount, &cm.ID, "Credit Memo: "+cm.Reason)
		if err != nil {
			return fmt.Errorf("failed to post credit to account: %w", err)
		}

		return nil
	})
	if err != nil {
		return nil, err
	}

	return cm, nil
}

func (s *Service) ListCreditMemos(ctx context.Context, customerID uuid.UUID) ([]CreditMemo, error) {
	return s.repo.ListCreditMemos(ctx, customerID)
}
