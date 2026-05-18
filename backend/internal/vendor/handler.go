package vendor

import (
	"encoding/json"
	"net/http"

	"github.com/gablelbm/gable/pkg/httputil"
	"github.com/google/uuid"
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

	mux.HandleFunc("GET /api/v1/vendors", guard(h.HandleList))
	mux.HandleFunc("POST /api/v1/vendors", guard(h.HandleCreate))
	mux.HandleFunc("GET /api/v1/vendors/{id}", guard(h.HandleGet))
}

func (h *Handler) HandleList(w http.ResponseWriter, r *http.Request) {
	vendors, err := h.service.ListVendors(r.Context())
	if err != nil {
		httputil.RespondError(w, r, "failed to list vendors", http.StatusInternalServerError, err)
		return
	}
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(vendors)
}

func (h *Handler) HandleCreate(w http.ResponseWriter, r *http.Request) {
	var req CreateVendorRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		httputil.RespondError(w, r, "Invalid request", http.StatusBadRequest, err)
		return
	}

	v, err := h.service.CreateVendor(r.Context(), req)
	if err != nil {
		httputil.RespondError(w, r, "failed to create vendor", http.StatusInternalServerError, err)
		return
	}
	w.WriteHeader(http.StatusCreated)
	json.NewEncoder(w).Encode(v)
}

func (h *Handler) HandleGet(w http.ResponseWriter, r *http.Request) {
	idStr := r.PathValue("id")
	id, err := uuid.Parse(idStr)
	if err != nil {
		httputil.RespondError(w, r, "Invalid ID", http.StatusBadRequest, err)
		return
	}

	v, err := h.service.GetVendor(r.Context(), id)
	if err != nil {
		httputil.RespondError(w, r, "failed to get vendor", http.StatusInternalServerError, err)
		return
	}
	if v == nil {
		httputil.RespondError(w, r, "Vendor not found", http.StatusNotFound, nil)
		return
	}

	json.NewEncoder(w).Encode(v)
}
