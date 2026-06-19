package delivery

import (
	"context"
	"encoding/json"
	"io"
	"log/slog"
	"net/http"
	"net/http/httptest"
	"strings"
	"sync/atomic"
	"testing"
	"time"

	"github.com/google/uuid"
)

type MockRepository struct {
	routes []Route

	// Configurable inputs for the OptimizeRoute path.
	deliveries   []Delivery
	branchID     uuid.UUID
	branchOrigin *BranchOrigin
	orderAddrs   map[uuid.UUID]string

	// Captured writes for assertions.
	reorderedIDs   []uuid.UUID
	etas           map[uuid.UUID]time.Time
	setLatLng      map[uuid.UUID]LatLng
	setBranch      map[uuid.UUID]LatLng
	setBranchCalls int
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
	return m.deliveries, nil
}
func (m *MockRepository) UpdateDeliveryStatus(ctx context.Context, id uuid.UUID, status DeliveryStatus, pod *PODUpdate) error {
	return nil
}
func (m *MockRepository) ReorderRouteDeliveries(ctx context.Context, routeID uuid.UUID, deliveryIDs []uuid.UUID) error {
	m.reorderedIDs = deliveryIDs
	return nil
}

func (m *MockRepository) GetRouteLoadWeight(ctx context.Context, routeID uuid.UUID) (float64, error) {
	return 0, nil
}

func (m *MockRepository) GetOrderEstimatedWeight(ctx context.Context, orderID uuid.UUID) (float64, error) {
	return 0, nil
}

func (m *MockRepository) GetRouteBranchID(ctx context.Context, routeID uuid.UUID) (uuid.UUID, error) {
	return m.branchID, nil
}
func (m *MockRepository) GetBranchOrigin(ctx context.Context, branchID uuid.UUID) (*BranchOrigin, error) {
	if m.branchOrigin != nil {
		return m.branchOrigin, nil
	}
	return &BranchOrigin{}, nil
}
func (m *MockRepository) SetBranchLatLng(ctx context.Context, branchID uuid.UUID, lat, lng float64) error {
	if m.setBranch == nil {
		m.setBranch = map[uuid.UUID]LatLng{}
	}
	m.setBranch[branchID] = LatLng{Lat: lat, Lng: lng}
	m.setBranchCalls++
	return nil
}
func (m *MockRepository) GetOrderDeliveryAddress(ctx context.Context, orderID uuid.UUID) (string, error) {
	return m.orderAddrs[orderID], nil
}
func (m *MockRepository) SetDeliveryLatLng(ctx context.Context, deliveryID uuid.UUID, lat, lng float64) error {
	if m.setLatLng == nil {
		m.setLatLng = map[uuid.UUID]LatLng{}
	}
	m.setLatLng[deliveryID] = LatLng{Lat: lat, Lng: lng}
	return nil
}
func (m *MockRepository) SetDeliveryETA(ctx context.Context, deliveryID uuid.UUID, eta time.Time) error {
	if m.etas == nil {
		m.etas = map[uuid.UUID]time.Time{}
	}
	m.etas[deliveryID] = eta
	return nil
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

func fptr(f float64) *float64 { return &f }

func discardLogger() *slog.Logger { return slog.New(slog.NewTextHandler(io.Discard, nil)) }

func equalIDs(a, b []uuid.UUID) bool {
	if len(a) != len(b) {
		return false
	}
	for i := range a {
		if a[i] != b[i] {
			return false
		}
	}
	return true
}

// TestOptimizeRoute_IndexAlignmentAndETA exercises the full service path on the
// keyed (ORS) branch and guards the plan's #1 hazard: when a stop is excluded
// for missing coordinates, the optimized order must remap to the *correct*
// deliveries and ETAs must land on the right rows (not shift by the dropped
// index). It also confirms the branch origin is resolved from the repo and
// encoded as [lng,lat].
func TestOptimizeRoute_IndexAlignmentAndETA(t *testing.T) {
	bodyCh := make(chan orsOptimizationRequest, 1)
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		body, _ := io.ReadAll(r.Body)
		var req orsOptimizationRequest
		_ = json.Unmarshal(body, &req)
		bodyCh <- req
		io.WriteString(w, vroomResponse) // optimized order: job 1, then job 0
	}))
	defer srv.Close()

	// A and C are already geocoded; B has nil coords and no address, so on the
	// keyed path it geocodes to nothing and is excluded from optimization — the
	// exact situation that used to desync the indices.
	dA := Delivery{ID: uuid.New(), OrderID: uuid.New(), Latitude: fptr(49.10), Longitude: fptr(-119.10)}
	dB := Delivery{ID: uuid.New(), OrderID: uuid.New()}
	dC := Delivery{ID: uuid.New(), OrderID: uuid.New(), Latitude: fptr(49.30), Longitude: fptr(-119.30)}

	repo := &MockRepository{
		deliveries:   []Delivery{dA, dB, dC},
		branchOrigin: &BranchOrigin{Latitude: fptr(49.0), Longitude: fptr(-119.0)},
	}
	svc := NewService(repo)
	svc.WithRouting(NewORSClient("k", srv.URL, "driving-hgv", discardLogger()), discardLogger())

	if _, err := svc.OptimizeRoute(context.Background(), uuid.New()); err != nil {
		t.Fatalf("OptimizeRoute: %v", err)
	}
	gotBody := <-bodyCh

	// Branch origin resolved from the repo, encoded [lng,lat].
	if len(gotBody.Vehicles) != 1 || gotBody.Vehicles[0].Start != [2]float64{-119.0, 49.0} {
		t.Errorf("vehicle start = %+v; want branch origin [lng,lat] [-119,49]", gotBody.Vehicles)
	}
	// Only A and C submitted (B excluded for lack of coords).
	if len(gotBody.Jobs) != 2 {
		t.Fatalf("want 2 jobs (B excluded), got %d", len(gotBody.Jobs))
	}

	// Index-desync fix: order [1,0] over stops [A,C] -> C then A, then the
	// excluded B appended last. Must not reorder the wrong rows.
	wantOrder := []uuid.UUID{dC.ID, dA.ID, dB.ID}
	if !equalIDs(repo.reorderedIDs, wantOrder) {
		t.Errorf("reorderedIDs = %v; want [C,A,B] = %v", repo.reorderedIDs, wantOrder)
	}
	// B stays uncoordinated on the keyed path (no address → no fake coords).
	if _, ok := repo.setLatLng[dB.ID]; ok {
		t.Errorf("B should remain uncoordinated on the keyed path (no address)")
	}
	// ETAs land on the correct deliveries and never on the excluded stop.
	etaC, okC := repo.etas[dC.ID]
	etaA, okA := repo.etas[dA.ID]
	if !okC || !okA {
		t.Fatalf("expected ETAs for C and A; got C=%v A=%v", okC, okA)
	}
	if _, ok := repo.etas[dB.ID]; ok {
		t.Errorf("excluded stop B must not get an ETA")
	}
	// C is visited first (arrival 600s), A second (arrival 1500s): A's ETA is later.
	if !etaA.After(etaC) {
		t.Errorf("ETA ordering wrong: A (visited 2nd) = %v should be after C (1st) = %v", etaA, etaC)
	}
}

// TestOptimizeRoute_BranchGeocodeBackfill exercises the lazy branch-origin
// backfill path the index-alignment test skips (it pre-stores coords): a branch
// with an address but no coordinates is geocoded once, the result is written
// back un-swapped, and that geocoded origin is what the optimizer receives.
func TestOptimizeRoute_BranchGeocodeBackfill(t *testing.T) {
	branchID := uuid.New()
	bodyCh := make(chan orsOptimizationRequest, 1)
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if strings.HasPrefix(r.URL.Path, "/geocode") {
			io.WriteString(w, `{"features":[{"geometry":{"coordinates":[-119.5,49.9]},"properties":{"confidence":0.95,"match_type":"exact","label":"branch"}}]}`)
			return
		}
		body, _ := io.ReadAll(r.Body)
		var req orsOptimizationRequest
		_ = json.Unmarshal(body, &req)
		bodyCh <- req
		io.WriteString(w, vroomResponse)
	}))
	defer srv.Close()

	// Stops already have coords (so only the branch needs geocoding).
	dA := Delivery{ID: uuid.New(), OrderID: uuid.New(), Latitude: fptr(49.10), Longitude: fptr(-119.10)}
	dB := Delivery{ID: uuid.New(), OrderID: uuid.New(), Latitude: fptr(49.30), Longitude: fptr(-119.30)}
	repo := &MockRepository{
		deliveries:   []Delivery{dA, dB},
		branchID:     branchID,
		branchOrigin: &BranchOrigin{BranchID: branchID, Address: "123 Branch St"}, // no coords → lazy geocode
	}
	svc := NewService(repo)
	svc.WithRouting(NewORSClient("k", srv.URL, "driving-hgv", discardLogger()), discardLogger())

	if _, err := svc.OptimizeRoute(context.Background(), uuid.New()); err != nil {
		t.Fatalf("OptimizeRoute: %v", err)
	}
	gotBody := <-bodyCh

	// (a) backfill persisted with un-swapped lat/lng.
	got, ok := repo.setBranch[branchID]
	if !ok {
		t.Fatal("branch geocode was never written back")
	}
	if got.Lat != 49.9 || got.Lng != -119.5 {
		t.Errorf("backfilled branch coord = %+v; want {Lat:49.9 Lng:-119.5} (lat/lng not swapped)", got)
	}
	// (b) written exactly once.
	if repo.setBranchCalls != 1 {
		t.Errorf("SetBranchLatLng called %d times; want 1", repo.setBranchCalls)
	}
	// (c) origin encoded [lng,lat] in the VROOM request.
	if len(gotBody.Vehicles) != 1 || gotBody.Vehicles[0].Start != [2]float64{-119.5, 49.9} {
		t.Errorf("vehicle start = %+v; want geocoded branch origin [lng,lat] [-119.5,49.9]", gotBody.Vehicles)
	}
}

// TestOptimizeRoute_CentroidOriginFallback proves the headline fallback design:
// when the branch has neither coords nor an address, the optimizer routes from
// the centroid of the submitted stops (region-correct), not a fixed demo anchor
// and not a lat/lng-swapped point.
func TestOptimizeRoute_CentroidOriginFallback(t *testing.T) {
	bodyCh := make(chan orsOptimizationRequest, 1)
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		body, _ := io.ReadAll(r.Body)
		var req orsOptimizationRequest
		_ = json.Unmarshal(body, &req)
		bodyCh <- req
		io.WriteString(w, vroomResponse)
	}))
	defer srv.Close()

	dA := Delivery{ID: uuid.New(), OrderID: uuid.New(), Latitude: fptr(49.10), Longitude: fptr(-119.10)}
	dB := Delivery{ID: uuid.New(), OrderID: uuid.New(), Latitude: fptr(49.30), Longitude: fptr(-119.50)}
	repo := &MockRepository{
		deliveries:   []Delivery{dA, dB},
		branchOrigin: &BranchOrigin{}, // no coords, no address → centroid fallback
	}
	svc := NewService(repo)
	svc.WithRouting(NewORSClient("k", srv.URL, "driving-hgv", discardLogger()), discardLogger())

	if _, err := svc.OptimizeRoute(context.Background(), uuid.New()); err != nil {
		t.Fatalf("OptimizeRoute: %v", err)
	}
	gotBody := <-bodyCh

	// Origin = mean of the stops, encoded [lng,lat].
	wantLng := (-119.10 + -119.50) / 2 // -119.30
	wantLat := (49.10 + 49.30) / 2     // 49.20
	if len(gotBody.Vehicles) != 1 {
		t.Fatalf("want 1 vehicle, got %d", len(gotBody.Vehicles))
	}
	start := gotBody.Vehicles[0].Start
	if !approx(start[0], wantLng) || !approx(start[1], wantLat) {
		t.Errorf("vehicle start = %v; want stop centroid [lng,lat] [%v,%v] (not demo anchor, not swapped)", start, wantLng, wantLat)
	}
}

// TestOptimizeRoute_KeylessMockPath confirms the keyless fallback: no ORS client,
// so a coordinate-less stop is mock-geocoded on demand and the mock optimizer
// preserves input order with ETAs on every stop.
func TestOptimizeRoute_KeylessMockPath(t *testing.T) {
	dA := Delivery{ID: uuid.New(), OrderID: uuid.New(), Latitude: fptr(49.10), Longitude: fptr(-119.10)}
	dB := Delivery{ID: uuid.New(), OrderID: uuid.New()} // nil coords → mock-geocoded on demand
	repo := &MockRepository{deliveries: []Delivery{dA, dB}}
	svc := NewService(repo) // no WithRouting → s.routing == nil (keyless)

	if _, err := svc.OptimizeRoute(context.Background(), uuid.New()); err != nil {
		t.Fatalf("OptimizeRoute: %v", err)
	}

	if _, ok := repo.setLatLng[dB.ID]; !ok {
		t.Errorf("keyless: B should be mock-geocoded on demand and persisted")
	}
	if !equalIDs(repo.reorderedIDs, []uuid.UUID{dA.ID, dB.ID}) {
		t.Errorf("reorderedIDs = %v; want [A,B]", repo.reorderedIDs)
	}
	if len(repo.etas) != 2 {
		t.Errorf("want ETAs for both stops, got %d", len(repo.etas))
	}
	// Mock optimizer spaces stops 15 min apart in input order: B (2nd) after A (1st).
	if etaA, etaB := repo.etas[dA.ID], repo.etas[dB.ID]; !etaB.After(etaA) {
		t.Errorf("keyless ETA ordering: B (2nd stop) %v should be after A (1st) %v", etaB, etaA)
	}
}

// TestOptimizeRoute_GeocodeDedupWithinRun verifies that two stops sharing one
// order are geocoded only once per optimize run (the per-run cache), with both
// delivery rows still receiving the coordinates.
func TestOptimizeRoute_GeocodeDedupWithinRun(t *testing.T) {
	var geocodeCalls atomic.Int64
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if strings.HasPrefix(r.URL.Path, "/geocode") {
			geocodeCalls.Add(1)
			io.WriteString(w, `{"features":[{"geometry":{"coordinates":[-119.0,49.0]},"properties":{"confidence":0.9,"match_type":"exact","label":"x"}}]}`)
			return
		}
		io.WriteString(w, `{"code":0,"summary":{"duration":600,"distance":1000},"routes":[{"vehicle":1,"steps":[`+
			`{"type":"start","arrival":0,"duration":0,"distance":0},`+
			`{"type":"job","id":0,"arrival":300,"duration":300,"distance":500},`+
			`{"type":"job","id":1,"arrival":600,"duration":600,"distance":1000},`+
			`{"type":"end","arrival":600,"duration":600,"distance":1000}]}],"unassigned":[]}`)
	}))
	defer srv.Close()

	sharedOrder := uuid.New()
	d1 := Delivery{ID: uuid.New(), OrderID: sharedOrder} // nil coords
	d2 := Delivery{ID: uuid.New(), OrderID: sharedOrder} // nil coords, same order
	repo := &MockRepository{
		deliveries: []Delivery{d1, d2},
		orderAddrs: map[uuid.UUID]string{sharedOrder: "123 Shared St"},
	}
	svc := NewService(repo)
	svc.WithRouting(NewORSClient("k", srv.URL, "driving-hgv", discardLogger()), discardLogger())

	if _, err := svc.OptimizeRoute(context.Background(), uuid.New()); err != nil {
		t.Fatalf("OptimizeRoute: %v", err)
	}
	if n := geocodeCalls.Load(); n != 1 {
		t.Errorf("geocoded %d times for one shared order; want 1 (deduped within the run)", n)
	}
	if _, ok := repo.setLatLng[d1.ID]; !ok {
		t.Error("d1 should be geocoded and persisted")
	}
	if _, ok := repo.setLatLng[d2.ID]; !ok {
		t.Error("d2 should reuse the cached geocode and be persisted")
	}
	// Both shared-order stops survive into the route with ETAs (dedup must not drop one).
	if !equalIDs(repo.reorderedIDs, []uuid.UUID{d1.ID, d2.ID}) {
		t.Errorf("reorderedIDs = %v; want both shared-order stops [d1,d2]", repo.reorderedIDs)
	}
	if len(repo.etas) != 2 {
		t.Errorf("want ETAs for both stops, got %d", len(repo.etas))
	}
}

// TestRouteOptimizationResultJSONContract pins the wire shape the TS mirror
// (app/src/types/notification.ts) depends on. Renaming a json tag breaks the
// frontend silently; this fails loudly instead.
func TestRouteOptimizationResultJSONContract(t *testing.T) {
	r := RouteOptimizationResult{
		OptimizedOrder:    []int{1, 0},
		Legs:              []RouteLeg{{StopIndex: 1, DurationMins: 10, DistanceMi: 5, ETA: "2026-01-01T00:00:00Z"}},
		TotalDurationMins: 30,
		TotalDistanceMi:   10,
	}
	b, err := json.Marshal(r)
	if err != nil {
		t.Fatalf("marshal: %v", err)
	}
	got := string(b)
	for _, key := range []string{
		`"optimized_order"`, `"legs"`, `"total_duration_mins"`, `"total_distance_miles"`,
		`"stop_index"`, `"duration_mins"`, `"distance_miles"`, `"eta"`,
	} {
		if !strings.Contains(got, key) {
			t.Errorf("RouteOptimizationResult JSON missing %s; got %s", key, got)
		}
	}
}
