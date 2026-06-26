package integrations

import (
	"context"
	"crypto/subtle"
	"encoding/json"
	"fmt"
	"log/slog"
	"math"
	"math/rand"
	"net/http"
	"time"

	"github.com/gablelbm/gable/internal/customer"
	"github.com/gablelbm/gable/internal/delivery"
	"github.com/gablelbm/gable/internal/order"
	"github.com/gablelbm/gable/internal/pricing"
	"github.com/gablelbm/gable/internal/product"
	"github.com/gablelbm/gable/internal/quote"
	"github.com/gablelbm/gable/pkg/database"
	"github.com/google/uuid"
)

type Handler struct {
	db          *database.DB
	pricingSvc  *pricing.Service
	quoteSvc    *quote.Service
	orderSvc    *order.Service
	customerSvc *customer.Service
	productSvc  *product.Service
	deliverySvc *delivery.Service
	apiKey      string
}

func NewHandler(db *database.DB, pricingSvc *pricing.Service, quoteSvc *quote.Service, orderSvc *order.Service, customerSvc *customer.Service, productSvc *product.Service, deliverySvc *delivery.Service, apiKey string) *Handler {
	return &Handler{
		db:          db,
		pricingSvc:  pricingSvc,
		quoteSvc:    quoteSvc,
		orderSvc:    orderSvc,
		customerSvc: customerSvc,
		productSvc:  productSvc,
		deliverySvc: deliverySvc,
		apiKey:      apiKey,
	}
}

func (h *Handler) RegisterRoutes(mux *http.ServeMux) {
	mux.HandleFunc("GET /api/integration/products", h.authMiddleware(h.ListProductsByCategory))
	mux.HandleFunc("POST /api/integration/quotes/bulk-price", h.authMiddleware(h.BulkCalculatePrice))
	mux.HandleFunc("POST /api/integration/quotes", h.authMiddleware(h.CreateQuote))
	mux.HandleFunc("POST /api/integration/quotes/{id}/accept-and-convert", h.authMiddleware(h.AcceptAndConvertQuote))

	// AI_LM load-management & routing integration surface
	mux.HandleFunc("GET /api/integration/vehicles", h.authMiddleware(h.ListVehicles))
	mux.HandleFunc("GET /api/integration/drivers", h.authMiddleware(h.ListDrivers))
	mux.HandleFunc("GET /api/integration/orders", h.authMiddleware(h.ListOrdersForDate))
	mux.HandleFunc("POST /api/integration/delivery-routes", h.authMiddleware(h.CreateDeliveryRoute))
	mux.HandleFunc("POST /api/integration/demo/seed-orders", h.authMiddleware(h.SeedDemoOrders))
}

func (h *Handler) authMiddleware(next http.HandlerFunc) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		if h.apiKey == "" {
			writeError(w, http.StatusServiceUnavailable, "Integration endpoints not configured")
			return
		}
		key := r.Header.Get("X-Integration-Key")
		if subtle.ConstantTimeCompare([]byte(key), []byte(h.apiKey)) != 1 {
			writeError(w, http.StatusUnauthorized, "invalid integration key")
			return
		}
		next(w, r)
	}
}

// ProductResponse is the integration-facing product model
type ProductResponse struct {
	ID             string   `json:"id"`
	SKU            string   `json:"sku"`
	Name           string   `json:"name"`
	Category       string   `json:"category"`
	UOM            string   `json:"uom"`
	Price          int64    `json:"price"`      // cents
	WeightLbs      float64  `json:"weight_lbs"` // per-unit weight (lb)
	LengthIn       *float64 `json:"length_in"`  // PIM-canonical geometry (inches); null = unset
	WidthIn        *float64 `json:"width_in"`   // PIM-canonical geometry (inches); null = unset
	HeightIn       *float64 `json:"height_in"`  // PIM-canonical geometry (inches); null = unset
	Stackable      bool     `json:"stackable"`
	GeometrySource string   `json:"geometry_source"`
}

// ListProductsByCategory returns products filtered by category and/or text search
func (h *Handler) ListProductsByCategory(w http.ResponseWriter, r *http.Request) {
	category := r.URL.Query().Get("category")
	query := r.URL.Query().Get("q")

	// With no filter this is a bulk catalog pull (e.g. AI_LM hydrating its
	// load-planning catalog with PIM geometry); a higher cap avoids silently
	// truncating the catalog. Filtered search keeps the small typeahead cap.
	limit := 20
	if category == "" && query == "" {
		limit = 1000
	}

	sqlQuery := `SELECT p.id, p.sku, p.description, COALESCE(p.category, ''), p.uom_primary::text, COALESCE(p.base_price, 0), COALESCE(p.weight_lbs, 0),
		p.length_in, p.width_in, p.height_in, COALESCE(p.stackable, TRUE), COALESCE(p.geometry_source, 'parametric')
		FROM products p WHERE 1=1`
	args := []interface{}{}
	argIdx := 1

	if category != "" {
		sqlQuery += fmt.Sprintf(` AND p.category = $%d`, argIdx)
		args = append(args, category)
		argIdx++
	}
	if query != "" {
		sqlQuery += fmt.Sprintf(` AND (p.sku ILIKE $%d OR p.description ILIKE $%d)`, argIdx, argIdx)
		args = append(args, "%"+query+"%")
		argIdx++
	}
	sqlQuery += fmt.Sprintf(` ORDER BY p.sku LIMIT %d`, limit)

	rows, err := h.db.Pool.Query(r.Context(), sqlQuery, args...)
	if err != nil {
		slog.Error("failed to query products", "error", err, "method", r.Method, "path", r.URL.Path)
		writeError(w, http.StatusInternalServerError, "failed to query products")
		return
	}
	defer rows.Close()

	var products []ProductResponse
	for rows.Next() {
		var p ProductResponse
		var priceFloat float64
		if err := rows.Scan(&p.ID, &p.SKU, &p.Name, &p.Category, &p.UOM, &priceFloat, &p.WeightLbs, &p.LengthIn, &p.WidthIn, &p.HeightIn, &p.Stackable, &p.GeometrySource); err != nil {
			slog.Error("failed to scan product row", "error", err, "method", r.Method, "path", r.URL.Path)
			writeError(w, http.StatusInternalServerError, "failed to read product data")
			return
		}
		p.Price = int64(priceFloat * 100)
		products = append(products, p)
	}

	writeJSON(w, http.StatusOK, products)
}

// BulkPriceRequest is the request body for bulk pricing
type BulkPriceRequest struct {
	CustomerID string          `json:"customer_id"`
	Items      []BulkPriceItem `json:"items"`
}

type BulkPriceItem struct {
	ProductID string `json:"product_id"`
	Quantity  int    `json:"quantity"`
}

type PricedItemResponse struct {
	ProductID   string `json:"product_id"`
	ProductName string `json:"product_name"`
	SKU         string `json:"sku"`
	Quantity    int    `json:"quantity"`
	UnitPrice   int64  `json:"unit_price"`  // cents
	TotalPrice  int64  `json:"total_price"` // cents
	UOM         string `json:"uom"`
}

// BulkCalculatePrice calculates prices for multiple items for a specific customer
func (h *Handler) BulkCalculatePrice(w http.ResponseWriter, r *http.Request) {
	var req BulkPriceRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, http.StatusBadRequest, "invalid request body")
		return
	}

	customerID, err := uuid.Parse(req.CustomerID)
	if err != nil {
		writeError(w, http.StatusBadRequest, "invalid customer_id")
		return
	}

	cust, err := h.customerSvc.GetCustomer(r.Context(), customerID)
	if err != nil {
		slog.Error("customer not found", "error", err, "customer_id", req.CustomerID, "method", r.Method, "path", r.URL.Path)
		writeError(w, http.StatusNotFound, "customer not found")
		return
	}

	var results []PricedItemResponse
	for _, item := range req.Items {
		productID, err := uuid.Parse(item.ProductID)
		if err != nil {
			continue
		}

		prod, err := h.productSvc.GetProduct(r.Context(), productID)
		if err != nil {
			continue
		}

		calculated, err := h.pricingSvc.CalculatePriceWithQty(r.Context(), cust, productID, prod.BasePrice, float64(item.Quantity), nil)
		if err != nil {
			continue
		}

		unitPriceCents := int64(calculated.FinalPrice * 100)
		totalPriceCents := unitPriceCents * int64(item.Quantity)

		results = append(results, PricedItemResponse{
			ProductID:   item.ProductID,
			ProductName: prod.Description,
			SKU:         prod.SKU,
			Quantity:    item.Quantity,
			UnitPrice:   unitPriceCents,
			TotalPrice:  totalPriceCents,
			UOM:         string(prod.UOMPrimary),
		})
	}

	writeJSON(w, http.StatusOK, results)
}

// CreateQuoteRequest is the request body for creating a quote
type CreateQuoteRequest struct {
	CustomerID string           `json:"customer_id"`
	Lines      []QuoteLineInput `json:"lines"`
}

type QuoteLineInput struct {
	ProductID string `json:"product_id"`
	Quantity  int    `json:"quantity"`
	UnitPrice int64  `json:"unit_price"` // cents
}

type QuoteResponse struct {
	ID         string `json:"id"`
	CustomerID string `json:"customer_id"`
	Total      int64  `json:"total"` // cents
	Status     string `json:"status"`
}

// CreateQuote creates a DRAFT quote from pre-priced line items
func (h *Handler) CreateQuote(w http.ResponseWriter, r *http.Request) {
	var req CreateQuoteRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, http.StatusBadRequest, "invalid request body")
		return
	}

	customerID, err := uuid.Parse(req.CustomerID)
	if err != nil {
		writeError(w, http.StatusBadRequest, "invalid customer_id")
		return
	}

	// Build quote lines
	var lines []quote.QuoteLine
	for _, line := range req.Lines {
		productID, err := uuid.Parse(line.ProductID)
		if err != nil {
			continue
		}

		prod, err := h.productSvc.GetProduct(r.Context(), productID)
		if err != nil {
			continue
		}

		unitPriceDollars := float64(line.UnitPrice) / 100.0
		lines = append(lines, quote.QuoteLine{
			ProductID:   productID,
			SKU:         prod.SKU,
			Description: prod.Description,
			Quantity:    float64(line.Quantity),
			UOM:         prod.UOMPrimary,
			UnitPrice:   unitPriceDollars,
		})
	}

	demoCreatedBy := uuid.MustParse("00000000-0000-0000-0000-000000000001")
	expires := time.Now().AddDate(0, 0, 30)

	q := &quote.Quote{
		CustomerID: customerID,
		State:      quote.QuoteStateDraft,
		ExpiresAt:  &expires,
		Lines:      lines,
	}
	// Set CreatedBy via context or field - the service will handle totals
	_ = demoCreatedBy

	if err := h.quoteSvc.CreateQuote(r.Context(), q); err != nil {
		slog.Error("failed to create quote", "error", err, "method", r.Method, "path", r.URL.Path)
		writeError(w, http.StatusInternalServerError, "failed to create quote")
		return
	}

	totalCents := int64(q.TotalAmount * 100)

	writeJSON(w, http.StatusCreated, QuoteResponse{
		ID:         q.ID.String(),
		CustomerID: req.CustomerID,
		Total:      totalCents,
		Status:     string(q.State),
	})
}

type OrderResponse struct {
	ID      string `json:"id"`
	QuoteID string `json:"quote_id"`
	Status  string `json:"status"`
}

// AcceptAndConvertQuote accepts a quote and converts it to an order
func (h *Handler) AcceptAndConvertQuote(w http.ResponseWriter, r *http.Request) {
	idStr := r.PathValue("id")
	quoteID, err := uuid.Parse(idStr)
	if err != nil {
		writeError(w, http.StatusBadRequest, "invalid quote id")
		return
	}

	ctx := r.Context()

	// 1. Load the quote first. We intentionally do NOT mark it ACCEPTED yet —
	//    QuoteStateAccepted is terminal, so accepting it before the order is
	//    created would strand the quote un-reconvertible if order creation fails.
	q, err := h.quoteSvc.GetQuote(ctx, quoteID)
	if err != nil {
		slog.Error("failed to get quote", "error", err, "quote_id", idStr, "method", r.Method, "path", r.URL.Path)
		writeError(w, http.StatusInternalServerError, "failed to get quote")
		return
	}

	// 2. Convert to order — PriceEach is now int64 cents
	// TODO: align with int64 cents — quote.UnitPrice is still float64 dollars
	var orderLines []order.OrderLineRequest
	for _, ql := range q.Lines {
		orderLines = append(orderLines, order.OrderLineRequest{
			ProductID: ql.ProductID,
			Quantity:  ql.Quantity,
			PriceEach: int64(math.Round(ql.UnitPrice * 100)),
		})
	}

	o, err := h.orderSvc.CreateOrder(ctx, order.CreateOrderRequest{
		CustomerID: q.CustomerID,
		QuoteID:    &quoteID,
		Lines:      orderLines,
	})
	if err != nil {
		slog.Error("failed to create order from quote", "error", err, "quote_id", idStr, "method", r.Method, "path", r.URL.Path)
		writeError(w, http.StatusInternalServerError, "failed to create order")
		return
	}

	// 3. Now that the order exists, mark the quote accepted.
	if err := h.quoteSvc.UpdateState(ctx, quoteID, quote.QuoteStateAccepted); err != nil {
		slog.Error("order created but quote not marked accepted", "error", err, "order_id", o.ID, "quote_id", idStr)
		writeError(w, http.StatusInternalServerError, "order "+o.ID.String()+" created but quote could not be accepted")
		return
	}

	// 4. Confirm the order. A failure here is reported (not silently masked as a
	//    200 success) — the order exists in DRAFT and confirmation can be retried.
	if err := h.orderSvc.ConfirmOrder(ctx, o.ID); err != nil {
		slog.Error("order created but not confirmed", "order_id", o.ID, "error", err)
		writeError(w, http.StatusConflict, "order "+o.ID.String()+" created from quote but could not be confirmed: "+err.Error())
		return
	}

	// Reflect the true post-confirmation status in the response.
	status := "CONFIRMED"
	if confirmed, gErr := h.orderSvc.GetOrder(ctx, o.ID); gErr == nil {
		status = string(confirmed.Status)
	}

	writeJSON(w, http.StatusOK, OrderResponse{
		ID:      o.ID.String(),
		QuoteID: quoteID.String(),
		Status:  status,
	})
}

func (h *Handler) confirmOrder(ctx context.Context, orderID uuid.UUID) error {
	return h.orderSvc.ConfirmOrder(ctx, orderID)
}

// VehicleResponse is the integration-facing fleet model. AI_LM keys its own
// axle/bed-dimension profiles by this id.
type VehicleResponse struct {
	ID                string  `json:"id"`
	Name              string  `json:"name"`
	VehicleType       string  `json:"vehicle_type"`
	CapacityWeightLbs *int    `json:"capacity_weight_lbs,omitempty"`
	Make              *string `json:"make,omitempty"`
	Model             *string `json:"model,omitempty"`
	Year              *int    `json:"year,omitempty"`
}

// ListVehicles returns the active fleet for AI_LM load/route planning.
func (h *Handler) ListVehicles(w http.ResponseWriter, r *http.Request) {
	if h.deliverySvc == nil {
		writeError(w, http.StatusServiceUnavailable, "delivery service not configured")
		return
	}
	vehicles, err := h.deliverySvc.ListVehicles(r.Context())
	if err != nil {
		slog.Error("failed to list vehicles", "error", err, "method", r.Method, "path", r.URL.Path)
		writeError(w, http.StatusInternalServerError, "failed to list vehicles")
		return
	}
	resp := make([]VehicleResponse, 0, len(vehicles))
	for _, v := range vehicles {
		resp = append(resp, VehicleResponse{
			ID:                v.ID.String(),
			Name:              v.Name,
			VehicleType:       string(v.VehicleType),
			CapacityWeightLbs: v.CapacityWeightLbs,
			Make:              v.Make,
			Model:             v.Model,
			Year:              v.Year,
		})
	}
	writeJSON(w, http.StatusOK, resp)
}

// DriverResponse is the integration-facing driver model. AI_LM needs a valid
// driver id to attach to each delivery_route it writes back.
type DriverResponse struct {
	ID     string `json:"id"`
	Name   string `json:"name"`
	Status string `json:"status"` // ACTIVE/INACTIVE/ON_LEAVE
}

// ListDrivers returns the fleet's drivers for AI_LM route write-back.
func (h *Handler) ListDrivers(w http.ResponseWriter, r *http.Request) {
	if h.deliverySvc == nil {
		writeError(w, http.StatusServiceUnavailable, "delivery service not configured")
		return
	}
	drivers, err := h.deliverySvc.ListDrivers(r.Context())
	if err != nil {
		slog.Error("failed to list drivers", "error", err, "method", r.Method, "path", r.URL.Path)
		writeError(w, http.StatusInternalServerError, "failed to list drivers")
		return
	}
	resp := make([]DriverResponse, 0, len(drivers))
	for _, d := range drivers {
		resp = append(resp, DriverResponse{
			ID:     d.ID.String(),
			Name:   d.Name,
			Status: string(d.Status),
		})
	}
	writeJSON(w, http.StatusOK, resp)
}

// IntegrationOrderLine carries the per-product weight AI_LM needs for the
// load solver. weight_lbs is the per-unit weight from the catalog.
type IntegrationOrderLine struct {
	ProductID string  `json:"product_id"`
	SKU       string  `json:"sku"`
	Quantity  float64 `json:"quantity"`
	WeightLbs float64 `json:"weight_lbs"`
}

// IntegrationOrderResponse is an order plus its line items and (when a delivery
// stop has been geocoded) its destination coordinates. Field names mirror
// AI_LM's gable.Order (customer_name, address, latitude, longitude, lines).
type IntegrationOrderResponse struct {
	ID           string                 `json:"id"`
	Status       string                 `json:"status"`
	CustomerName string                 `json:"customer_name,omitempty"`
	Address      string                 `json:"address,omitempty"`
	Latitude     *float64               `json:"latitude,omitempty"`
	Longitude    *float64               `json:"longitude,omitempty"`
	Lines        []IntegrationOrderLine `json:"lines"`
}

// ListOrdersForDate returns orders (optionally filtered by ?status= and ?date=)
// with line items + per-unit weights for AI_LM routing/load planning. Read-only.
func (h *Handler) ListOrdersForDate(w http.ResponseWriter, r *http.Request) {
	status := r.URL.Query().Get("status")
	date := r.URL.Query().Get("date")

	// Coordinates come from a LATERAL pick of a single geocoded delivery stop
	// per order — a plain JOIN to deliveries would multiply the line-item rows
	// once AI_LM writes a route back (a second delivery row appears for the
	// order). The date filter matches the SCHEDULED delivery date, falling back
	// to created_at when an order has none (legacy/non-scheduled orders).
	sqlQuery := `
		SELECT o.id, o.status, COALESCE(c.name, ''), COALESCE(c.address, ''),
		       ol.product_id, p.sku, ol.quantity, COALESCE(p.weight_lbs, 0),
		       d.latitude, d.longitude
		FROM orders o
		JOIN order_lines ol ON ol.order_id = o.id
		JOIN products p ON p.id = ol.product_id
		LEFT JOIN customers c ON c.id = o.customer_id
		LEFT JOIN LATERAL (
		    SELECT latitude, longitude FROM deliveries
		    WHERE order_id = o.id AND latitude IS NOT NULL AND longitude IS NOT NULL
		    ORDER BY created_at
		    LIMIT 1
		) d ON TRUE
		WHERE 1=1`
	args := []interface{}{}
	argIdx := 1
	if status != "" {
		sqlQuery += fmt.Sprintf(" AND o.status = $%d", argIdx)
		args = append(args, status)
		argIdx++
	}
	if date != "" {
		sqlQuery += fmt.Sprintf(" AND COALESCE(o.scheduled_delivery_date, o.created_at::date) = $%d::date", argIdx)
		args = append(args, date)
		argIdx++
	}
	sqlQuery += " ORDER BY o.created_at, o.id, ol.product_id"

	rows, err := h.db.Pool.Query(r.Context(), sqlQuery, args...)
	if err != nil {
		slog.Error("failed to query orders", "error", err, "method", r.Method, "path", r.URL.Path)
		writeError(w, http.StatusInternalServerError, "failed to query orders")
		return
	}
	defer rows.Close()

	ordersByID := map[string]*IntegrationOrderResponse{}
	var order_order []string
	for rows.Next() {
		var (
			orderID, orderStatus, custName, custAddr, productID, sku string
			qty, weight                                             float64
			lat, lng                                                *float64
		)
		if err := rows.Scan(&orderID, &orderStatus, &custName, &custAddr, &productID, &sku, &qty, &weight, &lat, &lng); err != nil {
			slog.Error("failed to scan order row", "error", err, "method", r.Method, "path", r.URL.Path)
			writeError(w, http.StatusInternalServerError, "failed to read order data")
			return
		}
		o, ok := ordersByID[orderID]
		if !ok {
			o = &IntegrationOrderResponse{ID: orderID, Status: orderStatus, CustomerName: custName, Address: custAddr, Latitude: lat, Longitude: lng}
			ordersByID[orderID] = o
			order_order = append(order_order, orderID)
		}
		if o.Latitude == nil && lat != nil {
			o.Latitude, o.Longitude = lat, lng
		}
		o.Lines = append(o.Lines, IntegrationOrderLine{
			ProductID: productID,
			SKU:       sku,
			Quantity:  qty,
			WeightLbs: weight,
		})
	}

	resp := make([]IntegrationOrderResponse, 0, len(order_order))
	for _, id := range order_order {
		resp = append(resp, *ordersByID[id])
	}
	writeJSON(w, http.StatusOK, resp)
}

// DeliveryRouteRequest is the approved-plan write-back body from AI_LM. The
// field names mirror AI_LM's gable.DeliveryRoute. LoadManifest is the optional
// 3D packing manifest (any JSON) that GableLBM persists per stop's order to
// power the yard "Pack Trucks" surface.
type DeliveryRouteRequest struct {
	VehicleID     string              `json:"vehicle_id"`
	DriverID      string              `json:"driver_id"`
	ScheduledDate string              `json:"scheduled_date"` // YYYY-MM-DD
	Notes         string              `json:"notes"`
	Stops         []DeliveryStopInput `json:"stops"`
	LoadManifest  json.RawMessage     `json:"load_manifest,omitempty"`
}

type DeliveryStopInput struct {
	OrderID  string   `json:"order_id"`
	Sequence int      `json:"sequence"`
	Lat      *float64 `json:"lat"`
	Lng      *float64 `json:"lng"`
}

type DeliveryRouteResponse struct {
	RouteID   string `json:"route_id"`
	StopCount int    `json:"stop_count"`
	Created   bool   `json:"created"` // false when an existing route was returned (idempotent)
}

// CreateDeliveryRoute persists an AI_LM-approved route as a GableLBM
// delivery_routes row + deliveries rows. Idempotent on (vehicle_id, scheduled_date):
// if a route already exists for that pair it is returned unchanged.
func (h *Handler) CreateDeliveryRoute(w http.ResponseWriter, r *http.Request) {
	if h.deliverySvc == nil {
		writeError(w, http.StatusServiceUnavailable, "delivery service not configured")
		return
	}
	var req DeliveryRouteRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, http.StatusBadRequest, "invalid request body")
		return
	}
	vehicleID, err := uuid.Parse(req.VehicleID)
	if err != nil {
		writeError(w, http.StatusBadRequest, "invalid vehicle_id")
		return
	}
	if _, err := uuid.Parse(req.DriverID); err != nil {
		writeError(w, http.StatusBadRequest, "invalid driver_id")
		return
	}
	if req.ScheduledDate == "" {
		writeError(w, http.StatusBadRequest, "scheduled_date required")
		return
	}

	ctx := r.Context()

	// Persist the packing manifest onto each stop's order regardless of whether
	// the route is newly created or already existed (idempotent re-push) — the
	// latest approved manifest always wins for the yard "Pack Trucks" surface.
	h.persistManifests(ctx, req.Stops, req.LoadManifest)

	// Idempotency: reuse an existing route for the same vehicle + date.
	existing, err := h.deliverySvc.ListRoutes(ctx, &req.ScheduledDate, nil)
	if err != nil {
		slog.Error("failed to list routes", "error", err, "method", r.Method, "path", r.URL.Path)
		writeError(w, http.StatusInternalServerError, "failed to check existing routes")
		return
	}
	for _, route := range existing {
		if route.VehicleID == vehicleID {
			writeJSON(w, http.StatusOK, DeliveryRouteResponse{
				RouteID:   route.ID.String(),
				StopCount: route.StopCount,
				Created:   false,
			})
			return
		}
	}

	var notes *string
	if req.Notes != "" {
		notes = &req.Notes
	}
	route, err := h.deliverySvc.CreateRoute(ctx, delivery.CreateRouteRequest{
		VehicleID:     vehicleID,
		DriverID:      uuid.MustParse(req.DriverID),
		ScheduledDate: req.ScheduledDate,
		Notes:         notes,
	})
	if err != nil {
		slog.Error("failed to create route", "error", err, "method", r.Method, "path", r.URL.Path)
		writeError(w, http.StatusInternalServerError, "failed to create route")
		return
	}

	created := 0
	for _, s := range req.Stops {
		orderID, err := uuid.Parse(s.OrderID)
		if err != nil {
			continue
		}
		if err := h.deliverySvc.CreateDeliveryStop(ctx, route.ID, orderID, s.Sequence, s.Lat, s.Lng); err != nil {
			slog.Warn("failed to create delivery stop", "order_id", s.OrderID, "error", err)
			continue
		}
		created++
	}

	writeJSON(w, http.StatusCreated, DeliveryRouteResponse{
		RouteID:   route.ID.String(),
		StopCount: created,
		Created:   true,
	})
}

// persistManifests writes the AI_LM-approved packing manifest (JSONB) onto every
// stop's order. The same route-level manifest is stored on each order in the
// route so the yard "Pack Trucks" view can replay loading for any of them. No-op
// when no manifest was sent.
func (h *Handler) persistManifests(ctx context.Context, stops []DeliveryStopInput, manifest json.RawMessage) {
	if len(manifest) == 0 || string(manifest) == "null" {
		return
	}
	for _, s := range stops {
		orderID, err := uuid.Parse(s.OrderID)
		if err != nil {
			continue
		}
		if _, err := h.db.Pool.Exec(ctx,
			`UPDATE orders SET packing_manifest = $1, updated_at = NOW() WHERE id = $2`,
			[]byte(manifest), orderID,
		); err != nil {
			slog.Warn("failed to persist packing manifest", "order_id", s.OrderID, "error", err)
		}
	}
}

// SeedOrdersRequest is the demo-seed request body. Both fields are optional:
// AI_LM's client sends only {date} (empty = tomorrow).
type SeedOrdersRequest struct {
	Date  string `json:"date"`  // YYYY-MM-DD; empty = tomorrow
	Count int    `json:"count"` // max orders to create; 0 = one per demo customer
}

// SeededOrderResponse mirrors AI_LM's gable.SeededOrder.
type SeededOrderResponse struct {
	ID           string  `json:"id"`
	CustomerName string  `json:"customer_name"`
	Address      string  `json:"address"`
	Lines        int     `json:"lines"`
	WeightLbs    float64 `json:"weight_lbs"`
}

// SeedOrdersResponse mirrors AI_LM's gable.SeedResult.
type SeedOrdersResponse struct {
	Date   string                `json:"date"`
	Orders []SeededOrderResponse `json:"orders"`
}

// kelownaDeliveryPoints are sensible Okanagan-area delivery coordinates assigned
// round-robin to seeded orders so stops scatter realistically on AI_LM's map.
var kelownaDeliveryPoints = [][2]float64{
	{49.8888, -119.4597}, // Spall Rd, Kelowna
	{49.9201, -119.3950}, // UBCO / Summit Pkwy
	{50.0490, -119.4060}, // Lake Country
	{49.8350, -119.5760}, // Mission Hill, West Kelowna
	{49.8330, -119.6190}, // Boucherie Rd, West Kelowna
	{49.8880, -119.4960}, // Bernard Ave, Kelowna
	{49.9050, -119.4900}, // Knox Mountain Dr, Kelowna
	{49.7730, -119.7280}, // Beach Ave, Peachland
	{50.2530, -119.2750}, // Polson Dr, Vernon
	{49.6000, -119.6800}, // Prairie Valley Rd, Summerland
}

// SeedDemoOrders creates a batch of future-dated CONFIRMED lumber orders for
// existing demo customers so AI_LM has upcoming deliveries to plan. Each order
// gets dimensioned lumber lines (digital-twin geometry), a geolocated delivery
// stop, and a scheduled_delivery_date. Reuses order.Service create+confirm so
// inventory allocation stays consistent. Idempotent: a (customer, date) that
// already has a CONFIRMED order is skipped. Response shape mirrors AI_LM's
// gable.SeedResult. Body is optional ({date, count}); empty date = tomorrow.
func (h *Handler) SeedDemoOrders(w http.ResponseWriter, r *http.Request) {
	if h.orderSvc == nil {
		writeError(w, http.StatusServiceUnavailable, "order service not configured")
		return
	}
	ctx := r.Context()

	var req SeedOrdersRequest
	// Body is optional — ignore EOF/decode errors so an empty POST still seeds.
	_ = json.NewDecoder(r.Body).Decode(&req)

	// Resolve the target scheduled delivery date (default: tomorrow). All seeded
	// orders share this date so the response's single `date` field is unambiguous
	// (matching AI_LM's SeedResult shape).
	schedDate := time.Now().AddDate(0, 0, 1)
	if req.Date != "" {
		parsed, err := time.Parse("2006-01-02", req.Date)
		if err != nil {
			writeError(w, http.StatusBadRequest, "invalid date (want YYYY-MM-DD)")
			return
		}
		schedDate = parsed
	}
	dateStr := schedDate.Format("2006-01-02")

	// Pick lumber products that carry digital-twin geometry (migration 073) so
	// the seeded lines render true-to-scale; fall back to any product so the
	// seed still works on a catalog without dimensions.
	lumber, err := h.seedLumberProducts(ctx)
	if err != nil || len(lumber) == 0 {
		slog.Error("seed-orders: no products available", "error", err)
		writeError(w, http.StatusServiceUnavailable, "no products available to seed orders")
		return
	}

	// Load existing demo customers (deterministic order for stable selection).
	custRows, err := h.db.Pool.Query(ctx, `SELECT id, COALESCE(name, ''), COALESCE(address, '') FROM customers ORDER BY name`)
	if err != nil {
		slog.Error("seed-orders: failed to query customers", "error", err)
		writeError(w, http.StatusInternalServerError, "failed to load customers")
		return
	}
	type seedCust struct {
		id      uuid.UUID
		name    string
		address string
	}
	var customers []seedCust
	for custRows.Next() {
		var c seedCust
		if err := custRows.Scan(&c.id, &c.name, &c.address); err != nil {
			custRows.Close()
			slog.Error("seed-orders: failed to scan customer", "error", err)
			writeError(w, http.StatusInternalServerError, "failed to read customers")
			return
		}
		customers = append(customers, c)
	}
	custRows.Close()
	if len(customers) == 0 {
		writeError(w, http.StatusServiceUnavailable, "no demo customers to seed orders for")
		return
	}

	limit := req.Count
	if limit <= 0 || limit > len(customers) {
		limit = len(customers)
	}

	for i := 0; i < limit; i++ {
		c := customers[i]

		// Idempotency: skip a customer that already has a CONFIRMED order on this
		// scheduled date (a leftover DRAFT from a failed confirm does not block a retry).
		var exists bool
		if err := h.db.Pool.QueryRow(ctx,
			`SELECT EXISTS(SELECT 1 FROM orders WHERE customer_id = $1 AND scheduled_delivery_date = $2::date AND status = 'CONFIRMED')`,
			c.id, dateStr,
		).Scan(&exists); err != nil {
			slog.Warn("seed-orders: idempotency check failed", "customer_id", c.id, "error", err)
			continue
		}
		if exists {
			continue
		}

		// 2–4 dimensioned lumber lines per order.
		numLines := 2 + rand.Intn(3)
		var lines []order.OrderLineRequest
		for j := 0; j < numLines; j++ {
			p := lumber[rand.Intn(len(lumber))]
			qty := float64(10 + rand.Intn(40))
			lines = append(lines, order.OrderLineRequest{
				ProductID: p.id,
				Quantity:  qty,
				PriceEach: int64(math.Round(p.price * 100)),
			})
		}

		sched := schedDate
		o, err := h.orderSvc.CreateOrder(ctx, order.CreateOrderRequest{
			CustomerID:            c.id,
			Lines:                 lines,
			ScheduledDeliveryDate: &sched,
		})
		if err != nil {
			slog.Warn("seed-orders: failed to create order", "customer_id", c.id, "error", err)
			continue
		}
		// Confirm so AI_LM's CONFIRMED-only pull sees it. A confirm failure (e.g.
		// over credit limit → ON_HOLD) is logged and skipped, not fatal.
		if err := h.orderSvc.ConfirmOrder(ctx, o.ID); err != nil {
			slog.Warn("seed-orders: failed to confirm order", "order_id", o.ID, "customer_id", c.id, "error", err)
			continue
		}

		// Geolocated delivery stop (route_id NULL — unrouted, awaiting AI_LM
		// dispatch) so the order carries coordinates on the orders pull.
		pt := kelownaDeliveryPoints[i%len(kelownaDeliveryPoints)]
		lat := pt[0] + (rand.Float64()-0.5)*0.02
		lng := pt[1] + (rand.Float64()-0.5)*0.02
		if _, err := h.db.Pool.Exec(ctx,
			`INSERT INTO deliveries (order_id, stop_sequence, status, latitude, longitude, delivery_instructions)
			 VALUES ($1, 0, 'PENDING', $2, $3, $4)`,
			o.ID, lat, lng, "AI_LM demo upcoming delivery",
		); err != nil {
			slog.Warn("seed-orders: failed to create delivery stop", "order_id", o.ID, "error", err)
		}
	}

	// Build the result from ALL CONFIRMED orders on this date (newly created +
	// any pre-existing), so a re-seed still returns the full populated set.
	resp := SeedOrdersResponse{Date: dateStr, Orders: []SeededOrderResponse{}}
	resRows, err := h.db.Pool.Query(ctx, `
		SELECT o.id, COALESCE(c.name, ''), COALESCE(c.address, ''),
		       COUNT(ol.id), COALESCE(SUM(ol.quantity * COALESCE(p.weight_lbs, 0)), 0)
		FROM orders o
		LEFT JOIN customers c ON c.id = o.customer_id
		LEFT JOIN order_lines ol ON ol.order_id = o.id
		LEFT JOIN products p ON p.id = ol.product_id
		WHERE o.scheduled_delivery_date = $1::date AND o.status = 'CONFIRMED'
		GROUP BY o.id, c.name, c.address
		ORDER BY c.name`, dateStr)
	if err != nil {
		slog.Error("seed-orders: failed to build result", "error", err)
		writeError(w, http.StatusInternalServerError, "orders seeded but failed to build response")
		return
	}
	defer resRows.Close()
	for resRows.Next() {
		var so SeededOrderResponse
		if err := resRows.Scan(&so.ID, &so.CustomerName, &so.Address, &so.Lines, &so.WeightLbs); err != nil {
			slog.Error("seed-orders: failed to scan result row", "error", err)
			writeError(w, http.StatusInternalServerError, "failed to read seeded orders")
			return
		}
		resp.Orders = append(resp.Orders, so)
	}

	writeJSON(w, http.StatusOK, resp)
}

// seedProduct is a catalog product used to build seeded order lines.
type seedProduct struct {
	id    uuid.UUID
	price float64
}

// seedLumberProducts returns lumber SKUs that carry digital-twin geometry
// (length/width/height from migration 073), preferring dimensioned products so
// AI_LM's Load Builder renders true-to-scale twins. Falls back to any lumber,
// then any product, so the seed works on a catalog without dimensions.
func (h *Handler) seedLumberProducts(ctx context.Context) ([]seedProduct, error) {
	queries := []string{
		`SELECT id, COALESCE(base_price, 0) FROM products
		 WHERE length_in IS NOT NULL AND width_in IS NOT NULL AND height_in IS NOT NULL
		 ORDER BY sku LIMIT 20`,
		`SELECT id, COALESCE(base_price, 0) FROM products WHERE category = 'Lumber' ORDER BY sku LIMIT 20`,
		`SELECT id, COALESCE(base_price, 0) FROM products ORDER BY sku LIMIT 20`,
	}
	for _, q := range queries {
		rows, err := h.db.Pool.Query(ctx, q)
		if err != nil {
			return nil, err
		}
		var out []seedProduct
		for rows.Next() {
			var p seedProduct
			if err := rows.Scan(&p.id, &p.price); err != nil {
				rows.Close()
				return nil, err
			}
			out = append(out, p)
		}
		rows.Close()
		if len(out) > 0 {
			return out, nil
		}
	}
	return nil, nil
}

func writeJSON(w http.ResponseWriter, status int, v interface{}) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	json.NewEncoder(w).Encode(v)
}

func writeError(w http.ResponseWriter, status int, msg string) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	json.NewEncoder(w).Encode(map[string]string{"error": msg})
}
