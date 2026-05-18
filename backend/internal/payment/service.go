package payment

import (
	"context"
	"fmt"
	"log/slog"
	"time"

	"github.com/gablelbm/gable/internal/account"
	"github.com/gablelbm/gable/internal/invoice"
	"github.com/gablelbm/gable/pkg/audit"
	"github.com/gablelbm/gable/pkg/database"
	"github.com/google/uuid"
)

type Service struct {
	db             *database.DB
	repo           Repository
	invoiceRepo    invoice.Repository
	account        account.Service
	gateway        PaymentGateway // Run Payments (or nil for non-card payments)
	publicKey      string         // Run Payments public key for Runner.js
	brainNotifier  *BrainNotifier // FB Brain financial engine notifier (or nil)
	brainOrgID     string         // Brain org_id for this tenant
	auditLog       *audit.Logger
	logger         *slog.Logger
}

func NewService(db *database.DB, repo Repository, invoiceRepo invoice.Repository, accountService account.Service) *Service {
	return &Service{
		db:          db,
		repo:        repo,
		invoiceRepo: invoiceRepo,
		account:     accountService,
		logger:      slog.Default(),
	}
}

// WithGateway sets the payment gateway (Run Payments) and returns the service for chaining.
func (s *Service) WithGateway(gw PaymentGateway, publicKey string) *Service {
	s.gateway = gw
	s.publicKey = publicKey
	return s
}

// WithBrainNotifier sets the FB Brain financial notifier and returns the service for chaining.
// When set, successfully paid invoices will fire an async notification to Brain's 10bps engine.
func (s *Service) WithBrainNotifier(n *BrainNotifier, orgID string) *Service {
	s.brainNotifier = n
	s.brainOrgID = orgID
	return s
}

// WithAuditLog sets the audit logger for financial operation tracking.
func (s *Service) WithAuditLog(l *audit.Logger) *Service {
	s.auditLog = l
	return s
}

// GetPublicKey returns the Run Payments public key for frontend Runner.js integration.
func (s *Service) GetPublicKey() string {
	return s.publicKey
}

// ProcessPayment handles cash, check, and account payments (non-gateway).
func (s *Service) ProcessPayment(ctx context.Context, invoiceID uuid.UUID, amountCents int64, method PaymentMethod, ref, notes string) (*Payment, error) {
	if amountCents <= 0 {
		return nil, fmt.Errorf("payment amount must be positive")
	}

	var p *Payment

	err := s.db.RunInTx(ctx, func(ctx context.Context) error {
		inv, err := s.invoiceRepo.GetInvoice(ctx, invoiceID)
		if err != nil {
			return fmt.Errorf("invoice not found: %w", err)
		}

		p = &Payment{
			InvoiceID: invoiceID,
			Amount:    amountCents,
			Method:    method,
			Reference: ref,
			Notes:     notes,
		}

		if err := s.repo.CreatePayment(ctx, p); err != nil {
			return err
		}

		_, err = s.account.PostTransaction(ctx, inv.CustomerID, account.TransactionTypePayment, -amountCents, &p.ID, "Payment "+ref)
		if err != nil {
			return fmt.Errorf("failed to post to account ledger: %w", err)
		}

		return s.updateInvoiceStatus(ctx, invoiceID, inv)
	})

	if err != nil {
		return nil, err
	}

	// Audit log: payment processed
	if s.auditLog != nil {
		s.auditLog.Log(ctx, audit.Entry{
			Action:     "payment.processed",
			EntityType: "payment",
			EntityID:   p.ID,
			Changes: map[string]interface{}{
				"invoice_id":   invoiceID,
				"amount_cents": amountCents,
				"method":       string(method),
				"reference":    ref,
			},
		})
	}

	return p, nil
}

// ProcessCardPayment handles card payments through the Run Payments gateway.
func (s *Service) ProcessCardPayment(ctx context.Context, invoiceID uuid.UUID, tokenID string, amountCents int64, notes string) (*Payment, error) {
	if amountCents <= 0 {
		return nil, fmt.Errorf("payment amount must be positive")
	}
	if s.gateway == nil {
		return nil, fmt.Errorf("payment gateway not configured — set RUN_PAYMENTS_API_KEY")
	}

	// 1. Charge through Run Payments
	result, err := s.gateway.Charge(ctx, ChargeRequest{
		TokenID:     tokenID,
		AmountCents: amountCents,
		Currency:    "USD",
		Description: fmt.Sprintf("Invoice %s", invoiceID.String()[:8]),
		InvoiceID:   invoiceID.String(),
	})
	if err != nil {
		return nil, fmt.Errorf("gateway charge failed: %w", err)
	}

	if result.Status == GatewayStatusDeclined {
		return nil, fmt.Errorf("card declined: %s", result.AuthCode)
	}
	if result.Status != GatewayStatusApproved {
		return nil, fmt.Errorf("unexpected gateway status: %s", result.Status)
	}

	// 2. Record payment in our DB within a transaction
	var p *Payment
	err = s.db.RunInTx(ctx, func(ctx context.Context) error {
		inv, err := s.invoiceRepo.GetInvoice(ctx, invoiceID)
		if err != nil {
			return fmt.Errorf("invoice not found: %w", err)
		}

		p = &Payment{
			InvoiceID:     invoiceID,
			Amount:        amountCents,
			Method:        PaymentMethodCard,
			Reference:     fmt.Sprintf("Run:%s", result.TransactionID),
			Notes:         notes,
			GatewayTxID:   result.TransactionID,
			GatewayStatus: string(result.Status),
			TokenID:       tokenID,
			CardLast4:     result.CardLast4,
			CardBrand:     result.CardBrand,
			AuthCode:      result.AuthCode,
		}

		if err := s.repo.CreatePayment(ctx, p); err != nil {
			return err
		}

		_, err = s.account.PostTransaction(ctx, inv.CustomerID, account.TransactionTypePayment, -amountCents, &p.ID, "Card Payment "+result.CardBrand+" ***"+result.CardLast4)
		if err != nil {
			return fmt.Errorf("failed to post to account ledger: %w", err)
		}

		return s.updateInvoiceStatus(ctx, invoiceID, inv)
	})

	if err != nil {
		// Gateway charged but DB failed — log for manual reconciliation
		s.logger.Error("CRITICAL: Gateway charged but DB commit failed",
			"gateway_tx_id", result.TransactionID,
			"invoice_id", invoiceID,
			"amount_cents", amountCents,
			"error", err,
		)
		return nil, fmt.Errorf("payment recorded at gateway but failed to save: %w", err)
	}

	return p, nil
}

// RefundPayment issues a full or partial refund on a completed card payment.
func (s *Service) RefundPayment(ctx context.Context, paymentID uuid.UUID, amountCents int64, reason string) (*Refund, error) {
	if amountCents <= 0 {
		return nil, fmt.Errorf("refund amount must be positive")
	}
	if s.gateway == nil {
		return nil, fmt.Errorf("payment gateway not configured")
	}

	// Look up the original payment to get the gateway transaction ID
	original, err := s.repo.GetPaymentByID(ctx, paymentID)
	if err != nil {
		return nil, fmt.Errorf("original payment not found: %w", err)
	}

	if original.GatewayTxID == "" {
		return nil, fmt.Errorf("payment %s has no gateway transaction — only card payments can be refunded", paymentID)
	}

	if amountCents > original.Amount {
		return nil, fmt.Errorf("refund amount (%d cents) exceeds original payment (%d cents)", amountCents, original.Amount)
	}

	// Process refund through gateway using the original transaction ID
	result, err := s.gateway.Refund(ctx, original.GatewayTxID, amountCents)
	if err != nil {
		return nil, fmt.Errorf("gateway refund failed: %w", err)
	}

	// Persist the refund record within a transaction
	var refund *Refund
	err = s.db.RunInTx(ctx, func(ctx context.Context) error {
		// Look up invoice to get the customer ID for the ledger entry
		inv, err := s.invoiceRepo.GetInvoice(ctx, original.InvoiceID)
		if err != nil {
			return fmt.Errorf("invoice not found for refund ledger: %w", err)
		}

		refund = &Refund{
			PaymentID:       paymentID,
			Amount:          amountCents,
			Reason:          reason,
			GatewayRefundID: result.TransactionID,
			Status:          "COMPLETE",
		}

		if err := s.repo.CreateRefund(ctx, refund); err != nil {
			return fmt.Errorf("failed to persist refund: %w", err)
		}

		// Post the refund as a credit to the customer's account ledger (positive = credit back)
		_, err = s.account.PostTransaction(ctx, inv.CustomerID, account.TransactionTypePayment, amountCents, &refund.ID, "Refund: "+reason)
		if err != nil {
			return fmt.Errorf("failed to post refund to account ledger: %w", err)
		}

		return nil
	})

	if err != nil {
		// Gateway refunded but DB failed — log for manual reconciliation
		s.logger.Error("CRITICAL: Gateway refunded but DB commit failed",
			"gateway_refund_id", result.TransactionID,
			"payment_id", paymentID,
			"amount_cents", amountCents,
			"error", err,
		)
		return nil, fmt.Errorf("refund processed at gateway but failed to save: %w", err)
	}

	// Audit log: refund processed
	if s.auditLog != nil {
		s.auditLog.Log(ctx, audit.Entry{
			Action:     "payment.refunded",
			EntityType: "refund",
			EntityID:   refund.ID,
			Changes: map[string]interface{}{
				"payment_id":   paymentID,
				"amount_cents": amountCents,
				"reason":       reason,
				"gateway_id":   result.TransactionID,
			},
		})
	}

	return refund, nil
}

// GetHistory returns all payments for an invoice.
func (s *Service) GetHistory(ctx context.Context, invoiceID uuid.UUID) ([]Payment, error) {
	return s.repo.GetPaymentsByInvoiceID(ctx, invoiceID)
}

// updateInvoiceStatus recalculates and updates the invoice status based on total payments.
func (s *Service) updateInvoiceStatus(ctx context.Context, invoiceID uuid.UUID, inv *invoice.Invoice) error {
	payments, err := s.repo.GetPaymentsByInvoiceID(ctx, invoiceID)
	if err != nil {
		return fmt.Errorf("failed to get payment history: %w", err)
	}

	var totalPaid int64
	for _, pay := range payments {
		totalPaid += pay.Amount
	}

	if totalPaid >= inv.TotalAmount {
		inv.Status = invoice.InvoiceStatusPaid
		if inv.PaidAt == nil {
			now := time.Now()
			inv.PaidAt = &now
		}
	} else if totalPaid > 0 {
		inv.Status = invoice.InvoiceStatusPartial
		inv.PaidAt = nil
	} else {
		inv.Status = invoice.InvoiceStatusUnpaid
		inv.PaidAt = nil
	}

	if err := s.invoiceRepo.UpdateInvoice(ctx, inv); err != nil {
		return fmt.Errorf("failed to update invoice status: %w", err)
	}

	// Notify FB Brain's financial engine when an invoice is fully paid.
	if inv.Status == invoice.InvoiceStatusPaid && s.brainNotifier != nil {
		s.brainNotifier.notifyInvoicePaid(s.brainOrgID, inv.ID, inv.TotalAmount)
	}

	return nil
}
