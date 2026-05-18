package delivery

import (
	"context"
	"testing"
	"time"

	"github.com/google/uuid"
)

type MockRepository struct {
	routes []Route
}

func (m *MockRepository) CreateVehicle(ctx context.Context, v *Vehicle) error { return nil }
func (m *MockRepository) ListVehicles(ctx context.Context) ([]Vehicle, error) { return nil, nil }
func (m *MockRepository) GetVehicle(ctx context.Context, id uuid.UUID) (*Vehicle, error) {
	return nil, nil
}
func (m *MockRepository) UpdateVehicle(ctx context.Context, id uuid.UUID, v *Vehicle) error {
	return nil
}
func (m *MockRepository) DeleteVehicle(ctx context.Context, id uuid.UUID) error { return nil }
func (m *MockRepository) CreateDriver(ctx context.Context, d *Driver) error     { return nil }
func (m *MockRepository) GetDriver(ctx context.Context, id uuid.UUID) (*Driver, error) {
	return nil, nil
}
func (m *MockRepository) ListDrivers(ctx context.Context) ([]Driver, error) { return nil, nil }
func (m *MockRepository) UpdateDriver(ctx context.Context, id uuid.UUID, d *Driver) error {
	return nil
}
// F-01: Missing DeleteDriver stub caused go vet to fail
func (m *MockRepository) DeleteDriver(ctx context.Context, id uuid.UUID) error { return nil }

func (m *MockRepository) CreateRoute(ctx context.Context, r *Route) error { return nil }
func (m *MockRepository) GetRoute(ctx context.Context, id uuid.UUID) (*Route, error) {
	return nil, nil
}
func (m *MockRepository) ListRoutes(ctx context.Context, date *time.Time, driverID *uuid.UUID) ([]Route, error) {
	var results []Route
	for _, r := range m.routes {
		if driverID != nil && r.DriverID != *driverID {
			continue
		}
		// Basic date matching mock - assuming exact match for test
		if date != nil {
			// simplified for mock
		}
		results = append(results, r)
	}
	return results, nil
}
func (m *MockRepository) UpdateRouteStatus(ctx context.Context, id uuid.UUID, status RouteStatus) error {
	return nil
}

func (m *MockRepository) CreateDelivery(ctx context.Context, d *Delivery) error { return nil }
func (m *MockRepository) GetDelivery(ctx context.Context, id uuid.UUID) (*Delivery, error) {
	return nil, nil
}
func (m *MockRepository) ListDeliveriesByRoute(ctx context.Context, routeID uuid.UUID) ([]Delivery, error) {
	return nil, nil
}
func (m *MockRepository) UpdateDeliveryStatus(ctx context.Context, id uuid.UUID, status DeliveryStatus, pod *PODUpdate) error {
	return nil
}
func (m *MockRepository) ReorderRouteDeliveries(ctx context.Context, routeID uuid.UUID, deliveryIDs []uuid.UUID) error {
	return nil
}

func (m *MockRepository) GetRouteLoadWeight(ctx context.Context, routeID uuid.UUID) (float64, error) {
	return 0, nil
}

func (m *MockRepository) GetOrderEstimatedWeight(ctx context.Context, orderID uuid.UUID) (float64, error) {
	return 0, nil
}

func (m *MockRepository) SetVehiclePhoto(ctx context.Context, id uuid.UUID, url string) error {
	return nil
}
func (m *MockRepository) SetDriverPhoto(ctx context.Context, id uuid.UUID, url string) error {
	return nil
}
func (m *MockRepository) SavePODPhoto(ctx context.Context, photo *PODPhoto) error { return nil }
func (m *MockRepository) GetPODPhotos(ctx context.Context, deliveryID uuid.UUID) ([]PODPhoto, error) {
	return nil, nil
}

func TestReorderStops(t *testing.T) {
	svc := NewService(&MockRepository{})
	err := svc.ReorderStops(context.Background(), uuid.New(), []uuid.UUID{uuid.New(), uuid.New()})
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
}

func TestListRoutes_FilterByDriver(t *testing.T) {
	driver1 := uuid.New()
	driver2 := uuid.New()

	mockRepo := &MockRepository{
		routes: []Route{
			{ID: uuid.New(), DriverID: driver1, Notes: asPtr("Route 1")},
			{ID: uuid.New(), DriverID: driver2, Notes: asPtr("Route 2")},
			{ID: uuid.New(), DriverID: driver1, Notes: asPtr("Route 3")},
		},
	}

	svc := NewService(mockRepo)

	// Filter by Driver 1
	routes, err := svc.ListRoutes(context.Background(), nil, &driver1)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	if len(routes) != 2 {
		t.Errorf("expected 2 routes, got %d", len(routes))
	}

	for _, r := range routes {
		if r.DriverID != driver1 {
			t.Errorf("expected driver %s, got %s", driver1, r.DriverID)
		}
	}

	// Filter by Driver 2
	routes2, err := svc.ListRoutes(context.Background(), nil, &driver2)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if len(routes2) != 1 {
		t.Errorf("expected 1 route, got %d", len(routes2))
	}
}

func TestCompleteDelivery_Validation(t *testing.T) {
	svc := NewService(&MockRepository{})
	id := uuid.New()

	// Case 1: Delivered without POD - Should Fail
	req := UpdateDeliveryStatusRequest{
		Status: DeliveryStatusDelivered,
	}
	err := svc.CompleteDelivery(context.Background(), id, req)
	if err == nil {
		t.Error("expected error for Delivered status without POD info")
	}

	// Case 2: Delivered with POD - Should Pass
	proof := "http://example.com/sig.png"
	signedBy := "John Doe"
	reqValid := UpdateDeliveryStatusRequest{
		Status:      DeliveryStatusDelivered,
		PODProofURL: &proof,
		PODSignedBy: &signedBy,
	}
	err = svc.CompleteDelivery(context.Background(), id, reqValid)
	if err != nil {
		t.Errorf("unexpected error: %v", err)
	}

	// Case 3: Failed status - Should pass without POD
	reqFailed := UpdateDeliveryStatusRequest{
		Status: DeliveryStatusFailed,
	}
	err = svc.CompleteDelivery(context.Background(), id, reqFailed)
	if err != nil {
		t.Errorf("unexpected error: %v", err)
	}
}

func asPtr(s string) *string {
	return &s
}
