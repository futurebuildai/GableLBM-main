package portal

import (
	"context"
	"fmt"

	"github.com/gablelbm/gable/internal/customer"
	"github.com/gablelbm/gable/internal/inventory"
	"github.com/gablelbm/gable/internal/pricing"
	"github.com/gablelbm/gable/internal/product"
	"github.com/google/uuid"
)

// catalogRow is an internal struct for raw DB product rows before enrichment.
type catalogRow struct {
	ID        uuid.UUID
	SKU       string
	Name      string
	Category  string
	Species   string
	Grade     string
	ImageURL  string
	UOM       string
	BasePrice float64
	WeightLbs float64
	UPC       string
	Vendor    string
}

// ListCatalog returns catalog products enriched with customer-specific pricing and availability.
func (s *Service) ListCatalog(ctx context.Context, customerID uuid.UUID, filter CatalogFilter) ([]CatalogProductDTO, error) {
	rows, err := s.repo.ListCatalogProducts(ctx, filter)
	if err != nil {
		return nil, fmt.Errorf("failed to list catalog: %w", err)
	}

	cust, err := s.customerSvc.GetCustomer(ctx, customerID)
	if err != nil {
		s.logger.Warn("Catalog: could not load customer for pricing, using base prices", "customer_id", customerID, "error", err)
		cust = &customer.Customer{ID: customerID}
	}

	products := make([]CatalogProductDTO, 0, len(rows))
	for _, row := range rows {
		dto := CatalogProductDTO{
			ID:        row.ID,
			SKU:       row.SKU,
			Name:      row.Name,
			Category:  row.Category,
			Species:   row.Species,
			Grade:     row.Grade,
			ImageURL:  row.ImageURL,
			UOM:       row.UOM,
			BasePrice: row.BasePrice,
		}

		// Pricing waterfall
		if s.pricingSvc != nil && cust != nil {
			cp, pErr := s.pricingSvc.CalculatePrice(ctx, cust, row.ID, row.BasePrice)
			if pErr == nil {
				dto.CustomerPrice = cp.FinalPrice
				dto.PriceSource = string(cp.Source)
			} else {
				dto.CustomerPrice = row.BasePrice
				dto.PriceSource = "retail"
			}
		} else {
			dto.CustomerPrice = row.BasePrice
			dto.PriceSource = "retail"
		}

		// Inventory availability
		dto.Available = s.getAvailableQty(ctx, row.ID)
		dto.InStock = dto.Available > 0

		products = append(products, dto)
	}

	return products, nil
}

// GetCatalogProduct returns a single product detail with customer pricing and availability.
func (s *Service) GetCatalogProduct(ctx context.Context, customerID, productID uuid.UUID) (*CatalogDetailDTO, error) {
	row, err := s.repo.GetCatalogProduct(ctx, productID)
	if err != nil {
		return nil, fmt.Errorf("product not found: %w", err)
	}

	cust, err := s.customerSvc.GetCustomer(ctx, customerID)
	if err != nil {
		cust = &customer.Customer{ID: customerID}
	}

	dto := &CatalogDetailDTO{
		CatalogProductDTO: CatalogProductDTO{
			ID:        row.ID,
			SKU:       row.SKU,
			Name:      row.Name,
			Category:  row.Category,
			Species:   row.Species,
			Grade:     row.Grade,
			ImageURL:  row.ImageURL,
			UOM:       row.UOM,
			BasePrice: row.BasePrice,
		},
		WeightLbs: row.WeightLbs,
		UPC:       row.UPC,
		Vendor:    row.Vendor,
	}

	// Pricing waterfall
	if s.pricingSvc != nil && cust != nil {
		cp, pErr := s.pricingSvc.CalculatePrice(ctx, cust, row.ID, row.BasePrice)
		if pErr == nil {
			dto.CustomerPrice = cp.FinalPrice
			dto.PriceSource = string(cp.Source)
		} else {
			dto.CustomerPrice = row.BasePrice
			dto.PriceSource = "retail"
		}
	} else {
		dto.CustomerPrice = row.BasePrice
		dto.PriceSource = "retail"
	}

	// Inventory
	dto.Available = s.getAvailableQty(ctx, row.ID)
	dto.InStock = dto.Available > 0

	return dto, nil
}

// getAvailableQty computes total available quantity across all locations.
func (s *Service) getAvailableQty(ctx context.Context, productID uuid.UUID) float64 {
	if s.inventorySvc == nil {
		return 0
	}
	items, err := s.inventorySvc.ListByProduct(ctx, productID.String())
	if err != nil {
		return 0
	}
	var total float64
	for _, item := range items {
		total += item.Quantity - item.Allocated
	}
	if total < 0 {
		return 0
	}
	return total
}

// Ensure imported packages are used.
var (
	_ = (*pricing.Service)(nil)
	_ = (*product.Service)(nil)
	_ = (*inventory.Service)(nil)
)
