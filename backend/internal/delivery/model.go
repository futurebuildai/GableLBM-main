package delivery

import (
	"context"
	"time"

	"github.com/google/uuid"
)

// Status Enums
type VehicleType string

const (
	VehicleTypeBoxTruck VehicleType = "BOX_TRUCK"
	VehicleTypeFlatbed  VehicleType = "FLATBED"
	VehicleTypePickup   VehicleType = "PICKUP"
	VehicleTypeVan      VehicleType = "VAN"
	VehicleTypeCrane    VehicleType = "CRANE"
)

type DriverStatus string

const (
	DriverStatusActive   DriverStatus = "ACTIVE"
	DriverStatusInactive DriverStatus = "INACTIVE"
	DriverStatusOnLeave  DriverStatus = "ON_LEAVE"
)

type RouteStatus string

const (
	RouteStatusDraft     RouteStatus = "DRAFT"
	RouteStatusScheduled RouteStatus = "SCHEDULED"
	RouteStatusInTransit RouteStatus = "IN_TRANSIT"
	RouteStatusCompleted RouteStatus = "COMPLETED"
	RouteStatusCancelled RouteStatus = "CANCELLED"
)

type DeliveryStatus string

const (
	DeliveryStatusPending        DeliveryStatus = "PENDING"
	DeliveryStatusOutForDelivery DeliveryStatus = "OUT_FOR_DELIVERY"
	DeliveryStatusDelivered      DeliveryStatus = "DELIVERED"
	DeliveryStatusFailed         DeliveryStatus = "FAILED"
	DeliveryStatusPartial        DeliveryStatus = "PARTIAL"
)

// Domain Models

type Vehicle struct {
	ID                uuid.UUID   `json:"id" db:"id"`
	Name              string      `json:"name" db:"name"`
	VehicleType       VehicleType `json:"vehicle_type" db:"vehicle_type"`
	LicensePlate      string      `json:"license_plate" db:"license_plate"`
	CapacityWeightLbs *int        `json:"capacity_weight_lbs" db:"capacity_weight_lbs"`
	VIN               *string     `json:"vin" db:"vin"`
	Year              *int        `json:"year" db:"year"`
	Make              *string     `json:"make" db:"make"`
	Model             *string     `json:"model" db:"model"`
	InsuranceExpiry   *time.Time  `json:"insurance_expiry" db:"insurance_expiry"`
	NextServiceDate   *time.Time  `json:"next_service_date" db:"next_service_date"`
	OdometerMiles     *int        `json:"odometer_miles" db:"odometer_miles"`
	Notes             *string     `json:"notes" db:"notes"`
	PhotoURL          *string     `json:"photo_url" db:"photo_url"`
	CreatedAt         time.Time   `json:"created_at" db:"created_at"`
	UpdatedAt         time.Time   `json:"updated_at" db:"updated_at"`
}

type Driver struct {
	ID            uuid.UUID    `json:"id" db:"id"`
	Name          string       `json:"name" db:"name"`
	LicenseNumber *string      `json:"license_number" db:"license_number"`
	Status        DriverStatus `json:"status" db:"status"`
	PhoneNumber   *string      `json:"phone_number" db:"phone_number"`
	CDLClass      *string      `json:"cdl_class" db:"cdl_class"`
	CDLExpiry     *time.Time   `json:"cdl_expiry" db:"cdl_expiry"`
	HireDate      *time.Time   `json:"hire_date" db:"hire_date"`
	Email         *string      `json:"email" db:"email"`
	PhotoURL      *string      `json:"photo_url" db:"photo_url"`
	CreatedAt     time.Time    `json:"created_at" db:"created_at"`
	UpdatedAt     time.Time    `json:"updated_at" db:"updated_at"`
}

type Route struct {
	ID                uuid.UUID   `json:"id" db:"id"`
	VehicleID         uuid.UUID   `json:"vehicle_id" db:"vehicle_id"`
	DriverID          uuid.UUID   `json:"driver_id" db:"driver_id"`
	ScheduledDate     time.Time   `json:"scheduled_date" db:"scheduled_date"` // YYYY-MM-DD
	Status            RouteStatus `json:"status" db:"status"`
	Notes             *string     `json:"notes" db:"notes"`
	TotalDurationMins *int        `json:"total_duration_mins,omitempty" db:"total_duration_mins"`
	TotalDistanceMi   *float64    `json:"total_distance_miles,omitempty" db:"total_distance_miles"`
	CreatedAt         time.Time   `json:"created_at" db:"created_at"`
	UpdatedAt         time.Time   `json:"updated_at" db:"updated_at"`

	// Joined fields
	VehicleName *string `json:"vehicle_name,omitempty" db:"vehicle_name"`
	DriverName  *string `json:"driver_name,omitempty" db:"driver_name"`
	StopCount   int     `json:"stop_count" db:"stop_count"`
}

type Delivery struct {
	ID           uuid.UUID      `json:"id" db:"id"`
	RouteID      uuid.UUID      `json:"route_id" db:"route_id"`
	OrderID      uuid.UUID      `json:"order_id" db:"order_id"`
	StopSequence int            `json:"stop_sequence" db:"stop_sequence"`
	Status       DeliveryStatus `json:"status" db:"status"`

	// POD
	PODProofURL  *string    `json:"pod_proof_url" db:"pod_proof_url"`
	PODSignedBy  *string    `json:"pod_signed_by" db:"pod_signed_by"`
	PODTimestamp *time.Time `json:"pod_timestamp" db:"pod_timestamp"`

	// Signature canvas data (base64 PNG)
	SignatureDataURL *string `json:"signature_data_url,omitempty" db:"signature_data_url"`

	DeliveryInstructions *string `json:"delivery_instructions" db:"delivery_instructions"`

	// Geolocation
	Latitude  *float64 `json:"latitude" db:"latitude"`
	Longitude *float64 `json:"longitude" db:"longitude"`

	// ETA (from route optimization)
	EstimatedArrival *time.Time `json:"estimated_arrival,omitempty" db:"estimated_arrival"`

	// Time-window scheduling
	ScheduledStart *time.Time `json:"scheduled_start,omitempty" db:"scheduled_start"`
	ScheduledEnd   *time.Time `json:"scheduled_end,omitempty" db:"scheduled_end"`

	CreatedAt time.Time `json:"created_at" db:"created_at"`
	UpdatedAt time.Time `json:"updated_at" db:"updated_at"`

	// Joined
	CustomerName *string `json:"customer_name,omitempty" db:"customer_name"`
	OrderNumber  *string `json:"order_number,omitempty" db:"order_number"`
	Address      *string `json:"address,omitempty" db:"address"`

	// Multi-photo POD
	PODPhotos []PODPhoto `json:"pod_photos,omitempty" db:"-"`
}

// DTOs

type CreateVehicleRequest struct {
	Name              string      `json:"name"`
	VehicleType       VehicleType `json:"vehicle_type"`
	LicensePlate      string      `json:"license_plate"`
	CapacityWeightLbs *int        `json:"capacity_weight_lbs"`
	VIN               *string     `json:"vin"`
	Year              *int        `json:"year"`
	Make              *string     `json:"make"`
	Model             *string     `json:"model"`
	InsuranceExpiry   *string     `json:"insurance_expiry"`
	NextServiceDate   *string     `json:"next_service_date"`
	OdometerMiles     *int        `json:"odometer_miles"`
	Notes             *string     `json:"notes"`
}

type UpdateVehicleRequest struct {
	Name              string      `json:"name"`
	VehicleType       VehicleType `json:"vehicle_type"`
	LicensePlate      string      `json:"license_plate"`
	CapacityWeightLbs *int        `json:"capacity_weight_lbs"`
	VIN               *string     `json:"vin"`
	Year              *int        `json:"year"`
	Make              *string     `json:"make"`
	Model             *string     `json:"model"`
	InsuranceExpiry   *string     `json:"insurance_expiry"`
	NextServiceDate   *string     `json:"next_service_date"`
	OdometerMiles     *int        `json:"odometer_miles"`
	Notes             *string     `json:"notes"`
}

type CreateDriverRequest struct {
	Name          string  `json:"name"`
	LicenseNumber *string `json:"license_number"`
	PhoneNumber   *string `json:"phone_number"`
	CDLClass      *string `json:"cdl_class"`
	CDLExpiry     *string `json:"cdl_expiry"`
	HireDate      *string `json:"hire_date"`
	Email         *string `json:"email"`
}

type UpdateDriverRequest struct {
	Name          string       `json:"name"`
	LicenseNumber *string      `json:"license_number"`
	PhoneNumber   *string      `json:"phone_number"`
	Status        DriverStatus `json:"status"`
	CDLClass      *string      `json:"cdl_class"`
	CDLExpiry     *string      `json:"cdl_expiry"`
	HireDate      *string      `json:"hire_date"`
	Email         *string      `json:"email"`
}

type CreateRouteRequest struct {
	VehicleID     uuid.UUID `json:"vehicle_id"`
	DriverID      uuid.UUID `json:"driver_id"`
	ScheduledDate string    `json:"scheduled_date"` // "2023-10-27"
	Notes         *string   `json:"notes"`
}

type AssignOrderRequest struct {
	RouteID              uuid.UUID `json:"route_id"`
	OrderID              uuid.UUID `json:"order_id"`
	StopSequence         int       `json:"stop_sequence"`
	DeliveryInstructions *string   `json:"delivery_instructions"`
}

type UpdateDeliveryStatusRequest struct {
	Status           DeliveryStatus `json:"status"`
	PODProofURL      *string        `json:"pod_proof_url"`
	PODSignedBy      *string        `json:"pod_signed_by"`
	SignatureDataURL *string        `json:"signature_data_url,omitempty"`
}

type ReorderStopsRequest struct {
	OrderedDeliveryIDs []uuid.UUID `json:"ordered_delivery_ids"`
}

// Interfaces

type Repository interface {
	// Fleet
	CreateVehicle(ctx context.Context, vehicle *Vehicle) error
	GetVehicle(ctx context.Context, id uuid.UUID) (*Vehicle, error)
	ListVehicles(ctx context.Context) ([]Vehicle, error)
	UpdateVehicle(ctx context.Context, id uuid.UUID, vehicle *Vehicle) error
	DeleteVehicle(ctx context.Context, id uuid.UUID) error
	CreateDriver(ctx context.Context, driver *Driver) error
	GetDriver(ctx context.Context, id uuid.UUID) (*Driver, error)
	ListDrivers(ctx context.Context) ([]Driver, error)
	UpdateDriver(ctx context.Context, id uuid.UUID, driver *Driver) error
	DeleteDriver(ctx context.Context, id uuid.UUID) error

	// Routes
	CreateRoute(ctx context.Context, route *Route) error
	GetRoute(ctx context.Context, id uuid.UUID) (*Route, error)
	ListRoutes(ctx context.Context, date *time.Time, driverID *uuid.UUID) ([]Route, error)
	UpdateRouteStatus(ctx context.Context, id uuid.UUID, status RouteStatus) error

	// Deliveries
	CreateDelivery(ctx context.Context, delivery *Delivery) error
	GetDelivery(ctx context.Context, id uuid.UUID) (*Delivery, error)
	ListDeliveriesByRoute(ctx context.Context, routeID uuid.UUID) ([]Delivery, error)
	UpdateDeliveryStatus(ctx context.Context, id uuid.UUID, status DeliveryStatus, pod *PODUpdate) error
	ReorderRouteDeliveries(ctx context.Context, routeID uuid.UUID, deliveryIDs []uuid.UUID) error

	// Photos
	SetVehiclePhoto(ctx context.Context, id uuid.UUID, url string) error
	SetDriverPhoto(ctx context.Context, id uuid.UUID, url string) error

	// POD Photos
	SavePODPhoto(ctx context.Context, photo *PODPhoto) error
	GetPODPhotos(ctx context.Context, deliveryID uuid.UUID) ([]PODPhoto, error)

	// Capacity
	GetRouteLoadWeight(ctx context.Context, routeID uuid.UUID) (float64, error)
	GetOrderEstimatedWeight(ctx context.Context, orderID uuid.UUID) (float64, error)
}

// CapacityWarning is returned when assignment would exceed vehicle capacity
type CapacityWarning struct {
	VehicleCapacity float64 `json:"vehicle_capacity_lbs"`
	CurrentLoad     float64 `json:"current_load_lbs"`
	OrderWeight     float64 `json:"order_weight_lbs"`
	TotalAfter      float64 `json:"total_after_lbs"`
}

type PODUpdate struct {
	ProofURL         string
	SignedBy         string
	SignatureDataURL string
	Time             time.Time
}

// PODPhoto represents a photo attached to a delivery's proof of delivery.
type PODPhoto struct {
	ID         uuid.UUID `json:"id"`
	DeliveryID uuid.UUID `json:"delivery_id"`
	PhotoURL   string    `json:"photo_url"`
	PhotoType  string    `json:"photo_type"` // "signature", "site", "damage"
	UploadedAt time.Time `json:"uploaded_at"`
}

// QtyAdjustmentRequest is used by drivers to adjust delivered quantities on-site.
type QtyAdjustmentRequest struct {
	DeliveryID  uuid.UUID                `json:"delivery_id"`
	AdjustedBy  uuid.UUID                `json:"adjusted_by"`
	Adjustments []DeliveryLineAdjustment `json:"adjustments"`
}

// DeliveryLineAdjustment represents a single line item quantity change.
type DeliveryLineAdjustment struct {
	ProductID   uuid.UUID `json:"product_id"`
	OriginalQty float64   `json:"original_qty"`
	AdjustedQty float64   `json:"adjusted_qty"`
	ReasonCode  string    `json:"reason_code"` // SHORT_SHIP, DAMAGED, REFUSED, WRONG_PRODUCT, OTHER
	Notes       string    `json:"notes,omitempty"`
}
