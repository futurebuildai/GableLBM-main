package bankrecon

import (
	"bufio"
	"context"
	"fmt"
	"log/slog"
	"math"
	"strconv"
	"strings"
	"time"

	"github.com/gablelbm/gable/internal/gl"
	"github.com/gablelbm/gable/pkg/database"
	"github.com/gablelbm/gable/pkg/middleware"
	"github.com/google/uuid"
)

// Service handles bank reconciliation business logic.
type Service struct {
	db     *database.DB
	repo   Repository
	glSvc  *gl.Service
	logger *slog.Logger
}

// NewService creates a new bank reconciliation service.
func NewService(db *database.DB, repo Repository, glSvc *gl.Service, logger *slog.Logger) *Service {
	return &Service{
		db:     db,
		repo:   repo,
		glSvc:  glSvc,
		logger: logger,
	}
}

// --- Bank Accounts ---

// CreateBankAccount sets up a bank account linked to a GL cash account.
func (s *Service) CreateBankAccount(ctx context.Context, req CreateBankAccountRequest) (*BankAccount, error) {
	acct := &BankAccount{
		Name:          req.Name,
		AccountNumber: req.AccountNumber,
		RoutingNumber: req.RoutingNumber,
		GLAccountID:   req.GLAccountID,
		IsActive:      true,
	}

	if err := s.repo.CreateBankAccount(ctx, acct); err != nil {
		return nil, err
	}

	s.logger.Info("Bank account created", "id", acct.ID, "name", acct.Name)
	return acct, nil
}

// ListBankAccounts returns all configured bank accounts.
func (s *Service) ListBankAccounts(ctx context.Context) ([]BankAccount, error) {
	return s.repo.ListBankAccounts(ctx)
}

// --- CSV Import ---

// ImportCSV parses a CSV bank statement and creates transactions.
// Expected CSV format: Date,Amount,Description,Reference (header row required)
func (s *Service) ImportCSV(ctx context.Context, req ImportCSVRequest) (*ImportResult, error) {
	result := &ImportResult{}

	scanner := bufio.NewScanner(strings.NewReader(req.CSVContent))

	// Skip header row
	if scanner.Scan() {
		// Header consumed
	}

	for scanner.Scan() {
		line := strings.TrimSpace(scanner.Text())
		if line == "" {
			continue
		}
		result.TotalRows++

		fields := parseCSVLine(line)
		if len(fields) < 3 {
			result.SkippedRows++
			continue
		}

		// Parse date
		txnDate, err := parseDate(fields[0])
		if err != nil {
			result.SkippedRows++
			continue
		}

		// Parse amount (dollars → cents)
		amountStr := strings.ReplaceAll(fields[1], "$", "")
		amountStr = strings.ReplaceAll(amountStr, ",", "")
		amountStr = strings.TrimSpace(amountStr)
		amountFloat, err := strconv.ParseFloat(amountStr, 64)
		if err != nil {
			result.SkippedRows++
			continue
		}
		amountCents := int64(amountFloat*100.0 + 0.5)
		if amountFloat < 0 {
			amountCents = int64(amountFloat*100.0 - 0.5)
		}

		description := ""
		if len(fields) > 2 {
			description = strings.TrimSpace(fields[2])
		}
		reference := ""
		if len(fields) > 3 {
			reference = strings.TrimSpace(fields[3])
		}

		txn := &BankTransaction{
			BankAccountID:    req.BankAccountID,
			ReconciliationID: req.ReconciliationID,
			TransactionDate:  txnDate,
			Amount:           amountCents,
			Description:      description,
			Reference:        reference,
			Status:           TransactionStatusUnmatched,
		}

		if err := s.repo.CreateBankTransaction(ctx, txn); err != nil {
			result.SkippedRows++
			continue
		}
		result.ImportedRows++
	}

	// Run auto-matching on imported transactions
	autoMatched, err := s.autoMatch(ctx, req.BankAccountID, req.ReconciliationID)
	if err != nil {
		s.logger.Warn("Auto-match had errors", "error", err)
	}
	result.AutoMatched = autoMatched

	s.logger.Info("CSV import complete",
		"total", result.TotalRows,
		"imported", result.ImportedRows,
		"skipped", result.SkippedRows,
		"auto_matched", result.AutoMatched,
	)

	return result, nil
}

// --- Auto-Matching ---

// autoMatch tries to match unmatched bank transactions to GL journal entries.
// Matches by amount (exact) and date (±1 day window).
func (s *Service) autoMatch(ctx context.Context, bankAccountID uuid.UUID, reconID *uuid.UUID) (int, error) {
	txns, err := s.repo.ListTransactions(ctx, bankAccountID, reconID)
	if err != nil {
		return 0, err
	}

	// Get GL journal entries for matching
	entries, err := s.glSvc.ListJournalEntries(ctx)
	if err != nil {
		return 0, fmt.Errorf("failed to list journal entries: %w", err)
	}

	matched := 0
	for i := range txns {
		if txns[i].Status != TransactionStatusUnmatched {
			continue
		}

		best := s.findBestMatch(txns[i], entries)
		if best != nil {
			txns[i].MatchedJournalEntryID = &best.ID
			txns[i].Status = TransactionStatusMatched
			if err := s.repo.UpdateBankTransaction(ctx, &txns[i]); err != nil {
				continue
			}
			matched++
		}
	}
	return matched, nil
}

// findBestMatch finds the best GL journal entry match for a bank transaction.
func (s *Service) findBestMatch(txn BankTransaction, entries []gl.JournalEntry) *gl.JournalEntry {
	txnAmount := txn.Amount // cents
	if txnAmount < 0 {
		txnAmount = -txnAmount
	}

	for i := range entries {
		entry := &entries[i]
		if entry.Status != gl.StatusPosted {
			continue
		}

		// Check date within ±1 day
		dayDiff := math.Abs(entry.EntryDate.Sub(txn.TransactionDate).Hours() / 24)
		if dayDiff > 1.5 {
			continue
		}

		// Check amount match (compare absolute values)
		entryAmount := entry.TotalDebit // Use debit total for comparison
		if entryAmount < 0 {
			entryAmount = -entryAmount
		}
		if txnAmount < 0 {
			txnAmount = -txnAmount
		}

		if entryAmount == txnAmount {
			return entry
		}
	}
	return nil
}

// --- Manual Match/Unmatch ---

// ManualMatch links a bank transaction to a specific GL journal entry.
func (s *Service) ManualMatch(ctx context.Context, req ManualMatchRequest) error {
	txn, err := s.repo.GetBankTransaction(ctx, req.BankTransactionID)
	if err != nil {
		return err
	}

	txn.MatchedJournalEntryID = &req.JournalEntryID
	txn.Status = TransactionStatusMatched

	if err := s.repo.UpdateBankTransaction(ctx, txn); err != nil {
		return err
	}

	s.logger.Info("Manual match created",
		"bank_txn_id", req.BankTransactionID,
		"journal_entry_id", req.JournalEntryID,
	)
	return nil
}

// ManualUnmatch removes the match link from a bank transaction.
func (s *Service) ManualUnmatch(ctx context.Context, bankTxnID uuid.UUID) error {
	txn, err := s.repo.GetBankTransaction(ctx, bankTxnID)
	if err != nil {
		return err
	}

	txn.MatchedJournalEntryID = nil
	txn.Status = TransactionStatusUnmatched

	if err := s.repo.UpdateBankTransaction(ctx, txn); err != nil {
		return err
	}

	s.logger.Info("Manual unmatch", "bank_txn_id", bankTxnID)
	return nil
}

// --- Reconciliation Sessions ---

// CreateSession starts a new reconciliation session.
func (s *Service) CreateSession(ctx context.Context, req CreateSessionRequest) (*ReconciliationSession, error) {
	periodStart, err := time.Parse("2006-01-02", req.PeriodStart)
	if err != nil {
		return nil, fmt.Errorf("invalid period_start: %w", err)
	}
	periodEnd, err := time.Parse("2006-01-02", req.PeriodEnd)
	if err != nil {
		return nil, fmt.Errorf("invalid period_end: %w", err)
	}

	stmtBalanceCents := int64(req.StatementBalance*100.0 + 0.5)

	session := &ReconciliationSession{
		BankAccountID:    req.BankAccountID,
		PeriodStart:      periodStart,
		PeriodEnd:        periodEnd,
		StatementBalance: stmtBalanceCents,
		Status:           SessionStatusInProgress,
	}

	if err := s.repo.CreateSession(ctx, session); err != nil {
		return nil, err
	}

	s.logger.Info("Reconciliation session created", "id", session.ID)
	return session, nil
}

// GetSession returns a reconciliation session with its transactions.
func (s *Service) GetSession(ctx context.Context, id uuid.UUID) (*ReconciliationSession, error) {
	session, err := s.repo.GetSession(ctx, id)
	if err != nil {
		return nil, err
	}

	// Load transactions for this session
	txns, err := s.repo.ListTransactions(ctx, session.BankAccountID, &id)
	if err != nil {
		return nil, err
	}
	session.Transactions = txns

	// Recalculate summary
	s.recalculateSummary(session)

	return session, nil
}

// CompleteSession finalizes a reconciliation session.
func (s *Service) CompleteSession(ctx context.Context, sessionID uuid.UUID) (*ReconciliationSession, error) {
	session, err := s.repo.GetSession(ctx, sessionID)
	if err != nil {
		return nil, err
	}

	if session.Status == SessionStatusCompleted {
		return nil, fmt.Errorf("session already completed")
	}

	now := time.Now()
	session.Status = SessionStatusCompleted
	session.CompletedAt = &now

	// Extract user ID from auth context
	if claims := middleware.ClaimsFromContext(ctx); claims != nil {
		if parsed, err := uuid.Parse(claims.Subject); err == nil {
			session.CompletedBy = &parsed
		}
	}

	if err := s.repo.UpdateSession(ctx, session); err != nil {
		return nil, err
	}

	s.logger.Info("Reconciliation session completed", "id", sessionID)
	return session, nil
}

// ListSessions returns reconciliation sessions, optionally filtered by bank account.
func (s *Service) ListSessions(ctx context.Context, bankAccountID *uuid.UUID) ([]ReconciliationSession, error) {
	return s.repo.ListSessions(ctx, bankAccountID)
}

// --- Helpers ---

// recalculateSummary updates the cleared/outstanding counts and totals.
func (s *Service) recalculateSummary(session *ReconciliationSession) {
	var clearedCount, outCount int
	var clearedTotal, outTotal int64

	for _, txn := range session.Transactions {
		if txn.Status == TransactionStatusMatched {
			clearedCount++
			clearedTotal += txn.Amount
		} else if txn.Status == TransactionStatusUnmatched {
			outCount++
			outTotal += txn.Amount
		}
	}

	session.ClearedCount = clearedCount
	session.ClearedTotal = clearedTotal
	session.OutstandingCount = outCount
	session.OutstandingTotal = outTotal
	session.Difference = session.StatementBalance - session.GLBalance - outTotal
}

// parseCSVLine splits a CSV line handling quoted fields.
func parseCSVLine(line string) []string {
	var fields []string
	var current strings.Builder
	inQuotes := false

	for _, ch := range line {
		switch {
		case ch == '"':
			inQuotes = !inQuotes
		case ch == ',' && !inQuotes:
			fields = append(fields, current.String())
			current.Reset()
		default:
			current.WriteRune(ch)
		}
	}
	fields = append(fields, current.String())
	return fields
}

// parseDate tries multiple date formats.
func parseDate(s string) (time.Time, error) {
	s = strings.TrimSpace(s)
	formats := []string{
		"2006-01-02",
		"01/02/2006",
		"1/2/2006",
		"01-02-2006",
		"Jan 2, 2006",
	}
	for _, fmt := range formats {
		if t, err := time.Parse(fmt, s); err == nil {
			return t, nil
		}
	}
	return time.Time{}, fmt.Errorf("unable to parse date: %s", s)
}
