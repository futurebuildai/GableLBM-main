package matching

import (
	"encoding/json"
	"net/http"

	"github.com/gablelbm/gable/pkg/httputil"
	"github.com/google/uuid"
)

// Handler handles PO matching HTTP endpoints.
type Handler struct {
	service *Service
}

// NewHandler creates a new matching handler.
func NewHandler(service *Service) *Handler {
	return &Handler{service: service}
}

// RegisterRoutes registers matching API routes.
// roleGuard protects all endpoints; pass middleware.RequireRole("admin","owner","finance") in production.
func (h *Handler) RegisterRoutes(mux *http.ServeMux, roleGuard ...func(http.Handler) http.Handler) {
	guard := func(handler http.HandlerFunc) http.HandlerFunc {
		if len(roleGuard) > 0 && roleGuard[0] != nil {
			return func(w http.ResponseWriter, r *http.Request) {
				roleGuard[0](handler).ServeHTTP(w, r)
			}
		}
		return handler
	}

	mux.HandleFunc("POST /api/v1/matching/run/{po_id}", guard(h.RunMatch))
	mux.HandleFunc("GET /api/v1/matching/results/{po_id}", guard(h.GetMatchResult))
	mux.HandleFunc("GET /api/v1/matching/exceptions", guard(h.ListExceptions))
	mux.HandleFunc("GET /api/v1/matching/config", guard(h.GetConfig))
	mux.HandleFunc("PUT /api/v1/matching/config", guard(h.UpdateConfig))
}

func (h *Handler) RunMatch(w http.ResponseWriter, r *http.Request) {
	poID, err := uuid.Parse(r.PathValue("po_id"))
	if err != nil {
		httputil.RespondError(w, r, "Invalid PO ID", http.StatusBadRequest, err)
		return
	}

	result, err := h.service.RunMatch(r.Context(), poID)
	if err != nil {
		httputil.RespondError(w, r, "failed to run PO match", http.StatusInternalServerError, err)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(result)
}

func (h *Handler) GetMatchResult(w http.ResponseWriter, r *http.Request) {
	poID, err := uuid.Parse(r.PathValue("po_id"))
	if err != nil {
		httputil.RespondError(w, r, "Invalid PO ID", http.StatusBadRequest, err)
		return
	}

	result, err := h.service.GetMatchResult(r.Context(), poID)
	if err != nil {
		httputil.RespondError(w, r, "match result not found", http.StatusNotFound, err)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(result)
}

func (h *Handler) ListExceptions(w http.ResponseWriter, r *http.Request) {
	exceptions, err := h.service.ListExceptions(r.Context())
	if err != nil {
		httputil.RespondError(w, r, "failed to list match exceptions", http.StatusInternalServerError, err)
		return
	}

	if exceptions == nil {
		exceptions = []MatchException{}
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(exceptions)
}

func (h *Handler) GetConfig(w http.ResponseWriter, r *http.Request) {
	cfg, err := h.service.GetConfig(r.Context())
	if err != nil {
		httputil.RespondError(w, r, "failed to get match config", http.StatusInternalServerError, err)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(cfg)
}

func (h *Handler) UpdateConfig(w http.ResponseWriter, r *http.Request) {
	var req UpdateMatchConfigRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		httputil.RespondError(w, r, "Invalid request body", http.StatusBadRequest, err)
		return
	}

	cfg, err := h.service.UpdateConfig(r.Context(), req)
	if err != nil {
		httputil.RespondError(w, r, "failed to update match config", http.StatusInternalServerError, err)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(cfg)
}
