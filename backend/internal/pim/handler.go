package pim

import (
	"encoding/json"
	"net/http"

	"github.com/gablelbm/gable/pkg/httputil"
	"github.com/google/uuid"
)

// Handler manages HTTP requests for PIM
type Handler struct {
	service *Service
}

// NewHandler creates a new PIM Handler
func NewHandler(service *Service) *Handler {
	return &Handler{service: service}
}

// RegisterRoutes adds PIM handlers to the mux
func (h *Handler) RegisterRoutes(mux *http.ServeMux, roleGuard ...func(http.Handler) http.Handler) {
	guard := func(handler http.HandlerFunc) http.HandlerFunc {
		if len(roleGuard) > 0 && roleGuard[0] != nil {
			return func(w http.ResponseWriter, r *http.Request) {
				roleGuard[0](handler).ServeHTTP(w, r)
			}
		}
		return handler
	}

	mux.HandleFunc("GET /api/v1/products/{id}/detail", guard(h.HandleGetProductDetail))
	mux.HandleFunc("GET /api/v1/products/{id}/pim/content", guard(h.HandleGetContent))
	mux.HandleFunc("PUT /api/v1/products/{id}/pim/content", guard(h.HandleUpdateContent))
	mux.HandleFunc("POST /api/v1/products/{id}/pim/generate/descriptions", guard(h.HandleGenerateDescriptions))
	mux.HandleFunc("POST /api/v1/products/{id}/pim/generate/seo", guard(h.HandleGenerateSEO))
	mux.HandleFunc("POST /api/v1/products/{id}/pim/generate/image", guard(h.HandleGenerateImage))
	mux.HandleFunc("POST /api/v1/products/{id}/pim/generate/collateral", guard(h.HandleGenerateCollateral))
	mux.HandleFunc("GET /api/v1/products/{id}/pim/media", guard(h.HandleListMedia))
	mux.HandleFunc("DELETE /api/v1/products/{id}/pim/media/{mediaId}", guard(h.HandleDeleteMedia))
	mux.HandleFunc("PATCH /api/v1/products/{id}/pim/media/{mediaId}/primary", guard(h.HandleSetPrimaryMedia))
	mux.HandleFunc("GET /api/v1/products/{id}/pim/collateral", guard(h.HandleListCollateral))
	mux.HandleFunc("DELETE /api/v1/products/{id}/pim/collateral/{collateralId}", guard(h.HandleDeleteCollateral))
}

func (h *Handler) HandleGetProductDetail(w http.ResponseWriter, r *http.Request) {
	id, err := uuid.Parse(r.PathValue("id"))
	if err != nil {
		httputil.RespondError(w, r, "invalid product id", http.StatusBadRequest, err)
		return
	}

	detail, err := h.service.GetProductDetail(r.Context(), id)
	if err != nil {
		httputil.RespondError(w, r, "failed to get product detail", http.StatusInternalServerError, err)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(detail)
}

func (h *Handler) HandleGetContent(w http.ResponseWriter, r *http.Request) {
	id, err := uuid.Parse(r.PathValue("id"))
	if err != nil {
		httputil.RespondError(w, r, "invalid product id", http.StatusBadRequest, err)
		return
	}

	content, err := h.service.GetContent(r.Context(), id)
	if err != nil {
		httputil.RespondError(w, r, "failed to get PIM content", http.StatusInternalServerError, err)
		return
	}

	if content == nil {
		content = &PIMContent{ProductID: id, Attributes: map[string]string{}, SEOKeywords: []string{}}
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(content)
}

func (h *Handler) HandleUpdateContent(w http.ResponseWriter, r *http.Request) {
	id, err := uuid.Parse(r.PathValue("id"))
	if err != nil {
		httputil.RespondError(w, r, "invalid product id", http.StatusBadRequest, err)
		return
	}

	var req UpdateContentRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		httputil.RespondError(w, r, "invalid request body", http.StatusBadRequest, err)
		return
	}

	content, err := h.service.UpdateContent(r.Context(), id, req)
	if err != nil {
		httputil.RespondError(w, r, "failed to update PIM content", http.StatusInternalServerError, err)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(content)
}

func (h *Handler) HandleGenerateDescriptions(w http.ResponseWriter, r *http.Request) {
	id, err := uuid.Parse(r.PathValue("id"))
	if err != nil {
		httputil.RespondError(w, r, "invalid product id", http.StatusBadRequest, err)
		return
	}

	var req GenerateDescriptionsRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		httputil.RespondError(w, r, "invalid request body", http.StatusBadRequest, err)
		return
	}

	content, err := h.service.GenerateDescriptions(r.Context(), id, req.Tone, req.Audience)
	if err != nil {
		httputil.RespondError(w, r, "failed to generate descriptions", http.StatusInternalServerError, err)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(content)
}

func (h *Handler) HandleGenerateSEO(w http.ResponseWriter, r *http.Request) {
	id, err := uuid.Parse(r.PathValue("id"))
	if err != nil {
		httputil.RespondError(w, r, "invalid product id", http.StatusBadRequest, err)
		return
	}

	var req GenerateSEORequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		httputil.RespondError(w, r, "invalid request body", http.StatusBadRequest, err)
		return
	}

	content, err := h.service.GenerateSEO(r.Context(), id, req.TargetKeywords)
	if err != nil {
		httputil.RespondError(w, r, "failed to generate SEO", http.StatusInternalServerError, err)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(content)
}

func (h *Handler) HandleGenerateImage(w http.ResponseWriter, r *http.Request) {
	id, err := uuid.Parse(r.PathValue("id"))
	if err != nil {
		httputil.RespondError(w, r, "invalid product id", http.StatusBadRequest, err)
		return
	}

	var req GenerateImageRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		httputil.RespondError(w, r, "invalid request body", http.StatusBadRequest, err)
		return
	}

	media, err := h.service.GenerateImage(r.Context(), id, req.Style, req.Prompt)
	if err != nil {
		httputil.RespondError(w, r, "failed to generate image", http.StatusInternalServerError, err)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(media)
}

func (h *Handler) HandleGenerateCollateral(w http.ResponseWriter, r *http.Request) {
	id, err := uuid.Parse(r.PathValue("id"))
	if err != nil {
		httputil.RespondError(w, r, "invalid product id", http.StatusBadRequest, err)
		return
	}

	var req GenerateCollateralRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		httputil.RespondError(w, r, "invalid request body", http.StatusBadRequest, err)
		return
	}

	collateral, err := h.service.GenerateCollateral(r.Context(), id, req.Type, req.Tone, req.Audience)
	if err != nil {
		httputil.RespondError(w, r, "failed to generate collateral", http.StatusInternalServerError, err)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(collateral)
}

func (h *Handler) HandleListMedia(w http.ResponseWriter, r *http.Request) {
	id, err := uuid.Parse(r.PathValue("id"))
	if err != nil {
		httputil.RespondError(w, r, "invalid product id", http.StatusBadRequest, err)
		return
	}

	media, err := h.service.ListMedia(r.Context(), id)
	if err != nil {
		httputil.RespondError(w, r, "failed to list media", http.StatusInternalServerError, err)
		return
	}

	if media == nil {
		media = []PIMMedia{}
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(media)
}

func (h *Handler) HandleDeleteMedia(w http.ResponseWriter, r *http.Request) {
	mediaID, err := uuid.Parse(r.PathValue("mediaId"))
	if err != nil {
		httputil.RespondError(w, r, "invalid media id", http.StatusBadRequest, err)
		return
	}

	if err := h.service.DeleteMedia(r.Context(), mediaID); err != nil {
		httputil.RespondError(w, r, "failed to delete media", http.StatusInternalServerError, err)
		return
	}

	w.WriteHeader(http.StatusNoContent)
}

func (h *Handler) HandleSetPrimaryMedia(w http.ResponseWriter, r *http.Request) {
	productID, err := uuid.Parse(r.PathValue("id"))
	if err != nil {
		httputil.RespondError(w, r, "invalid product id", http.StatusBadRequest, err)
		return
	}

	mediaID, err := uuid.Parse(r.PathValue("mediaId"))
	if err != nil {
		httputil.RespondError(w, r, "invalid media id", http.StatusBadRequest, err)
		return
	}

	if err := h.service.SetPrimaryMedia(r.Context(), productID, mediaID); err != nil {
		httputil.RespondError(w, r, "failed to set primary media", http.StatusInternalServerError, err)
		return
	}

	w.WriteHeader(http.StatusOK)
}

func (h *Handler) HandleListCollateral(w http.ResponseWriter, r *http.Request) {
	id, err := uuid.Parse(r.PathValue("id"))
	if err != nil {
		httputil.RespondError(w, r, "invalid product id", http.StatusBadRequest, err)
		return
	}

	items, err := h.service.ListCollateral(r.Context(), id)
	if err != nil {
		httputil.RespondError(w, r, "failed to list collateral", http.StatusInternalServerError, err)
		return
	}

	if items == nil {
		items = []PIMCollateral{}
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(items)
}

func (h *Handler) HandleDeleteCollateral(w http.ResponseWriter, r *http.Request) {
	collateralID, err := uuid.Parse(r.PathValue("collateralId"))
	if err != nil {
		httputil.RespondError(w, r, "invalid collateral id", http.StatusBadRequest, err)
		return
	}

	if err := h.service.DeleteCollateral(r.Context(), collateralID); err != nil {
		httputil.RespondError(w, r, "failed to delete collateral", http.StatusInternalServerError, err)
		return
	}

	w.WriteHeader(http.StatusNoContent)
}
