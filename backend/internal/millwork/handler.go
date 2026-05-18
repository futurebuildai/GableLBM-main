package millwork

import (
	"encoding/json"
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

	mux.HandleFunc("POST /api/v1/millwork/options", guard(h.handleCreateOption))
	mux.HandleFunc("GET /api/v1/millwork/options", guard(h.handleGetOptions))
}

func (h *Handler) handleCreateOption(w http.ResponseWriter, r *http.Request) {
	var req CreateOptionRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		httputil.RespondError(w, r, "Invalid request body", http.StatusBadRequest, err)
		return
	}

	opt, err := h.service.CreateOption(r.Context(), req)
	if err != nil {
		httputil.RespondError(w, r, "Failed to create option", http.StatusInternalServerError, err)
		return
	}

	w.WriteHeader(http.StatusCreated)
	json.NewEncoder(w).Encode(opt)
}

func (h *Handler) handleGetOptions(w http.ResponseWriter, r *http.Request) {
	category := r.URL.Query().Get("category")
	if category == "" {
		httputil.RespondError(w, r, "Category query parameter is required", http.StatusBadRequest, nil)
		return
	}

	options, err := h.service.GetOptionsByCategory(r.Context(), category)
	if err != nil {
		httputil.RespondError(w, r, "Failed to fetch options", http.StatusInternalServerError, err)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(options)
}
