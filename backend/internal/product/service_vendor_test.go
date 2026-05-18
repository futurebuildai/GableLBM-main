package product

import (
	"context"
	"testing"
	"time"

	"github.com/gablelbm/gable/internal/vendor"
	"github.com/google/uuid"
)

// fakeProductRepo is an in-memory product.Repository for unit tests.
type fakeProductRepo struct {
	created []*Product
}

func (f *fakeProductRepo) CreateProduct(_ context.Context, p *Product) error {
	if p.ID == uuid.Nil {
		p.ID = uuid.New()
	}
	now := time.Now()
	p.CreatedAt = now
	p.UpdatedAt = now
	f.created = append(f.created, p)
	return nil
}
func (f *fakeProductRepo) GetProduct(_ context.Context, _ uuid.UUID) (*Product, error) {
	return nil, nil
}
func (f *fakeProductRepo) ListProducts(_ context.Context) ([]Product, error) {
	return nil, nil
}
func (f *fakeProductRepo) ListProductsPaginated(_ context.Context, _, _ int) ([]Product, int, error) {
	return nil, 0, nil
}
func (f *fakeProductRepo) ListBelowReorder(_ context.Context) ([]ReorderAlert, error) {
	return nil, nil
}
func (f *fakeProductRepo) UpdateAverageCost(_ context.Context, _ uuid.UUID, _ float64) error {
	return nil
}
func (f *fakeProductRepo) UpdateMarginRules(_ context.Context, _ uuid.UUID, _ float64, _ float64) error {
	return nil
}
func (f *fakeProductRepo) UpdateReorderTargets(_ context.Context, _ uuid.UUID, _ float64, _ float64) error {
	return nil
}
func (f *fakeProductRepo) UpdateVendor(_ context.Context, _ uuid.UUID, _ *string, _ *uuid.UUID) error {
	return nil
}

// fakeVendorRepo is an in-memory vendor.Repository.
type fakeVendorRepo struct {
	byName map[string]*vendor.Vendor
}

func newFakeVendorRepo() *fakeVendorRepo {
	return &fakeVendorRepo{byName: map[string]*vendor.Vendor{}}
}
func (f *fakeVendorRepo) ListVendors(_ context.Context) ([]vendor.Vendor, error) {
	out := make([]vendor.Vendor, 0, len(f.byName))
	for _, v := range f.byName {
		out = append(out, *v)
	}
	return out, nil
}
func (f *fakeVendorRepo) GetVendor(_ context.Context, id uuid.UUID) (*vendor.Vendor, error) {
	for _, v := range f.byName {
		if v.ID == id {
			return v, nil
		}
	}
	return nil, nil
}
func (f *fakeVendorRepo) CreateVendor(_ context.Context, v *vendor.Vendor) error {
	if v.ID == uuid.Nil {
		v.ID = uuid.New()
	}
	f.byName[v.Name] = v
	return nil
}
func (f *fakeVendorRepo) UpdateStats(_ context.Context, _ uuid.UUID, _, _, _ float64) error {
	return nil
}
func (f *fakeVendorRepo) GetVendorByName(_ context.Context, name string) (*vendor.Vendor, error) {
	if v, ok := f.byName[name]; ok {
		return v, nil
	}
	return nil, nil
}

// TestCreateProductResolvesVendorByName verifies the core invariant that
// guarantees products.vendor (TEXT) and products.vendor_id (UUID) cannot drift:
// when a caller supplies a free-text vendor name without a vendor_id, the
// product service upserts the vendor row and stamps the resulting UUID onto
// the product before persisting.
func TestCreateProductResolvesVendorByName(t *testing.T) {
	prodRepo := &fakeProductRepo{}
	vendorRepo := newFakeVendorRepo()
	vendorSvc := vendor.NewService(vendorRepo)
	svc := NewService(prodRepo).WithVendorService(vendorSvc)

	name := "Weyerhaeuser"
	p := &Product{
		SKU:         "TEST-001",
		Description: "Test product",
		UOMPrimary:  UOM_EA,
		BasePrice:   3.5,
		Vendor:      &name,
	}

	if err := svc.CreateProduct(context.Background(), p); err != nil {
		t.Fatalf("CreateProduct returned error: %v", err)
	}
	if p.VendorID == nil {
		t.Fatalf("expected VendorID to be set after CreateProduct, got nil")
	}
	if v, _ := vendorRepo.GetVendorByName(context.Background(), name); v == nil || v.ID != *p.VendorID {
		t.Fatalf("expected product.VendorID (%v) to match upserted vendor row", p.VendorID)
	}
}

// TestCreateProductHydratesVendorName covers the inverse case: caller submits
// a vendor_id from a dropdown without the display name, and the service
// backfills the name so the legacy column stays consistent.
func TestCreateProductHydratesVendorName(t *testing.T) {
	prodRepo := &fakeProductRepo{}
	vendorRepo := newFakeVendorRepo()
	existingID := uuid.New()
	vendorRepo.byName["Marvin Windows"] = &vendor.Vendor{ID: existingID, Name: "Marvin Windows", PaymentTerms: "Net 30"}

	vendorSvc := vendor.NewService(vendorRepo)
	svc := NewService(prodRepo).WithVendorService(vendorSvc)

	p := &Product{
		SKU:         "TEST-002",
		Description: "Test product",
		UOMPrimary:  UOM_EA,
		BasePrice:   100,
		VendorID:    &existingID,
	}

	if err := svc.CreateProduct(context.Background(), p); err != nil {
		t.Fatalf("CreateProduct returned error: %v", err)
	}
	if p.Vendor == nil || *p.Vendor != "Marvin Windows" {
		t.Fatalf("expected Vendor name to be hydrated to 'Marvin Windows', got %v", p.Vendor)
	}
}

// TestCreateProductWithoutVendorServiceIsBackwardCompatible verifies that
// the WithVendorService dependency is genuinely optional — callers that don't
// wire it can still create products with just a name (legacy behavior).
func TestCreateProductWithoutVendorServiceIsBackwardCompatible(t *testing.T) {
	prodRepo := &fakeProductRepo{}
	svc := NewService(prodRepo) // no WithVendorService

	name := "Legacy Vendor"
	p := &Product{
		SKU:         "TEST-003",
		Description: "Test product",
		UOMPrimary:  UOM_EA,
		BasePrice:   1,
		Vendor:      &name,
	}

	if err := svc.CreateProduct(context.Background(), p); err != nil {
		t.Fatalf("CreateProduct returned error: %v", err)
	}
	if p.VendorID != nil {
		t.Fatalf("expected VendorID to remain nil without vendor service, got %v", p.VendorID)
	}
}
