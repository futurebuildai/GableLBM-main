package edi

import (
	"encoding/json"
	"io"
	"net/http"

	"github.com/gablelbm/gable/pkg/httputil"
	"github.com/google/uuid"
)

// EDIHandler provides admin-facing API endpoints for managing EDI trading partners.
type EDIHandler struct {
	repo    *EDIRepository
	bgSvc   *BuyingGroupService
	ediSvc  *Service
}

// NewEDIHandler creates a new EDI admin handler.
func NewEDIHandler(repo *EDIRepository, bgSvc *BuyingGroupService, ediSvc *Service) *EDIHandler {
	return &EDIHandler{repo: repo, bgSvc: bgSvc, ediSvc: ediSvc}
}

// RegisterRoutes registers EDI admin routes.
// roleGuard protects all endpoints; pass middleware.RequireRole("admin","owner") in production.
func (h *EDIHandler) RegisterRoutes(mux *http.ServeMux, roleGuard ...func(http.Handler) http.Handler) {
	guard := func(handler http.HandlerFunc) http.HandlerFunc {
		if len(roleGuard) > 0 && roleGuard[0] != nil {
			return func(w http.ResponseWriter, r *http.Request) {
				roleGuard[0](handler).ServeHTTP(w, r)
			}
		}
		return handler
	}

	mux.HandleFunc("GET /api/v1/edi/partners", guard(h.ListPartners))
	mux.HandleFunc("POST /api/v1/edi/partners", guard(h.CreatePartner))
	mux.HandleFunc("GET /api/v1/edi/partners/{id}", guard(h.GetPartner))
	mux.HandleFunc("PUT /api/v1/edi/partners/{id}", guard(h.UpdatePartner))
	mux.HandleFunc("DELETE /api/v1/edi/partners/{id}", guard(h.DeletePartner))
	mux.HandleFunc("POST /api/v1/edi/partners/{id}/import-catalog", guard(h.ImportCatalog))
	mux.HandleFunc("GET /api/v1/edi/partners/{id}/catalog", guard(h.ListCatalog))
}

func (h *EDIHandler) ListPartners(w http.ResponseWriter, r *http.Request) {
	partners, err := h.repo.ListPartners(r.Context())
	if err != nil {
		httputil.RespondError(w, r, "failed to list EDI partners", http.StatusInternalServerError, err)
		return
	}
	if partners == nil {
		partners = []TradingPartner{}
	}
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(partners)
}

func (h *EDIHandler) CreatePartner(w http.ResponseWriter, r *http.Request) {
	var p TradingPartner
	if err := json.NewDecoder(r.Body).Decode(&p); err != nil {
		httputil.RespondError(w, r, "Invalid request body", http.StatusBadRequest, err)
		return
	}
	if p.Name == "" {
		httputil.RespondError(w, r, "name is required", http.StatusBadRequest, nil)
		return
	}
	if p.TransportConfig == "" {
		p.TransportConfig = "{}"
	}
	if p.EDIVersion == "" {
		p.EDIVersion = "004010"
	}
	if p.TransportType == "" {
		p.TransportType = "SFTP"
	}
	if len(p.SupportedDocuments) == 0 {
		p.SupportedDocuments = []string{"832", "846", "850"}
	}

	if err := h.repo.CreatePartner(r.Context(), &p); err != nil {
		httputil.RespondError(w, r, "failed to create EDI partner", http.StatusInternalServerError, err)
		return
	}
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusCreated)
	json.NewEncoder(w).Encode(p)
}

func (h *EDIHandler) GetPartner(w http.ResponseWriter, r *http.Request) {
	id, err := uuid.Parse(r.PathValue("id"))
	if err != nil {
		httputil.RespondError(w, r, "Invalid partner ID", http.StatusBadRequest, err)
		return
	}
	p, err := h.repo.GetPartner(r.Context(), id)
	if err != nil {
		httputil.RespondError(w, r, "Partner not found", http.StatusNotFound, err)
		return
	}

	// Include catalog count
	count, _ := h.repo.GetCatalogEntryCount(r.Context(), id)

	type PartnerWithCount struct {
		TradingPartner
		CatalogCount int `json:"catalog_count"`
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(PartnerWithCount{
		TradingPartner: *p,
		CatalogCount:   count,
	})
}

func (h *EDIHandler) UpdatePartner(w http.ResponseWriter, r *http.Request) {
	id, err := uuid.Parse(r.PathValue("id"))
	if err != nil {
		httputil.RespondError(w, r, "Invalid partner ID", http.StatusBadRequest, err)
		return
	}

	var p TradingPartner
	if err := json.NewDecoder(r.Body).Decode(&p); err != nil {
		httputil.RespondError(w, r, "Invalid request body", http.StatusBadRequest, err)
		return
	}
	p.ID = id

	if err := h.repo.UpdatePartner(r.Context(), &p); err != nil {
		httputil.RespondError(w, r, "failed to update EDI partner", http.StatusInternalServerError, err)
		return
	}
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(p)
}

func (h *EDIHandler) DeletePartner(w http.ResponseWriter, r *http.Request) {
	id, err := uuid.Parse(r.PathValue("id"))
	if err != nil {
		httputil.RespondError(w, r, "Invalid partner ID", http.StatusBadRequest, err)
		return
	}
	if err := h.repo.DeletePartner(r.Context(), id); err != nil {
		httputil.RespondError(w, r, "failed to delete EDI partner", http.StatusInternalServerError, err)
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

// ImportCatalog accepts an EDI 832 file or CSV upload and persists catalog entries for the partner.
func (h *EDIHandler) ImportCatalog(w http.ResponseWriter, r *http.Request) {
	partnerID, err := uuid.Parse(r.PathValue("id"))
	if err != nil {
		httputil.RespondError(w, r, "Invalid partner ID", http.StatusBadRequest, err)
		return
	}

	// Read the uploaded file body
	defer r.Body.Close()
	data, err := io.ReadAll(io.LimitReader(r.Body, 50<<20)) // 50MB limit
	if err != nil {
		httputil.RespondError(w, r, "Failed to read request body", http.StatusBadRequest, err)
		return
	}

	format := r.URL.Query().Get("format") // "x12" or "csv", default "x12"
	if format == "" {
		format = "x12"
	}

	// Parse using existing BuyingGroupService
	var entries []CatalogEntry
	if format == "csv" {
		csvItems, parseErr := h.bgSvc.ParseCSVCatalog(string(data), "import")
		if parseErr != nil {
			httputil.RespondError(w, r, "CSV parse error", http.StatusUnprocessableEntity, parseErr)
			return
		}
		for _, item := range csvItems {
			entries = append(entries, CatalogEntry{
				VendorSKU:   item.SKU,
				Description: item.Description,
				UnitCost:    item.UnitPrice,
				UOM:         item.UOM,
				MinOrderQty: item.MinOrderQty,
				PackQty:     float64(item.PackSize),
			})
		}
	} else {
		x12Items, parseErr := h.bgSvc.Parse832Catalog(string(data))
		if parseErr != nil {
			httputil.RespondError(w, r, "X12 parse error", http.StatusUnprocessableEntity, parseErr)
			return
		}
		for _, item := range x12Items {
			entries = append(entries, CatalogEntry{
				VendorSKU:   item.SKU,
				Description: item.Description,
				UnitCost:    item.UnitPrice,
				UOM:         item.UOM,
			})
		}
	}

	// Persist to DB
	count, err := h.repo.SaveCatalogEntries(r.Context(), partnerID, entries)
	if err != nil {
		httputil.RespondError(w, r, "failed to save catalog", http.StatusInternalServerError, err)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]interface{}{
		"partner_id":   partnerID.String(),
		"format":       format,
		"parsed_count": len(entries),
		"saved_count":  count,
	})
}

func (h *EDIHandler) ListCatalog(w http.ResponseWriter, r *http.Request) {
	partnerID, err := uuid.Parse(r.PathValue("id"))
	if err != nil {
		httputil.RespondError(w, r, "Invalid partner ID", http.StatusBadRequest, err)
		return
	}

	entries, err := h.repo.ListCatalogEntries(r.Context(), partnerID, 200)
	if err != nil {
		httputil.RespondError(w, r, "failed to list catalog entries", http.StatusInternalServerError, err)
		return
	}
	if entries == nil {
		entries = []CatalogEntry{}
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(entries)
}
