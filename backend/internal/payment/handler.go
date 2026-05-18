package payment

import (
	"encoding/json"
	"net/http"

	"github.com/gablelbm/gable/pkg/httputil"
	"github.com/google/uuid"
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

	// Existing routes
	mux.HandleFunc("POST /api/v1/payments", guard(h.CreatePayment))
	mux.HandleFunc("GET /api/v1/invoices/{id}/payments", guard(h.GetPaymentHistory))

	// Run Payments gateway routes
	mux.HandleFunc("POST /api/v1/payments/intent", guard(h.CreatePaymentIntent))
	mux.HandleFunc("POST /api/v1/payments/card", guard(h.ProcessCardPayment))
	mux.HandleFunc("POST /api/v1/payments/refund", guard(h.ProcessRefund))
}

// CreatePayment handles non-card payments (cash, check, account).
func (h *Handler) CreatePayment(w http.ResponseWriter, r *http.Request) {
	var req CreatePaymentRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		httputil.RespondError(w, r, "Invalid request body", http.StatusBadRequest, err)
		return
	}

	payment, err := h.service.ProcessPayment(r.Context(), req.InvoiceID, req.Amount, req.Method, req.Reference, req.Notes)
	if err != nil {
		httputil.RespondError(w, r, "payment processing failed", http.StatusInternalServerError, err)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(payment)
}

// CreatePaymentIntent returns the Run Payments public key for Runner.js tokenization.
// The frontend calls this before showing the card input form.
func (h *Handler) CreatePaymentIntent(w http.ResponseWriter, r *http.Request) {
	var req CreatePaymentIntentRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		httputil.RespondError(w, r, "Invalid request body", http.StatusBadRequest, err)
		return
	}

	publicKey := h.service.GetPublicKey()
	if publicKey == "" {
		httputil.RespondError(w, r, "Payment gateway not configured", http.StatusServiceUnavailable, nil)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(PaymentIntentResponse{
		PublicKey: publicKey,
		InvoiceID: req.InvoiceID.String(),
		Amount:    req.Amount,
	})
}

// ProcessCardPayment handles tokenized card payments through Run Payments.
// Flow: Frontend tokenizes via Runner.js → sends token here → we charge via gateway.
func (h *Handler) ProcessCardPayment(w http.ResponseWriter, r *http.Request) {
	var req ProcessCardPaymentRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		httputil.RespondError(w, r, "Invalid request body", http.StatusBadRequest, err)
		return
	}

	if req.TokenID == "" {
		httputil.RespondError(w, r, "token_id is required", http.StatusBadRequest, nil)
		return
	}

	payment, err := h.service.ProcessCardPayment(r.Context(), req.InvoiceID, req.TokenID, req.Amount, req.Notes)
	if err != nil {
		httputil.RespondError(w, r, "card payment failed", http.StatusPaymentRequired, err)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(payment)
}

// ProcessRefund handles full or partial refunds of card payments.
func (h *Handler) ProcessRefund(w http.ResponseWriter, r *http.Request) {
	var req RefundRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		httputil.RespondError(w, r, "Invalid request body", http.StatusBadRequest, err)
		return
	}

	refund, err := h.service.RefundPayment(r.Context(), req.PaymentID, req.Amount, req.Reason)
	if err != nil {
		httputil.RespondError(w, r, "refund processing failed", http.StatusInternalServerError, err)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(refund)
}

// GetPaymentHistory returns all payments for an invoice.
func (h *Handler) GetPaymentHistory(w http.ResponseWriter, r *http.Request) {
	idStr := r.PathValue("id")
	id, err := uuid.Parse(idStr)
	if err != nil {
		httputil.RespondError(w, r, "Invalid Invoice ID", http.StatusBadRequest, err)
		return
	}

	history, err := h.service.GetHistory(r.Context(), id)
	if err != nil {
		httputil.RespondError(w, r, "failed to get payment history", http.StatusInternalServerError, err)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(history)
}

// CreatePaymentRequest is the existing request struct for non-card payments.
type CreatePaymentRequest struct {
	InvoiceID uuid.UUID     `json:"invoice_id"`
	Amount    int64         `json:"amount"` // In cents
	Method    PaymentMethod `json:"method"`
	Reference string        `json:"reference"`
	Notes     string        `json:"notes"`
}
