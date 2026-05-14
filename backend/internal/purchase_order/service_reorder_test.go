package purchase_order

import (
	"fmt"
	"testing"

	"github.com/gablelbm/gable/internal/product"
	"github.com/google/uuid"
)

// TestGroupAlertsByVendor exercises the core grouping invariant used by
// CreateReorders: alerts collapse onto their canonical vendor_id, and any
// alert with a nil vendor_id falls into a single sentinel "Unknown Vendor"
// bucket whose UUID is resolved lazily exactly once.
func TestGroupAlertsByVendor(t *testing.T) {
	vendorA := uuid.New()
	vendorB := uuid.New()
	unknownID := uuid.New()

	alerts := []product.ReorderAlert{
		{ProductID: uuid.New(), SKU: "A1", VendorID: &vendorA},
		{ProductID: uuid.New(), SKU: "A2", VendorID: &vendorA},
		{ProductID: uuid.New(), SKU: "B1", VendorID: &vendorB},
		{ProductID: uuid.New(), SKU: "U1", VendorID: nil},
		{ProductID: uuid.New(), SKU: "U2", VendorID: nil},
	}

	resolveCalls := 0
	groups, err := groupAlertsByVendor(alerts, func() (uuid.UUID, error) {
		resolveCalls++
		return unknownID, nil
	})
	if err != nil {
		t.Fatalf("groupAlertsByVendor returned error: %v", err)
	}

	if resolveCalls != 1 {
		t.Errorf("resolveUnknown should be called exactly once, got %d calls", resolveCalls)
	}
	if got := len(groups); got != 3 {
		t.Errorf("expected 3 vendor groups, got %d", got)
	}
	if got := len(groups[vendorA]); got != 2 {
		t.Errorf("vendor A should have 2 alerts, got %d", got)
	}
	if got := len(groups[vendorB]); got != 1 {
		t.Errorf("vendor B should have 1 alert, got %d", got)
	}
	if got := len(groups[unknownID]); got != 2 {
		t.Errorf("unknown vendor bucket should have 2 alerts, got %d", got)
	}
}

// TestGroupAlertsByVendorAllKnown verifies that resolveUnknown is never
// invoked when every alert already has a vendor_id — important because the
// real implementation upserts a "Unknown Vendor" row on first call.
func TestGroupAlertsByVendorAllKnown(t *testing.T) {
	vendorA := uuid.New()
	alerts := []product.ReorderAlert{
		{ProductID: uuid.New(), VendorID: &vendorA},
		{ProductID: uuid.New(), VendorID: &vendorA},
	}

	resolveCalls := 0
	groups, err := groupAlertsByVendor(alerts, func() (uuid.UUID, error) {
		resolveCalls++
		return uuid.Nil, fmt.Errorf("should not be called")
	})
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if resolveCalls != 0 {
		t.Errorf("resolveUnknown should not be called when all alerts have vendor_id, got %d", resolveCalls)
	}
	if got := len(groups); got != 1 {
		t.Errorf("expected 1 group, got %d", got)
	}
}

// TestGroupAlertsByVendorResolveError propagates errors from the lazy
// vendor-resolution callback so callers can fail the reorder run cleanly
// rather than producing POs with NULL vendor_id.
func TestGroupAlertsByVendorResolveError(t *testing.T) {
	alerts := []product.ReorderAlert{
		{ProductID: uuid.New(), VendorID: nil},
	}
	_, err := groupAlertsByVendor(alerts, func() (uuid.UUID, error) {
		return uuid.Nil, fmt.Errorf("db unavailable")
	})
	if err == nil {
		t.Fatal("expected error to propagate from resolveUnknown, got nil")
	}
}
