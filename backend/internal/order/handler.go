package order

import (
	"encoding/json"
	"net/http"

	"github.com/gablelbm/gable/pkg/httputil"
	"github.com/gablelbm/gable/pkg/pagination"
	"github.com/google/uuid"
)

type Handler struct {
	service *Service
}

func NewHandler(service *Service) *Handler {
	return &Handler{service: service}
}

func (h *Handler) RegisterRoutes(mux *http.ServeMux, roleGuard ...func(http.Handler) http.Handler) {
	guard := func(handler http.HandlerFunc) http.HandlerFunc {
		if len(roleGuard) > 0 && roleGuard[0] != nil {
			return func(w http.ResponseWriter, r *http.Request) {
				roleGuard[0](handler).ServeHTTP(w, r)
			}
		}
		return handler
	}

	mux.HandleFunc("POST /api/v1/orders", guard(h.HandleCreateOrder))
	mux.HandleFunc("GET /api/v1/orders", guard(h.HandleListOrders))
	mux.HandleFunc("GET /api/v1/orders/{id}", guard(h.HandleGetOrder))
	mux.HandleFunc("POST /api/v1/orders/{id}/confirm", guard(h.HandleConfirmOrder))
	mux.HandleFunc("POST /api/v1/orders/{id}/fulfill", guard(h.HandleFulfillOrder))
}

func (h *Handler) HandleCreateOrder(w http.ResponseWriter, r *http.Request) {
	var req CreateOrderRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		httputil.RespondError(w, r, "Invalid request body", http.StatusBadRequest, err)
		return
	}

	o, err := h.service.CreateOrder(r.Context(), req)
	if err != nil {
		httputil.RespondError(w, r, "failed to create order", http.StatusInternalServerError, err)
		return
	}

	w.WriteHeader(http.StatusCreated)
	json.NewEncoder(w).Encode(o)
}

func (h *Handler) HandleListOrders(w http.ResponseWriter, r *http.Request) {
	page := pagination.FromRequest(r)
	orders, total, err := h.service.ListOrdersPaginated(r.Context(), page.Limit, page.Offset)
	if err != nil {
		httputil.RespondError(w, r, "Failed to fetch orders", http.StatusInternalServerError, err)
		return
	}

	resp := pagination.PagedResponse[Order]{
		Data:   orders,
		Total:  total,
		Limit:  page.Limit,
		Offset: page.Offset,
	}
	if resp.Data == nil {
		resp.Data = []Order{}
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(resp)
}

func (h *Handler) HandleGetOrder(w http.ResponseWriter, r *http.Request) {
	idStr := r.PathValue("id")
	id, err := uuid.Parse(idStr)
	if err != nil {
		httputil.RespondError(w, r, "Invalid Order ID", http.StatusBadRequest, err)
		return
	}

	o, err := h.service.GetOrder(r.Context(), id)
	if err != nil {
		httputil.RespondError(w, r, "order not found", http.StatusNotFound, err)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(o)
}

func (h *Handler) HandleConfirmOrder(w http.ResponseWriter, r *http.Request) {
	idStr := r.PathValue("id")
	id, err := uuid.Parse(idStr)
	if err != nil {
		httputil.RespondError(w, r, "Invalid Order ID", http.StatusBadRequest, err)
		return
	}

	if err := h.service.ConfirmOrder(r.Context(), id); err != nil {
		httputil.RespondError(w, r, "failed to confirm order", http.StatusInternalServerError, err)
		return
	}

	w.WriteHeader(http.StatusNoContent)
}

func (h *Handler) HandleFulfillOrder(w http.ResponseWriter, r *http.Request) {
	idStr := r.PathValue("id")
	id, err := uuid.Parse(idStr)
	if err != nil {
		httputil.RespondError(w, r, "Invalid Order ID", http.StatusBadRequest, err)
		return
	}

	if err := h.service.FulfillOrder(r.Context(), id); err != nil {
		httputil.RespondError(w, r, "failed to fulfill order", http.StatusInternalServerError, err)
		return
	}

	w.WriteHeader(http.StatusNoContent)
}
