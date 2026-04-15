package product

import (
	"context"
	"fmt"

	"github.com/google/uuid"
)

// Service defines the business logic for products
type Service struct {
	repo Repository
}

// NewService creates a new Product Service
func NewService(repo Repository) *Service {
	return &Service{repo: repo}
}

// CreateProduct creates a new product
func (s *Service) CreateProduct(ctx context.Context, p *Product) error {
	// TODO: Add UOM validation here if needed
	if p.SKU == "" {
		return fmt.Errorf("sku is required")
	}
	if p.Description == "" {
		return fmt.Errorf("description is required")
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
