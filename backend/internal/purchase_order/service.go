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

type Service struct {
	repo         *Repository
	db           *database.DB
	edi          *edi.Service
	inventorySvc *inventory.Service
	productSvc   *product.Service
	vendorSvc    *vendor.Service
	aiClient     *ai.Client
}

func NewService(repo *Repository, db *database.DB, ediSvc *edi.Service, inventorySvc *inventory.Service, productSvc *product.Service, vendorSvc *vendor.Service) *Service {
	return &Service{repo: repo, db: db, edi: ediSvc, inventorySvc: inventorySvc, productSvc: productSvc, vendorSvc: vendorSvc}
}

// WithAIClient sets the AI client for freight invoice extraction.
func (s *Service) WithAIClient(c *ai.Client) {
	s.aiClient = c
}

// CreateReorders checks for low stock alerts and creates Draft POs automatically
func (s *Service) CreateReorders(ctx context.Context) (int, error) {
	if s.productSvc == nil {
		return 0, fmt.Errorf("product service not configured")
	}

	// 1. Get products below reorder point
	alerts, err := s.productSvc.ListBelowReorder(ctx)
	if err != nil {
		return 0, fmt.Errorf("failed to list reorder alerts: %w", err)
	}

	if len(alerts) == 0 {
		return 0, nil
	}

	// 2. Group by Vendor
	// Map: Vendor Name -> List of alerts
	// Note: If vendor is nil, we group under "Unknown Vendor"
	byVendor := make(map[string][]product.ReorderAlert)

	for _, a := range alerts {
		v := "Unknown Vendor"
		if a.Vendor != nil && *a.Vendor != "" {
			v = *a.Vendor
		}
		byVendor[v] = append(byVendor[v], a)
	}

	createdCount := 0

	// 3. Create PO for each vendor group
	for vendorName, items := range byVendor {
		// Try to find existing vendor ID if possible?
		// MVP: We don't have a Vendors table yet (stored as string on Product).
		// We can't link to a Vendor UUID easily unless we look it up or create one.
		// Current PO structure uses UUID for VendorID.
		// Workaround: Use a placeholder UUID or leave nil?
		// PO struct requires VendorID pointer.
		// For L8, we should probably have a Vendors table, but given current constraints:
		// We will create a new PO with NO Vendor UUID but put the Name in notes?
		// Or try to resolve it.

		// Let's create a "One-Time Vendor" UUID deterministically? Or just random.
		// Since we can't save the string name on PO directly (it has vendor_id uuid).
		// Actually, PO table has vendor_id UUID.
		// And we don't have a Vendor Service.
		// Product has "Vendor" string.
		// This is a data model gap.
		// GAP: Product.Vendor is string, PO.VendorID is UUID.
		// FIX: We need to either create a vendor or find one.
		// Hack for MVP/Sprint 15: Generate a random UUID and store the name in Description/Notes?
		// Or assume there is a Vendor with that Name?
		// Let's create a PO with nil VendorID (if allowed) and add a Note with the Vendor Name.
		// Checks: PO table definition.

		// Checking 011_special_orders_and_po.sql: vendor_id UUID. Nullable?
		// "vendor_id UUID, -- In a real system, REFERENCES vendors(id)"
		// Yes, nullable.

		// So we will leave VendorID nil and put "Auto-Reorder: [VendorName]" in external reference or notes?
		// PO struct doesn't have Notes field?
		// Let's check PurchaseOrder model.

		// Wait, I can't check it right now inside replace_file_content.
		// I'll proceed assuming I can create with nil VendorID.

		po := &PurchaseOrder{
			ID:     uuid.New(),
			Status: StatusDraft,
			// No VendorID for now
		}
		// If we had a way to store the Vendor Name string, we should.
		// For now, we just create the PO. The user can edit the Vendor later.

		if err := s.repo.CreatePO(ctx, po); err != nil {
			return createdCount, fmt.Errorf("failed to create PO for vendor %s: %w", vendorName, err)
		}

		for _, item := range items {
			qty := item.ReorderQty
			if qty <= 0 {
				qty = item.Deficit
			}
			if qty <= 0 {
				qty = 1
			}

			// We need cost. Product model has BasePrice.
			// Ideally we'd have a cost field.
			// We'll use BasePrice * 0.6 as estimate again?
			// Product struct in reorder alert doesn't have BasePrice.
			// We need to fetch product or add Cost to Alert?
			// ReorderAlert struct has limited fields.
			// Let's fetch product to be safe or add BasePrice to Alert in repo?
			// Fetching each product in loop n+1 query?
			// Better: Update ReorderAlert to include Cost/Price.
			// For now, let's just use 0 cost and let user fill it in.

			line := &PurchaseOrderLine{
				ID:          uuid.New(),
				POID:        po.ID,
				ProductID:   &item.ProductID,
				Description: fmt.Sprintf("%s - %s", item.SKU, item.Description),
				Quantity:    qty,
				Cost:        0, // User to fill
			}
			if err := s.repo.AddPOLine(ctx, line); err != nil {
				return createdCount, fmt.Errorf("failed to add PO line: %w", err)
			}
		}
		createdCount++
	}

	return createdCount, nil
}

func (s *Service) ListPOs(ctx context.Context) ([]PurchaseOrder, error) {
	return s.repo.ListPOs(ctx)
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

// CreateManualPOFromHandler is a convenience wrapper using the handler's request types
func (s *Service) CreateManualPOFromHandler(ctx context.Context, vendorID uuid.UUID, lines []CreatePOLineInput) (*PurchaseOrder, error) {
	po := &PurchaseOrder{
		ID:       uuid.New(),
		VendorID: &vendorID,
		Status:   StatusDraft,
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

