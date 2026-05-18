package invoice

import (
	"encoding/json"
	"net/http"

	"github.com/gablelbm/gable/pkg/httputil"
	"github.com/gablelbm/gable/pkg/pagination"
	"github.com/google/uuid"
)

type Handler struct {
	svc *Service
}

func NewHandler(svc *Service) *Handler {
	return &Handler{svc: svc}
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

	mux.HandleFunc("GET /api/v1/invoices", guard(h.HandleList))
	mux.HandleFunc("GET /api/v1/invoices/{id}", guard(h.HandleGet))
	mux.HandleFunc("POST /api/v1/invoices/{id}/credit-memo", guard(h.HandleCreateCreditMemo))
	mux.HandleFunc("GET /api/v1/credit-memos/{customerId}", guard(h.HandleListCreditMemos))
}

func (h *Handler) HandleList(w http.ResponseWriter, r *http.Request) {
	page := pagination.FromRequest(r)
	invoices, total, err := h.svc.ListInvoicesPaginated(r.Context(), page.Limit, page.Offset)
	if err != nil {
		httputil.RespondError(w, r, "failed to list invoices", http.StatusInternalServerError, err)
		return
	}

	resp := pagination.PagedResponse[Invoice]{
		Data:   invoices,
		Total:  total,
		Limit:  page.Limit,
		Offset: page.Offset,
	}
	if resp.Data == nil {
		resp.Data = []Invoice{}
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(resp)
}

func (h *Handler) HandleGet(w http.ResponseWriter, r *http.Request) {
	idStr := r.PathValue("id")
	id, err := uuid.Parse(idStr)
	if err != nil {
		httputil.RespondError(w, r, "invalid invoice ID", http.StatusBadRequest, err)
		return
	}

	inv, err := h.svc.GetInvoice(r.Context(), id)
	if err != nil {
		httputil.RespondError(w, r, "invoice not found", http.StatusNotFound, err)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(inv)
}

type CreateCreditMemoRequest struct {
	AmountCents int64  `json:"amount_cents"`
	Reason      string `json:"reason"`
}

func (h *Handler) HandleCreateCreditMemo(w http.ResponseWriter, r *http.Request) {
	invoiceIDStr := r.PathValue("id")
	invoiceID, err := uuid.Parse(invoiceIDStr)
	if err != nil {
		httputil.RespondError(w, r, "invalid invoice ID", http.StatusBadRequest, err)
		return
	}

	var req CreateCreditMemoRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		httputil.RespondError(w, r, "invalid request body", http.StatusBadRequest, err)
		return
	}

	if req.AmountCents <= 0 {
		httputil.RespondError(w, r, "amount_cents must be positive", http.StatusBadRequest, nil)
		return
	}

	// Get invoice to find customer
	inv, err := h.svc.GetInvoice(r.Context(), invoiceID)
	if err != nil {
		httputil.RespondError(w, r, "invoice not found", http.StatusNotFound, err)
		return
	}

	cm, err := h.svc.CreateAndApplyCreditMemo(r.Context(), inv.CustomerID, &invoiceID, req.AmountCents, req.Reason)
	if err != nil {
		httputil.RespondError(w, r, "failed to create credit memo", http.StatusInternalServerError, err)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusCreated)
	json.NewEncoder(w).Encode(cm)
}

func (h *Handler) HandleListCreditMemos(w http.ResponseWriter, r *http.Request) {
	customerIDStr := r.PathValue("customerId")
	customerID, err := uuid.Parse(customerIDStr)
	if err != nil {
		httputil.RespondError(w, r, "invalid customer ID", http.StatusBadRequest, err)
		return
	}

	memos, err := h.svc.ListCreditMemos(r.Context(), customerID)
	if err != nil {
		httputil.RespondError(w, r, "failed to list credit memos", http.StatusInternalServerError, err)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(memos)
}
