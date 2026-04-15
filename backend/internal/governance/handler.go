package governance

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

	mux.HandleFunc("POST /api/v1/governance/rfcs", guard(h.HandleCreateRFC))
	mux.HandleFunc("GET /api/v1/governance/rfcs", guard(h.HandleListRFCs))
	mux.HandleFunc("GET /api/v1/governance/rfcs/{id}", guard(h.HandleGetRFC))
	mux.HandleFunc("PUT /api/v1/governance/rfcs/{id}", guard(h.HandleUpdateRFC))
}

func (h *Handler) HandleCreateRFC(w http.ResponseWriter, r *http.Request) {
	var input CreateRFCInput
	if err := json.NewDecoder(r.Body).Decode(&input); err != nil {
		httputil.RespondError(w, r, "Invalid request body", http.StatusBadRequest, err)
		return
	}

	rfc, err := h.service.DraftRFC(r.Context(), input)
	if err != nil {
		httputil.RespondError(w, r, "failed to create RFC", http.StatusInternalServerError, err)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusCreated)
	json.NewEncoder(w).Encode(rfc)
}

func (h *Handler) HandleListRFCs(w http.ResponseWriter, r *http.Request) {
	rfcs, err := h.service.ListRFCs(r.Context())
	if err != nil {
		httputil.RespondError(w, r, "Failed to fetch RFCs", http.StatusInternalServerError, err)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(rfcs)
}

func (h *Handler) HandleGetRFC(w http.ResponseWriter, r *http.Request) {
	idStr := r.PathValue("id")
	id, err := uuid.Parse(idStr)
	if err != nil {
		httputil.RespondError(w, r, "Invalid UUID", http.StatusBadRequest, err)
		return
	}

	rfc, err := h.service.GetRFC(r.Context(), id)
	if err != nil {
		httputil.RespondError(w, r, "RFC not found", http.StatusNotFound, err)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(rfc)
}

func (h *Handler) HandleUpdateRFC(w http.ResponseWriter, r *http.Request) {
	idStr := r.PathValue("id")
	id, err := uuid.Parse(idStr)
	if err != nil {
		httputil.RespondError(w, r, "Invalid UUID", http.StatusBadRequest, err)
		return
	}

	var input UpdateRFCInput
	if err := json.NewDecoder(r.Body).Decode(&input); err != nil {
		httputil.RespondError(w, r, "Invalid request body", http.StatusBadRequest, err)
		return
	}

	rfc, err := h.service.UpdateRFC(r.Context(), id, input)
	if err != nil {
		httputil.RespondError(w, r, "failed to update RFC", http.StatusInternalServerError, err)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(rfc)
}
