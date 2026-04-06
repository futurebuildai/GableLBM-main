package edi

import (
	"encoding/json"
	"fmt"
	"io"
	"net/http"

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
func (h *EDIHandler) RegisterRoutes(mux *http.ServeMux) {
	mux.HandleFunc("GET /api/v1/edi/partners", h.ListPartners)
	mux.HandleFunc("POST /api/v1/edi/partners", h.CreatePartner)
	mux.HandleFunc("GET /api/v1/edi/partners/{id}", h.GetPartner)
	mux.HandleFunc("PUT /api/v1/edi/partners/{id}", h.UpdatePartner)
	mux.HandleFunc("DELETE /api/v1/edi/partners/{id}", h.DeletePartner)
	mux.HandleFunc("POST /api/v1/edi/partners/{id}/import-catalog", h.ImportCatalog)
	mux.HandleFunc("GET /api/v1/edi/partners/{id}/catalog", h.ListCatalog)
}

func (h *EDIHandler) ListPartners(w http.ResponseWriter, r *http.Request) {
	partners, err := h.repo.ListPartners(r.Context())
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
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
		http.Error(w, "Invalid request body", http.StatusBadRequest)
		return
	}
	if p.Name == "" {
		http.Error(w, "name is required", http.StatusBadRequest)
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
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusCreated)
	json.NewEncoder(w).Encode(p)
}

func (h *EDIHandler) GetPartner(w http.ResponseWriter, r *http.Request) {
	id, err := uuid.Parse(r.PathValue("id"))
	if err != nil {
		http.Error(w, "Invalid partner ID", http.StatusBadRequest)
		return
	}
	p, err := h.repo.GetPartner(r.Context(), id)
	if err != nil {
		http.Error(w, "Partner not found", http.StatusNotFound)
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
		http.Error(w, "Invalid partner ID", http.StatusBadRequest)
		return
	}

	var p TradingPartner
	if err := json.NewDecoder(r.Body).Decode(&p); err != nil {
		http.Error(w, "Invalid request body", http.StatusBadRequest)
		return
	}
	p.ID = id

	if err := h.repo.UpdatePartner(r.Context(), &p); err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(p)
}

func (h *EDIHandler) DeletePartner(w http.ResponseWriter, r *http.Request) {
	id, err := uuid.Parse(r.PathValue("id"))
	if err != nil {
		http.Error(w, "Invalid partner ID", http.StatusBadRequest)
		return
	}
	if err := h.repo.DeletePartner(r.Context(), id); err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

// ImportCatalog accepts an EDI 832 file or CSV upload and persists catalog entries for the partner.
func (h *EDIHandler) ImportCatalog(w http.ResponseWriter, r *http.Request) {
	partnerID, err := uuid.Parse(r.PathValue("id"))
	if err != nil {
		http.Error(w, "Invalid partner ID", http.StatusBadRequest)
		return
	}

	// Read the uploaded file body
	defer r.Body.Close()
	data, err := io.ReadAll(io.LimitReader(r.Body, 50<<20)) // 50MB limit
	if err != nil {
		http.Error(w, "Failed to read body", http.StatusBadRequest)
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
			http.Error(w, fmt.Sprintf("CSV parse error: %v", parseErr), http.StatusUnprocessableEntity)
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
			http.Error(w, fmt.Sprintf("X12 parse error: %v", parseErr), http.StatusUnprocessableEntity)
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
		http.Error(w, fmt.Sprintf("Failed to save catalog: %v", err), http.StatusInternalServerError)
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
		http.Error(w, "Invalid partner ID", http.StatusBadRequest)
		return
	}

	entries, err := h.repo.ListCatalogEntries(r.Context(), partnerID, 200)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	if entries == nil {
		entries = []CatalogEntry{}
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(entries)
}
