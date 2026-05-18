package ap

import (
	"encoding/json"
	"net/http"

	"github.com/gablelbm/gable/pkg/httputil"
	"github.com/gablelbm/gable/pkg/middleware"
	"github.com/google/uuid"
)

// Handler handles AP HTTP endpoints.
type Handler struct {
	service *Service
}

// NewHandler creates a new AP handler.
func NewHandler(service *Service) *Handler {
	return &Handler{service: service}
}

// RegisterRoutes registers AP API routes.
// roleGuard protects all endpoints; pass middleware.RequireRole("admin","owner","finance") in production.
func (h *Handler) RegisterRoutes(mux *http.ServeMux, roleGuard ...func(http.Handler) http.Handler) {
	guard := func(handler http.HandlerFunc) http.HandlerFunc {
		if len(roleGuard) > 0 && roleGuard[0] != nil {
			return func(w http.ResponseWriter, r *http.Request) {
				roleGuard[0](handler).ServeHTTP(w, r)
			}
		}
		return handler
	}

	// Vendor Invoices
	mux.HandleFunc("POST /api/v1/ap/invoices", guard(h.CreateVendorInvoice))
	mux.HandleFunc("GET /api/v1/ap/invoices", guard(h.ListVendorInvoices))
	mux.HandleFunc("GET /api/v1/ap/invoices/{id}", guard(h.GetVendorInvoice))
	mux.HandleFunc("POST /api/v1/ap/invoices/{id}/approve", guard(h.ApproveInvoice))

	// AP Payments
	mux.HandleFunc("POST /api/v1/ap/payments", guard(h.PayVendor))
	mux.HandleFunc("GET /api/v1/ap/payments", guard(h.ListPayments))

	// Aging Report
	mux.HandleFunc("GET /api/v1/ap/aging", guard(h.GetAgingSummary))
}

func (h *Handler) CreateVendorInvoice(w http.ResponseWriter, r *http.Request) {
	var req CreateVendorInvoiceRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		httputil.RespondError(w, r, "Invalid request body", http.StatusBadRequest, err)
		return
	}

	inv, err := h.service.CreateVendorInvoice(r.Context(), req)
	if err != nil {
		httputil.RespondError(w, r, "failed to create vendor invoice", http.StatusInternalServerError, err)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusCreated)
	json.NewEncoder(w).Encode(inv)
}

func (h *Handler) GetVendorInvoice(w http.ResponseWriter, r *http.Request) {
	id, err := uuid.Parse(r.PathValue("id"))
	if err != nil {
		httputil.RespondError(w, r, "Invalid invoice ID", http.StatusBadRequest, err)
		return
	}

	inv, err := h.service.GetVendorInvoice(r.Context(), id)
	if err != nil {
		httputil.RespondError(w, r, "vendor invoice not found", http.StatusNotFound, err)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(inv)
}

func (h *Handler) ListVendorInvoices(w http.ResponseWriter, r *http.Request) {
	var vendorID *uuid.UUID
	if vid := r.URL.Query().Get("vendor_id"); vid != "" {
		parsed, err := uuid.Parse(vid)
		if err == nil {
			vendorID = &parsed
		}
	}
	status := r.URL.Query().Get("status")

	invoices, err := h.service.ListVendorInvoices(r.Context(), vendorID, status)
	if err != nil {
		httputil.RespondError(w, r, "failed to list vendor invoices", http.StatusInternalServerError, err)
		return
	}

	if invoices == nil {
		invoices = []VendorInvoice{}
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(invoices)
}

func (h *Handler) ApproveInvoice(w http.ResponseWriter, r *http.Request) {
	id, err := uuid.Parse(r.PathValue("id"))
	if err != nil {
		httputil.RespondError(w, r, "Invalid invoice ID", http.StatusBadRequest, err)
		return
	}

	// Extract approver ID from auth context
	var approverID uuid.UUID
	if claims := middleware.ClaimsFromContext(r.Context()); claims != nil {
		parsed, err := uuid.Parse(claims.Subject)
		if err != nil {
			httputil.RespondError(w, r, "Invalid user ID in token", http.StatusUnauthorized, err)
			return
		}
		approverID = parsed
	} else {
		httputil.RespondError(w, r, "Authentication required", http.StatusUnauthorized, nil)
		return
	}

	inv, err := h.service.ApproveInvoice(r.Context(), id, approverID)
	if err != nil {
		httputil.RespondError(w, r, "failed to approve invoice", http.StatusUnprocessableEntity, err)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(inv)
}

func (h *Handler) PayVendor(w http.ResponseWriter, r *http.Request) {
	var req CreateAPPaymentRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		httputil.RespondError(w, r, "Invalid request body", http.StatusBadRequest, err)
		return
	}

	pmt, err := h.service.PayVendor(r.Context(), req)
	if err != nil {
		httputil.RespondError(w, r, "failed to process vendor payment", http.StatusInternalServerError, err)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusCreated)
	json.NewEncoder(w).Encode(pmt)
}

func (h *Handler) ListPayments(w http.ResponseWriter, r *http.Request) {
	var vendorID *uuid.UUID
	if vid := r.URL.Query().Get("vendor_id"); vid != "" {
		parsed, err := uuid.Parse(vid)
		if err == nil {
			vendorID = &parsed
		}
	}

	payments, err := h.service.ListPayments(r.Context(), vendorID)
	if err != nil {
		httputil.RespondError(w, r, "failed to list AP payments", http.StatusInternalServerError, err)
		return
	}

	if payments == nil {
		payments = []APPayment{}
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(payments)
}

func (h *Handler) GetAgingSummary(w http.ResponseWriter, r *http.Request) {
	summary, err := h.service.GetAgingSummary(r.Context())
	if err != nil {
		httputil.RespondError(w, r, "failed to get AP aging summary", http.StatusInternalServerError, err)
		return
	}

	if summary == nil {
		summary = []APAgingSummary{}
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(summary)
}
