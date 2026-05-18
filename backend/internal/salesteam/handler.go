package salesteam

import (
	"encoding/json"
	"net/http"

	"github.com/gablelbm/gable/pkg/httputil"
	"github.com/google/uuid"
)

type Handler struct {
	repo *Repository
}

func NewHandler(repo *Repository) *Handler {
	return &Handler{repo: repo}
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

	mux.HandleFunc("GET /api/v1/sales-team", guard(h.HandleList))
	mux.HandleFunc("GET /api/v1/sales-team/{id}", guard(h.HandleGet))
}

func (h *Handler) HandleList(w http.ResponseWriter, r *http.Request) {
	people, err := h.repo.List(r.Context())
	if err != nil {
		httputil.RespondError(w, r, "Failed to fetch sales team", http.StatusInternalServerError, err)
		return
	}
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(people)
}

func (h *Handler) HandleGet(w http.ResponseWriter, r *http.Request) {
	id, err := uuid.Parse(r.PathValue("id"))
	if err != nil {
		httputil.RespondError(w, r, "Invalid salesperson ID", http.StatusBadRequest, err)
		return
	}

	person, err := h.repo.Get(r.Context(), id)
	if err != nil {
		httputil.RespondError(w, r, "Salesperson not found", http.StatusNotFound, err)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(person)
}
