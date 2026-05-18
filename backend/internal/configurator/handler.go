package configurator

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

	mux.HandleFunc("GET /api/v1/configurator/rules", guard(h.handleGetRules))
	mux.HandleFunc("POST /api/v1/configurator/validate", guard(h.handleValidate))
	mux.HandleFunc("POST /api/v1/configurator/build-sku", guard(h.handleBuildSKU))
	mux.HandleFunc("GET /api/v1/configurator/options", guard(h.handleGetOptions))
	mux.HandleFunc("GET /api/v1/configurator/presets", guard(h.handleGetPresets))
}

func (h *Handler) handleGetRules(w http.ResponseWriter, r *http.Request) {
	rules, err := h.service.GetAllRules(r.Context())
	if err != nil {
		httputil.RespondError(w, r, "Failed to fetch configurator rules", http.StatusInternalServerError, err)
		return
	}
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(rules)
}

func (h *Handler) handleValidate(w http.ResponseWriter, r *http.Request) {
	var req ValidateConfigRequest
	if err := json.NewDecoder(http.MaxBytesReader(w, r.Body, 1<<16)).Decode(&req); err != nil {
		httputil.RespondError(w, r, "Invalid request body", http.StatusBadRequest, err)
		return
	}

	if len(req.Selections) == 0 {
		httputil.RespondError(w, r, "Selections map is required", http.StatusBadRequest, nil)
		return
	}

	resp, err := h.service.ValidateConfig(r.Context(), req)
	if err != nil {
		httputil.RespondError(w, r, "Internal validation error", http.StatusInternalServerError, err)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(resp)
}

func (h *Handler) handleBuildSKU(w http.ResponseWriter, r *http.Request) {
	var req BuildSKURequest
	if err := json.NewDecoder(http.MaxBytesReader(w, r.Body, 1<<16)).Decode(&req); err != nil {
		httputil.RespondError(w, r, "Invalid request body", http.StatusBadRequest, err)
		return
	}

	if req.ProductType == "" || len(req.Selections) == 0 {
		httputil.RespondError(w, r, "ProductType and Selections are required", http.StatusBadRequest, nil)
		return
	}

	resp, err := h.service.BuildSKU(r.Context(), req)
	if err != nil {
		httputil.RespondError(w, r, "failed to build SKU", http.StatusBadRequest, err)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(resp)
}

func (h *Handler) handleGetOptions(w http.ResponseWriter, r *http.Request) {
	attributeType := r.URL.Query().Get("attribute_type")
	if attributeType == "" {
		httputil.RespondError(w, r, "attribute_type query parameter is required", http.StatusBadRequest, nil)
		return
	}

	// Parse optional selections from query params
	selections := make(map[string]string)
	for key, values := range r.URL.Query() {
		if key != "attribute_type" && len(values) > 0 {
			selections[key] = values[0]
		}
	}

	req := AvailableOptionsRequest{
		AttributeType: attributeType,
		Selections:    selections,
	}

	options, err := h.service.GetAvailableOptions(r.Context(), req)
	if err != nil {
		httputil.RespondError(w, r, "Failed to fetch options", http.StatusInternalServerError, err)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(options)
}

func (h *Handler) handleGetPresets(w http.ResponseWriter, r *http.Request) {
	productType := r.URL.Query().Get("product_type")

	presets, err := h.service.GetPresets(r.Context(), productType)
	if err != nil {
		httputil.RespondError(w, r, "Failed to fetch presets", http.StatusInternalServerError, err)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(presets)
}
