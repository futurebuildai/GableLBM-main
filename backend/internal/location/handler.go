package location

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

	mux.HandleFunc("POST /locations", guard(h.CreateLocation))
	mux.HandleFunc("GET /locations", guard(h.ListLocations))
}

func (h *Handler) CreateLocation(w http.ResponseWriter, r *http.Request) {
	var loc Location
	if err := json.NewDecoder(r.Body).Decode(&loc); err != nil {
		httputil.RespondError(w, r, "Invalid input", http.StatusBadRequest, err)
		return
	}

	if err := h.service.CreateLocation(r.Context(), &loc); err != nil {
		httputil.RespondError(w, r, "failed to create location", http.StatusInternalServerError, err)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusCreated)
	json.NewEncoder(w).Encode(loc)
}

func (h *Handler) ListLocations(w http.ResponseWriter, r *http.Request) {
	locs, err := h.service.ListLocations(r.Context())
	if err != nil {
		httputil.RespondError(w, r, "failed to list locations", http.StatusInternalServerError, err)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(locs)
}
