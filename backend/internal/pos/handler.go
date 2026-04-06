package pos

import (
	"encoding/json"
	"net/http"
	"time"

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
func (h *Handler) RegisterRoutes(mux *http.ServeMux) {
	// Transaction lifecycle
	mux.HandleFunc("POST /api/pos/transactions", h.StartTransaction)
	mux.HandleFunc("GET /api/pos/transactions/{id}", h.GetTransaction)
	mux.HandleFunc("POST /api/pos/transactions/{id}/items", h.AddItem)
	mux.HandleFunc("DELETE /api/pos/transactions/{id}/items/{itemId}", h.RemoveItem)
	mux.HandleFunc("POST /api/pos/transactions/{id}/complete", h.CompleteTransaction)
	mux.HandleFunc("POST /api/pos/transactions/{id}/void", h.VoidTransaction)

	// History and search
	mux.HandleFunc("GET /api/pos/transactions", h.ListTransactions)
	mux.HandleFunc("GET /api/pos/products/search", h.SearchProducts)

	// Offline sync
	mux.HandleFunc("POST /api/pos/sync", h.SyncOffline)
	mux.HandleFunc("GET /api/pos/catalog", h.GetCatalog)
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
		http.Error(w, "Invalid request body", http.StatusBadRequest)
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
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusCreated)
	json.NewEncoder(w).Encode(tx)
}

func (h *Handler) GetTransaction(w http.ResponseWriter, r *http.Request) {
	id, err := uuid.Parse(r.PathValue("id"))
	if err != nil {
		http.Error(w, "Invalid transaction ID", http.StatusBadRequest)
		return
	}

	tx, err := h.service.GetTransaction(r.Context(), id)
	if err != nil {
		http.Error(w, err.Error(), http.StatusNotFound)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(tx)
}

func (h *Handler) AddItem(w http.ResponseWriter, r *http.Request) {
	txID, err := uuid.Parse(r.PathValue("id"))
	if err != nil {
		http.Error(w, "Invalid transaction ID", http.StatusBadRequest)
		return
	}

	var req AddLineItemRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "Invalid request body", http.StatusBadRequest)
		return
	}

	tx, err := h.service.AddItem(r.Context(), txID, req)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(tx)
}

func (h *Handler) RemoveItem(w http.ResponseWriter, r *http.Request) {
	txID, err := uuid.Parse(r.PathValue("id"))
	if err != nil {
		http.Error(w, "Invalid transaction ID", http.StatusBadRequest)
		return
	}

	itemID, err := uuid.Parse(r.PathValue("itemId"))
	if err != nil {
		http.Error(w, "Invalid item ID", http.StatusBadRequest)
		return
	}

	tx, err := h.service.RemoveItem(r.Context(), txID, itemID)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(tx)
}

func (h *Handler) CompleteTransaction(w http.ResponseWriter, r *http.Request) {
	txID, err := uuid.Parse(r.PathValue("id"))
	if err != nil {
		http.Error(w, "Invalid transaction ID", http.StatusBadRequest)
		return
	}

	var req completeTransactionRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "Invalid request body", http.StatusBadRequest)
		return
	}

	if len(req.Tenders) == 0 {
		http.Error(w, "At least one tender is required", http.StatusBadRequest)
		return
	}

	tx, err := h.service.CompleteTransaction(r.Context(), txID, req.Tenders)
	if err != nil {
		http.Error(w, err.Error(), http.StatusUnprocessableEntity)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(tx)
}

func (h *Handler) VoidTransaction(w http.ResponseWriter, r *http.Request) {
	txID, err := uuid.Parse(r.PathValue("id"))
	if err != nil {
		http.Error(w, "Invalid transaction ID", http.StatusBadRequest)
		return
	}

	tx, err := h.service.VoidTransaction(r.Context(), txID)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
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
		http.Error(w, err.Error(), http.StatusInternalServerError)
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
		http.Error(w, err.Error(), http.StatusInternalServerError)
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
		http.Error(w, "Invalid request body", http.StatusBadRequest)
		return
	}

	if req.BatchID == "" {
		http.Error(w, "batch_id is required", http.StatusBadRequest)
		return
	}
	if len(req.Items) == 0 {
		http.Error(w, "items cannot be empty", http.StatusBadRequest)
		return
	}

	resp, err := h.service.SyncOfflineTransactions(r.Context(), req)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(resp)
}

// GetCatalog handles GET /api/pos/catalog — returns full product catalog for offline cache.
func (h *Handler) GetCatalog(w http.ResponseWriter, r *http.Request) {
	catalog, err := h.service.GetProductCatalog(r.Context())
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	if catalog == nil {
		catalog = []CatalogProduct{}
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(catalog)
}

