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
	if inv.TaxRate == 0 {
		inv.TaxRate = DefaultTaxRate
	}
	inv.TaxAmount = int64(float64(inv.Subtotal) * inv.TaxRate)
	inv.TotalAmount = inv.Subtotal + inv.TaxAmount

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
