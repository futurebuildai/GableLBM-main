package edi

import (
	"encoding/csv"
	"fmt"
	"io"
	"strconv"
	"strings"
	"time"

	"log/slog"
)

// BuyingGroupService handles EDI 832 (Price/Sales Catalog) and 846 (Inventory Inquiry)
// document processing for buying group integrations.
type BuyingGroupService struct {
	logger  *slog.Logger
	catalog []SupplierCatalogEntry
}

// SupplierCatalogEntry represents a single item from a supplier's price catalog.
type SupplierCatalogEntry struct {
	VendorName    string    `json:"vendor_name"`
	SKU           string    `json:"sku"`
	VendorSKU     string    `json:"vendor_sku"`
	Description   string    `json:"description"`
	UnitPrice     float64   `json:"unit_price"`
	UOM           string    `json:"uom"`
	EffectiveDate time.Time `json:"effective_date"`
	ExpiryDate    time.Time `json:"expiry_date,omitempty"`
	MinOrderQty   float64   `json:"min_order_qty"`
	PackSize      int       `json:"pack_size"`
}

// PriceComparison compares current cost with supplier catalog pricing.
type PriceComparison struct {
	SKU           string  `json:"sku"`
	ProductName   string  `json:"product_name"`
	CurrentCost   float64 `json:"current_cost"`
	CatalogPrice  float64 `json:"catalog_price"`
	Savings       float64 `json:"savings"`
	SavingsPct    float64 `json:"savings_pct"`
	VendorName    string  `json:"vendor_name"`
	CatalogDate   string  `json:"catalog_date"`
	IsBetterPrice bool    `json:"is_better_price"`
}

// InventoryInquiryResult represents parsed EDI 846 inventory data.
type InventoryInquiryResult struct {
	VendorName   string  `json:"vendor_name"`
	VendorSKU    string  `json:"vendor_sku"`
	Description  string  `json:"description"`
	QtyAvailable float64 `json:"qty_available"`
	UOM          string  `json:"uom"`
	LeadTimeDays int     `json:"lead_time_days"`
	AsOfDate     string  `json:"as_of_date"`
}

// CatalogSyncResult summarizes a catalog import operation.
type CatalogSyncResult struct {
	VendorName    string `json:"vendor_name"`
	ItemsImported int    `json:"items_imported"`
	ItemsUpdated  int    `json:"items_updated"`
	ItemsSkipped  int    `json:"items_skipped"`
	Errors        int    `json:"errors"`
	SyncedAt      string `json:"synced_at"`
}

// NewBuyingGroupService creates a new buying group EDI service.
func NewBuyingGroupService(logger *slog.Logger) *BuyingGroupService {
	return &BuyingGroupService{
		logger:  logger,
		catalog: make([]SupplierCatalogEntry, 0),
	}
}

// Parse832Catalog parses an EDI 832 Price/Sales Catalog document.
// EDI 832 contains supplier pricing information in X12 segment format.
func (s *BuyingGroupService) Parse832Catalog(data string) ([]SupplierCatalogEntry, error) {
	segments := strings.Split(data, "~")
	var entries []SupplierCatalogEntry
	var currentEntry *SupplierCatalogEntry
	vendorName := ""

	for _, seg := range segments {
		seg = strings.TrimSpace(seg)
		if seg == "" {
			continue
		}
		elements := strings.Split(seg, "*")
		if len(elements) == 0 {
			continue
		}

		switch elements[0] {
		case "N1":
			// N1*SU*VendorName — Supplier name segment
			if len(elements) >= 3 && elements[1] == "SU" {
				vendorName = elements[2]
			}

		case "LIN":
			// LIN*1*VP*VENDOR-SKU*SK*OUR-SKU — Line item identification
			if currentEntry != nil {
				entries = append(entries, *currentEntry)
			}
			currentEntry = &SupplierCatalogEntry{
				VendorName:    vendorName,
				EffectiveDate: time.Now(),
				MinOrderQty:   1,
				PackSize:      1,
			}
			for i := 1; i < len(elements)-1; i += 2 {
				qualifier := elements[i]
				value := ""
				if i+1 < len(elements) {
					value = elements[i+1]
				}
				switch qualifier {
				case "VP":
					currentEntry.VendorSKU = value
				case "SK":
					currentEntry.SKU = value
				}
			}

		case "PID":
			// PID*F****Description — Product description
			if currentEntry != nil && len(elements) >= 5 {
				currentEntry.Description = elements[4]
			}

		case "CTP":
			// CTP*RS*RES*12.50*1*EA — Pricing information
			if currentEntry != nil && len(elements) >= 4 {
				price, err := strconv.ParseFloat(elements[3], 64)
				if err == nil {
					currentEntry.UnitPrice = price
				}
				if len(elements) >= 6 {
					currentEntry.UOM = elements[5]
				}
			}

		case "DTM":
			// DTM*196*20260101 — Effective date
			if currentEntry != nil && len(elements) >= 3 {
				if t, err := time.Parse("20060102", elements[2]); err == nil {
					switch elements[1] {
					case "196":
						currentEntry.EffectiveDate = t
					case "197":
						currentEntry.ExpiryDate = t
					}
				}
			}
		}
	}

	// Don't forget the last entry
	if currentEntry != nil {
		entries = append(entries, *currentEntry)
	}

	s.logger.Info("Parsed EDI 832 catalog", "vendor", vendorName, "item_count", len(entries))
	return entries, nil
}

// ParseCSVCatalog parses a CSV supplier price list.
// Expected columns: vendor_sku, sku, description, unit_price, uom, min_order_qty
func (s *BuyingGroupService) ParseCSVCatalog(data string, vendorName string) ([]SupplierCatalogEntry, error) {
	reader := csv.NewReader(strings.NewReader(data))
	var entries []SupplierCatalogEntry

	// Read header
	header, err := reader.Read()
	if err != nil {
		return nil, fmt.Errorf("failed to read CSV header: %w", err)
	}

	// Build column index map
	colIdx := make(map[string]int)
	for i, col := range header {
		colIdx[strings.ToLower(strings.TrimSpace(col))] = i
	}

	for {
		record, err := reader.Read()
		if err == io.EOF {
			break
		}
		if err != nil {
			continue // Skip malformed rows
		}

		entry := SupplierCatalogEntry{
			VendorName:    vendorName,
			EffectiveDate: time.Now(),
			MinOrderQty:   1,
			PackSize:      1,
		}

		if idx, ok := colIdx["vendor_sku"]; ok && idx < len(record) {
			entry.VendorSKU = strings.TrimSpace(record[idx])
		}
		if idx, ok := colIdx["sku"]; ok && idx < len(record) {
			entry.SKU = strings.TrimSpace(record[idx])
		}
		if idx, ok := colIdx["description"]; ok && idx < len(record) {
			entry.Description = strings.TrimSpace(record[idx])
		}
		if idx, ok := colIdx["unit_price"]; ok && idx < len(record) {
			if price, err := strconv.ParseFloat(strings.TrimSpace(record[idx]), 64); err == nil {
				entry.UnitPrice = price
			}
		}
		if idx, ok := colIdx["uom"]; ok && idx < len(record) {
			entry.UOM = strings.TrimSpace(record[idx])
		}
		if idx, ok := colIdx["min_order_qty"]; ok && idx < len(record) {
			if qty, err := strconv.ParseFloat(strings.TrimSpace(record[idx]), 64); err == nil {
				entry.MinOrderQty = qty
			}
		}

		entries = append(entries, entry)
	}

	s.logger.Info("Parsed CSV catalog", "vendor", vendorName, "item_count", len(entries))
	return entries, nil
}

// Parse846Inquiry parses an EDI 846 Inventory Inquiry/Advice document.
func (s *BuyingGroupService) Parse846Inquiry(data string) ([]InventoryInquiryResult, error) {
	segments := strings.Split(data, "~")
	var results []InventoryInquiryResult
	var current *InventoryInquiryResult
	vendorName := ""

	for _, seg := range segments {
		seg = strings.TrimSpace(seg)
		if seg == "" {
			continue
		}
		elements := strings.Split(seg, "*")
		if len(elements) == 0 {
			continue
		}

		switch elements[0] {
		case "N1":
			if len(elements) >= 3 && elements[1] == "SU" {
				vendorName = elements[2]
			}

		case "LIN":
			if current != nil {
				results = append(results, *current)
			}
			current = &InventoryInquiryResult{
				VendorName: vendorName,
				AsOfDate:   time.Now().Format("2006-01-02"),
			}
			for i := 1; i < len(elements)-1; i += 2 {
				if elements[i] == "VP" && i+1 < len(elements) {
					current.VendorSKU = elements[i+1]
				}
			}

		case "QTY":
			// QTY*33*500*EA — Quantity available
			if current != nil && len(elements) >= 3 {
				if qty, err := strconv.ParseFloat(elements[2], 64); err == nil {
					current.QtyAvailable = qty
				}
				if len(elements) >= 4 {
					current.UOM = elements[3]
				}
			}

		case "PID":
			if current != nil && len(elements) >= 5 {
				current.Description = elements[4]
			}

		case "LDT":
			// LDT*AF*7*DA — Lead time
			if current != nil && len(elements) >= 3 {
				if days, err := strconv.Atoi(elements[2]); err == nil {
					current.LeadTimeDays = days
				}
			}
		}
	}

	if current != nil {
		results = append(results, *current)
	}

	s.logger.Info("Parsed EDI 846 inquiry", "vendor", vendorName, "item_count", len(results))
	return results, nil
}

// ImportCatalog stores parsed catalog entries in the in-memory catalog.
// In production, this would persist to a database table.
func (s *BuyingGroupService) ImportCatalog(entries []SupplierCatalogEntry) *CatalogSyncResult {
	result := &CatalogSyncResult{
		SyncedAt: time.Now().Format(time.RFC3339),
	}

	if len(entries) > 0 {
		result.VendorName = entries[0].VendorName
	}

	for _, entry := range entries {
		if entry.SKU == "" && entry.VendorSKU == "" {
			result.ItemsSkipped++
			continue
		}

		// Check for existing entry and update or add
		found := false
		for i, existing := range s.catalog {
			if existing.VendorSKU == entry.VendorSKU && existing.VendorName == entry.VendorName {
				s.catalog[i] = entry
				result.ItemsUpdated++
				found = true
				break
			}
		}
		if !found {
			s.catalog = append(s.catalog, entry)
			result.ItemsImported++
		}
	}

	s.logger.Info("Catalog imported",
		"vendor", result.VendorName,
		"imported", result.ItemsImported,
		"updated", result.ItemsUpdated,
		"skipped", result.ItemsSkipped,
	)

	return result
}

// ComparePrices compares current product costs against the supplier catalog.
func (s *BuyingGroupService) ComparePrices(sku string, currentCost float64, productName string) []PriceComparison {
	var comparisons []PriceComparison

	for _, entry := range s.catalog {
		if entry.SKU != sku && entry.VendorSKU != sku {
			continue
		}

		savings := currentCost - entry.UnitPrice
		savingsPct := 0.0
		if currentCost > 0 {
			savingsPct = (savings / currentCost) * 100
		}

		comparisons = append(comparisons, PriceComparison{
			SKU:           sku,
			ProductName:   productName,
			CurrentCost:   currentCost,
			CatalogPrice:  entry.UnitPrice,
			Savings:       savings,
			SavingsPct:    savingsPct,
			VendorName:    entry.VendorName,
			CatalogDate:   entry.EffectiveDate.Format("2006-01-02"),
			IsBetterPrice: savings > 0,
		})
	}

	return comparisons
}

// GetCatalog returns all loaded catalog entries.
func (s *BuyingGroupService) GetCatalog() []SupplierCatalogEntry {
	return s.catalog
}

// SyncSupplierPricing is a placeholder for scheduled supplier pricing sync.
// In production, this would fetch from configured FTP/API endpoints.
func (s *BuyingGroupService) SyncSupplierPricing() error {
	s.logger.Info("Supplier pricing sync triggered (stub - configure FTP/API endpoints for production)")
	return nil
}
