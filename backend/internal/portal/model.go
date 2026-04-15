package portal

import (
	"time"

	"github.com/google/uuid"
)

// CustomerUser represents a contractor/customer who can log into the portal.
type CustomerUser struct {
	ID           uuid.UUID `json:"id"`
	CustomerID   uuid.UUID `json:"customer_id"`
	Email        string    `json:"email"`
	PasswordHash string    `json:"-"` // Never serialize
	Name         string    `json:"name"`
	Role         string    `json:"role"`
	Status       string    `json:"status"` // Active, Inactive
	CreatedAt    time.Time `json:"created_at"`
	UpdatedAt    time.Time `json:"updated_at"`
}

// PortalInvite represents an invitation for a team member to join the portal.
type PortalInvite struct {
	ID         uuid.UUID `json:"id"`
	CustomerID uuid.UUID `json:"customer_id"`
	Email      string    `json:"email"`
	Role       string    `json:"role"`
	Token      string    `json:"-"`
	ExpiresAt  time.Time `json:"expires_at"`
	CreatedAt  time.Time `json:"created_at"`
}

// PortalConfig holds white-label branding for the dealer portal.
type PortalConfig struct {
	ID           uuid.UUID `json:"id"`
	DealerName   string    `json:"dealer_name"`
	LogoURL      string    `json:"logo_url"`
	PrimaryColor string    `json:"primary_color"`
	SupportEmail string    `json:"support_email"`
	SupportPhone string    `json:"support_phone"`
	CreatedAt    time.Time `json:"created_at"`
	UpdatedAt    time.Time `json:"updated_at"`
}

// --- Request/Response DTOs ---

// LoginRequest is the payload for portal login.
type LoginRequest struct {
	Email    string `json:"email"`
	Password string `json:"password"`
}

// LoginResponse is returned on successful login.
// The JWT is delivered via httpOnly cookie only — never in the response body.
type LoginResponse struct {
	User   CustomerUser `json:"user"`
	Config PortalConfig `json:"config"`
}

// PortalDashboardDTO aggregates AR and activity data for the contractor.
// TODO: align with int64 cents — BalanceDue, CreditLimit, PastDue are float64 dollars
type PortalDashboardDTO struct {
	BalanceDue   float64          `json:"balance_due"`
	CreditLimit  float64          `json:"credit_limit"`
	PastDue      float64          `json:"past_due"`
	RecentOrders []PortalOrderDTO `json:"recent_orders"`
}

// PortalOrderDTO is a customer-facing order summary.
// TODO: align with int64 cents — TotalAmount is float64 dollars
type PortalOrderDTO struct {
	ID          uuid.UUID       `json:"id"`
	Status      string          `json:"status"`
	TotalAmount float64         `json:"total_amount"`
	CreatedAt   time.Time       `json:"created_at"`
	Lines       []PortalLineDTO `json:"lines"`
}

// PortalLineDTO is a customer-facing order/invoice line item.
// TODO: align with int64 cents — PriceEach is float64 dollars
type PortalLineDTO struct {
	ProductID   uuid.UUID `json:"product_id"`
	ProductSKU  string    `json:"product_sku"`
	ProductName string    `json:"product_name"`
	Quantity    float64   `json:"quantity"`
	PriceEach   float64   `json:"price_each"`
}

// PortalInvoiceDTO is a customer-facing invoice summary.
// TODO: align with int64 cents — TotalAmount, Subtotal, TaxAmount are float64 dollars
type PortalInvoiceDTO struct {
	ID           uuid.UUID       `json:"id"`
	OrderID      uuid.UUID       `json:"order_id"`
	Status       string          `json:"status"`
	TotalAmount  float64         `json:"total_amount"`
	Subtotal     float64         `json:"subtotal"`
	TaxAmount    float64         `json:"tax_amount"`
	PaymentTerms string          `json:"payment_terms"`
	DueDate      *time.Time      `json:"due_date"`
	PaidAt       *time.Time      `json:"paid_at"`
	CreatedAt    time.Time       `json:"created_at"`
	Lines        []PortalLineDTO `json:"lines"`
}

// PortalDeliveryDTO is a customer-facing delivery with POD info and tracking.
type PortalDeliveryDTO struct {
	ID                   uuid.UUID  `json:"id"`
	OrderID              uuid.UUID  `json:"order_id"`
	Status               string     `json:"status"`
	PODProofURL          *string    `json:"pod_proof_url"`
	PODSignedBy          *string    `json:"pod_signed_by"`
	PODTimestamp         *time.Time `json:"pod_timestamp"`
	CreatedAt            time.Time  `json:"created_at"`
	OrderNumber          *string    `json:"order_number"`
	DriverName           *string    `json:"driver_name"`
	DriverPhone          *string    `json:"driver_phone"`
	DriverPhotoURL       *string    `json:"driver_photo_url"`
	VehicleName          *string    `json:"vehicle_name"`
	VehiclePhotoURL      *string    `json:"vehicle_photo_url"`
	ScheduledDate        *time.Time `json:"scheduled_date"`
	EstimatedArrival     *time.Time `json:"estimated_arrival"`
	DeliveryAddress      *string    `json:"delivery_address"`
	StopSequence         *int       `json:"stop_sequence"`
	TotalStops           *int       `json:"total_stops"`
	DeliveryInstructions *string    `json:"delivery_instructions"`
}

// ReorderRequest tells which historical order to duplicate.
type ReorderRequest struct {
	OrderID uuid.UUID `json:"order_id"`
}

// ReorderResponse confirms the new draft order.
type ReorderResponse struct {
	OrderID uuid.UUID `json:"order_id"`
	Message string    `json:"message"`
}

// --- Catalog DTOs ---

// CatalogFilter holds query parameters for catalog browsing.
type CatalogFilter struct {
	Query    string `json:"query"`
	Category string `json:"category"`
	Species  string `json:"species"`
	Grade    string `json:"grade"`
}

// CatalogProductDTO is a portal-facing product with customer-specific pricing and availability.
type CatalogProductDTO struct {
	ID            uuid.UUID `json:"id"`
	SKU           string    `json:"sku"`
	Name          string    `json:"name"`
	Category      string    `json:"category"`
	Species       string    `json:"species"`
	Grade         string    `json:"grade"`
	ImageURL      string    `json:"image_url"`
	UOM           string    `json:"uom"`
	BasePrice     float64   `json:"base_price"`
	CustomerPrice float64   `json:"customer_price"`
	PriceSource   string    `json:"price_source"`
	Available     float64   `json:"available"`
	InStock       bool      `json:"in_stock"`
}

// CatalogDetailDTO is an extended product detail view for the portal.
type CatalogDetailDTO struct {
	CatalogProductDTO
	WeightLbs float64 `json:"weight_lbs"`
	UPC       string  `json:"upc"`
	Vendor    string  `json:"vendor"`
}

// --- Cart DTOs ---

// CartDTO represents a customer's shopping cart.
// TODO: align with int64 cents — Subtotal is float64 dollars
type CartDTO struct {
	ID        uuid.UUID     `json:"id"`
	Items     []CartItemDTO `json:"items"`
	ItemCount int           `json:"item_count"`
	Subtotal  float64       `json:"subtotal"`
}

// CartItemDTO represents a single item in the cart.
// TODO: align with int64 cents — UnitPrice and LineTotal are float64 dollars
type CartItemDTO struct {
	ID          uuid.UUID `json:"id"`
	ProductID   uuid.UUID `json:"product_id"`
	ProductSKU  string    `json:"product_sku"`
	ProductName string    `json:"product_name"`
	ImageURL    string    `json:"image_url"`
	Quantity    float64   `json:"quantity"`
	UnitPrice   float64   `json:"unit_price"`
	LineTotal   float64   `json:"line_total"`
	Available   float64   `json:"available"`
}

// AddToCartRequest is the payload for adding an item to the cart.
type AddToCartRequest struct {
	ProductID uuid.UUID `json:"product_id"`
	Quantity  float64   `json:"quantity"`
}

// UpdateCartItemRequest is the payload for updating a cart item quantity.
type UpdateCartItemRequest struct {
	Quantity float64 `json:"quantity"`
}

// CheckoutRequest is the payload for placing an order from the cart.
type CheckoutRequest struct {
	DeliveryMethod  string `json:"delivery_method"` // DELIVERY or PICKUP
	DeliveryAddress string `json:"delivery_address"`
	PaymentMethod   string `json:"payment_method"` // ACCOUNT or CARD
	Notes           string `json:"notes"`
}

// CheckoutResponse confirms a placed order.
type CheckoutResponse struct {
	OrderID uuid.UUID `json:"order_id"`
	Message string    `json:"message"`
}
