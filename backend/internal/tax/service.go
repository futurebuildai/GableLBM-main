package tax

import (
	"context"
	"fmt"
	"log/slog"
	"math"
	"time"

	"github.com/google/uuid"
)

// TaxCalculator is the interface for tax calculation services.
type TaxCalculator interface {
	// PreviewTax calculates tax without committing (for cart/invoice previews).
	PreviewTax(ctx context.Context, req *TaxPreviewRequest) (*TaxResult, error)
	// CommitTax calculates and commits tax for a finalized transaction.
	CommitTax(ctx context.Context, req *TaxPreviewRequest) (*TaxResult, error)
	// VoidTax voids a previously committed tax document (for returns/cancellations).
	VoidTax(ctx context.Context, documentCode string) error
	// GetExemptions returns all exemptions for a customer.
	GetExemptions(ctx context.Context, customerID uuid.UUID) ([]TaxExemption, error)
	// SaveExemption creates a new tax exemption certificate.
	SaveExemption(ctx context.Context, req *CreateExemptionRequest) (*TaxExemption, error)
	// DeleteExemption removes an exemption by ID.
	DeleteExemption(ctx context.Context, id uuid.UUID) error
}

// Service implements TaxCalculator with Avalara or flat-rate fallback.
type Service struct {
	exemptionRepo ExemptionRepo
	avalara       *AvalaraClient // nil if Avalara is not configured
	companyCode   string
	flatRate      float64 // Fallback flat tax rate (0.0 = no tax)
	logger        *slog.Logger
}

// NewService creates a new tax service.
// If avalaraClient is nil, falls back to flat-rate calculation.
func NewService(exemptionRepo ExemptionRepo, avalaraClient *AvalaraClient, companyCode string, flatRate float64, logger *slog.Logger) *Service {
	return &Service{
		exemptionRepo: exemptionRepo,
		avalara:       avalaraClient,
		companyCode:   companyCode,
		flatRate:      flatRate,
		logger:        logger,
	}
}

func (s *Service) PreviewTax(ctx context.Context, req *TaxPreviewRequest) (*TaxResult, error) {
	// Check for tax exemption
	if req.CustomerID != nil {
		exempt, err := s.isExempt(ctx, *req.CustomerID)
		if err != nil {
			s.logger.Warn("Failed to check exemption, proceeding with tax calculation", "error", err)
		} else if exempt {
			return s.zeroTaxResult(req), nil
		}
	}

	// Use Avalara if configured
	if s.avalara != nil {
		customerCode := "WALKUP"
		if req.CustomerID != nil {
			customerCode = req.CustomerID.String()
		}
		return s.avalara.CalculateTax(ctx, req, customerCode, false)
	}

	// Flat-rate fallback
	return s.flatRateCalc(req), nil
}

func (s *Service) CommitTax(ctx context.Context, req *TaxPreviewRequest) (*TaxResult, error) {
	// Check for tax exemption
	if req.CustomerID != nil {
		exempt, err := s.isExempt(ctx, *req.CustomerID)
		if err != nil {
			s.logger.Warn("Failed to check exemption, proceeding with tax calculation", "error", err)
		} else if exempt {
			return s.zeroTaxResult(req), nil
		}
	}

	// Use Avalara if configured
	if s.avalara != nil {
		customerCode := "WALKUP"
		if req.CustomerID != nil {
			customerCode = req.CustomerID.String()
		}
		return s.avalara.CalculateTax(ctx, req, customerCode, true)
	}

	// Flat-rate fallback — no commit necessary
	return s.flatRateCalc(req), nil
}

func (s *Service) VoidTax(ctx context.Context, documentCode string) error {
	if s.avalara == nil {
		s.logger.Info("VoidTax: no Avalara configured, nothing to void", "document_code", documentCode)
		return nil
	}
	return s.avalara.VoidTransaction(ctx, s.companyCode, documentCode)
}

func (s *Service) GetExemptions(ctx context.Context, customerID uuid.UUID) ([]TaxExemption, error) {
	return s.exemptionRepo.GetByCustomer(ctx, customerID)
}

func (s *Service) SaveExemption(ctx context.Context, req *CreateExemptionRequest) (*TaxExemption, error) {
	ex := &TaxExemption{
		ID:                uuid.New(),
		CustomerID:        req.CustomerID,
		ExemptReason:      req.ExemptReason,
		CertificateNumber: req.CertificateNumber,
		IssuingState:      req.IssuingState,
		IsActive:          true,
	}

	if req.ExpiryDate != nil {
		t, err := time.Parse("2006-01-02", *req.ExpiryDate)
		if err != nil {
			return nil, fmt.Errorf("invalid expiry_date format (expected YYYY-MM-DD): %w", err)
		}
		ex.ExpiryDate = &t
	}

	if err := s.exemptionRepo.Create(ctx, ex); err != nil {
		return nil, err
	}

	s.logger.Info("Tax exemption created",
		"id", ex.ID,
		"customer_id", ex.CustomerID,
		"reason", ex.ExemptReason,
	)

	return ex, nil
}

func (s *Service) DeleteExemption(ctx context.Context, id uuid.UUID) error {
	return s.exemptionRepo.Delete(ctx, id)
}

// --- Internal helpers ---

func (s *Service) isExempt(ctx context.Context, customerID uuid.UUID) (bool, error) {
	exemptions, err := s.exemptionRepo.GetActiveByCustomer(ctx, customerID)
	if err != nil {
		return false, err
	}
	return len(exemptions) > 0, nil
}

func (s *Service) zeroTaxResult(req *TaxPreviewRequest) *TaxResult {
	var totalAmount int64
	var lines []TaxLine

	for _, line := range req.Lines {
		totalAmount += line.Amount
		lines = append(lines, TaxLine{
			LineNumber:  line.LineNumber,
			ItemCode:    line.ItemCode,
			Description: line.Description,
			Quantity:    line.Quantity,
			Amount:      line.Amount,
			TaxAmount:   0,
			TaxRate:     0,
			Exempt:      true,
		})
	}

	return &TaxResult{
		TotalAmount: totalAmount,
		TotalTax:    0,
		GrandTotal:  totalAmount,
		Lines:       lines,
		IsEstimate:  true,
	}
}

func (s *Service) flatRateCalc(req *TaxPreviewRequest) *TaxResult {
	var totalAmount, totalTax int64
	var lines []TaxLine

	for _, line := range req.Lines {
		lineTax := int64(math.Round(float64(line.Amount) * s.flatRate))
		totalAmount += line.Amount
		totalTax += lineTax

		lines = append(lines, TaxLine{
			LineNumber:  line.LineNumber,
			ItemCode:    line.ItemCode,
			Description: line.Description,
			Quantity:    line.Quantity,
			Amount:      line.Amount,
			TaxAmount:   lineTax,
			TaxRate:     s.flatRate,
			Exempt:      false,
		})
	}

	return &TaxResult{
		TotalAmount: totalAmount,
		TotalTax:    totalTax,
		GrandTotal:  totalAmount + totalTax,
		Lines:       lines,
		IsEstimate:  true, // Flat rate is always an estimate
	}
}
