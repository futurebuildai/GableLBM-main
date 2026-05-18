package product

import (
	"context"
	"fmt"

	"github.com/gablelbm/gable/internal/vendor"
	"github.com/google/uuid"
)

// Service defines the business logic for products
type Service struct {
	repo      Repository
	vendorSvc *vendor.Service // Optional: when set, CreateProduct auto-resolves vendor name -> vendor_id
}

// NewService creates a new Product Service
func NewService(repo Repository) *Service {
	return &Service{repo: repo}
}

// WithVendorService attaches the vendor service so CreateProduct can resolve
// a free-text vendor name to a canonical vendor_id via EnsureVendorByName.
func (s *Service) WithVendorService(v *vendor.Service) *Service {
	s.vendorSvc = v
	return s
}

// CreateProduct creates a new product. If a vendor name is supplied without a
// vendor_id and the vendor service is wired, the vendor row is upserted and
// the resulting UUID is stamped onto the product so the two columns can never
// drift out of sync.
func (s *Service) CreateProduct(ctx context.Context, p *Product) error {
	if p.SKU == "" {
		return fmt.Errorf("sku is required")
	}
	if p.Description == "" {
		return fmt.Errorf("description is required")
	}

	if p.VendorID == nil && p.Vendor != nil && *p.Vendor != "" && s.vendorSvc != nil {
		v, err := s.vendorSvc.EnsureVendorByName(ctx, *p.Vendor)
		if err != nil {
			return fmt.Errorf("resolve vendor: %w", err)
		}
		p.VendorID = &v.ID
	}

	// If vendor_id was supplied but no display name (e.g. dropdown selection),
	// hydrate the display name so the legacy column stays consistent.
	if p.VendorID != nil && (p.Vendor == nil || *p.Vendor == "") && s.vendorSvc != nil {
		v, err := s.vendorSvc.GetVendor(ctx, *p.VendorID)
		if err == nil && v != nil {
			name := v.Name
			p.Vendor = &name
		}
	}

	return s.repo.CreateProduct(ctx, p)
}

// ListProducts returns all products
func (s *Service) ListProducts(ctx context.Context) ([]Product, error) {
	return s.repo.ListProducts(ctx)
}

// ListProductsPaginated returns products with pagination
func (s *Service) ListProductsPaginated(ctx context.Context, limit, offset int) ([]Product, int, error) {
	return s.repo.ListProductsPaginated(ctx, limit, offset)
}

// GetProduct retrieves a product by its ID
func (s *Service) GetProduct(ctx context.Context, id uuid.UUID) (*Product, error) {
	return s.repo.GetProduct(ctx, id)
}

// ListBelowReorder returns products below their reorder point
func (s *Service) ListBelowReorder(ctx context.Context) ([]ReorderAlert, error) {
	return s.repo.ListBelowReorder(ctx)
}

// UpdateAverageCost updates the average unit cost for a product
func (s *Service) UpdateAverageCost(ctx context.Context, id uuid.UUID, avgCost float64) error {
	return s.repo.UpdateAverageCost(ctx, id, avgCost)
}

// UpdateMarginRules updates the target margin and commission rate for a product
func (s *Service) UpdateMarginRules(ctx context.Context, id uuid.UUID, targetMargin float64, commissionRate float64) error {
	return s.repo.UpdateMarginRules(ctx, id, targetMargin, commissionRate)
}

// UpdateReorderTargets writes new reorder_point and reorder_qty for a product.
// Used by the purchase_order package's RefreshReorderTargets job.
func (s *Service) UpdateReorderTargets(ctx context.Context, id uuid.UUID, reorderPoint, reorderQty float64) error {
	return s.repo.UpdateReorderTargets(ctx, id, reorderPoint, reorderQty)
}
