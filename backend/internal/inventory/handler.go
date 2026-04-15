package inventory

import (
	"encoding/json"
	"log/slog"
	"net/http"

	"github.com/gablelbm/gable/pkg/httputil"
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

	mux.HandleFunc("POST /api/v1/inventory/adjust", guard(h.AdjustStock))
	mux.HandleFunc("POST /api/v1/inventory/transfer", guard(h.MoveStock))
	mux.HandleFunc("GET /api/v1/inventory", guard(h.ListInventory))
}

func (h *Handler) AdjustStock(w http.ResponseWriter, r *http.Request) {
	var req StockAdjustmentRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		httputil.RespondError(w, r, "Invalid input", http.StatusBadRequest, err)
		return
	}

	if err := h.service.AdjustStock(r.Context(), req); err != nil {
		slog.Error("AdjustStock failed", "error", err)
		httputil.RespondError(w, r, "Internal Server Error", http.StatusInternalServerError, err)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusOK)
	w.Write([]byte(`{"status":"ok"}`))
}

func (h *Handler) MoveStock(w http.ResponseWriter, r *http.Request) {
	var req StockMovementRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		httputil.RespondError(w, r, "Invalid input", http.StatusBadRequest, err)
		return
	}

	if err := h.service.MoveStock(r.Context(), req); err != nil {
		slog.Error("MoveStock failed", "error", err)
		httputil.RespondError(w, r, "Internal Server Error", http.StatusInternalServerError, err)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusOK)
	w.Write([]byte(`{"status":"ok"}`))
}

func (h *Handler) ListInventory(w http.ResponseWriter, r *http.Request) {
	prodID := r.URL.Query().Get("product_id")
	if prodID == "" {
		httputil.RespondError(w, r, "product_id required", http.StatusBadRequest, nil)
		return
	}

	items, err := h.service.ListByProduct(r.Context(), prodID)
	if err != nil {
		slog.Error("ListByProduct failed", "error", err)
		httputil.RespondError(w, r, "Internal Server Error", http.StatusInternalServerError, err)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(items)
}
