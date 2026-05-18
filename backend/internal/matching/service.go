package matching

import (
	"context"
	"fmt"
	"log/slog"
	"math"
	"time"

	"github.com/gablelbm/gable/internal/ap"
	"github.com/gablelbm/gable/internal/purchase_order"
	"github.com/gablelbm/gable/pkg/database"
	"github.com/google/uuid"
)

// Service handles 3-way PO matching business logic.
type Service struct {
	db     *database.DB
	repo   Repository
	poSvc  *purchase_order.Service
	apSvc  *ap.Service
	logger *slog.Logger
}

// NewService creates a new matching service.
func NewService(db *database.DB, repo Repository, poSvc *purchase_order.Service, apSvc *ap.Service, logger *slog.Logger) *Service {
	return &Service{
		db:     db,
		repo:   repo,
		poSvc:  poSvc,
		apSvc:  apSvc,
		logger: logger,
	}
}

// RunMatch executes a 3-way match for a purchase order.
// It compares PO lines (ordered qty + cost) against received qty and vendor invoice lines.
func (s *Service) RunMatch(ctx context.Context, poID uuid.UUID) (*MatchResult, error) {
	// 1. Load PO with lines
	po, err := s.poSvc.GetPO(ctx, poID)
	if err != nil {
		return nil, fmt.Errorf("failed to load PO: %w", err)
	}
	if len(po.Lines) == 0 {
		return nil, fmt.Errorf("PO %s has no lines", poID)
	}

	// 2. Find linked vendor invoice (by po_id on vendor_invoices)
	invoices, err := s.apSvc.ListVendorInvoices(ctx, nil, "")
	if err != nil {
		return nil, fmt.Errorf("failed to list vendor invoices: %w", err)
	}

	var vendorInvoice *ap.VendorInvoice
	for i, inv := range invoices {
		if inv.POID != nil && *inv.POID == poID {
			fullInv, err := s.apSvc.GetVendorInvoice(ctx, inv.ID)
			if err != nil {
				continue
			}
			vendorInvoice = fullInv
			_ = i
			break
		}
	}

	// 3. Load tolerance config
	cfg, err := s.repo.GetConfig(ctx)
	if err != nil {
		// Use defaults if no config found
		cfg = &MatchConfig{
			QtyTolerancePct:    0,
			PriceTolerancePct:  2.0,
			DollarTolerance:    5000, // $50
			AutoApproveOnMatch: true,
		}
	}

	// 4. Check if we already have a match result for this PO — update or create
	var result *MatchResult
	existingResult, err := s.repo.GetMatchResult(ctx, poID)
	if err == nil && existingResult != nil {
		result = existingResult
		// Clear old line details before re-running
		_ = s.repo.DeleteMatchLineDetails(ctx, result.ID)
	} else {
		result = &MatchResult{
			POID:   poID,
			Status: MatchStatusPending,
		}
		if err := s.repo.CreateMatchResult(ctx, result); err != nil {
			return nil, fmt.Errorf("failed to create match result: %w", err)
		}
	}

	if vendorInvoice != nil {
		result.VendorInvoiceID = &vendorInvoice.ID
	}

	// 5. Build invoice line lookup (by index position since we can't match by product)
	invoiceLines := make(map[int]ap.VendorInvoiceLine)
	if vendorInvoice != nil {
		for i, line := range vendorInvoice.Lines {
			invoiceLines[i] = line
		}
	}

	// 6. Run comparison for each PO line
	matchedCount := 0
	exceptionCount := 0

	for i, poLine := range po.Lines {
		detail := MatchLineDetail{
			MatchResultID: result.ID,
			POLineID:      poLine.ID,
			Description:   poLine.Description,
			POQty:         poLine.Quantity,
			ReceivedQty:   poLine.QtyReceived,
			POUnitCost:    int64(poLine.Cost * 100.0),
		}

		// Get corresponding invoice line (matched by position)
		if invLine, ok := invoiceLines[i]; ok {
			detail.InvoicedQty = invLine.Quantity
			detail.InvoiceUnitPrice = invLine.UnitPrice
		}

		// Calculate variances
		detail.QtyVariancePct = calcVariancePct(detail.POQty, detail.ReceivedQty)
		if detail.POUnitCost > 0 {
			detail.PriceVariancePct = calcVariancePctInt(detail.POUnitCost, detail.InvoiceUnitPrice)
		}

		// Determine line status
		qtyOK := math.Abs(detail.QtyVariancePct) <= cfg.QtyTolerancePct
		priceOK := math.Abs(detail.PriceVariancePct) <= cfg.PriceTolerancePct

		// Also check dollar tolerance for price
		priceDiffCents := abs64(detail.POUnitCost - detail.InvoiceUnitPrice)
		if priceDiffCents <= cfg.DollarTolerance {
			priceOK = true
		}

		// If no invoice line exists, it is an exception (unless qty received matches PO)
		hasInvoice := vendorInvoice != nil && i < len(vendorInvoice.Lines)

		if qtyOK && priceOK && hasInvoice {
			detail.LineStatus = MatchStatusMatched
			matchedCount++
		} else {
			detail.LineStatus = MatchStatusException
			exceptionCount++
		}

		if err := s.repo.CreateMatchLineDetail(ctx, &detail); err != nil {
			return nil, fmt.Errorf("failed to save line detail: %w", err)
		}
	}

	// 7. Determine overall status
	now := time.Now()
	result.MatchedAt = &now
	totalLines := len(po.Lines)

	if exceptionCount == 0 && matchedCount == totalLines {
		result.Status = MatchStatusMatched
		result.Notes = fmt.Sprintf("All %d lines matched within tolerance", totalLines)
	} else if matchedCount > 0 {
		result.Status = MatchStatusPartial
		result.Notes = fmt.Sprintf("%d/%d lines matched, %d exceptions", matchedCount, totalLines, exceptionCount)
	} else {
		result.Status = MatchStatusException
		result.Notes = fmt.Sprintf("All %d lines have exceptions", totalLines)
	}

	if err := s.repo.UpdateMatchResult(ctx, result); err != nil {
		return nil, fmt.Errorf("failed to update match result: %w", err)
	}

	// 8. Auto-approve vendor invoice if fully matched
	if result.Status == MatchStatusMatched && cfg.AutoApproveOnMatch && vendorInvoice != nil {
		approverID := uuid.New() // System auto-approve
		_, err := s.apSvc.ApproveInvoice(ctx, vendorInvoice.ID, approverID)
		if err != nil {
			s.logger.Warn("Auto-approve failed after match",
				"invoice_id", vendorInvoice.ID,
				"error", err,
			)
		} else {
			s.logger.Info("Vendor invoice auto-approved via 3-way match",
				"invoice_id", vendorInvoice.ID,
				"po_id", poID,
			)
		}
	}

	// Load line details for response
	result.Lines, _ = s.repo.GetMatchLineDetails(ctx, result.ID)

	s.logger.Info("3-way match completed",
		"po_id", poID,
		"status", result.Status,
		"matched", matchedCount,
		"exceptions", exceptionCount,
	)

	return result, nil
}

// GetMatchResult returns the latest match result for a PO.
func (s *Service) GetMatchResult(ctx context.Context, poID uuid.UUID) (*MatchResult, error) {
	result, err := s.repo.GetMatchResult(ctx, poID)
	if err != nil {
		return nil, err
	}
	result.Lines, _ = s.repo.GetMatchLineDetails(ctx, result.ID)
	return result, nil
}

// ListExceptions returns all match results with exceptions.
func (s *Service) ListExceptions(ctx context.Context) ([]MatchException, error) {
	return s.repo.ListExceptions(ctx)
}

// GetConfig returns the current matching tolerance config.
func (s *Service) GetConfig(ctx context.Context) (*MatchConfig, error) {
	return s.repo.GetConfig(ctx)
}

// UpdateConfig updates matching tolerance settings.
func (s *Service) UpdateConfig(ctx context.Context, req UpdateMatchConfigRequest) (*MatchConfig, error) {
	cfg, err := s.repo.GetConfig(ctx)
	if err != nil {
		return nil, err
	}

	if req.QtyTolerancePct != nil {
		cfg.QtyTolerancePct = *req.QtyTolerancePct
	}
	if req.PriceTolerancePct != nil {
		cfg.PriceTolerancePct = *req.PriceTolerancePct
	}
	if req.DollarTolerance != nil {
		cfg.DollarTolerance = int64(*req.DollarTolerance*100.0 + 0.5)
	}
	if req.AutoApproveOnMatch != nil {
		cfg.AutoApproveOnMatch = *req.AutoApproveOnMatch
	}

	if err := s.repo.UpdateConfig(ctx, cfg); err != nil {
		return nil, err
	}
	return cfg, nil
}

// --- Helpers ---

func calcVariancePct(expected, actual float64) float64 {
	if expected == 0 {
		if actual == 0 {
			return 0
		}
		return 100.0
	}
	return ((actual - expected) / expected) * 100.0
}

func calcVariancePctInt(expected, actual int64) float64 {
	if expected == 0 {
		if actual == 0 {
			return 0
		}
		return 100.0
	}
	return (float64(actual-expected) / float64(expected)) * 100.0
}

func abs64(v int64) int64 {
	if v < 0 {
		return -v
	}
	return v
}
