package demoseed

import (
	"encoding/json"
	"net/http"

	"github.com/gablelbm/gable/pkg/httputil"
)

// Handler exposes manual operator controls for the demo-seed injection,
// mirroring the auto-reorder manual trigger + runs feed.
type Handler struct {
	service *Service
}

func NewHandler(service *Service) *Handler {
	return &Handler{service: service}
}

// RegisterRoutes attaches the admin endpoints. An optional role guard (e.g.
// middleware.RequireRole("admin","owner")) wraps every handler.
func (h *Handler) RegisterRoutes(mux *http.ServeMux, roleGuard ...func(http.Handler) http.Handler) {
	guard := func(handler http.HandlerFunc) http.HandlerFunc {
		if len(roleGuard) > 0 && roleGuard[0] != nil {
			return func(w http.ResponseWriter, r *http.Request) {
				roleGuard[0](handler).ServeHTTP(w, r)
			}
		}
		return handler
	}

	mux.HandleFunc("POST /api/v1/admin/demo-seed/run", guard(h.HandleRun))
	mux.HandleFunc("GET /api/v1/admin/demo-seed/runs", guard(h.HandleListRuns))
}

// HandleRun triggers one injection now (the same logic the nightly cron runs)
// over the configured rolling window and returns the number of orders created.
func (h *Handler) HandleRun(w http.ResponseWriter, r *http.Request) {
	runID, created, err := h.service.Execute(r.Context())
	if err != nil {
		httputil.RespondError(w, r, "failed to run demo-seed injection", http.StatusInternalServerError, err)
		return
	}
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]interface{}{
		"status":         "success",
		"run_id":         runID,
		"orders_created": created,
	})
}

// HandleListRuns returns the most recent demo-seed cron executions for the
// operator dashboard.
func (h *Handler) HandleListRuns(w http.ResponseWriter, r *http.Request) {
	runs, err := h.service.ListRuns(r.Context(), 50)
	if err != nil {
		httputil.RespondError(w, r, "failed to list demo-seed runs", http.StatusInternalServerError, err)
		return
	}
	if runs == nil {
		runs = []SeedRun{}
	}
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(runs)
}
