package account

import (
	"encoding/json"
	"net/http"

	"github.com/gablelbm/gable/pkg/httputil"
	"github.com/google/uuid"
)

type Handler struct {
	service Service
}

func NewHandler(service Service) *Handler {
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

	mux.HandleFunc("GET /api/v1/accounts/{id}", guard(h.GetAccountSummary))
	mux.HandleFunc("GET /api/v1/accounts/{id}/transactions", guard(h.GetTransactions))
}

func (h *Handler) GetAccountSummary(w http.ResponseWriter, r *http.Request) {
	idStr := r.PathValue("id")
	id, err := uuid.Parse(idStr)
	if err != nil {
		httputil.RespondError(w, r, "Invalid customer ID", http.StatusBadRequest, err)
		return
	}

	summary, err := h.service.GetAccountSummary(r.Context(), id)
	if err != nil {
		httputil.RespondError(w, r, "Failed to get account summary", http.StatusInternalServerError, err)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(summary)
}

func (h *Handler) GetTransactions(w http.ResponseWriter, r *http.Request) {
	idStr := r.PathValue("id")
	id, err := uuid.Parse(idStr)
	if err != nil {
		httputil.RespondError(w, r, "Invalid customer ID", http.StatusBadRequest, err)
		return
	}

	txns, err := h.service.GetTransactions(r.Context(), id)
	if err != nil {
		httputil.RespondError(w, r, "Failed to get transactions", http.StatusInternalServerError, err)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(txns)
}
