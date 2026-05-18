package product

import (
	"encoding/json"
	"net/http"

	"github.com/gablelbm/gable/pkg/httputil"
	"github.com/gablelbm/gable/pkg/pagination"
	"github.com/google/uuid"
)

// Handler manages HTTP requests for products
type Handler struct {
	service *Service
}

// NewHandler creates a new Product Handler
func NewHandler(service *Service) *Handler {
	return &Handler{service: service}
}

// RegisterRoutes adds handlers to the mux
func (h *Handler) RegisterRoutes(mux *http.ServeMux, roleGuard ...func(http.Handler) http.Handler) {
	guard := func(handler http.HandlerFunc) http.HandlerFunc {
		if len(roleGuard) > 0 && roleGuard[0] != nil {
			return func(w http.ResponseWriter, r *http.Request) {
				roleGuard[0](handler).ServeHTTP(w, r)
			}
		}
		return handler
	}

	mux.HandleFunc("GET /api/v1/products", guard(h.HandleListProducts))
	mux.HandleFunc("POST /api/v1/products", guard(h.HandleCreateProduct))
	mux.HandleFunc("GET /api/v1/products/reorder-alerts", guard(h.HandleReorderAlerts))
	mux.HandleFunc("GET /api/v1/products/{id}", guard(h.HandleGetProduct))
	mux.HandleFunc("PATCH /api/v1/products/{id}/margins", guard(h.HandleUpdateMarginRules))
}

// HandleGetProduct handles GET /products/{id}
func (h *Handler) HandleGetProduct(w http.ResponseWriter, r *http.Request) {
	id, err := uuid.Parse(r.PathValue("id"))
	if err != nil {
		httputil.RespondError(w, r, "invalid id format", http.StatusBadRequest, err)
		return
	}

	p, err := h.service.GetProduct(r.Context(), id)
	if err != nil {
		httputil.RespondError(w, r, "product not found", http.StatusNotFound, err)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(p)
}

// HandleCreateProduct handles POST /products
func (h *Handler) HandleCreateProduct(w http.ResponseWriter, r *http.Request) {
	var p Product
	if err := json.NewDecoder(r.Body).Decode(&p); err != nil {
		httputil.RespondError(w, r, "Invalid request body", http.StatusBadRequest, err)
		return
	}

	if err := h.service.CreateProduct(r.Context(), &p); err != nil {
		httputil.RespondError(w, r, "failed to create product", http.StatusInternalServerError, err)
		return
	}

	w.WriteHeader(http.StatusCreated)
	json.NewEncoder(w).Encode(p)
}

// HandleReorderAlerts handles GET /products/reorder-alerts
func (h *Handler) HandleReorderAlerts(w http.ResponseWriter, r *http.Request) {
	alerts, err := h.service.ListBelowReorder(r.Context())
	if err != nil {
		httputil.RespondError(w, r, "Failed to fetch reorder alerts", http.StatusInternalServerError, err)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(alerts)
}

// HandleListProducts handles GET /products
func (h *Handler) HandleListProducts(w http.ResponseWriter, r *http.Request) {
	page := pagination.FromRequest(r)
	products, total, err := h.service.ListProductsPaginated(r.Context(), page.Limit, page.Offset)
	if err != nil {
		httputil.RespondError(w, r, "Failed to fetch products", http.StatusInternalServerError, err)
		return
	}

	resp := pagination.PagedResponse[Product]{
		Data:   products,
		Total:  total,
		Limit:  page.Limit,
		Offset: page.Offset,
	}
	if resp.Data == nil {
		resp.Data = []Product{}
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(resp)
}

// HandleUpdateMarginRules handles PATCH /products/{id}/margins
func (h *Handler) HandleUpdateMarginRules(w http.ResponseWriter, r *http.Request) {
	idStr := r.PathValue("id")
	if idStr == "" {
		httputil.RespondError(w, r, "id is required", http.StatusBadRequest, nil)
		return
	}

	id, err := uuid.Parse(idStr)
	if err != nil {
		httputil.RespondError(w, r, "invalid id format", http.StatusBadRequest, err)
		return
	}

	var req struct {
		TargetMargin   float64 `json:"target_margin"`
		CommissionRate float64 `json:"commission_rate"`
	}

	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		httputil.RespondError(w, r, "invalid request body", http.StatusBadRequest, err)
		return
	}

	if err := h.service.UpdateMarginRules(r.Context(), id, req.TargetMargin, req.CommissionRate); err != nil {
		httputil.RespondError(w, r, "Failed to update margin rules", http.StatusInternalServerError, err)
		return
	}

	w.WriteHeader(http.StatusOK)
}
