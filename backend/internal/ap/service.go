package ap

import (
	"context"
	"fmt"
	"log/slog"
	"time"

	"github.com/gablelbm/gable/internal/gl"
	"github.com/google/uuid"
)

// Database interface for transaction support.
type Database interface {
	RunInTx(ctx context.Context, fn func(ctx context.Context) error) error
}

// Service handles AP business logic.
type Service struct {
	db     Database
	repo   Repository
	glSvc  *gl.Service
	logger *slog.Logger
}

// NewService creates a new AP service.
func NewService(db Database, repo Repository, glSvc *gl.Service, logger *slog.Logger) *Service {
	return &Service{
		db:     db,
		repo:   repo,
		glSvc:  glSvc,
		logger: logger,
	}
}

// CreateVendorInvoice enters a new vendor bill with line items.
func (s *Service) CreateVendorInvoice(ctx context.Context, req CreateVendorInvoiceRequest) (*VendorInvoice, error) {
	invoiceDate, err := time.Parse("2006-01-02", req.InvoiceDate)
	if err != nil {
		return nil, fmt.Errorf("invalid invoice_date: %w", err)
	}
	dueDate, err := time.Parse("2006-01-02", req.DueDate)
	if err != nil {
		return nil, fmt.Errorf("invalid due_date: %w", err)
	}

	// Calculate subtotal from lines
	var subtotalCents int64
	for _, line := range req.Lines {
		lineTotalCents := int64(line.UnitPrice*line.Quantity*100.0 + 0.5)
		subtotalCents += lineTotalCents
	}
	taxCents := int64(req.TaxAmount*100.0 + 0.5)
	totalCents := subtotalCents + taxCents

	var inv *VendorInvoice
	err = s.db.RunInTx(ctx, func(ctx context.Context) error {
		inv = &VendorInvoice{
			VendorID:      req.VendorID,
			InvoiceNumber: req.InvoiceNumber,
			InvoiceDate:   invoiceDate,
			DueDate:       dueDate,
			POID:          req.POID,
			Subtotal:      subtotalCents,
			TaxAmount:     taxCents,
			Total:         totalCents,
			AmountPaid:    0,
			Status:        InvoiceStatusPending,
			Notes:         req.Notes,
		}

		if err := s.repo.CreateVendorInvoice(ctx, inv); err != nil {
			return err
		}

		// Add line items
		for _, lineReq := range req.Lines {
			unitPriceCents := int64(lineReq.UnitPrice*100.0 + 0.5)
			lineTotalCents := int64(lineReq.UnitPrice*lineReq.Quantity*100.0 + 0.5)

			line := &VendorInvoiceLine{
				InvoiceID:   inv.ID,
				Description: lineReq.Description,
				Quantity:    lineReq.Quantity,
				UnitPrice:   unitPriceCents,
				LineTotal:   lineTotalCents,
				GLAccountID: lineReq.GLAccountID,
			}
			if err := s.repo.AddInvoiceLine(ctx, line); err != nil {
				return err
			}
		}

		s.logger.Info("Vendor invoice created",
			"id", inv.ID,
			"vendor_id", inv.VendorID,
			"total_cents", totalCents,
		)
		return nil
	})

	if err != nil {
		return nil, err
	}
	return inv, nil
}

// ApproveInvoice approves a pending vendor invoice and posts to GL.
func (s *Service) ApproveInvoice(ctx context.Context, invoiceID uuid.UUID, approverID uuid.UUID) (*VendorInvoice, error) {
	inv, err := s.repo.GetVendorInvoice(ctx, invoiceID)
	if err != nil {
		return nil, err
	}

	if inv.Status != InvoiceStatusPending {
		return nil, fmt.Errorf("invoice is not pending (status: %s)", inv.Status)
	}

	err = s.db.RunInTx(ctx, func(txCtx context.Context) error {
		now := time.Now()
		inv.Status = InvoiceStatusApproved
		inv.ApprovedBy = &approverID
		inv.ApprovedAt = &now

		if err := s.repo.UpdateVendorInvoice(txCtx, inv); err != nil {
			return err
		}

		// Post to GL: DR Expense/Inventory, CR Accounts Payable
		var glLines []gl.VendorInvoiceLineDetail
		for _, line := range inv.Lines {
			glLines = append(glLines, gl.VendorInvoiceLineDetail{
				Description: line.Description,
				AmountCents: line.LineTotal,
				GLAccountID: line.GLAccountID,
			})
		}
		if err := s.glSvc.SyncVendorInvoice(txCtx, inv.ID, inv.Total, glLines); err != nil {
			return fmt.Errorf("failed to sync vendor invoice to GL: %w", err)
		}

		return nil
	})
	if err != nil {
		return nil, err
	}

	s.logger.Info("Vendor invoice approved and synced to GL",
		"id", invoiceID,
		"approved_by", approverID,
		"total_cents", inv.Total,
	)

	return inv, nil
}

// PayVendor creates a payment and applies it to invoices.
func (s *Service) PayVendor(ctx context.Context, req CreateAPPaymentRequest) (*APPayment, error) {
	paymentDate, err := time.Parse("2006-01-02", req.PaymentDate)
	if err != nil {
		return nil, fmt.Errorf("invalid payment_date: %w", err)
	}

	amountCents := int64(req.Amount*100.0 + 0.5)

	var pmt *APPayment
	err = s.db.RunInTx(ctx, func(ctx context.Context) error {
		pmt = &APPayment{
			VendorID:    req.VendorID,
			Amount:      amountCents,
			Method:      req.Method,
			CheckNumber: req.CheckNumber,
			Reference:   req.Reference,
			PaymentDate: paymentDate,
			Status:      "COMPLETE",
		}

		if err := s.repo.CreatePayment(ctx, pmt); err != nil {
			return err
		}

		// Apply payment to invoices
		remaining := amountCents
		for _, invID := range req.InvoiceIDs {
			if remaining <= 0 {
				break
			}

			inv, err := s.repo.GetVendorInvoice(ctx, invID)
			if err != nil {
				return fmt.Errorf("invoice %s not found: %w", invID, err)
			}

			outstanding := inv.Total - inv.AmountPaid
			apply := remaining
			if apply > outstanding {
				apply = outstanding
			}

			app := &APPaymentApplication{
				PaymentID: pmt.ID,
				InvoiceID: invID,
				Amount:    apply,
			}
			if err := s.repo.CreatePaymentApplication(ctx, app); err != nil {
				return err
			}

			// Update invoice paid amount
			inv.AmountPaid += apply
			if inv.AmountPaid >= inv.Total {
				inv.Status = InvoiceStatusPaid
			} else {
				inv.Status = InvoiceStatusPartial
			}
			if err := s.repo.UpdateVendorInvoice(ctx, inv); err != nil {
				return err
			}

			remaining -= apply
		}

		// Post to GL: DR Accounts Payable, CR Cash
		if err := s.glSvc.SyncVendorPayment(ctx, pmt.ID, pmt.Amount); err != nil {
			return fmt.Errorf("failed to sync vendor payment to GL: %w", err)
		}

		s.logger.Info("Vendor payment created and synced to GL",
			"id", pmt.ID,
			"vendor_id", pmt.VendorID,
			"amount_cents", amountCents,
			"invoices_paid", len(req.InvoiceIDs),
		)
		return nil
	})

	if err != nil {
		return nil, err
	}
	return pmt, nil
}

// GetVendorInvoice returns a vendor invoice with lines.
func (s *Service) GetVendorInvoice(ctx context.Context, id uuid.UUID) (*VendorInvoice, error) {
	inv, err := s.repo.GetVendorInvoice(ctx, id)
	if err != nil {
		return nil, err
	}
	inv.Lines, _ = s.repo.GetInvoiceLines(ctx, id)
	return inv, nil
}

// ListVendorInvoices returns vendor invoices filtered by vendor and status.
func (s *Service) ListVendorInvoices(ctx context.Context, vendorID *uuid.UUID, status string) ([]VendorInvoice, error) {
	return s.repo.ListVendorInvoices(ctx, vendorID, status)
}

// ListPayments returns AP payments for a vendor.
func (s *Service) ListPayments(ctx context.Context, vendorID *uuid.UUID) ([]APPayment, error) {
	return s.repo.ListPayments(ctx, vendorID)
}

// GetAgingSummary returns the AP aging report by vendor.
func (s *Service) GetAgingSummary(ctx context.Context) ([]APAgingSummary, error) {
	return s.repo.GetAgingSummary(ctx)
}
