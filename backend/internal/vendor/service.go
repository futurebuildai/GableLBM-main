package vendor

import (
	"context"
	"fmt"

	"github.com/google/uuid"
)

type Service struct {
	repo Repository
}

func NewService(repo Repository) *Service {
	return &Service{repo: repo}
}

func (s *Service) ListVendors(ctx context.Context) ([]Vendor, error) {
	return s.repo.ListVendors(ctx)
}

func (s *Service) GetVendor(ctx context.Context, id uuid.UUID) (*Vendor, error) {
	return s.repo.GetVendor(ctx, id)
}

func (s *Service) CreateVendor(ctx context.Context, req CreateVendorRequest) (*Vendor, error) {
	v := &Vendor{
		Name:         req.Name,
		ContactEmail: req.ContactEmail,
		Phone:        req.Phone,
		PaymentTerms: "Net 30",
	}
	if req.PaymentTerms != nil {
		v.PaymentTerms = *req.PaymentTerms
	}

	if err := s.repo.CreateVendor(ctx, v); err != nil {
		return nil, fmt.Errorf("failed to create vendor: %w", err)
	}
	return v, nil
}

// EnsureVendorByName finds a vendor by name or creates it if it doesn't exist
func (s *Service) EnsureVendorByName(ctx context.Context, name string) (*Vendor, error) {
	v, err := s.repo.GetVendorByName(ctx, name)
	if err != nil {
		return nil, err
	}
	if v != nil {
		return v, nil
	}

	// Create
	newV := &Vendor{
		Name:         name,
		PaymentTerms: "Net 30",
	}
	if err := s.repo.CreateVendor(ctx, newV); err != nil {
		return nil, err
	}
	return newV, nil
}

func (s *Service) UpdatePerformance(ctx context.Context, id uuid.UUID, leadTime float64, fillRate float64, spend float64) error {
	return s.repo.UpdateStats(ctx, id, leadTime, fillRate, spend)
}
