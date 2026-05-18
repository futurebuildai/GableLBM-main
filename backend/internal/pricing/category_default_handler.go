package pricing

import (
	"encoding/json"
	"net/http"

	"github.com/gablelbm/gable/pkg/httputil"
	"github.com/google/uuid"
)

// CategoryDefaultHandler serves the product_category_index_defaults CRUD API.
type CategoryDefaultHandler struct {
	exposure ExposureRepository
}

func NewCategoryDefaultHandler(exposure ExposureRepository) *CategoryDefaultHandler {
	return &CategoryDefaultHandler{exposure: exposure}
}

func (h *CategoryDefaultHandler) RegisterRoutes(mux *http.ServeMux, roleGuard ...func(http.Handler) http.Handler) {
	guard := func(handler http.HandlerFunc) http.HandlerFunc {
		if len(roleGuard) > 0 && roleGuard[0] != nil {
			return func(w http.ResponseWriter, r *http.Request) {
				roleGuard[0](handler).ServeHTTP(w, r)
			}
		}
		return handler
	}

	mux.HandleFunc("GET /api/v1/product-category-index-defaults", guard(h.HandleList))
	mux.HandleFunc("PUT /api/v1/product-category-index-defaults/{category_id}", guard(h.HandleUpsert))
}

func (h *CategoryDefaultHandler) HandleList(w http.ResponseWriter, r *http.Request) {
	defaults, err := h.exposure.ListCategoryDefaults(r.Context())
	if err != nil {
		httputil.RespondError(w, r, "failed to list", http.StatusInternalServerError, err)
		return
	}
	if defaults == nil {
		defaults = []ProductCategoryIndexDefault{}
	}
	writeJSON(w, http.StatusOK, defaults)
}

// HandleUpsert sets (or clears) the default index for a category. Passing
// market_index_id = null deletes the row.
func (h *CategoryDefaultHandler) HandleUpsert(w http.ResponseWriter, r *http.Request) {
	categoryID, err := uuid.Parse(r.PathValue("category_id"))
	if err != nil {
		httputil.RespondError(w, r, "invalid category_id", http.StatusBadRequest, err)
		return
	}
	var body struct {
		MarketIndexID *uuid.UUID `json:"market_index_id"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		httputil.RespondError(w, r, "invalid request body", http.StatusBadRequest, err)
		return
	}
	if body.MarketIndexID == nil {
		if err := h.exposure.DeleteCategoryDefault(r.Context(), categoryID); err != nil {
			httputil.RespondError(w, r, "failed to delete", http.StatusInternalServerError, err)
			return
		}
		writeJSON(w, http.StatusOK, map[string]any{"category_id": categoryID, "market_index_id": nil})
		return
	}
	if err := h.exposure.UpsertCategoryDefault(r.Context(), categoryID, *body.MarketIndexID); err != nil {
		httputil.RespondError(w, r, "failed to upsert", http.StatusInternalServerError, err)
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"category_id": categoryID, "market_index_id": *body.MarketIndexID})
}
