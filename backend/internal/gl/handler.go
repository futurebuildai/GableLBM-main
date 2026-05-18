package gl

import (
	"encoding/json"
	"math"
	"net/http"
	"time"

	"github.com/gablelbm/gable/pkg/httputil"
	"github.com/google/uuid"
)

// Handler exposes GL REST endpoints.
type Handler struct {
	svc *Service
}

// NewHandler creates a new GL Handler.
func NewHandler(svc *Service) *Handler {
	return &Handler{svc: svc}
}

// RegisterRoutes registers all GL routes on the mux.
// roleGuard protects write endpoints; pass middleware.RequireRole("admin","owner") in production.
func (h *Handler) RegisterRoutes(mux *http.ServeMux, roleGuard ...func(http.Handler) http.Handler) {
	guard := func(handler http.HandlerFunc) http.HandlerFunc {
		if len(roleGuard) > 0 && roleGuard[0] != nil {
			return func(w http.ResponseWriter, r *http.Request) {
				roleGuard[0](handler).ServeHTTP(w, r)
			}
		}
		return handler
	}

	// Accounts
	mux.HandleFunc("GET /api/v1/gl/accounts", guard(h.HandleListAccounts))
	mux.HandleFunc("POST /api/v1/gl/accounts", guard(h.HandleCreateAccount))
	mux.HandleFunc("PUT /api/v1/gl/accounts/{id}", guard(h.HandleUpdateAccount))

	// Journal Entries
	mux.HandleFunc("GET /api/v1/gl/journal-entries", guard(h.HandleListJournalEntries))
	mux.HandleFunc("GET /api/v1/gl/journal-entries/{id}", guard(h.HandleGetJournalEntry))
	mux.HandleFunc("POST /api/v1/gl/journal-entries", guard(h.HandleCreateJournalEntry))
	mux.HandleFunc("POST /api/v1/gl/journal-entries/{id}/post", guard(h.HandlePostJournalEntry))
	mux.HandleFunc("POST /api/v1/gl/journal-entries/{id}/void", guard(h.HandleVoidJournalEntry))

	// Trial Balance
	mux.HandleFunc("GET /api/v1/gl/trial-balance", guard(h.HandleTrialBalance))

	// Fiscal Periods
	mux.HandleFunc("GET /api/v1/gl/fiscal-periods", guard(h.HandleListFiscalPeriods))
	mux.HandleFunc("POST /api/v1/gl/fiscal-periods/{id}/close", guard(h.HandleCloseFiscalPeriod))
}

// --- Account Handlers ---

func (h *Handler) HandleListAccounts(w http.ResponseWriter, r *http.Request) {
	accounts, err := h.svc.ListAccounts(r.Context())
	if err != nil {
		httputil.RespondError(w, r, "failed to list GL accounts", http.StatusInternalServerError, err)
		return
	}
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(accounts)
}

type createAccountRequest struct {
	Code          string     `json:"code"`
	Name          string     `json:"name"`
	Type          string     `json:"type"`
	Subtype       string     `json:"subtype"`
	ParentID      *uuid.UUID `json:"parent_id,omitempty"`
	NormalBalance string     `json:"normal_balance"`
	Description   string     `json:"description"`
}

func (h *Handler) HandleCreateAccount(w http.ResponseWriter, r *http.Request) {
	var req createAccountRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		httputil.RespondError(w, r, "invalid request body", http.StatusBadRequest, err)
		return
	}

	acct := &GLAccount{
		Code:          req.Code,
		Name:          req.Name,
		Type:          req.Type,
		Subtype:       req.Subtype,
		ParentID:      req.ParentID,
		NormalBalance: req.NormalBalance,
		Description:   req.Description,
	}

	if err := h.svc.CreateAccount(r.Context(), acct); err != nil {
		httputil.RespondError(w, r, "failed to create GL account", http.StatusBadRequest, err)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusCreated)
	json.NewEncoder(w).Encode(acct)
}

func (h *Handler) HandleUpdateAccount(w http.ResponseWriter, r *http.Request) {
	idStr := r.PathValue("id")
	id, err := uuid.Parse(idStr)
	if err != nil {
		httputil.RespondError(w, r, "invalid account ID", http.StatusBadRequest, err)
		return
	}

	var req createAccountRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		httputil.RespondError(w, r, "invalid request body", http.StatusBadRequest, err)
		return
	}

	acct := &GLAccount{
		ID:            id,
		Code:          req.Code,
		Name:          req.Name,
		Type:          req.Type,
		Subtype:       req.Subtype,
		ParentID:      req.ParentID,
		NormalBalance: req.NormalBalance,
		Description:   req.Description,
		IsActive:      true,
	}

	if err := h.svc.UpdateAccount(r.Context(), acct); err != nil {
		httputil.RespondError(w, r, "failed to update GL account", http.StatusInternalServerError, err)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(acct)
}

// --- Journal Entry Handlers ---

func (h *Handler) HandleListJournalEntries(w http.ResponseWriter, r *http.Request) {
	entries, err := h.svc.ListJournalEntries(r.Context())
	if err != nil {
		httputil.RespondError(w, r, "failed to list journal entries", http.StatusInternalServerError, err)
		return
	}
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(entries)
}

func (h *Handler) HandleGetJournalEntry(w http.ResponseWriter, r *http.Request) {
	idStr := r.PathValue("id")
	id, err := uuid.Parse(idStr)
	if err != nil {
		httputil.RespondError(w, r, "invalid journal entry ID", http.StatusBadRequest, err)
		return
	}

	entry, err := h.svc.GetJournalEntry(r.Context(), id)
	if err != nil {
		httputil.RespondError(w, r, "journal entry not found", http.StatusNotFound, err)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(entry)
}

type createJournalEntryRequest struct {
	EntryDate string           `json:"entry_date"` // YYYY-MM-DD
	Memo      string           `json:"memo"`
	Lines     []journalLineReq `json:"lines"`
}

type journalLineReq struct {
	AccountID   string  `json:"account_id"`
	Description string  `json:"description"`
	Debit       float64 `json:"debit"`
	Credit      float64 `json:"credit"`
}

func (h *Handler) HandleCreateJournalEntry(w http.ResponseWriter, r *http.Request) {
	var req createJournalEntryRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		httputil.RespondError(w, r, "invalid request body", http.StatusBadRequest, err)
		return
	}

	entryDate := time.Now()
	if req.EntryDate != "" {
		parsed, err := time.Parse("2006-01-02", req.EntryDate)
		if err != nil {
			httputil.RespondError(w, r, "invalid entry_date format (expected YYYY-MM-DD)", http.StatusBadRequest, err)
			return
		}
		entryDate = parsed
	}

	var lines []JournalLine
	for _, lr := range req.Lines {
		if lr.Debit < 0 || lr.Credit < 0 {
			httputil.RespondError(w, r, "debit and credit amounts must be >= 0", http.StatusBadRequest, nil)
			return
		}
		accountID, err := uuid.Parse(lr.AccountID)
		if err != nil {
			httputil.RespondError(w, r, "invalid account_id: "+lr.AccountID, http.StatusBadRequest, err)
			return
		}
		lines = append(lines, JournalLine{
			AccountID:   accountID,
			Description: lr.Description,
			Debit:       int64(math.Round(lr.Debit * 100)),
			Credit:      int64(math.Round(lr.Credit * 100)),
		})
	}

	entry := &JournalEntry{
		EntryDate: entryDate,
		Memo:      req.Memo,
		Source:    SourceManual,
		Status:    StatusDraft,
		Lines:     lines,
	}

	if err := h.svc.CreateJournalEntry(r.Context(), entry); err != nil {
		httputil.RespondError(w, r, "failed to create journal entry", http.StatusBadRequest, err)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusCreated)
	json.NewEncoder(w).Encode(entry)
}

func (h *Handler) HandlePostJournalEntry(w http.ResponseWriter, r *http.Request) {
	idStr := r.PathValue("id")
	id, err := uuid.Parse(idStr)
	if err != nil {
		httputil.RespondError(w, r, "invalid journal entry ID", http.StatusBadRequest, err)
		return
	}

	if err := h.svc.PostJournalEntry(r.Context(), id); err != nil {
		httputil.RespondError(w, r, "failed to post journal entry", http.StatusBadRequest, err)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]string{"status": "posted"})
}

func (h *Handler) HandleVoidJournalEntry(w http.ResponseWriter, r *http.Request) {
	idStr := r.PathValue("id")
	id, err := uuid.Parse(idStr)
	if err != nil {
		httputil.RespondError(w, r, "invalid journal entry ID", http.StatusBadRequest, err)
		return
	}

	if err := h.svc.VoidJournalEntry(r.Context(), id); err != nil {
		httputil.RespondError(w, r, "failed to void journal entry", http.StatusBadRequest, err)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]string{"status": "voided"})
}

// --- Trial Balance ---

func (h *Handler) HandleTrialBalance(w http.ResponseWriter, r *http.Request) {
	asOfStr := r.URL.Query().Get("as_of")
	asOf := time.Now()
	if asOfStr != "" {
		parsed, err := time.Parse("2006-01-02", asOfStr)
		if err != nil {
			httputil.RespondError(w, r, "invalid as_of date (expected YYYY-MM-DD)", http.StatusBadRequest, err)
			return
		}
		asOf = parsed
	}

	rows, err := h.svc.GetTrialBalance(r.Context(), asOf)
	if err != nil {
		httputil.RespondError(w, r, "failed to get trial balance", http.StatusInternalServerError, err)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(rows)
}

// --- Fiscal Periods ---

func (h *Handler) HandleListFiscalPeriods(w http.ResponseWriter, r *http.Request) {
	periods, err := h.svc.ListFiscalPeriods(r.Context())
	if err != nil {
		httputil.RespondError(w, r, "failed to list fiscal periods", http.StatusInternalServerError, err)
		return
	}
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(periods)
}

func (h *Handler) HandleCloseFiscalPeriod(w http.ResponseWriter, r *http.Request) {
	idStr := r.PathValue("id")
	id, err := uuid.Parse(idStr)
	if err != nil {
		httputil.RespondError(w, r, "invalid fiscal period ID", http.StatusBadRequest, err)
		return
	}

	if err := h.svc.CloseFiscalPeriod(r.Context(), id); err != nil {
		httputil.RespondError(w, r, "failed to close fiscal period", http.StatusBadRequest, err)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]string{"status": "closed"})
}
