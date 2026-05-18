package pricing

import (
	"encoding/json"
	"net/http"
	"time"

	"github.com/gablelbm/gable/pkg/httputil"
	"github.com/google/uuid"
)

type RebateHandler struct {
	service RebateService
}

func NewRebateHandler(s RebateService) *RebateHandler {
	return &RebateHandler{service: s}
}

func (h *RebateHandler) RegisterRoutes(mux *http.ServeMux, roleGuard ...func(http.Handler) http.Handler) {
	guard := func(handler http.HandlerFunc) http.HandlerFunc {
		if len(roleGuard) > 0 && roleGuard[0] != nil {
			return func(w http.ResponseWriter, r *http.Request) {
				roleGuard[0](handler).ServeHTTP(w, r)
			}
		}
		return handler
	}

	mux.HandleFunc("POST /api/v1/pricing/rebates/programs", guard(h.HandleCreateProgram))
	mux.HandleFunc("GET /api/v1/pricing/rebates/programs", guard(h.HandleListPrograms))
	mux.HandleFunc("GET /api/v1/pricing/rebates/programs/{id}", guard(h.HandleGetProgram))
	mux.HandleFunc("POST /api/v1/pricing/rebates/programs/{id}/claims/calculate", guard(h.HandleCalculateClaim))
	mux.HandleFunc("GET /api/v1/pricing/rebates/programs/{id}/claims", guard(h.HandleListClaims))
}

type createProgramRequest struct {
	Program RebateProgram `json:"program"`
	Tiers   []RebateTier  `json:"tiers"`
}

func (h *RebateHandler) HandleCreateProgram(w http.ResponseWriter, r *http.Request) {
	var req createProgramRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		httputil.RespondError(w, r, "Invalid request body", http.StatusBadRequest, err)
		return
	}

	if req.Program.VendorID == uuid.Nil || req.Program.Name == "" {
		httputil.RespondError(w, r, "vendor_id and name are required", http.StatusBadRequest, nil)
		return
	}

	prog, err := h.service.CreateProgramWithTiers(r.Context(), &req.Program, req.Tiers)
	if err != nil {
		httputil.RespondError(w, r, "failed to create rebate program", http.StatusInternalServerError, err)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusCreated)
	json.NewEncoder(w).Encode(prog)
}

func (h *RebateHandler) HandleListPrograms(w http.ResponseWriter, r *http.Request) {
	var vendorID *uuid.UUID
	if vidStr := r.URL.Query().Get("vendor_id"); vidStr != "" {
		if vid, err := uuid.Parse(vidStr); err == nil {
			vendorID = &vid
		}
	}

	programs, err := h.service.ListPrograms(r.Context(), vendorID)
	if err != nil {
		httputil.RespondError(w, r, "failed to list rebate programs", http.StatusInternalServerError, err)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(programs)
}

func (h *RebateHandler) HandleGetProgram(w http.ResponseWriter, r *http.Request) {
	idStr := r.PathValue("id")
	id, err := uuid.Parse(idStr)
	if err != nil {
		httputil.RespondError(w, r, "Invalid ID", http.StatusBadRequest, err)
		return
	}

	prog, err := h.service.GetProgramWithTiers(r.Context(), id)
	if err != nil {
		httputil.RespondError(w, r, "failed to get rebate program", http.StatusInternalServerError, err)
		return
	}
	if prog == nil {
		httputil.RespondError(w, r, "Program not found", http.StatusNotFound, nil)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(prog)
}

type calculateClaimRequest struct {
	PeriodStart time.Time `json:"period_start"`
	PeriodEnd   time.Time `json:"period_end"`
	MockVolume  int64     `json:"mock_volume"`
}

func (h *RebateHandler) HandleCalculateClaim(w http.ResponseWriter, r *http.Request) {
	idStr := r.PathValue("id")
	id, err := uuid.Parse(idStr)
	if err != nil {
		httputil.RespondError(w, r, "Invalid ID", http.StatusBadRequest, err)
		return
	}

	var req calculateClaimRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		httputil.RespondError(w, r, "Invalid request body", http.StatusBadRequest, err)
		return
	}

	claim, err := h.service.CalculateClaim(r.Context(), id, req.PeriodStart, req.PeriodEnd, req.MockVolume)
	if err != nil {
		httputil.RespondError(w, r, "failed to calculate rebate claim", http.StatusInternalServerError, err)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(claim)
}

func (h *RebateHandler) HandleListClaims(w http.ResponseWriter, r *http.Request) {
	idStr := r.PathValue("id")
	id, err := uuid.Parse(idStr)
	if err != nil {
		httputil.RespondError(w, r, "Invalid ID", http.StatusBadRequest, err)
		return
	}

	claims, err := h.service.ListClaims(r.Context(), &id)
	if err != nil {
		httputil.RespondError(w, r, "failed to list rebate claims", http.StatusInternalServerError, err)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(claims)
}
