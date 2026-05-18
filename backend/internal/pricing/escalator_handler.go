package pricing

import (
	"encoding/json"
	"net/http"

	"github.com/gablelbm/gable/pkg/httputil"
)

// EscalatorHandler handles HTTP requests for price escalation endpoints.
type EscalatorHandler struct {
	service *EscalatorService
}

// NewEscalatorHandler creates a new escalator handler.
func NewEscalatorHandler(s *EscalatorService) *EscalatorHandler {
	return &EscalatorHandler{service: s}
}

// RegisterRoutes registers the escalator API routes on the given mux.
// roleGuard protects all endpoints; pass middleware.RequireRole("admin","owner") in production.
func (h *EscalatorHandler) RegisterRoutes(mux *http.ServeMux, roleGuard ...func(http.Handler) http.Handler) {
	guard := func(handler http.HandlerFunc) http.HandlerFunc {
		if len(roleGuard) > 0 && roleGuard[0] != nil {
			return func(w http.ResponseWriter, r *http.Request) {
				roleGuard[0](handler).ServeHTTP(w, r)
			}
		}
		return handler
	}

	mux.HandleFunc("POST /api/v1/pricing/calculate-escalation", guard(h.HandleCalculateEscalation))
	mux.HandleFunc("GET /api/v1/market-indices", guard(h.HandleListMarketIndices))
}

// HandleCalculateEscalation calculates future pricing based on escalation parameters.
func (h *EscalatorHandler) HandleCalculateEscalation(w http.ResponseWriter, r *http.Request) {
	// Cap request body size at 1MB
	r.Body = http.MaxBytesReader(w, r.Body, 1<<20)

	var req EscalationRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		httputil.RespondError(w, r, "Invalid request body", http.StatusBadRequest, err)
		return
	}

	// Validate required fields
	if req.BasePrice <= 0 {
		httputil.RespondError(w, r, "base_price must be positive", http.StatusBadRequest, nil)
		return
	}
	if req.EscalationType == "" {
		httputil.RespondError(w, r, "escalation_type is required", http.StatusBadRequest, nil)
		return
	}
	if req.EscalationType != EscalationPercentage && req.EscalationType != EscalationIndexDelta {
		httputil.RespondError(w, r, "escalation_type must be PERCENTAGE or INDEX_DELTA", http.StatusBadRequest, nil)
		return
	}
	if req.EffectiveDate == "" || req.TargetDate == "" {
		httputil.RespondError(w, r, "effective_date and target_date are required", http.StatusBadRequest, nil)
		return
	}

	result, err := h.service.CalculateEscalation(r.Context(), req)
	if err != nil {
		httputil.RespondError(w, r, "Internal server error", http.StatusInternalServerError, err)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(result)
}

// HandleListMarketIndices returns all active market indices.
func (h *EscalatorHandler) HandleListMarketIndices(w http.ResponseWriter, r *http.Request) {
	indices, err := h.service.ListMarketIndices(r.Context())
	if err != nil {
		httputil.RespondError(w, r, "Internal server error", http.StatusInternalServerError, err)
		return
	}

	if indices == nil {
		indices = []MarketIndex{}
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(indices)
}
