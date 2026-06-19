package delivery

import (
	"context"
	"fmt"
	"log/slog"
	"time"

	"github.com/google/uuid"
)

type Service struct {
	repo       Repository
	routing    *ORSClient // nil if OpenRouteService not configured (keyless dev/demo)
	notifier   DeliveryNotifierInterface
	invoiceSvc InvoiceServiceInterface // nil if invoice service not wired
	logger     *slog.Logger
}

// InvoiceServiceInterface auto-creates invoices from orders on delivery completion.
type InvoiceServiceInterface interface {
	CreateFromOrder(ctx context.Context, orderID uuid.UUID) error
}

// DeliveryNotifierInterface allows injecting the notification system.
type DeliveryNotifierInterface interface {
	Notify(ctx context.Context, event DeliveryEvent)
}

// DeliveryEvent mirrors notification.DeliveryEvent to avoid import cycle.
type DeliveryEvent struct {
	EventType     string
	DeliveryID    string
	OrderNumber   string
	CustomerName  string
	CustomerPhone string
	CustomerEmail string
	ETA           string
	ReceiptURL    string
}

func NewService(repo Repository) *Service {
	return &Service{repo: repo, logger: slog.Default()}
}

// WithRouting sets the OpenRouteService client for route optimization and
// geocoding. When unset — or when the ORS key isn't configured — the service uses
// keyless mock fallbacks.
func (s *Service) WithRouting(client *ORSClient, logger *slog.Logger) {
	s.routing = client
	s.logger = logger
}

// routingEnabled reports whether real ORS routing/geocoding should be used. The
// client may be wired but have no key (settable at runtime via Tech Admin), in
// which case the service falls back to mock optimization + geocoding.
func (s *Service) routingEnabled(ctx context.Context) bool {
	return s.routing != nil && s.routing.IsConfigured(ctx)
}

// WithNotifier sets the delivery notification service.
func (s *Service) WithNotifier(n DeliveryNotifierInterface) {
	s.notifier = n
}

// WithInvoiceService sets the invoice service for auto-invoicing on delivery completion.
func (s *Service) WithInvoiceService(invoiceSvc InvoiceServiceInterface) {
	s.invoiceSvc = invoiceSvc
}

// Fleet Management

func (s *Service) CreateVehicle(ctx context.Context, req CreateVehicleRequest) (*Vehicle, error) {
	v := &Vehicle{
		Name:              req.Name,
		VehicleType:       req.VehicleType,
		LicensePlate:      req.LicensePlate,
		CapacityWeightLbs: req.CapacityWeightLbs,
		VIN:               req.VIN,
		Year:              req.Year,
		Make:              req.Make,
		Model:             req.Model,
		OdometerMiles:     req.OdometerMiles,
		Notes:             req.Notes,
	}
	if req.InsuranceExpiry != nil {
		if t, err := time.Parse("2006-01-02", *req.InsuranceExpiry); err == nil {
			v.InsuranceExpiry = &t
		}
	}
	if req.NextServiceDate != nil {
		if t, err := time.Parse("2006-01-02", *req.NextServiceDate); err == nil {
			v.NextServiceDate = &t
		}
	}
	if err := s.repo.CreateVehicle(ctx, v); err != nil {
		return nil, err
	}
	return v, nil
}

func (s *Service) GetVehicle(ctx context.Context, id uuid.UUID) (*Vehicle, error) {
	return s.repo.GetVehicle(ctx, id)
}

func (s *Service) ListVehicles(ctx context.Context) ([]Vehicle, error) {
	return s.repo.ListVehicles(ctx)
}

func (s *Service) UpdateVehicle(ctx context.Context, id uuid.UUID, req UpdateVehicleRequest) (*Vehicle, error) {
	v, err := s.repo.GetVehicle(ctx, id)
	if err != nil {
		return nil, err
	}
	v.Name = req.Name
	v.VehicleType = req.VehicleType
	v.LicensePlate = req.LicensePlate
	v.CapacityWeightLbs = req.CapacityWeightLbs
	v.VIN = req.VIN
	v.Year = req.Year
	v.Make = req.Make
	v.Model = req.Model
	v.OdometerMiles = req.OdometerMiles
	v.Notes = req.Notes
	if req.InsuranceExpiry != nil {
		if t, err := time.Parse("2006-01-02", *req.InsuranceExpiry); err == nil {
			v.InsuranceExpiry = &t
		}
	} else {
		v.InsuranceExpiry = nil
	}
	if req.NextServiceDate != nil {
		if t, err := time.Parse("2006-01-02", *req.NextServiceDate); err == nil {
			v.NextServiceDate = &t
		}
	} else {
		v.NextServiceDate = nil
	}
	if err := s.repo.UpdateVehicle(ctx, id, v); err != nil {
		return nil, err
	}
	return v, nil
}

func (s *Service) DeleteVehicle(ctx context.Context, id uuid.UUID) error {
	return s.repo.DeleteVehicle(ctx, id)
}

func (s *Service) CreateDriver(ctx context.Context, req CreateDriverRequest) (*Driver, error) {
	d := &Driver{
		Name:          req.Name,
		LicenseNumber: req.LicenseNumber,
		PhoneNumber:   req.PhoneNumber,
		Status:        DriverStatusActive,
		CDLClass:      req.CDLClass,
		Email:         req.Email,
	}
	if req.CDLExpiry != nil {
		if t, err := time.Parse("2006-01-02", *req.CDLExpiry); err == nil {
			d.CDLExpiry = &t
		}
	}
	if req.HireDate != nil {
		if t, err := time.Parse("2006-01-02", *req.HireDate); err == nil {
			d.HireDate = &t
		}
	}
	if err := s.repo.CreateDriver(ctx, d); err != nil {
		return nil, err
	}
	return d, nil
}

func (s *Service) GetDriver(ctx context.Context, id uuid.UUID) (*Driver, error) {
	return s.repo.GetDriver(ctx, id)
}

func (s *Service) ListDrivers(ctx context.Context) ([]Driver, error) {
	return s.repo.ListDrivers(ctx)
}

func (s *Service) UpdateDriver(ctx context.Context, id uuid.UUID, req UpdateDriverRequest) (*Driver, error) {
	d, err := s.repo.GetDriver(ctx, id)
	if err != nil {
		return nil, err
	}
	d.Name = req.Name
	d.LicenseNumber = req.LicenseNumber
	d.PhoneNumber = req.PhoneNumber
	d.Status = req.Status
	d.CDLClass = req.CDLClass
	d.Email = req.Email
	if req.CDLExpiry != nil {
		if t, err := time.Parse("2006-01-02", *req.CDLExpiry); err == nil {
			d.CDLExpiry = &t
		}
	} else {
		d.CDLExpiry = nil
	}
	if req.HireDate != nil {
		if t, err := time.Parse("2006-01-02", *req.HireDate); err == nil {
			d.HireDate = &t
		}
	} else {
		d.HireDate = nil
	}
	if err := s.repo.UpdateDriver(ctx, id, d); err != nil {
		return nil, err
	}
	return d, nil
}

func (s *Service) DeleteDriver(ctx context.Context, id uuid.UUID) error {
	return s.repo.DeleteDriver(ctx, id)
}

func (s *Service) SetVehiclePhoto(ctx context.Context, id uuid.UUID, url string) error {
	return s.repo.SetVehiclePhoto(ctx, id, url)
}

func (s *Service) SetDriverPhoto(ctx context.Context, id uuid.UUID, url string) error {
	return s.repo.SetDriverPhoto(ctx, id, url)
}

// CompleteRoute marks a route as COMPLETED if all deliveries are in a terminal state.
func (s *Service) CompleteRoute(ctx context.Context, routeID uuid.UUID) error {
	deliveries, err := s.repo.ListDeliveriesByRoute(ctx, routeID)
	if err != nil {
		return fmt.Errorf("list deliveries: %w", err)
	}
	if len(deliveries) == 0 {
		return fmt.Errorf("route has no deliveries")
	}
	for _, d := range deliveries {
		if d.Status != DeliveryStatusDelivered && d.Status != DeliveryStatusFailed && d.Status != DeliveryStatusPartial {
			return fmt.Errorf("cannot complete route: delivery %s is still %s", d.ID, d.Status)
		}
	}
	return s.repo.UpdateRouteStatus(ctx, routeID, RouteStatusCompleted)
}

// Route Management

func (s *Service) CreateRoute(ctx context.Context, req CreateRouteRequest) (*Route, error) {
	date, err := time.Parse("2006-01-02", req.ScheduledDate)
	if err != nil {
		return nil, fmt.Errorf("invalid date format: %v", err)
	}

	route := &Route{
		VehicleID:     req.VehicleID,
		DriverID:      req.DriverID,
		ScheduledDate: date,
		Status:        RouteStatusDraft,
		Notes:         req.Notes,
	}

	if err := s.repo.CreateRoute(ctx, route); err != nil {
		return nil, err
	}
	return route, nil
}

func (s *Service) GetRoute(ctx context.Context, id uuid.UUID) (*Route, error) {
	return s.repo.GetRoute(ctx, id)
}

func (s *Service) ListRoutes(ctx context.Context, dateStr *string, driverID *uuid.UUID) ([]Route, error) {
	var date *time.Time
	if dateStr != nil && *dateStr != "" {
		parsed, err := time.Parse("2006-01-02", *dateStr)
		if err != nil {
			return nil, fmt.Errorf("invalid date format")
		}
		date = &parsed
	}
	return s.repo.ListRoutes(ctx, date, driverID)
}

func (s *Service) DispatchRoute(ctx context.Context, id uuid.UUID) error {
	route, err := s.repo.GetRoute(ctx, id)
	if err != nil {
		return fmt.Errorf("get route: %w", err)
	}
	if route.Status != RouteStatusDraft && route.Status != RouteStatusScheduled {
		return fmt.Errorf("cannot dispatch route in status %s: must be DRAFT or SCHEDULED", route.Status)
	}
	return s.repo.UpdateRouteStatus(ctx, id, RouteStatusInTransit)
}

// Delivery Management

func (s *Service) AssignOrderToRoute(ctx context.Context, req AssignOrderRequest) (*Delivery, *CapacityWarning, error) {
	// Verify route exists and get vehicle info
	route, err := s.repo.GetRoute(ctx, req.RouteID)
	if err != nil {
		return nil, nil, err
	}

	// Vehicle capacity validation
	var warning *CapacityWarning
	vehicle, err := s.repo.GetVehicle(ctx, route.VehicleID)
	if err == nil && vehicle.CapacityWeightLbs != nil && *vehicle.CapacityWeightLbs > 0 {
		currentLoad, _ := s.repo.GetRouteLoadWeight(ctx, req.RouteID)
		orderWeight, _ := s.repo.GetOrderEstimatedWeight(ctx, req.OrderID)
		totalAfter := currentLoad + orderWeight

		if totalAfter > float64(*vehicle.CapacityWeightLbs) {
			warning = &CapacityWarning{
				VehicleCapacity: float64(*vehicle.CapacityWeightLbs),
				CurrentLoad:     currentLoad,
				OrderWeight:     orderWeight,
				TotalAfter:      totalAfter,
			}
			// Warning only — still allow assignment (soft validation)
		}
	}

	d := &Delivery{
		RouteID:              req.RouteID,
		OrderID:              req.OrderID,
		StopSequence:         req.StopSequence,
		Status:               DeliveryStatusPending,
		DeliveryInstructions: req.DeliveryInstructions,
	}

	// Geocode the delivery address. With an ORS key, resolve the order's
	// customer address for real; with no key (dev/demo) fall back to a
	// deterministic mock so stops still scatter onto the map.
	if coord := s.geocodeOrderStop(ctx, req.OrderID); coord != nil {
		d.Latitude = &coord.Lat
		d.Longitude = &coord.Lng
	}

	if err := s.repo.CreateDelivery(ctx, d); err != nil {
		return nil, nil, err
	}
	return d, warning, nil
}

func (s *Service) ListDeliveries(ctx context.Context, routeID uuid.UUID) ([]Delivery, error) {
	return s.repo.ListDeliveriesByRoute(ctx, routeID)
}

func (s *Service) GetDelivery(ctx context.Context, id uuid.UUID) (*Delivery, error) {
	return s.repo.GetDelivery(ctx, id)
}

func (s *Service) CompleteDelivery(ctx context.Context, id uuid.UUID, req UpdateDeliveryStatusRequest) error {
	switch req.Status {
	case DeliveryStatusDelivered, DeliveryStatusFailed, DeliveryStatusPartial:
		// valid terminal states
	default:
		return fmt.Errorf("invalid delivery status: %s", req.Status)
	}

	var pod *PODUpdate
	if req.Status == DeliveryStatusDelivered || req.Status == DeliveryStatusPartial {
		if req.PODProofURL == nil || req.PODSignedBy == nil {
			return fmt.Errorf("POD proof required for delivery completion")
		}
		now := time.Now()
		pod = &PODUpdate{
			ProofURL: *req.PODProofURL,
			SignedBy: *req.PODSignedBy,
			Time:     now,
		}
		if req.SignatureDataURL != nil {
			pod.SignatureDataURL = *req.SignatureDataURL
		}
	}

	if err := s.repo.UpdateDeliveryStatus(ctx, id, req.Status, pod); err != nil {
		return err
	}

	// Auto-invoice: when delivery is completed, create invoice from order
	if req.Status == DeliveryStatusDelivered && s.invoiceSvc != nil {
		delivery, err := s.repo.GetDelivery(ctx, id)
		if err != nil {
			s.logger.Error("auto-invoice: failed to get delivery", "delivery_id", id, "error", err)
		} else {
			if err := s.invoiceSvc.CreateFromOrder(ctx, delivery.OrderID); err != nil {
				s.logger.Error("auto-invoice: failed to create invoice", "order_id", delivery.OrderID, "error", err)
			} else {
				s.logger.Info("auto-invoice: invoice created on POD completion", "delivery_id", id, "order_id", delivery.OrderID)
			}
		}
	}

	return nil
}

// UploadPODPhoto saves a POD photo record for a delivery.
func (s *Service) UploadPODPhoto(ctx context.Context, deliveryID uuid.UUID, photoURL string, photoType string) (*PODPhoto, error) {
	photo := &PODPhoto{
		DeliveryID: deliveryID,
		PhotoURL:   photoURL,
		PhotoType:  photoType,
	}
	if err := s.repo.SavePODPhoto(ctx, photo); err != nil {
		return nil, fmt.Errorf("save POD photo: %w", err)
	}
	return photo, nil
}

// GetPODPhotos returns all POD photos for a delivery.
func (s *Service) GetPODPhotos(ctx context.Context, deliveryID uuid.UUID) ([]PODPhoto, error) {
	return s.repo.GetPODPhotos(ctx, deliveryID)
}

func (s *Service) ReorderStops(ctx context.Context, routeID uuid.UUID, deliveryIDs []uuid.UUID) error {
	return s.repo.ReorderRouteDeliveries(ctx, routeID, deliveryIDs)
}

// OptimizeRoute uses OpenRouteService (VROOM) to find the optimal stop ordering
// and per-stop ETAs for a route, persisting both the new stop order and the
// ETAs. Falls back to a deterministic mock when no ORS key is configured.
func (s *Service) OptimizeRoute(ctx context.Context, routeID uuid.UUID) (*RouteOptimizationResult, error) {
	deliveries, err := s.repo.ListDeliveriesByRoute(ctx, routeID)
	if err != nil {
		return nil, fmt.Errorf("list deliveries: %w", err)
	}

	if len(deliveries) == 0 {
		return &RouteOptimizationResult{}, nil
	}

	// Build the stop list, keeping each stop aligned to its delivery via a
	// parallel slice. Previously deliveries with nil coords were silently
	// dropped, which desynced the optimizer's indices from the deliveries slice
	// (the optimized order then reordered the wrong deliveries). We keep the
	// mapping explicit, and geocode-on-demand any stop missing coordinates so no
	// stop is dropped from optimization.
	var stops []LatLng
	stopDeliveries := make([]*Delivery, 0, len(deliveries)) // stopDeliveries[i] owns stops[i]
	geocodeCache := make(map[uuid.UUID]*LatLng)             // dedup repeat geocodes within one run
	for i := range deliveries {
		d := &deliveries[i]
		if d.Latitude == nil || d.Longitude == nil {
			coord, cached := geocodeCache[d.OrderID]
			if !cached {
				coord = s.geocodeDeliveryOnDemand(ctx, d)
				geocodeCache[d.OrderID] = coord
			} else if coord != nil {
				// Same order already geocoded this run — reuse it, persisting to
				// this delivery row too rather than re-hitting the geocoder.
				if err := s.repo.SetDeliveryLatLng(ctx, d.ID, coord.Lat, coord.Lng); err != nil {
					s.logger.Warn("OptimizeRoute: failed to persist cached geocode", "delivery_id", d.ID, "error", err)
				}
			}
			if coord == nil {
				continue // still no coords — excluded from optimization, not dropped from the route
			}
			d.Latitude = &coord.Lat
			d.Longitude = &coord.Lng
		}
		stops = append(stops, LatLng{Lat: *d.Latitude, Lng: *d.Longitude})
		stopDeliveries = append(stopDeliveries, d)
	}

	if len(stops) == 0 {
		s.logger.Warn("OptimizeRoute: no geocoded stops to optimize", "route_id", routeID)
		return &RouteOptimizationResult{}, nil
	}

	var result *RouteOptimizationResult
	if s.routingEnabled(ctx) {
		origin := s.resolveBranchOrigin(ctx, routeID, stops)
		result, err = s.routing.OptimizeRoute(ctx, origin, stops)
		if err != nil {
			s.logger.Warn("ORS optimization failed, using mock fallback", "error", err)
			result = MockOptimizeRoute(stops)
		}
	} else {
		result = MockOptimizeRoute(stops)
	}

	// Map optimized stop indices (into `stops`, aligned with stopDeliveries)
	// back to delivery IDs, then append any deliveries the optimizer didn't
	// return so every stop survives the reorder.
	var reorderedIDs []uuid.UUID
	seen := make(map[uuid.UUID]bool, len(deliveries))
	for _, stopIdx := range result.OptimizedOrder {
		if stopIdx < 0 || stopIdx >= len(stopDeliveries) {
			continue
		}
		id := stopDeliveries[stopIdx].ID
		if seen[id] {
			continue
		}
		reorderedIDs = append(reorderedIDs, id)
		seen[id] = true
	}
	for i := range deliveries {
		if !seen[deliveries[i].ID] {
			reorderedIDs = append(reorderedIDs, deliveries[i].ID)
			seen[deliveries[i].ID] = true
		}
	}

	if len(reorderedIDs) > 0 {
		if err := s.repo.ReorderRouteDeliveries(ctx, routeID, reorderedIDs); err != nil {
			s.logger.Warn("OptimizeRoute: failed to persist reordered stops", "route_id", routeID, "error", err)
		}
	}

	// Persist per-stop ETAs. VROOM returns them for free; the
	// deliveries.estimated_arrival column existed (migration 032) but was never
	// written. Each leg's StopIndex is an index into `stops`.
	for _, leg := range result.Legs {
		if leg.StopIndex < 0 || leg.StopIndex >= len(stopDeliveries) || leg.ETA == "" {
			continue
		}
		eta, parseErr := time.Parse(time.RFC3339, leg.ETA)
		if parseErr != nil {
			continue
		}
		if err := s.repo.SetDeliveryETA(ctx, stopDeliveries[leg.StopIndex].ID, eta); err != nil {
			s.logger.Warn("OptimizeRoute: failed to persist ETA", "delivery_id", stopDeliveries[leg.StopIndex].ID, "error", err)
		}
	}

	s.logger.Info("Route optimized",
		"route_id", routeID,
		"stops", len(stops),
		"total_duration_mins", result.TotalDurationMins,
	)

	return result, nil
}

// resolveBranchOrigin returns the coordinates the optimizer should use as the
// vehicle start/end for a route: the route's branch location. Branch coordinates
// are backfilled lazily — if the branch has no stored lat/lng, its address is
// geocoded once and persisted.
//
// Every failure path falls back to the centroid of the route's stops (and logs
// why). The centroid is a geographically neutral origin that stays in the right
// region for any deployment — unlike a fixed demo anchor, which would silently
// route a real non-demo dealer's first optimize from the wrong city. Only called
// on the keyed path (the keyless mock optimizer ignores the origin).
func (s *Service) resolveBranchOrigin(ctx context.Context, routeID uuid.UUID, stops []LatLng) LatLng {
	fallback := centroid(stops)

	branchID, err := s.repo.GetRouteBranchID(ctx, routeID)
	if err != nil {
		s.logger.Warn("route origin: could not resolve branch, routing from stop centroid", "route_id", routeID, "error", err)
		return fallback
	}
	origin, err := s.repo.GetBranchOrigin(ctx, branchID)
	if err != nil {
		s.logger.Warn("route origin: could not load branch, routing from stop centroid", "branch_id", branchID, "error", err)
		return fallback
	}
	if origin.Latitude != nil && origin.Longitude != nil {
		return LatLng{Lat: *origin.Latitude, Lng: *origin.Longitude}
	}
	// No stored coords — backfill via geocoding.
	if origin.Address == "" {
		s.logger.Warn("route origin: branch has no address to geocode, routing from stop centroid", "branch_id", branchID)
		return fallback
	}
	// Invariant: resolveBranchOrigin is only reached from the keyed path
	// (OptimizeRoute guards routingEnabled before calling), so Geocode is safe.
	gc, gErr := s.routing.Geocode(ctx, origin.Address)
	if gErr != nil {
		s.logger.Warn("route origin: branch geocode failed, routing from stop centroid",
			"branch_id", branchID, "address", origin.Address, "error", gErr)
		return fallback
	}
	if err := s.repo.SetBranchLatLng(ctx, branchID, gc.LatLng.Lat, gc.LatLng.Lng); err != nil {
		s.logger.Warn("route origin: failed to persist branch geocode", "branch_id", branchID, "error", err)
	}
	s.logger.Info("route origin: backfilled branch coordinates",
		"branch_id", branchID, "address", origin.Address, "confidence", gc.Confidence)
	return gc.LatLng
}

// centroid returns the average of the given coordinates — a geographically
// neutral origin fallback that stays in the right region for any deployment.
// The caller (resolveBranchOrigin, via OptimizeRoute) guarantees len(points) > 0;
// the empty case returns the zero value rather than a fixed city so a future
// misuse fails visibly instead of silently routing from the wrong region.
func centroid(points []LatLng) LatLng {
	if len(points) == 0 {
		return LatLng{}
	}
	var sumLat, sumLng float64
	for _, p := range points {
		sumLat += p.Lat
		sumLng += p.Lng
	}
	n := float64(len(points))
	return LatLng{Lat: sumLat / n, Lng: sumLng / n}
}

// geocodeOrderStop resolves a delivery stop's coordinates for an order. With an
// ORS key configured it geocodes the order's customer address; with no key
// (dev/demo) it returns deterministic mock coordinates so stops still appear on
// the map. Returns nil only when a keyed geocode is attempted and fails, so
// production surfaces the failure (the stop is created without coordinates,
// rather than routed to a wrong/fake point) instead of masking it.
//
// Low-confidence matches are still returned but logged at WARN. The log is the
// v1 review signal; persisting a structured review flag on the delivery is a
// deferred follow-up (would need a new column + UI surface).
func (s *Service) geocodeOrderStop(ctx context.Context, orderID uuid.UUID) *LatLng {
	if !s.routingEnabled(ctx) {
		ll := mockGeocode(orderID)
		return &ll
	}

	address, err := s.repo.GetOrderDeliveryAddress(ctx, orderID)
	if err != nil || address == "" {
		s.logger.Warn("geocode: no delivery address for order; leaving stop uncoordinated",
			"order_id", orderID, "error", err)
		return nil
	}
	gc, err := s.routing.Geocode(ctx, address)
	if err != nil {
		s.logger.Error("geocode: failed to resolve delivery address; leaving stop uncoordinated",
			"order_id", orderID, "address", address, "error", err)
		return nil
	}
	if gc.LowConfidence() {
		s.logger.Warn("geocode: low-confidence delivery match — review before dispatch",
			"order_id", orderID, "address", address, "matched", gc.Label,
			"confidence", gc.Confidence, "match_type", gc.MatchType)
	}
	return &gc.LatLng
}

// geocodeDeliveryOnDemand geocodes a delivery that is missing coordinates at
// optimize time and best-effort persists the result so the stop appears on the
// map afterwards. Returns nil when geocoding isn't possible.
func (s *Service) geocodeDeliveryOnDemand(ctx context.Context, d *Delivery) *LatLng {
	coord := s.geocodeOrderStop(ctx, d.OrderID)
	if coord == nil {
		return nil
	}
	if err := s.repo.SetDeliveryLatLng(ctx, d.ID, coord.Lat, coord.Lng); err != nil {
		s.logger.Warn("OptimizeRoute: failed to persist on-demand geocode", "delivery_id", d.ID, "error", err)
	}
	return coord
}

// AdjustDeliveryQuantity handles driver on-site quantity changes (short-ship, damage, etc.)
func (s *Service) AdjustDeliveryQuantity(ctx context.Context, req QtyAdjustmentRequest) error {
	// Validate delivery exists
	_, err := s.repo.GetDelivery(ctx, req.DeliveryID)
	if err != nil {
		return fmt.Errorf("delivery not found: %w", err)
	}

	// Log the adjustment (in production, this would also update invoice and inventory)
	for _, adj := range req.Adjustments {
		s.logger.Info("Delivery quantity adjusted",
			"delivery_id", req.DeliveryID,
			"product_id", adj.ProductID,
			"original_qty", adj.OriginalQty,
			"adjusted_qty", adj.AdjustedQty,
			"reason", adj.ReasonCode,
			"adjusted_by", req.AdjustedBy,
		)
	}

	return nil
}
