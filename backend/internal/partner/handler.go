package partner

import (
	"encoding/json"
	"net/http"

	"github.com/gablelbm/gable/internal/customer"
	"github.com/gablelbm/gable/pkg/httputil"
	"github.com/gablelbm/gable/pkg/middleware"
	"github.com/google/uuid"
)

type Handler struct {
	svc *Service
}

func NewHandler(svc *Service) *Handler {
	return &Handler{svc: svc}
}

func (h *Handler) RegisterRoutes(mux *http.ServeMux, authMw func(http.Handler) http.Handler) {
	mux.Handle("GET /api/partner/v1/dashboard", authMw(http.HandlerFunc(h.GetDashboard)))
	mux.Handle("GET /api/partner/v1/quotes", authMw(http.HandlerFunc(h.ListQuotes)))
	mux.Handle("GET /api/partner/v1/quotes/{id}", authMw(http.HandlerFunc(h.GetQuote)))
}

func (h *Handler) GetDashboard(w http.ResponseWriter, r *http.Request) {
	cust, ok := r.Context().Value(middleware.CustomerContextKey).(*customer.Customer)
	if !ok || cust == nil {
		httputil.RespondError(w, r, "unauthorized", http.StatusUnauthorized, nil)
		return
	}

	dto, err := h.svc.GetDashboard(r.Context(), cust.ID)
	if err != nil {
		httputil.RespondError(w, r, "Internal Server Error", http.StatusInternalServerError, err)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(dto)
}

func (h *Handler) ListQuotes(w http.ResponseWriter, r *http.Request) {
	cust, ok := r.Context().Value(middleware.CustomerContextKey).(*customer.Customer)
	if !ok || cust == nil {
		httputil.RespondError(w, r, "unauthorized", http.StatusUnauthorized, nil)
		return
	}

	quotes, err := h.svc.ListQuotes(r.Context(), cust.ID)
	if err != nil {
		httputil.RespondError(w, r, "Internal Server Error", http.StatusInternalServerError, err)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(quotes)
}

func (h *Handler) GetQuote(w http.ResponseWriter, r *http.Request) {
	cust, ok := r.Context().Value(middleware.CustomerContextKey).(*customer.Customer)
	if !ok || cust == nil {
		httputil.RespondError(w, r, "unauthorized", http.StatusUnauthorized, nil)
		return
	}

	idStr := r.PathValue("id")
	id, err := uuid.Parse(idStr)
	if err != nil {
		httputil.RespondError(w, r, "Invalid ID", http.StatusBadRequest, err)
		return
	}

	q, err := h.svc.GetQuote(r.Context(), cust.ID, id)
	if err != nil {
		httputil.RespondError(w, r, "Quote not found", http.StatusNotFound, err)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(q)
}
