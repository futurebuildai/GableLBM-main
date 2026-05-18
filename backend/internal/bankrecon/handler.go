package bankrecon

import (
	"encoding/json"
	"net/http"

	"github.com/gablelbm/gable/pkg/httputil"
	"github.com/google/uuid"
)

// Handler handles bank reconciliation HTTP endpoints.
type Handler struct {
	service *Service
}

// NewHandler creates a new bank reconciliation handler.
func NewHandler(service *Service) *Handler {
	return &Handler{service: service}
}

// RegisterRoutes registers bank reconciliation API routes.
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

	// Bank Accounts
	mux.HandleFunc("POST /api/v1/bankrecon/accounts", guard(h.CreateBankAccount))
	mux.HandleFunc("GET /api/v1/bankrecon/accounts", guard(h.ListBankAccounts))

	// CSV Import
	mux.HandleFunc("POST /api/v1/bankrecon/import", guard(h.ImportCSV))

	// Reconciliation Sessions
	mux.HandleFunc("POST /api/v1/bankrecon/sessions", guard(h.CreateSession))
	mux.HandleFunc("GET /api/v1/bankrecon/sessions", guard(h.ListSessions))
	mux.HandleFunc("GET /api/v1/bankrecon/sessions/{id}", guard(h.GetSession))
	mux.HandleFunc("POST /api/v1/bankrecon/sessions/{id}/complete", guard(h.CompleteSession))

	// Manual Match/Unmatch
	mux.HandleFunc("POST /api/v1/bankrecon/match", guard(h.ManualMatch))
	mux.HandleFunc("POST /api/v1/bankrecon/unmatch", guard(h.ManualUnmatch))
}

func (h *Handler) CreateBankAccount(w http.ResponseWriter, r *http.Request) {
	var req CreateBankAccountRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		httputil.RespondError(w, r, "Invalid request body", http.StatusBadRequest, err)
		return
	}

	acct, err := h.service.CreateBankAccount(r.Context(), req)
	if err != nil {
		httputil.RespondError(w, r, "failed to create bank account", http.StatusInternalServerError, err)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusCreated)
	json.NewEncoder(w).Encode(acct)
}

func (h *Handler) ListBankAccounts(w http.ResponseWriter, r *http.Request) {
	accounts, err := h.service.ListBankAccounts(r.Context())
	if err != nil {
		httputil.RespondError(w, r, "failed to list bank accounts", http.StatusInternalServerError, err)
		return
	}

	if accounts == nil {
		accounts = []BankAccount{}
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(accounts)
}

func (h *Handler) ImportCSV(w http.ResponseWriter, r *http.Request) {
	var req ImportCSVRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		httputil.RespondError(w, r, "Invalid request body", http.StatusBadRequest, err)
		return
	}

	result, err := h.service.ImportCSV(r.Context(), req)
	if err != nil {
		httputil.RespondError(w, r, "failed to import CSV", http.StatusInternalServerError, err)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(result)
}

func (h *Handler) CreateSession(w http.ResponseWriter, r *http.Request) {
	var req CreateSessionRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		httputil.RespondError(w, r, "Invalid request body", http.StatusBadRequest, err)
		return
	}

	session, err := h.service.CreateSession(r.Context(), req)
	if err != nil {
		httputil.RespondError(w, r, "failed to create reconciliation session", http.StatusInternalServerError, err)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusCreated)
	json.NewEncoder(w).Encode(session)
}

func (h *Handler) GetSession(w http.ResponseWriter, r *http.Request) {
	id, err := uuid.Parse(r.PathValue("id"))
	if err != nil {
		httputil.RespondError(w, r, "Invalid session ID", http.StatusBadRequest, err)
		return
	}

	session, err := h.service.GetSession(r.Context(), id)
	if err != nil {
		httputil.RespondError(w, r, "reconciliation session not found", http.StatusNotFound, err)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(session)
}

func (h *Handler) ListSessions(w http.ResponseWriter, r *http.Request) {
	var bankAccountID *uuid.UUID
	if bid := r.URL.Query().Get("bank_account_id"); bid != "" {
		parsed, err := uuid.Parse(bid)
		if err == nil {
			bankAccountID = &parsed
		}
	}

	sessions, err := h.service.ListSessions(r.Context(), bankAccountID)
	if err != nil {
		httputil.RespondError(w, r, "failed to list reconciliation sessions", http.StatusInternalServerError, err)
		return
	}

	if sessions == nil {
		sessions = []ReconciliationSession{}
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(sessions)
}

func (h *Handler) CompleteSession(w http.ResponseWriter, r *http.Request) {
	id, err := uuid.Parse(r.PathValue("id"))
	if err != nil {
		httputil.RespondError(w, r, "Invalid session ID", http.StatusBadRequest, err)
		return
	}

	session, err := h.service.CompleteSession(r.Context(), id)
	if err != nil {
		httputil.RespondError(w, r, "failed to complete reconciliation session", http.StatusUnprocessableEntity, err)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(session)
}

func (h *Handler) ManualMatch(w http.ResponseWriter, r *http.Request) {
	var req ManualMatchRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		httputil.RespondError(w, r, "Invalid request body", http.StatusBadRequest, err)
		return
	}

	if err := h.service.ManualMatch(r.Context(), req); err != nil {
		httputil.RespondError(w, r, "failed to manually match transaction", http.StatusInternalServerError, err)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]string{"status": "matched"})
}

func (h *Handler) ManualUnmatch(w http.ResponseWriter, r *http.Request) {
	var req struct {
		BankTransactionID uuid.UUID `json:"bank_transaction_id"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		httputil.RespondError(w, r, "Invalid request body", http.StatusBadRequest, err)
		return
	}

	if err := h.service.ManualUnmatch(r.Context(), req.BankTransactionID); err != nil {
		httputil.RespondError(w, r, "failed to unmatch transaction", http.StatusInternalServerError, err)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]string{"status": "unmatched"})
}
