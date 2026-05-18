package purchase_order

import (
	"context"
	"fmt"
	"math"
	"net/http"
	"os"
	"path/filepath"
	"strings"
	"time"

	"github.com/gablelbm/gable/internal/ai"
	"github.com/gablelbm/gable/internal/domain"
	"github.com/gablelbm/gable/internal/edi"
	"github.com/gablelbm/gable/internal/inventory"
	"github.com/gablelbm/gable/internal/product"
	"github.com/gablelbm/gable/internal/vendor"
	"github.com/gablelbm/gable/pkg/database"
	"github.com/google/uuid"
)

// salesVelocityLister is the narrow read interface RefreshReorderTargets needs.
// Sized to one method so unit tests can supply a fake without spinning up pgx.
type salesVelocityLister interface {
	ListSalesVelocity(ctx context.Context, lookbackDays int) ([]SalesVelocity, error)
}

type Service struct {
	repo         *Repository
	db           *database.DB
	edi          *edi.Service
	inventorySvc *inventory.Service
	productSvc   *product.Service
	vendorSvc    *vendor.Service
	aiClient     *ai.Client
	velocityRepo salesVelocityLister
}

func NewService(repo *Repository, db *database.DB, ediSvc *edi.Service, inventorySvc *inventory.Service, productSvc *product.Service, vendorSvc *vendor.Service) *Service {
	return &Service{repo: repo, db: db, edi: ediSvc, inventorySvc: inventorySvc, productSvc: productSvc, vendorSvc: vendorSvc}
}

// WithVelocityRepo wires the sales-velocity reader used by both
// RefreshReorderTargets and the recommendation engine.
func (s *Service) WithVelocityRepo(v salesVelocityLister) *Service {
	s.velocityRepo = v
	return s
}

// WithAIClient sets the AI client for freight invoice extraction.
func (s *Service) WithAIClient(c *ai.Client) {
	s.aiClient = c
}

// CreateReorders checks for low stock alerts and creates Draft POs automatically,
// grouped by canonical vendor_id. Existing DRAFT POs for the same vendor are
// reused rather than duplicated. Alerts with no vendor_id are bucketed under a
// single "Unknown Vendor" row (upserted via vendor.EnsureVendorByName) so the
// FK on purchase_orders.vendor_id is always satisfied.
func (s *Service) CreateReorders(ctx context.Context) (int, error) {
	if s.productSvc == nil {
		return 0, fmt.Errorf("product service not configured")
	}
	if s.vendorSvc == nil {
		return 0, fmt.Errorf("vendor service not configured")
	}

	alerts, err := s.productSvc.ListBelowReorder(ctx)
	if err != nil {
		return 0, fmt.Errorf("failed to list reorder alerts: %w", err)
	}
	if len(alerts) == 0 {
		return 0, nil
	}

	// Group by canonical vendor UUID. Alerts with NULL vendor_id are bucketed
	// under a single sentinel "Unknown Vendor" row, upserted lazily.
	resolveUnknown := func() (uuid.UUID, error) {
		v, err := s.vendorSvc.EnsureVendorByName(ctx, "Unknown Vendor")
		if err != nil {
			return uuid.Nil, fmt.Errorf("ensure unknown vendor: %w", err)
		}
		return v.ID, nil
	}
	byVendor, err := groupAlertsByVendor(alerts, resolveUnknown)
	if err != nil {
		return 0, err
	}

	createdCount := 0
	for vendorID, items := range byVendor {
		vid := vendorID // local copy for pointer

		// Reuse an existing DRAFT PO for this vendor if one exists. Note we
		// intentionally do NOT overwrite the source of a reused PO — if an
		// operator manually created a DRAFT for this vendor, it stays MANUAL.
		po, err := s.repo.GetDraftPOByVendor(ctx, &vid)
		if err != nil || po == nil {
			po = &PurchaseOrder{
				ID:       uuid.New(),
				VendorID: &vid,
				Status:   StatusDraft,
				Source:   SourceReorder,
			}
			if err := s.repo.CreatePO(ctx, po); err != nil {
				return createdCount, fmt.Errorf("create PO for vendor %s: %w", vid, err)
			}
			createdCount++
		}

		for _, item := range items {
			qty := item.ReorderQty
			if qty <= 0 {
				qty = item.Deficit
			}
			if qty <= 0 {
				qty = 1
			}

			productID := item.ProductID
			line := &PurchaseOrderLine{
				ID:          uuid.New(),
				POID:        po.ID,
				ProductID:   &productID,
				Description: fmt.Sprintf("%s - %s", item.SKU, item.Description),
				Quantity:    qty,
				Cost:        0, // Cost catalog wiring is a separate backlog item.
			}
			if err := s.repo.AddPOLine(ctx, line); err != nil {
				return createdCount, fmt.Errorf("add PO line: %w", err)
			}
		}
	}

	return createdCount, nil
}

func (s *Service) ListPOs(ctx context.Context) ([]PurchaseOrder, error) {
	return s.repo.ListPOs(ctx)
}

// GetSourceSummary returns PO counts grouped by source. Used by the
// purchasing dashboard's "% replenishments automated" widget.
func (s *Service) GetSourceSummary(ctx context.Context) (map[string]int, error) {
	return s.repo.GetSourceSummary(ctx)
}

func (s *Service) GetPO(ctx context.Context, id uuid.UUID) (*PurchaseOrder, error) {
	return s.repo.GetPO(ctx, id)
}

// CreateManualPO creates a new PO manually (not from a sales order special item)
func (s *Service) CreateManualPO(ctx context.Context, vendorID uuid.UUID, lines []struct {
	ProductID   string
	Description string
	Quantity    float64
	Cost        float64
}) (*PurchaseOrder, error) {
	po := &PurchaseOrder{
		ID:       uuid.New(),
		VendorID: &vendorID,
		Status:   StatusDraft,
		Source:   SourceManual,
	}

	err := s.db.RunInTx(ctx, func(txCtx context.Context) error {
		if err := s.repo.CreatePO(txCtx, po); err != nil {
			return fmt.Errorf("failed to create PO: %w", err)
		}

		for _, l := range lines {
			var prodID *uuid.UUID
			if l.ProductID != "" {
				parsed, err := uuid.Parse(l.ProductID)
				if err == nil {
					prodID = &parsed
				}
			}
			line := &PurchaseOrderLine{
				ID:          uuid.New(),
				POID:        po.ID,
				ProductID:   prodID,
				Description: l.Description,
				Quantity:    l.Quantity,
				Cost:        l.Cost,
			}
			if err := s.repo.AddPOLine(txCtx, line); err != nil {
				return fmt.Errorf("failed to add PO line: %w", err)
			}
			po.Lines = append(po.Lines, *line)
		}
		return nil
	})
	if err != nil {
		return nil, err
	}

	return po, nil
}

// CreateManualPOFromHandler is a convenience wrapper using the handler's request types.
// The source parameter records how the PO got here — the HTTP handler passes
// SourceManual, the A2A receiver passes SourceA2A. An empty source defaults
// to MANUAL at the repository layer.
func (s *Service) CreateManualPOFromHandler(ctx context.Context, vendorID uuid.UUID, lines []CreatePOLineInput, source string) (*PurchaseOrder, error) {
	if source == "" {
		source = SourceManual
	}
	po := &PurchaseOrder{
		ID:       uuid.New(),
		VendorID: &vendorID,
		Status:   StatusDraft,
		Source:   source,
	}

	err := s.db.RunInTx(ctx, func(txCtx context.Context) error {
		if err := s.repo.CreatePO(txCtx, po); err != nil {
			return fmt.Errorf("failed to create PO: %w", err)
		}

		for _, l := range lines {
			var prodID *uuid.UUID
			if l.ProductID != "" {
				parsed, err := uuid.Parse(l.ProductID)
				if err == nil {
					prodID = &parsed
				}
			}
			line := &PurchaseOrderLine{
				ID:          uuid.New(),
				POID:        po.ID,
				ProductID:   prodID,
				Description: l.Description,
				Quantity:    l.Quantity,
				Cost:        l.Cost,
			}
			if err := s.repo.AddPOLine(txCtx, line); err != nil {
				return fmt.Errorf("failed to add PO line: %w", err)
			}
			po.Lines = append(po.Lines, *line)
		}
		return nil
	})
	if err != nil {
		return nil, err
	}

	return po, nil
}

// CreatePOLineInput matches handler request shape
type CreatePOLineInput struct {
	ProductID   string
	Description string
	Quantity    float64
	Cost        float64
}

// CreateFromSOLine creates or updates a DRAFT PO for the vendor of the special order item
func (s *Service) CreateFromSOLine(ctx context.Context, soLineId uuid.UUID, vendorId *uuid.UUID, description string, qty float64, cost float64) error {
	var po *PurchaseOrder
	var err error

	if vendorId != nil {
		po, err = s.repo.GetDraftPOByVendor(ctx, vendorId)
	}

	if po == nil || err != nil {
		newPO := &PurchaseOrder{
			ID:       uuid.New(),
			VendorID: vendorId,
			Status:   StatusDraft,
			Source:   SourceSpecialOrder,
		}
		if err := s.repo.CreatePO(ctx, newPO); err != nil {
			return fmt.Errorf("failed to create PO: %w", err)
		}
		po = newPO
	}

	line := &PurchaseOrderLine{
		ID:             uuid.New(),
		POID:           po.ID,
		Description:    description,
		Quantity:       qty,
		Cost:           cost,
		LinkedSOLineID: &soLineId,
	}

	if err := s.repo.AddPOLine(ctx, line); err != nil {
		return fmt.Errorf("failed to add PO line: %w", err)
	}

	return nil
}

func (s *Service) SubmitPO(ctx context.Context, id uuid.UUID) error {
	po, err := s.repo.GetPO(ctx, id)
	if err != nil {
		return err
	}

	if po.VendorID == nil {
		return fmt.Errorf("cannot submit PO without a vendor")
	}

	if s.edi != nil {
		lines := make([]domain.POlineData, len(po.Lines))
		for i, l := range po.Lines {
			lines[i] = domain.POlineData{
				LineNumber: i + 1,
				Quantity:   l.Quantity,
				Cost:       l.Cost,
				ItemCode:   "UNKNOWN",
			}
		}

		poData := domain.POData{
			ID:       po.ID,
			PONumber: po.ID.String(),
			VendorID: *po.VendorID,
			Lines:    lines,
		}

		if err := s.edi.SendExamplePO(ctx, poData); err != nil {
			return fmt.Errorf("failed to send EDI: %w", err)
		}
	}

	po.Status = StatusSent
	if err := s.repo.UpdatePO(ctx, po); err != nil {
		return err
	}

	// Update Vendor Stats
	if s.vendorSvc != nil && po.VendorID != nil {
		// Calculate stats
		// Lead Time: Now - CreatedAt (days)
		leadTime := time.Since(po.CreatedAt).Hours() / 24.0

		// Fill Rate: Total Received / Total Ordered * 100
		var totalOrdered, totalReceived float64
		for _, l := range po.Lines {
			totalOrdered += l.Quantity
			totalReceived += l.QtyReceived
		}
		fillRate := 0.0
		if totalOrdered > 0 {
			fillRate = (totalReceived / totalOrdered) * 100
		}

		// Spend
		spend := 0.0
		for _, l := range po.Lines {
			spend += l.QtyReceived * l.Cost
		}

		v, err := s.vendorSvc.GetVendor(ctx, *po.VendorID)
		if err == nil && v != nil {
			newLeadTime := (v.AverageLeadTimeDays + leadTime) / 2
			if v.AverageLeadTimeDays == 0 {
				newLeadTime = leadTime
			}

			newFillRate := (v.FillRate + fillRate) / 2
			if v.FillRate == 0 {
				newFillRate = fillRate
			}

			newSpend := v.TotalSpendYTD + spend
			_ = s.vendorSvc.UpdatePerformance(ctx, *po.VendorID, newLeadTime, newFillRate, newSpend)
		}
	}

	return nil
}

// ReceivePO processes goods receipt against a PO, creating inventory entries
func (s *Service) ReceivePO(ctx context.Context, poID uuid.UUID, receivedLines []ReceiveLineInput) error {
	po, err := s.repo.GetPO(ctx, poID)
	if err != nil {
		return fmt.Errorf("PO not found: %w", err)
	}

	if po.Status != StatusSent && po.Status != StatusPartialReceive {
		return fmt.Errorf("PO must be in SENT or PARTIAL status to receive (current: %s)", po.Status)
	}

	lineMap := make(map[uuid.UUID]*PurchaseOrderLine)
	for i := range po.Lines {
		lineMap[po.Lines[i].ID] = &po.Lines[i]
	}

	// Pre-parse and validate all input before starting the transaction
	type parsedLine struct {
		lineID     uuid.UUID
		locationID uuid.UUID
		poLine     *PurchaseOrderLine
		rl         ReceiveLineInput
	}
	var parsed []parsedLine
	for _, rl := range receivedLines {
		lineID, err := uuid.Parse(rl.LineID)
		if err != nil {
			return fmt.Errorf("invalid line_id: %s", rl.LineID)
		}

		locationID, err := uuid.Parse(rl.LocationID)
		if err != nil {
			return fmt.Errorf("invalid location_id: %s", rl.LocationID)
		}

		poLine, ok := lineMap[lineID]
		if !ok {
			return fmt.Errorf("line %s not found on PO %s", rl.LineID, poID)
		}

		parsed = append(parsed, parsedLine{lineID: lineID, locationID: locationID, poLine: poLine, rl: rl})
	}

	return s.db.RunInTx(ctx, func(txCtx context.Context) error {
		allFullyReceived := true
		for _, p := range parsed {
			newQtyReceived := p.poLine.QtyReceived + p.rl.QtyReceived
			if err := s.repo.UpdateLineReceived(txCtx, p.lineID, newQtyReceived); err != nil {
				return fmt.Errorf("failed to update received qty: %w", err)
			}

			// Create inventory if product_id is set
			if p.poLine.ProductID != nil && s.inventorySvc != nil {
				err := s.inventorySvc.AdjustStock(txCtx, inventory.StockAdjustmentRequest{
					ProductID:  *p.poLine.ProductID,
					LocationID: &p.locationID,
					Quantity:   p.rl.QtyReceived,
					IsDelta:    true,
					Reason:     fmt.Sprintf("PO Receipt: %s", poID),
				})
				if err != nil {
					return fmt.Errorf("failed to create inventory for line %s: %w", p.rl.LineID, err)
				}

				// Recalculate Weighted Average Unit Cost
				if s.productSvc != nil {
					prod, err := s.productSvc.GetProduct(txCtx, *p.poLine.ProductID)
					if err == nil && prod != nil {
						currentTotalQty := prod.TotalQuantity
						currentAvgCost := prod.AverageUnitCost
						receivedQty := p.rl.QtyReceived
						poLineCost := p.poLine.Cost

						var newAvgCost float64
						if currentTotalQty <= 0 {
							newAvgCost = poLineCost
						} else {
							newAvgCost = ((currentTotalQty * currentAvgCost) + (receivedQty * poLineCost)) / (currentTotalQty + receivedQty)
						}

						_ = s.productSvc.UpdateAverageCost(txCtx, *p.poLine.ProductID, newAvgCost)
					}
				}
			}

			if newQtyReceived < p.poLine.Quantity {
				allFullyReceived = false
			}
		}

		// Check if any lines not in this receipt are still under-received
		for _, line := range po.Lines {
			found := false
			for _, rl := range receivedLines {
				if rl.LineID == line.ID.String() {
					found = true
					break
				}
			}
			if !found && line.QtyReceived < line.Quantity {
				allFullyReceived = false
			}
		}

		if allFullyReceived {
			po.Status = StatusReceived
		} else {
			po.Status = StatusPartialReceive
		}

		if err := s.repo.UpdatePO(txCtx, po); err != nil {
			return err
		}

		// Update Vendor Stats
		if s.vendorSvc != nil && po.VendorID != nil {
			leadTime := time.Since(po.CreatedAt).Hours() / 24.0

			var totalOrdered, totalReceived float64
			for _, l := range po.Lines {
				totalOrdered += l.Quantity
				totalReceived += l.QtyReceived
			}
			fillRate := 0.0
			if totalOrdered > 0 {
				fillRate = (totalReceived / totalOrdered) * 100
			}

			spend := 0.0
			for _, l := range po.Lines {
				spend += l.QtyReceived * l.Cost
			}

			v, err := s.vendorSvc.GetVendor(txCtx, *po.VendorID)
			if err == nil && v != nil {
				newLeadTime := (v.AverageLeadTimeDays + leadTime) / 2
				if v.AverageLeadTimeDays == 0 {
					newLeadTime = leadTime
				}

				newFillRate := (v.FillRate + fillRate) / 2
				if v.FillRate == 0 {
					newFillRate = fillRate
				}

				newSpend := v.TotalSpendYTD + spend
				_ = s.vendorSvc.UpdatePerformance(txCtx, *po.VendorID, newLeadTime, newFillRate, newSpend)
			}
		}

		return nil
	})
}

// ReceiveLineInput matches handler request shape
type ReceiveLineInput struct {
	LineID      string
	QtyReceived float64
	LocationID  string
}

// UploadFreightInvoice processes a freight invoice file, extracts data via AI,
// computes cost-weighted allocation across PO lines, and returns a preview.
func (s *Service) UploadFreightInvoice(ctx context.Context, poID uuid.UUID, fileBytes []byte, contentType string, filename string) (*FreightUploadResponse, error) {
	po, err := s.repo.GetPO(ctx, poID)
	if err != nil {
		return nil, fmt.Errorf("PO not found: %w", err)
	}

	if po.Status != StatusReceived && po.Status != StatusPartialReceive {
		return nil, fmt.Errorf("PO must be in RECEIVED or PARTIAL status to upload freight (current: %s)", po.Status)
	}

	// Save the file to disk
	ext := strings.ToLower(filepath.Ext(filename))
	if ext == "" {
		ext = ".bin"
	}
	fileID := uuid.New().String()
	dir := filepath.Join("uploads", "freight")
	if err := os.MkdirAll(dir, 0o755); err != nil {
		return nil, fmt.Errorf("failed to create freight upload dir: %w", err)
	}
	savedPath := filepath.Join(dir, fileID+ext)
	if err := os.WriteFile(savedPath, fileBytes, 0o644); err != nil {
		return nil, fmt.Errorf("failed to save freight file: %w", err)
	}

	// Detect content type for AI if needed
	aiContentType := contentType
	if aiContentType == "" || aiContentType == "application/octet-stream" {
		aiContentType = http.DetectContentType(fileBytes)
	}

	// Extract freight data via AI
	var carrierName, invoiceNumber string
	var totalAmountCents int64
	var aiRaw string

	if s.aiClient != nil && s.aiClient.IsConfigured(ctx) {
		result, raw, aiErr := s.aiClient.ExtractFreightInvoice(ctx, fileBytes, aiContentType)
		aiRaw = raw
		if aiErr != nil {
			return nil, fmt.Errorf("AI extraction failed: %w", aiErr)
		}
		if result != nil {
			carrierName = result.CarrierName
			invoiceNumber = result.InvoiceNumber
			totalAmountCents = int64(math.Round(result.TotalAmount * 100))
		}
	} else {
		return nil, fmt.Errorf("AI service not configured — please enter the freight total manually")
	}

	if totalAmountCents <= 0 {
		return nil, fmt.Errorf("could not extract a valid freight amount from the invoice")
	}

	// Compute cost-weighted allocation across PO lines
	var totalReceivedCost float64
	for _, line := range po.Lines {
		totalReceivedCost += line.Cost * line.QtyReceived
	}

	if totalReceivedCost <= 0 {
		return nil, fmt.Errorf("no received line costs to allocate freight against")
	}

	freightChargeID := uuid.New()
	fc := &FreightCharge{
		ID:               freightChargeID,
		POID:             poID,
		FilePath:         savedPath,
		OriginalFilename: filename,
		CarrierName:      carrierName,
		InvoiceNumber:    invoiceNumber,
		TotalAmountCents: totalAmountCents,
		AllocationMethod: "cost_weighted",
		Status:           FreightStatusPending,
		AIRawResponse:    aiRaw,
	}

	if err := s.repo.SaveFreightCharge(ctx, fc); err != nil {
		return nil, fmt.Errorf("failed to save freight charge: %w", err)
	}

	var allocations []FreightAllocation
	var allocatedTotal int64

	for i, line := range po.Lines {
		if line.QtyReceived <= 0 {
			continue
		}

		lineCost := line.Cost * line.QtyReceived
		lineShare := lineCost / totalReceivedCost
		allocCents := int64(math.Round(float64(totalAmountCents) * lineShare))

		// Ensure rounding doesn't lose cents — adjust last allocation
		if i == len(po.Lines)-1 && allocatedTotal+allocCents != totalAmountCents {
			allocCents = totalAmountCents - allocatedTotal
		}

		perUnitCents := int64(0)
		if line.QtyReceived > 0 {
			perUnitCents = int64(math.Round(float64(allocCents) / line.QtyReceived))
		}

		a := FreightAllocation{
			ID:              uuid.New(),
			FreightChargeID: freightChargeID,
			POLineID:        line.ID,
			ProductID:       line.ProductID,
			AllocatedCents:  allocCents,
			PerUnitCents:    perUnitCents,
			Description:     line.Description,
		}
		allocations = append(allocations, a)
		allocatedTotal += allocCents
	}

	if err := s.repo.SaveFreightAllocations(ctx, allocations); err != nil {
		return nil, fmt.Errorf("failed to save freight allocations: %w", err)
	}

	fc.Allocations = allocations
	return &FreightUploadResponse{
		FreightCharge: *fc,
		Allocations:   allocations,
	}, nil
}

// ApplyFreightCharge applies a pending freight charge to product average costs.
func (s *Service) ApplyFreightCharge(ctx context.Context, poID uuid.UUID, freightChargeID uuid.UUID) error {
	fc, err := s.repo.GetFreightCharge(ctx, freightChargeID)
	if err != nil {
		return fmt.Errorf("freight charge not found: %w", err)
	}

	if fc.POID != poID {
		return fmt.Errorf("freight charge does not belong to this PO")
	}

	if fc.Status != FreightStatusPending {
		return fmt.Errorf("freight charge already applied")
	}

	allocations, err := s.repo.GetFreightAllocations(ctx, freightChargeID)
	if err != nil {
		return fmt.Errorf("failed to load allocations: %w", err)
	}

	// Load PO to get received quantities per line
	po, err := s.repo.GetPO(ctx, poID)
	if err != nil {
		return fmt.Errorf("PO not found: %w", err)
	}

	lineMap := make(map[uuid.UUID]*PurchaseOrderLine)
	for i := range po.Lines {
		lineMap[po.Lines[i].ID] = &po.Lines[i]
	}

	if s.productSvc != nil {
		for _, alloc := range allocations {
			if alloc.ProductID == nil {
				continue
			}

			poLine, ok := lineMap[alloc.POLineID]
			if !ok || poLine.QtyReceived <= 0 {
				continue
			}

			prod, err := s.productSvc.GetProduct(ctx, *alloc.ProductID)
			if err != nil || prod == nil {
				continue
			}

			freightPerUnit := float64(alloc.PerUnitCents) / 100.0
			currentAvg := prod.AverageUnitCost
			totalQty := prod.TotalQuantity
			qtyReceived := poLine.QtyReceived

			if totalQty <= 0 {
				continue
			}

			// Add the freight cost into the weighted average
			newAvg := currentAvg + (qtyReceived*freightPerUnit)/totalQty
			_ = s.productSvc.UpdateAverageCost(ctx, *alloc.ProductID, newAvg)
		}
	}

	return s.repo.UpdateFreightStatus(ctx, freightChargeID, FreightStatusApplied)
}

// GetFreightCharges returns all freight charges for a PO with their allocations.
func (s *Service) GetFreightCharges(ctx context.Context, poID uuid.UUID) ([]FreightCharge, error) {
	charges, err := s.repo.GetFreightCharges(ctx, poID)
	if err != nil {
		return nil, err
	}

	for i := range charges {
		allocs, err := s.repo.GetFreightAllocations(ctx, charges[i].ID)
		if err != nil {
			return nil, err
		}
		charges[i].Allocations = allocs
	}

	return charges, nil
}


// ReorderTargetProposal records the before/after of a single product's
// recomputed reorder target. Surfaced in dry-run mode so an operator can
// inspect proposed changes before flipping reorder.dry_run to false.
type ReorderTargetProposal struct {
	ProductID uuid.UUID `json:"product_id"`
	SKU       string    `json:"sku"`
	OldPoint  float64   `json:"old_point"`
	NewPoint  float64   `json:"new_point"`
	OldQty    float64   `json:"old_qty"`
	NewQty    float64   `json:"new_qty"`
	AvgDaily  float64   `json:"avg_daily"`
}

// RefreshResult is the JSON shape returned by RefreshReorderTargets and the
// manual-trigger HTTP endpoint.
type RefreshResult struct {
	DryRun          bool                    `json:"dry_run"`
	ProductsUpdated int                     `json:"products_updated"`
	ProductsSkipped int                     `json:"products_skipped"`
	Proposals       []ReorderTargetProposal `json:"proposals"`
}

// maxProposalsPreview caps the dry-run response so a large catalog doesn't
// produce a megabyte response body. The aggregate counts are still accurate.
const maxProposalsPreview = 100

// RefreshReorderTargets recomputes reorder_point and reorder_qty for every
// product with non-zero velocity over the configured lookback window. If
// dryRun is true, no writes happen; the caller gets a preview of what would
// change. Skips products with zero velocity (we don't auto-zero a slow
// seasonal SKU mid-summer). Falls back to DefaultLeadTimeDays when neither
// the product nor its vendor exposes a lead time.
//
// Formula:
//
//	avg_daily      = units_sold_in_lookback / lookback_days
//	reorder_point  = ceil(avg_daily * lead_time_days * 1.5)   // 1.5 safety
//	reorder_qty    = ceil(avg_daily * 30)                     // 30-day cover
func (s *Service) RefreshReorderTargets(ctx context.Context, dryRun bool, lookbackDays int) (*RefreshResult, error) {
	if s.velocityRepo == nil {
		return nil, fmt.Errorf("velocity repository not configured")
	}
	if s.productSvc == nil {
		return nil, fmt.Errorf("product service not configured")
	}
	if lookbackDays <= 0 {
		lookbackDays = DefaultRecommendationConfig().LookbackDays
	}
	leadTime := DefaultRecommendationConfig().DefaultLeadTimeDays

	velocity, err := s.velocityRepo.ListSalesVelocity(ctx, lookbackDays)
	if err != nil {
		return nil, fmt.Errorf("list sales velocity: %w", err)
	}
	velByProduct := make(map[uuid.UUID]float64, len(velocity))
	for _, v := range velocity {
		velByProduct[v.ProductID] = v.UnitsSold
	}

	products, err := s.productSvc.ListProducts(ctx)
	if err != nil {
		return nil, fmt.Errorf("list products: %w", err)
	}

	res := &RefreshResult{DryRun: dryRun}
	lookbackFloat := float64(lookbackDays)
	for _, p := range products {
		units, ok := velByProduct[p.ID]
		if !ok || units <= 0 {
			res.ProductsSkipped++
			continue
		}
		avgDaily := units / lookbackFloat
		newPoint := math.Ceil(avgDaily * leadTime * 1.5)
		newQty := math.Ceil(avgDaily * 30)
		if newPoint == p.ReorderPoint && newQty == p.ReorderQty {
			res.ProductsSkipped++
			continue
		}

		if len(res.Proposals) < maxProposalsPreview {
			res.Proposals = append(res.Proposals, ReorderTargetProposal{
				ProductID: p.ID,
				SKU:       p.SKU,
				OldPoint:  p.ReorderPoint,
				NewPoint:  newPoint,
				OldQty:    p.ReorderQty,
				NewQty:    newQty,
				AvgDaily:  math.Round(avgDaily*100) / 100,
			})
		}

		if !dryRun {
			if err := s.productSvc.UpdateReorderTargets(ctx, p.ID, newPoint, newQty); err != nil {
				return nil, fmt.Errorf("update reorder targets for %s: %w", p.ID, err)
			}
		}
		res.ProductsUpdated++
	}
	return res, nil
}

// ListReorderRuns surfaces the last N rows from reorder_runs for the
// operator dashboard.
func (s *Service) ListReorderRuns(ctx context.Context, limit int) ([]ReorderRun, error) {
	return s.repo.ListReorderRuns(ctx, limit)
}

// StartReorderRun and FinishReorderRun are exposed for the scheduler to
// instrument each cron tick. Direct repository pass-throughs.
func (s *Service) StartReorderRun(ctx context.Context, job string, dryRun bool) (uuid.UUID, error) {
	return s.repo.StartReorderRun(ctx, job, dryRun)
}

func (s *Service) FinishReorderRun(ctx context.Context, id uuid.UUID, status string, posCreated, productsUpdated, productsSkipped int, errMsg string) error {
	return s.repo.FinishReorderRun(ctx, id, status, posCreated, productsUpdated, productsSkipped, errMsg)
}

// groupAlertsByVendor partitions reorder alerts by canonical vendor_id. Any
// alert whose VendorID is nil is bucketed under a single sentinel vendor
// resolved lazily via resolveUnknown (typically vendor.EnsureVendorByName).
// Extracted as a pure helper so the grouping logic can be unit-tested without
// a database connection.
func groupAlertsByVendor(
	alerts []product.ReorderAlert,
	resolveUnknown func() (uuid.UUID, error),
) (map[uuid.UUID][]product.ReorderAlert, error) {
	byVendor := make(map[uuid.UUID][]product.ReorderAlert)
	var unknownID *uuid.UUID
	for _, a := range alerts {
		if a.VendorID != nil {
			byVendor[*a.VendorID] = append(byVendor[*a.VendorID], a)
			continue
		}
		if unknownID == nil {
			id, err := resolveUnknown()
			if err != nil {
				return nil, err
			}
			unknownID = &id
		}
		byVendor[*unknownID] = append(byVendor[*unknownID], a)
	}
	return byVendor, nil
}
