package document

import (
	"context"
	"log/slog"
	"net/http"

	"github.com/gablelbm/gable/internal/customer"
	"github.com/gablelbm/gable/internal/invoice"
	"github.com/gablelbm/gable/internal/notification"
	"github.com/gablelbm/gable/internal/order"
	"github.com/gablelbm/gable/pkg/httputil"
	"github.com/google/uuid"
)

type Handler struct {
	docSvc      *Service
	orderSvc    *order.Service
	invoiceSvc  *invoice.Service
	customerSvc *customer.Service
	emailSvc    notification.EmailService
}

func NewHandler(d *Service, o *order.Service, i *invoice.Service, c *customer.Service, e notification.EmailService) *Handler {
	return &Handler{docSvc: d, orderSvc: o, invoiceSvc: i, customerSvc: c, emailSvc: e}
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

	mux.HandleFunc("GET /api/v1/documents/print/invoice/{id}", guard(h.HandlePrintInvoice))
	mux.HandleFunc("GET /api/v1/documents/print/pickticket/{id}", guard(h.HandlePrintPickTicket))
	mux.HandleFunc("POST /api/v1/invoices/{id}/email", guard(h.HandleEmailInvoice))
}

func (h *Handler) HandlePrintInvoice(w http.ResponseWriter, r *http.Request) {
	idStr := r.PathValue("id")
	id, err := uuid.Parse(idStr)
	if err != nil {
		httputil.RespondError(w, r, "invalid id", http.StatusBadRequest, err)
		return
	}

	inv, err := h.invoiceSvc.GetInvoice(r.Context(), id)
	if err != nil {
		httputil.RespondError(w, r, "invoice not found", http.StatusNotFound, err)
		return
	}

	cust, err := h.customerSvc.GetCustomer(r.Context(), inv.CustomerID)
	if err != nil {
		httputil.RespondError(w, r, "customer not found", http.StatusNotFound, err)
		return
	}

	pdfBytes, err := h.docSvc.GenerateInvoicePDF(r.Context(), inv, cust)
	if err != nil {
		httputil.RespondError(w, r, "failed to generate invoice PDF", http.StatusInternalServerError, err)
		return
	}

	w.Header().Set("Content-Type", "application/pdf")
	w.Header().Set("Content-Disposition", "inline; filename=invoice.pdf")
	w.Write(pdfBytes)
}

func (h *Handler) HandlePrintPickTicket(w http.ResponseWriter, r *http.Request) {
	idStr := r.PathValue("id")
	id, err := uuid.Parse(idStr)
	if err != nil {
		httputil.RespondError(w, r, "invalid id", http.StatusBadRequest, err)
		return
	}

	o, err := h.orderSvc.GetOrder(r.Context(), id)
	if err != nil {
		httputil.RespondError(w, r, "order not found", http.StatusNotFound, err)
		return
	}

	cust, err := h.customerSvc.GetCustomer(r.Context(), o.CustomerID)
	if err != nil {
		httputil.RespondError(w, r, "customer not found", http.StatusNotFound, err)
		return
	}

	pdfBytes, err := h.docSvc.GeneratePickTicketPDF(r.Context(), o, cust)
	if err != nil {
		httputil.RespondError(w, r, "failed to generate pick ticket PDF", http.StatusInternalServerError, err)
		return
	}

	w.Header().Set("Content-Type", "application/pdf")
	w.Header().Set("Content-Disposition", "inline; filename=pickticket.pdf")
	w.Write(pdfBytes)
}

func (h *Handler) HandleEmailInvoice(w http.ResponseWriter, r *http.Request) {
	idStr := r.PathValue("id")
	id, err := uuid.Parse(idStr)
	if err != nil {
		httputil.RespondError(w, r, "invalid id", http.StatusBadRequest, err)
		return
	}

	inv, err := h.invoiceSvc.GetInvoice(r.Context(), id)
	if err != nil {
		httputil.RespondError(w, r, "invoice not found", http.StatusNotFound, err)
		return
	}

	cust, err := h.customerSvc.GetCustomer(r.Context(), inv.CustomerID)
	if err != nil {
		httputil.RespondError(w, r, "customer not found", http.StatusNotFound, err)
		return
	}

	pdfBytes, err := h.docSvc.GenerateInvoicePDF(r.Context(), inv, cust)
	if err != nil {
		httputil.RespondError(w, r, "failed to generate pdf", http.StatusInternalServerError, err)
		return
	}

	email := cust.Email
	if email == "" {
		httputil.RespondError(w, r, "customer has no email address on file", http.StatusBadRequest, nil)
		return
	}
	// Async Email Dispatch
	// L8 Requirement: Do not block HTTP thread on external SMTP calls.
	go func() {
		bgCtx := context.Background()
		if err := h.emailSvc.SendInvoice(bgCtx, email, inv.ID.String(), pdfBytes); err != nil {
			slog.Error("Failed to send invoice email", "error", err, "invoice_id", id)
		}
	}()

	w.WriteHeader(http.StatusAccepted)
	w.Write([]byte(`{"status":"queued"}`))
}
