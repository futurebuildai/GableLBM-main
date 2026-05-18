package integrations

import (
	"context"
	"crypto/subtle"
	"encoding/json"
	"fmt"
	"log/slog"
	"math"
	"net/http"
	"time"

	"github.com/gablelbm/gable/internal/customer"
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
	apiKey      string
}

func NewHandler(db *database.DB, pricingSvc *pricing.Service, quoteSvc *quote.Service, orderSvc *order.Service, customerSvc *customer.Service, productSvc *product.Service, apiKey string) *Handler {
	return &Handler{
		db:          db,
		pricingSvc:  pricingSvc,
		quoteSvc:    quoteSvc,
		orderSvc:    orderSvc,
		customerSvc: customerSvc,
		productSvc:  productSvc,
		apiKey:      apiKey,
	}
}

func (h *Handler) RegisterRoutes(mux *http.ServeMux) {
	mux.HandleFunc("GET /api/integration/products", h.authMiddleware(h.ListProductsByCategory))
	mux.HandleFunc("POST /api/integration/quotes/bulk-price", h.authMiddleware(h.BulkCalculatePrice))
	mux.HandleFunc("POST /api/integration/quotes", h.authMiddleware(h.CreateQuote))
	mux.HandleFunc("POST /api/integration/quotes/{id}/accept-and-convert", h.authMiddleware(h.AcceptAndConvertQuote))
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
	ID       string  `json:"id"`
	SKU      string  `json:"sku"`
	Name     string  `json:"name"`
	Category string  `json:"category"`
	UOM      string  `json:"uom"`
	Price    int64   `json:"price"` // cents
}

// ListProductsByCategory returns products filtered by category and/or text search
func (h *Handler) ListProductsByCategory(w http.ResponseWriter, r *http.Request) {
	category := r.URL.Query().Get("category")
	query := r.URL.Query().Get("q")

	if category == "" && query == "" {
		writeError(w, http.StatusBadRequest, "category or q query parameter required")
		return
	}

	sqlQuery := `SELECT p.id, p.sku, p.description, COALESCE(p.category, ''), p.uom_primary::text, COALESCE(p.base_price, 0)
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
	sqlQuery += ` ORDER BY p.sku LIMIT 20`

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
		if err := rows.Scan(&p.ID, &p.SKU, &p.Name, &p.Category, &p.UOM, &priceFloat); err != nil {
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

	// 1. Accept the quote
	if err := h.quoteSvc.UpdateState(ctx, quoteID, quote.QuoteStateAccepted); err != nil {
		slog.Error("failed to accept quote", "error", err, "quote_id", idStr, "method", r.Method, "path", r.URL.Path)
		writeError(w, http.StatusInternalServerError, "failed to accept quote")
		return
	}

	// 2. Get the quote to build order
	q, err := h.quoteSvc.GetQuote(ctx, quoteID)
	if err != nil {
		slog.Error("failed to get quote", "error", err, "quote_id", idStr, "method", r.Method, "path", r.URL.Path)
		writeError(w, http.StatusInternalServerError, "failed to get quote")
		return
	}

	// 3. Convert to order — PriceEach is now int64 cents
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

	// 4. Confirm the order
	if err := h.confirmOrder(ctx, o.ID); err != nil {
		// Order created but not confirmed - still return success
		slog.Warn("order created but not confirmed", "order_id", o.ID, "error", err)
	}

	writeJSON(w, http.StatusOK, OrderResponse{
		ID:      o.ID.String(),
		QuoteID: quoteID.String(),
		Status:  string(o.Status),
	})
}

func (h *Handler) confirmOrder(ctx context.Context, orderID uuid.UUID) error {
	return h.orderSvc.ConfirmOrder(ctx, orderID)
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
