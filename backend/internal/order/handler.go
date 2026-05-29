package order

import (
	"encoding/json"
	"errors"
	"net/http"

	"github.com/gablelbm/gable/pkg/httputil"
	"github.com/gablelbm/gable/pkg/middleware"
	"github.com/gablelbm/gable/pkg/pagination"
	"github.com/google/uuid"
)

// unresolvedExposure is the duck-typed interface pricing.ErrUnresolvedExposure
// satisfies. Detecting it lets the handler render a structured 409 without the
// order package importing pricing.
type unresolvedExposure interface {
	UnresolvedExposurePayload() map[string]any
}

// writeExposureBlock renders the 409 body when err is an unresolved-exposure
// gate error; returns false if err is some other (or nil) error.
func writeExposureBlock(w http.ResponseWriter, err error) bool {
	var ue unresolvedExposure
	if errors.As(err, &ue) {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusConflict)
		json.NewEncoder(w).Encode(ue.UnresolvedExposurePayload())
		return true
	}
	return false
}

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
	mux.HandleFunc("GET /api/v1/orders/{id}/exposure-gate", guard(h.HandleExposureGate))
	mux.HandleFunc("POST /api/v1/orders/{id}/exposure-override", guard(h.HandleExposureOverride))
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
		if writeExposureBlock(w, err) {
			return
		}
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
		if writeExposureBlock(w, err) {
			return
		}
		httputil.RespondError(w, r, "failed to fulfill order", http.StatusInternalServerError, err)
		return
	}

	w.WriteHeader(http.StatusNoContent)
}

// HandleExposureGate reports whether the order is currently blocked by the
// lumber-index pre-ship gate. 200 {"blocked":false} when clear; 409 with the
// exposure payload when blocked.
func (h *Handler) HandleExposureGate(w http.ResponseWriter, r *http.Request) {
	id, err := uuid.Parse(r.PathValue("id"))
	if err != nil {
		httputil.RespondError(w, r, "Invalid Order ID", http.StatusBadRequest, err)
		return
	}
	if err := h.service.CheckExposureGate(r.Context(), id); err != nil {
		if writeExposureBlock(w, err) {
			return
		}
		httputil.RespondError(w, r, "failed to check exposure gate", http.StatusInternalServerError, err)
		return
	}
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]any{"blocked": false})
}

// HandleExposureOverride records an explicit owner override of the pre-ship
// gate. Requires a notes justification (>= 10 chars); writes an OVERRIDDEN
// exposure event + audit entry.
func (h *Handler) HandleExposureOverride(w http.ResponseWriter, r *http.Request) {
	id, err := uuid.Parse(r.PathValue("id"))
	if err != nil {
		httputil.RespondError(w, r, "Invalid Order ID", http.StatusBadRequest, err)
		return
	}
	var body struct {
		Notes string `json:"notes"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		httputil.RespondError(w, r, "Invalid request body", http.StatusBadRequest, err)
		return
	}
	actor, role := "", ""
	if claims, ok := r.Context().Value(middleware.UserContextKey).(*middleware.UserClaims); ok && claims != nil {
		actor = claims.Subject
		role = claims.Role
	}
	if err := h.service.OverrideExposure(r.Context(), id, body.Notes, actor, role); err != nil {
		httputil.RespondError(w, r, err.Error(), http.StatusBadRequest, err)
		return
	}
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]any{"overridden": true})
}
