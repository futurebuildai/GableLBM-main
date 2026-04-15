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
	mapsClient *MapsClient // nil if Google Maps not configured
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

// WithMaps sets the Google Maps client for route optimization.
func (s *Service) WithMaps(mc *MapsClient, logger *slog.Logger) {
	s.mapsClient = mc
	s.logger = logger
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

	// Mock Geocoding (San Francisco Bay Area)
	// Base: 37.7749, -122.4194
	// Use simple byte math for determinism
	b := req.OrderID[:]
	// Use bytes 0 and 1 for offsets
	latOffset := (float64(int(b[0])) - 128.0) / 1000.0 // +/- 0.128 deg
	lngOffset := (float64(int(b[1])) - 128.0) / 1000.0

	lat := 37.7749 + latOffset
	lng := -122.4194 + lngOffset

	d := &Delivery{
		RouteID:              req.RouteID,
		OrderID:              req.OrderID,
		StopSequence:         req.StopSequence,
		Status:               DeliveryStatusPending,
		DeliveryInstructions: req.DeliveryInstructions,
		Latitude:             &lat,
		Longitude:            &lng,
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

// OptimizeRoute calls Google Maps to find optimal stop ordering and ETAs.
// Falls back to mock optimization if Maps client is not configured.
func (s *Service) OptimizeRoute(ctx context.Context, routeID uuid.UUID) (*RouteOptimizationResult, error) {
	deliveries, err := s.repo.ListDeliveriesByRoute(ctx, routeID)
	if err != nil {
		return nil, fmt.Errorf("list deliveries: %w", err)
	}

	if len(deliveries) == 0 {
		return &RouteOptimizationResult{}, nil
	}

	// Build stop coordinates
	var stops []LatLng
	for _, d := range deliveries {
		if d.Latitude != nil && d.Longitude != nil {
			stops = append(stops, LatLng{Lat: *d.Latitude, Lng: *d.Longitude})
		}
	}

	var result *RouteOptimizationResult
	if s.mapsClient != nil {
		// Use lumberyard as origin (San Francisco default)
		origin := LatLng{Lat: 37.7749, Lng: -122.4194}
		result, err = s.mapsClient.OptimizeRoute(ctx, origin, stops)
		if err != nil {
			s.logger.Warn("Maps optimization failed, using mock fallback", "error", err)
			result = MockOptimizeRoute(stops)
		}
	} else {
		result = MockOptimizeRoute(stops)
	}

	// Update ETAs on deliveries and reorder
	validIdx := 0
	var reorderedIDs []uuid.UUID
	for _, optIdx := range result.OptimizedOrder {
		if optIdx < len(deliveries) {
			reorderedIDs = append(reorderedIDs, deliveries[optIdx].ID)
		}
	}
	// If optimized order doesn't cover all, append remaining
	if len(reorderedIDs) < len(deliveries) {
		for _, d := range deliveries {
			found := false
			for _, rid := range reorderedIDs {
				if rid == d.ID {
					found = true
					break
				}
			}
			if !found {
				reorderedIDs = append(reorderedIDs, d.ID)
			}
		}
	}
	_ = validIdx

	if len(reorderedIDs) > 0 {
		_ = s.repo.ReorderRouteDeliveries(ctx, routeID, reorderedIDs)
	}

	s.logger.Info("Route optimized",
		"route_id", routeID,
		"stops", len(stops),
		"total_duration_mins", result.TotalDurationMins,
	)

	return result, nil
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
