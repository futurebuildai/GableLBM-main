package pos

import (
	"encoding/json"
	"net/http"
	"time"

	"github.com/gablelbm/gable/pkg/httputil"
	"github.com/google/uuid"
)

// Handler handles POS HTTP endpoints.
type Handler struct {
	service *Service
}

// NewHandler creates a new POS handler.
func NewHandler(service *Service) *Handler {
	return &Handler{service: service}
}

// RegisterRoutes registers POS API routes.
// NOTE: POS routes use /api/pos/* (legacy). Migrate to /api/v1/pos/* in API versioning sprint.
func (h *Handler) RegisterRoutes(mux *http.ServeMux, roleGuard ...func(http.Handler) http.Handler) {
	guard := func(handler http.HandlerFunc) http.HandlerFunc {
		if len(roleGuard) > 0 && roleGuard[0] != nil {
			return func(w http.ResponseWriter, r *http.Request) {
				roleGuard[0](handler).ServeHTTP(w, r)
			}
		}
		return handler
	}

	// Transaction lifecycle
	mux.HandleFunc("POST /api/v1/pos/transactions", guard(h.StartTransaction))
	mux.HandleFunc("GET /api/v1/pos/transactions/{id}", guard(h.GetTransaction))
	mux.HandleFunc("POST /api/v1/pos/transactions/{id}/items", guard(h.AddItem))
	mux.HandleFunc("DELETE /api/v1/pos/transactions/{id}/items/{itemId}", guard(h.RemoveItem))
	mux.HandleFunc("POST /api/v1/pos/transactions/{id}/complete", guard(h.CompleteTransaction))
	mux.HandleFunc("POST /api/v1/pos/transactions/{id}/void", guard(h.VoidTransaction))

	// History and search
	mux.HandleFunc("GET /api/v1/pos/transactions", guard(h.ListTransactions))
	mux.HandleFunc("GET /api/v1/pos/products/search", guard(h.SearchProducts))

	// Offline sync
	mux.HandleFunc("POST /api/v1/pos/sync", guard(h.SyncOffline))
	mux.HandleFunc("GET /api/v1/pos/catalog", guard(h.GetCatalog))
}

// --- Request types ---

type startTransactionRequest struct {
	RegisterID string     `json:"register_id"`
	CashierID  uuid.UUID  `json:"cashier_id"`
	CustomerID *uuid.UUID `json:"customer_id,omitempty"`
}

type completeTransactionRequest struct {
	Tenders []AddTenderRequest `json:"tenders"`
}

// --- Handlers ---

func (h *Handler) StartTransaction(w http.ResponseWriter, r *http.Request) {
	var req startTransactionRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		httputil.RespondError(w, r, "Invalid request body", http.StatusBadRequest, err)
		return
	}

	if req.RegisterID == "" {
		req.RegisterID = "REG-01"
	}
	if req.CashierID == uuid.Nil {
		req.CashierID = uuid.New() // Demo fallback
	}

	tx, err := h.service.StartTransaction(r.Context(), req.RegisterID, req.CashierID, req.CustomerID)
	if err != nil {
		httputil.RespondError(w, r, "failed to start transaction", http.StatusInternalServerError, err)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusCreated)
	json.NewEncoder(w).Encode(tx)
}

func (h *Handler) GetTransaction(w http.ResponseWriter, r *http.Request) {
	id, err := uuid.Parse(r.PathValue("id"))
	if err != nil {
		httputil.RespondError(w, r, "Invalid transaction ID", http.StatusBadRequest, err)
		return
	}

	tx, err := h.service.GetTransaction(r.Context(), id)
	if err != nil {
		httputil.RespondError(w, r, "transaction not found", http.StatusNotFound, err)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(tx)
}

func (h *Handler) AddItem(w http.ResponseWriter, r *http.Request) {
	txID, err := uuid.Parse(r.PathValue("id"))
	if err != nil {
		httputil.RespondError(w, r, "Invalid transaction ID", http.StatusBadRequest, err)
		return
	}

	var req AddLineItemRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		httputil.RespondError(w, r, "Invalid request body", http.StatusBadRequest, err)
		return
	}

	tx, err := h.service.AddItem(r.Context(), txID, req)
	if err != nil {
		httputil.RespondError(w, r, "failed to add item", http.StatusInternalServerError, err)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(tx)
}

func (h *Handler) RemoveItem(w http.ResponseWriter, r *http.Request) {
	txID, err := uuid.Parse(r.PathValue("id"))
	if err != nil {
		httputil.RespondError(w, r, "Invalid transaction ID", http.StatusBadRequest, err)
		return
	}

	itemID, err := uuid.Parse(r.PathValue("itemId"))
	if err != nil {
		httputil.RespondError(w, r, "Invalid item ID", http.StatusBadRequest, err)
		return
	}

	tx, err := h.service.RemoveItem(r.Context(), txID, itemID)
	if err != nil {
		httputil.RespondError(w, r, "failed to remove item", http.StatusInternalServerError, err)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(tx)
}

func (h *Handler) CompleteTransaction(w http.ResponseWriter, r *http.Request) {
	txID, err := uuid.Parse(r.PathValue("id"))
	if err != nil {
		httputil.RespondError(w, r, "Invalid transaction ID", http.StatusBadRequest, err)
		return
	}

	var req completeTransactionRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		httputil.RespondError(w, r, "Invalid request body", http.StatusBadRequest, err)
		return
	}

	if len(req.Tenders) == 0 {
		httputil.RespondError(w, r, "At least one tender is required", http.StatusBadRequest, nil)
		return
	}

	tx, err := h.service.CompleteTransaction(r.Context(), txID, req.Tenders)
	if err != nil {
		httputil.RespondError(w, r, "failed to complete transaction", http.StatusUnprocessableEntity, err)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(tx)
}

func (h *Handler) VoidTransaction(w http.ResponseWriter, r *http.Request) {
	txID, err := uuid.Parse(r.PathValue("id"))
	if err != nil {
		httputil.RespondError(w, r, "Invalid transaction ID", http.StatusBadRequest, err)
		return
	}

	tx, err := h.service.VoidTransaction(r.Context(), txID)
	if err != nil {
		httputil.RespondError(w, r, "failed to void transaction", http.StatusInternalServerError, err)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(tx)
}

func (h *Handler) ListTransactions(w http.ResponseWriter, r *http.Request) {
	registerID := r.URL.Query().Get("register_id")
	dateStr := r.URL.Query().Get("date")

	date := time.Now()
	if dateStr != "" {
		parsed, err := time.Parse("2006-01-02", dateStr)
		if err == nil {
			date = parsed
		}
	}

	summaries, err := h.service.ListTransactions(r.Context(), registerID, date)
	if err != nil {
		httputil.RespondError(w, r, "failed to list transactions", http.StatusInternalServerError, err)
		return
	}

	if summaries == nil {
		summaries = []TransactionSummary{}
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(summaries)
}

func (h *Handler) SearchProducts(w http.ResponseWriter, r *http.Request) {
	query := r.URL.Query().Get("q")
	if query == "" {
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode([]QuickSearchResult{})
		return
	}

	results, err := h.service.SearchProducts(r.Context(), query)
	if err != nil {
		httputil.RespondError(w, r, "product search failed", http.StatusInternalServerError, err)
		return
	}

	if results == nil {
		results = []QuickSearchResult{}
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(results)
}

// SyncOffline handles POST /api/pos/sync — replays offline POS transactions.
func (h *Handler) SyncOffline(w http.ResponseWriter, r *http.Request) {
	var req OfflineSyncRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		httputil.RespondError(w, r, "Invalid request body", http.StatusBadRequest, err)
		return
	}

	if req.BatchID == "" {
		httputil.RespondError(w, r, "batch_id is required", http.StatusBadRequest, nil)
		return
	}
	if len(req.Items) == 0 {
		httputil.RespondError(w, r, "items cannot be empty", http.StatusBadRequest, nil)
		return
	}

	resp, err := h.service.SyncOfflineTransactions(r.Context(), req)
	if err != nil {
		httputil.RespondError(w, r, "offline sync failed", http.StatusInternalServerError, err)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(resp)
}

// GetCatalog handles GET /api/pos/catalog — returns full product catalog for offline cache.
func (h *Handler) GetCatalog(w http.ResponseWriter, r *http.Request) {
	catalog, err := h.service.GetProductCatalog(r.Context())
	if err != nil {
		httputil.RespondError(w, r, "failed to get catalog", http.StatusInternalServerError, err)
		return
	}

	if catalog == nil {
		catalog = []CatalogProduct{}
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(catalog)
}
