package apps

import (
	"encoding/json"
	"errors"
	"net/http"

	"github.com/gablelbm/gable/pkg/httputil"
)

// Handler exposes the apps registry over HTTP:
//
//	GET  /api/v1/apps                — full catalog + enablement (any authenticated role;
//	                                   the SPA needs it to build navigation)
//	POST /api/v1/apps/{key}/enable   — admin/owner
//	POST /api/v1/apps/{key}/disable  — admin/owner
//
// This is platform surface (like /metrics), not itself an app.
type Handler struct {
	reg *Registry
}

func NewHandler(reg *Registry) *Handler {
	return &Handler{reg: reg}
}

// RegisterRoutes mounts the apps API. adminGuard wraps the mutating routes;
// the read route rides the global auth middleware only.
func (h *Handler) RegisterRoutes(mux Router, adminGuard func(http.Handler) http.Handler) {
	mux.HandleFunc("GET /api/v1/apps", h.handleList)
	toggle := func(fn http.HandlerFunc) http.Handler {
		if adminGuard != nil {
			return adminGuard(fn)
		}
		return fn
	}
	mux.Handle("POST /api/v1/apps/{key}/enable", toggle(h.handleEnable))
	mux.Handle("POST /api/v1/apps/{key}/disable", toggle(h.handleDisable))
}

func (h *Handler) handleList(w http.ResponseWriter, r *http.Request) {
	list, err := h.reg.List(r.Context())
	if err != nil {
		httputil.RespondError(w, r, "Failed to list apps", http.StatusInternalServerError, err)
		return
	}
	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(map[string]any{"apps": list})
}

func (h *Handler) handleEnable(w http.ResponseWriter, r *http.Request) {
	h.toggle(w, r, true)
}

func (h *Handler) handleDisable(w http.ResponseWriter, r *http.Request) {
	h.toggle(w, r, false)
}

func (h *Handler) toggle(w http.ResponseWriter, r *http.Request, enabled bool) {
	key := r.PathValue("key")
	if key == "" {
		httputil.RespondError(w, r, "Missing app key", http.StatusBadRequest, nil)
		return
	}
	err := h.reg.SetEnabled(r.Context(), key, enabled)
	var depErr *DependencyError
	switch {
	case err == nil:
		// fallthrough to success response below
	case errors.Is(err, ErrUnknownApp):
		httputil.RespondError(w, r, err.Error(), http.StatusNotFound, err)
		return
	case errors.Is(err, ErrCoreApp):
		// Custom envelope: RespondError genericizes messages, but "this is a
		// core app" is exactly what an API consumer needs to hear.
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusConflict)
		_ = json.NewEncoder(w).Encode(map[string]any{
			"error": map[string]any{"code": "app_core", "message": err.Error()},
		})
		return
	case errors.As(err, &depErr):
		// Machine-readable conflict so the Apps page can point at the blockers.
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusConflict)
		_ = json.NewEncoder(w).Encode(map[string]any{
			"error": map[string]any{
				"code":     "app_dependency_conflict",
				"message":  depErr.Error(),
				"blockers": depErr.Blockers,
			},
		})
		return
	default:
		httputil.RespondError(w, r, "Failed to toggle app", http.StatusInternalServerError, err)
		return
	}
	list, err := h.reg.List(r.Context())
	if err != nil {
		httputil.RespondError(w, r, "App toggled, but listing failed", http.StatusInternalServerError, err)
		return
	}
	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(map[string]any{"apps": list})
}
