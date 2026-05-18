package vision

import (
	"encoding/json"
	"log/slog"
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

	mux.HandleFunc("POST /api/v1/vision/scan", guard(h.handleScan))
}

func (h *Handler) handleScan(w http.ResponseWriter, r *http.Request) {
	var req BlueprintScanRequest
	// Limit body to 1MB to prevent DoS from large blueprint payloads
	if err := json.NewDecoder(http.MaxBytesReader(w, r.Body, 1<<20)).Decode(&req); err != nil {
		slog.Warn("Vision scan: invalid request body", "error", err)
		httputil.RespondError(w, r, "Invalid request body", http.StatusBadRequest, err)
		return
	}

	if req.BlueprintText == "" {
		httputil.RespondError(w, r, "blueprint_text is required", http.StatusBadRequest, nil)
		return
	}

	resp := h.service.ScanBlueprint(req)

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(resp)
}
