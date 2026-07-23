package deposit

import (
	"encoding/json"
	"net/http"

	"github.com/gablelbm/gable/pkg/httputil"
	"github.com/google/uuid"
)

// Handler exposes customer-deposit endpoints.
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

	mux.HandleFunc("POST /api/v1/deposits", guard(h.RecordDeposit))
	mux.HandleFunc("GET /api/v1/deposits", guard(h.ListDeposits))
	mux.HandleFunc("GET /api/v1/deposits/{id}", guard(h.GetDeposit))
	mux.HandleFunc("POST /api/v1/deposits/{id}/apply", guard(h.ApplyDeposit))
}

// RecordDeposit takes a new customer prepayment.
func (h *Handler) RecordDeposit(w http.ResponseWriter, r *http.Request) {
	var req RecordDepositRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		httputil.RespondError(w, r, "Invalid request body", http.StatusBadRequest, err)
		return
	}
	d, err := h.service.RecordDeposit(r.Context(), req)
	if err != nil {
		httputil.RespondError(w, r, err.Error(), http.StatusBadRequest, err)
		return
	}
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusCreated)
	json.NewEncoder(w).Encode(d)
}

// ApplyDeposit draws a deposit down against AR.
func (h *Handler) ApplyDeposit(w http.ResponseWriter, r *http.Request) {
	id, err := uuid.Parse(r.PathValue("id"))
	if err != nil {
		httputil.RespondError(w, r, "Invalid deposit ID", http.StatusBadRequest, err)
		return
	}
	var req ApplyDepositRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		httputil.RespondError(w, r, "Invalid request body", http.StatusBadRequest, err)
		return
	}
	app, err := h.service.ApplyDeposit(r.Context(), id, req)
	if err != nil {
		httputil.RespondError(w, r, err.Error(), http.StatusBadRequest, err)
		return
	}
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusCreated)
	json.NewEncoder(w).Encode(app)
}

// GetDeposit returns a single deposit.
func (h *Handler) GetDeposit(w http.ResponseWriter, r *http.Request) {
	id, err := uuid.Parse(r.PathValue("id"))
	if err != nil {
		httputil.RespondError(w, r, "Invalid deposit ID", http.StatusBadRequest, err)
		return
	}
	d, err := h.service.GetDeposit(r.Context(), id)
	if err != nil {
		httputil.RespondError(w, r, err.Error(), http.StatusNotFound, err)
		return
	}
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(d)
}

// ListDeposits lists a customer's deposits (requires customer_id query param)
// and includes their open (unapplied) balance.
func (h *Handler) ListDeposits(w http.ResponseWriter, r *http.Request) {
	cidStr := r.URL.Query().Get("customer_id")
	if cidStr == "" {
		httputil.RespondError(w, r, "customer_id query parameter is required", http.StatusBadRequest, nil)
		return
	}
	customerID, err := uuid.Parse(cidStr)
	if err != nil {
		httputil.RespondError(w, r, "Invalid customer_id", http.StatusBadRequest, err)
		return
	}
	list, balance, err := h.service.ListDeposits(r.Context(), customerID)
	if err != nil {
		httputil.RespondError(w, r, "failed to list deposits", http.StatusInternalServerError, err)
		return
	}
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]any{"deposits": list, "open_balance_cents": balance})
}
