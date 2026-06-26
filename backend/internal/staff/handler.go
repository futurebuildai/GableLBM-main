package staff

import (
	"encoding/json"
	"errors"
	"net/http"

	"github.com/gablelbm/gable/pkg/httputil"
	"github.com/gablelbm/gable/pkg/middleware"
	"github.com/google/uuid"
)

type Handler struct {
	svc *Service
}

func NewHandler(svc *Service) *Handler {
	return &Handler{svc: svc}
}

func writeJSON(w http.ResponseWriter, status int, v interface{}) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(v)
}

// --- Staff CRUD ---

func (h *Handler) ListStaff(w http.ResponseWriter, r *http.Request) {
	staff, err := h.svc.ListStaff(r.Context())
	if err != nil {
		httputil.RespondError(w, r, "Failed to list staff", http.StatusInternalServerError, err)
		return
	}
	writeJSON(w, http.StatusOK, staff)
}

func (h *Handler) GetStaff(w http.ResponseWriter, r *http.Request) {
	id, err := uuid.Parse(r.PathValue("id"))
	if err != nil {
		httputil.RespondError(w, r, "Invalid staff id", http.StatusBadRequest, err)
		return
	}
	st, err := h.svc.GetStaff(r.Context(), id)
	if err != nil {
		if errors.Is(err, ErrNotFound) {
			httputil.RespondError(w, r, "Staff not found", http.StatusNotFound, err)
			return
		}
		httputil.RespondError(w, r, "Failed to get staff", http.StatusInternalServerError, err)
		return
	}
	writeJSON(w, http.StatusOK, st)
}

func (h *Handler) CreateStaff(w http.ResponseWriter, r *http.Request) {
	var in CreateStaffInput
	if err := json.NewDecoder(r.Body).Decode(&in); err != nil {
		httputil.RespondError(w, r, "Invalid request body", http.StatusBadRequest, err)
		return
	}
	if in.Email == "" || in.FullName == "" {
		httputil.RespondError(w, r, "email and full_name are required", http.StatusBadRequest, nil)
		return
	}
	st, err := h.svc.CreateStaff(r.Context(), in)
	if err != nil {
		httputil.RespondError(w, r, "Failed to create staff", http.StatusInternalServerError, err)
		return
	}
	writeJSON(w, http.StatusCreated, st)
}

func (h *Handler) UpdateStaff(w http.ResponseWriter, r *http.Request) {
	id, err := uuid.Parse(r.PathValue("id"))
	if err != nil {
		httputil.RespondError(w, r, "Invalid staff id", http.StatusBadRequest, err)
		return
	}
	var in UpdateStaffInput
	if err := json.NewDecoder(r.Body).Decode(&in); err != nil {
		httputil.RespondError(w, r, "Invalid request body", http.StatusBadRequest, err)
		return
	}
	st, err := h.svc.UpdateStaff(r.Context(), id, in)
	if err != nil {
		if errors.Is(err, ErrNotFound) {
			httputil.RespondError(w, r, "Staff not found", http.StatusNotFound, err)
			return
		}
		httputil.RespondError(w, r, "Failed to update staff", http.StatusInternalServerError, err)
		return
	}
	writeJSON(w, http.StatusOK, st)
}

// --- Module grants ---

type grantModuleRequest struct {
	ModuleID string `json:"module_id"`
}

func (h *Handler) GrantModule(w http.ResponseWriter, r *http.Request) {
	id, err := uuid.Parse(r.PathValue("id"))
	if err != nil {
		httputil.RespondError(w, r, "Invalid staff id", http.StatusBadRequest, err)
		return
	}
	var req grantModuleRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		httputil.RespondError(w, r, "Invalid request body", http.StatusBadRequest, err)
		return
	}
	if req.ModuleID == "" {
		httputil.RespondError(w, r, "module_id is required", http.StatusBadRequest, nil)
		return
	}
	if err := h.svc.GrantModule(r.Context(), id, req.ModuleID, requesterSub(r)); err != nil {
		httputil.RespondError(w, r, "Failed to grant module", http.StatusInternalServerError, err)
		return
	}
	st, err := h.svc.GetStaff(r.Context(), id)
	if err != nil {
		// Grant succeeded; report 200 even if the re-read fails.
		writeJSON(w, http.StatusOK, map[string]string{"status": "granted"})
		return
	}
	writeJSON(w, http.StatusOK, st)
}

func (h *Handler) RevokeModule(w http.ResponseWriter, r *http.Request) {
	id, err := uuid.Parse(r.PathValue("id"))
	if err != nil {
		httputil.RespondError(w, r, "Invalid staff id", http.StatusBadRequest, err)
		return
	}
	moduleID := r.PathValue("module_id")
	if moduleID == "" {
		httputil.RespondError(w, r, "module_id is required", http.StatusBadRequest, nil)
		return
	}
	if err := h.svc.RevokeModule(r.Context(), id, moduleID); err != nil {
		httputil.RespondError(w, r, "Failed to revoke module", http.StatusInternalServerError, err)
		return
	}
	st, err := h.svc.GetStaff(r.Context(), id)
	if err != nil {
		writeJSON(w, http.StatusOK, map[string]string{"status": "revoked"})
		return
	}
	writeJSON(w, http.StatusOK, st)
}

// --- Global module enable flag ---

func (h *Handler) ListModules(w http.ResponseWriter, r *http.Request) {
	mods, err := h.svc.ListModules(r.Context())
	if err != nil {
		httputil.RespondError(w, r, "Failed to list modules", http.StatusInternalServerError, err)
		return
	}
	writeJSON(w, http.StatusOK, mods)
}

type setModuleEnabledRequest struct {
	Enabled bool `json:"enabled"`
}

func (h *Handler) SetModuleEnabled(w http.ResponseWriter, r *http.Request) {
	moduleID := r.PathValue("id")
	if moduleID == "" {
		httputil.RespondError(w, r, "module id is required", http.StatusBadRequest, nil)
		return
	}
	var req setModuleEnabledRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		httputil.RespondError(w, r, "Invalid request body", http.StatusBadRequest, err)
		return
	}
	if err := h.svc.SetModuleEnabled(r.Context(), moduleID, req.Enabled); err != nil {
		httputil.RespondError(w, r, "Failed to update module", http.StatusInternalServerError, err)
		return
	}
	writeJSON(w, http.StatusOK, Module{ID: moduleID, Enabled: req.Enabled})
}

// requesterSub returns the JWT subject of the calling admin for grant
// attribution, or "" in dev mode (no auth claims).
func requesterSub(r *http.Request) string {
	if claims := middleware.ClaimsFromContext(r.Context()); claims != nil {
		if claims.Subject != "" {
			return claims.Subject
		}
		return claims.Email
	}
	return ""
}
