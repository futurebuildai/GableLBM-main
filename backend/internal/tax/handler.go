package tax

import (
	"encoding/json"
	"net/http"

	"github.com/gablelbm/gable/pkg/httputil"
	"github.com/google/uuid"
)

// Handler exposes tax-related HTTP endpoints.
type Handler struct {
	svc TaxCalculator
}

// NewHandler creates a new tax Handler.
func NewHandler(svc TaxCalculator) *Handler {
	return &Handler{svc: svc}
}

// RegisterRoutes registers tax endpoints on the given mux.
func (h *Handler) RegisterRoutes(mux *http.ServeMux, roleGuard ...func(http.Handler) http.Handler) {
	guard := func(handler http.HandlerFunc) http.HandlerFunc {
		if len(roleGuard) > 0 && roleGuard[0] != nil {
			return func(w http.ResponseWriter, r *http.Request) {
				roleGuard[0](handler).ServeHTTP(w, r)
			}
		}
		return handler
	}

	mux.HandleFunc("POST /api/v1/tax/preview", guard(h.previewTax))
	mux.HandleFunc("GET /api/v1/tax/exemptions/{customerID}", guard(h.getExemptions))
	mux.HandleFunc("POST /api/v1/tax/exemptions", guard(h.createExemption))
	mux.HandleFunc("DELETE /api/v1/tax/exemptions/{id}", guard(h.deleteExemption))
}

func (h *Handler) previewTax(w http.ResponseWriter, r *http.Request) {
	var req TaxPreviewRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		httputil.RespondError(w, r, "invalid request body", http.StatusBadRequest, err)
		return
	}

	if len(req.Lines) == 0 {
		httputil.RespondError(w, r, "at least one line item is required", http.StatusBadRequest, nil)
		return
	}

	if req.DocumentType == "" {
		req.DocumentType = "SalesInvoice"
	}

	result, err := h.svc.PreviewTax(r.Context(), &req)
	if err != nil {
		httputil.RespondError(w, r, "failed to preview tax", http.StatusInternalServerError, err)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(result)
}

func (h *Handler) getExemptions(w http.ResponseWriter, r *http.Request) {
	customerIDStr := r.PathValue("customerID")
	customerID, err := uuid.Parse(customerIDStr)
	if err != nil {
		httputil.RespondError(w, r, "invalid customer ID", http.StatusBadRequest, err)
		return
	}

	exemptions, err := h.svc.GetExemptions(r.Context(), customerID)
	if err != nil {
		httputil.RespondError(w, r, "failed to get tax exemptions", http.StatusInternalServerError, err)
		return
	}

	if exemptions == nil {
		exemptions = []TaxExemption{}
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(exemptions)
}

func (h *Handler) createExemption(w http.ResponseWriter, r *http.Request) {
	var req CreateExemptionRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		httputil.RespondError(w, r, "invalid request body", http.StatusBadRequest, err)
		return
	}

	if req.CustomerID == uuid.Nil {
		httputil.RespondError(w, r, "customer_id is required", http.StatusBadRequest, nil)
		return
	}
	if req.ExemptReason == "" {
		httputil.RespondError(w, r, "exempt_reason is required", http.StatusBadRequest, nil)
		return
	}

	exemption, err := h.svc.SaveExemption(r.Context(), &req)
	if err != nil {
		httputil.RespondError(w, r, "failed to save tax exemption", http.StatusInternalServerError, err)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusCreated)
	json.NewEncoder(w).Encode(exemption)
}

func (h *Handler) deleteExemption(w http.ResponseWriter, r *http.Request) {
	idStr := r.PathValue("id")
	id, err := uuid.Parse(idStr)
	if err != nil {
		httputil.RespondError(w, r, "invalid exemption ID", http.StatusBadRequest, err)
		return
	}

	if err := h.svc.DeleteExemption(r.Context(), id); err != nil {
		httputil.RespondError(w, r, "failed to delete tax exemption", http.StatusInternalServerError, err)
		return
	}

	w.WriteHeader(http.StatusNoContent)
}
