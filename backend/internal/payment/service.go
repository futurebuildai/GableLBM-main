package payment

import (
	"context"
	"fmt"
	"log/slog"
	"time"

	"github.com/gablelbm/gable/internal/account"
	"github.com/gablelbm/gable/internal/invoice"
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

// GetPublicKey returns the Run Payments public key for frontend Runner.js integration.
func (s *Service) GetPublicKey() string {
	return s.publicKey
}

// ProcessPayment handles cash, check, and account payments (non-gateway).
func (s *Service) ProcessPayment(ctx context.Context, invoiceID uuid.UUID, amount float64, method PaymentMethod, ref, notes string) (*Payment, error) {
	var p *Payment
	amountCents := int64(amount*100.0 + 0.5)

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
	return p, nil
}

// ProcessCardPayment handles card payments through the Run Payments gateway.
func (s *Service) ProcessCardPayment(ctx context.Context, invoiceID uuid.UUID, tokenID string, amount float64, notes string) (*Payment, error) {
	if s.gateway == nil {
		return nil, fmt.Errorf("payment gateway not configured — set RUN_PAYMENTS_API_KEY")
	}

	amountCents := int64(amount*100.0 + 0.5)

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
func (s *Service) RefundPayment(ctx context.Context, paymentID uuid.UUID, amount float64, reason string) (*Refund, error) {
	if s.gateway == nil {
		return nil, fmt.Errorf("payment gateway not configured")
	}

	amountCents := int64(amount*100.0 + 0.5)

	// Get the original payment
	payments, err := s.repo.GetPaymentsByInvoiceID(ctx, uuid.Nil) // We need GetPaymentByID
	_ = payments                                                  // TODO: implement GetPaymentByID in repository
	_ = err

	// For now, we need the gateway tx ID — this will be enhanced when we add GetPaymentByID
	// Placeholder: process refund through gateway
	result, err := s.gateway.Refund(ctx, "", amountCents) // TODO: pass real gateway_tx_id
	if err != nil {
		return nil, fmt.Errorf("gateway refund failed: %w", err)
	}

	refund := &Refund{
		ID:              uuid.New(),
		PaymentID:       paymentID,
		Amount:          amountCents,
		Reason:          reason,
		GatewayRefundID: result.TransactionID,
		Status:          "COMPLETE",
		CreatedAt:       time.Now(),
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
