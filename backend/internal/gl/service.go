package gl

import (
	"context"
	"fmt"
	"time"

	"log/slog"

	"github.com/gablelbm/gable/internal/domain"
	integration "github.com/gablelbm/gable/internal/integrations/gl"
	"github.com/google/uuid"
)

// Service provides General Ledger business logic.
type Service struct {
	repo    Repository
	adapter integration.GLAdapter
	logger  *slog.Logger
}

// NewService creates a new GL Service. The adapter is optional (nil if no external GL sync).
func NewService(repo Repository, adapter integration.GLAdapter, logger *slog.Logger) *Service {
	return &Service{repo: repo, adapter: adapter, logger: logger}
}

// --- Account Operations ---

func (s *Service) ListAccounts(ctx context.Context) ([]GLAccount, error) {
	return s.repo.ListAccounts(ctx)
}

func (s *Service) GetAccount(ctx context.Context, id uuid.UUID) (*GLAccount, error) {
	return s.repo.GetAccount(ctx, id)
}

func (s *Service) CreateAccount(ctx context.Context, acct *GLAccount) error {
	if acct.Code == "" {
		return fmt.Errorf("account code is required")
	}
	if acct.Name == "" {
		return fmt.Errorf("account name is required")
	}
	if !isValidAccountType(acct.Type) {
		return fmt.Errorf("invalid account type: %s", acct.Type)
	}
	if acct.NormalBalance == "" {
		acct.NormalBalance = defaultNormalBalance(acct.Type)
	}
	acct.IsActive = true
	return s.repo.CreateAccount(ctx, acct)
}

func (s *Service) UpdateAccount(ctx context.Context, acct *GLAccount) error {
	return s.repo.UpdateAccount(ctx, acct)
}

// --- Journal Entry Operations ---

// CreateJournalEntry creates a new journal entry, validating that it balances.
func (s *Service) CreateJournalEntry(ctx context.Context, entry *JournalEntry) error {
	if len(entry.Lines) < 2 {
		return fmt.Errorf("journal entry must have at least 2 lines")
	}

	// Validate balance: total debits == total credits
	var totalDebit, totalCredit int64
	for _, line := range entry.Lines {
		totalDebit += line.Debit
		totalCredit += line.Credit
	}
	if totalDebit != totalCredit {
		return fmt.Errorf("journal entry is not balanced: debits (%d) != credits (%d)", totalDebit, totalCredit)
	}
	if totalDebit == 0 {
		return fmt.Errorf("journal entry cannot have zero amounts")
	}

	if entry.Status == "" {
		entry.Status = StatusDraft
	}
	if entry.Source == "" {
		entry.Source = SourceManual
	}
	if entry.EntryDate.IsZero() {
		entry.EntryDate = time.Now()
	}

	entry.TotalDebit = totalDebit
	entry.TotalCredit = totalCredit

	return s.repo.CreateJournalEntry(ctx, entry)
}

func (s *Service) GetJournalEntry(ctx context.Context, id uuid.UUID) (*JournalEntry, error) {
	return s.repo.GetJournalEntry(ctx, id)
}

func (s *Service) ListJournalEntries(ctx context.Context) ([]JournalEntry, error) {
	return s.repo.ListJournalEntries(ctx)
}

// PostJournalEntry transitions a DRAFT entry to POSTED after validating the fiscal period is open.
func (s *Service) PostJournalEntry(ctx context.Context, id uuid.UUID) error {
	entry, err := s.repo.GetJournalEntry(ctx, id)
	if err != nil {
		return err
	}
	if entry.Status != StatusDraft {
		return fmt.Errorf("can only post entries in DRAFT status (current: %s)", entry.Status)
	}

	// Check fiscal period
	period, err := s.repo.GetFiscalPeriodForDate(ctx, entry.EntryDate)
	if err != nil {
		return fmt.Errorf("failed to check fiscal period: %w", err)
	}
	if period != nil && period.Status == PeriodClosed {
		return fmt.Errorf("cannot post to closed fiscal period: %s", period.Name)
	}

	return s.repo.UpdateJournalEntryStatus(ctx, id, StatusPosted, "system")
}

// VoidJournalEntry marks a POSTED entry as VOID.
func (s *Service) VoidJournalEntry(ctx context.Context, id uuid.UUID) error {
	entry, err := s.repo.GetJournalEntry(ctx, id)
	if err != nil {
		return err
	}
	if entry.Status != StatusPosted {
		return fmt.Errorf("can only void entries in POSTED status (current: %s)", entry.Status)
	}
	return s.repo.UpdateJournalEntryStatus(ctx, id, StatusVoid, "")
}

// --- Trial Balance ---

func (s *Service) GetTrialBalance(ctx context.Context, asOfDate time.Time) ([]TrialBalanceRow, error) {
	if asOfDate.IsZero() {
		asOfDate = time.Now()
	}
	return s.repo.GetTrialBalance(ctx, asOfDate)
}

// --- Fiscal Periods ---

func (s *Service) ListFiscalPeriods(ctx context.Context) ([]FiscalPeriod, error) {
	return s.repo.ListFiscalPeriods(ctx)
}

func (s *Service) CloseFiscalPeriod(ctx context.Context, id uuid.UUID) error {
	return s.repo.CloseFiscalPeriod(ctx, id, "system")
}

// --- Auto-posting from other modules ---

// SyncInvoice creates a journal entry: DR Accounts Receivable / CR Sales Revenue.
// This replaces the old stub that only forwarded to external GL.
func (s *Service) SyncInvoice(ctx context.Context, invoiceID string, amount int64) error {
	sourceRefID, _ := uuid.Parse(invoiceID)
	entry := &JournalEntry{
		EntryDate:   time.Now(),
		Memo:        fmt.Sprintf("Invoice %s", invoiceID),
		Source:      SourceInvoice,
		SourceRefID: &sourceRefID,
		Status:      StatusPosted,
		PostedBy:    "system",
		Lines: []JournalLine{
			{AccountID: uuid.Nil, Description: "Accounts Receivable", Debit: amount, Credit: 0},
			{AccountID: uuid.Nil, Description: "Sales Revenue", Debit: 0, Credit: amount},
		},
	}

	// Resolve account IDs by code
	accounts, err := s.repo.ListAccounts(ctx)
	if err == nil {
		acctMap := make(map[string]uuid.UUID)
		for _, a := range accounts {
			acctMap[a.Name] = a.ID
		}
		for i := range entry.Lines {
			if id, ok := acctMap[entry.Lines[i].Description]; ok {
				entry.Lines[i].AccountID = id
			}
		}
	}

	// Post to internal GL
	if err := s.repo.CreateJournalEntry(ctx, entry); err != nil {
		s.logger.Warn("Failed to post invoice to internal GL", "error", err, "invoice_id", invoiceID)
		// Don't fail the invoice for GL errors
	}

	// Also post to external GL if adapter is configured
	if s.adapter != nil {
		domainEntry := domain.JournalEntry{
			ReferenceID: invoiceID,
			Memo:        fmt.Sprintf("Invoice %s", invoiceID),
			Lines: []domain.JournalEntryLine{
				{AccountName: "Accounts Receivable", Debit: amount, Credit: 0},
				{AccountName: "Sales Revenue", Debit: 0, Credit: amount},
			},
		}
		id, err := s.adapter.PostJournalEntry(ctx, domainEntry)
		if err != nil {
			s.logger.Warn("Failed to sync invoice to external GL", "error", err)
		} else {
			s.logger.Info("Synced Invoice to external GL", "invoice_id", invoiceID, "gl_ref_id", id)
		}
	}

	return nil
}

// SyncPayment creates a journal entry: DR Cash / CR Accounts Receivable.
func (s *Service) SyncPayment(ctx context.Context, paymentID string, amount int64) error {
	sourceRefID, _ := uuid.Parse(paymentID)
	entry := &JournalEntry{
		EntryDate:   time.Now(),
		Memo:        fmt.Sprintf("Payment %s", paymentID),
		Source:      SourcePayment,
		SourceRefID: &sourceRefID,
		Status:      StatusPosted,
		PostedBy:    "system",
		Lines: []JournalLine{
			{AccountID: uuid.Nil, Description: "Cash", Debit: amount, Credit: 0},
			{AccountID: uuid.Nil, Description: "Accounts Receivable", Debit: 0, Credit: amount},
		},
	}

	accounts, err := s.repo.ListAccounts(ctx)
	if err == nil {
		acctMap := make(map[string]uuid.UUID)
		for _, a := range accounts {
			acctMap[a.Name] = a.ID
		}
		for i := range entry.Lines {
			if id, ok := acctMap[entry.Lines[i].Description]; ok {
				entry.Lines[i].AccountID = id
			}
		}
	}

	if err := s.repo.CreateJournalEntry(ctx, entry); err != nil {
		s.logger.Warn("Failed to post payment to internal GL", "error", err, "payment_id", paymentID)
	}

	return nil
}

// SyncVendorInvoice creates a journal entry: DR Expense/Inventory / CR Accounts Payable.
func (s *Service) SyncVendorInvoice(ctx context.Context, invoiceID uuid.UUID, totalCents int64, lineDetails []VendorInvoiceLineDetail) error {
	entry := &JournalEntry{
		EntryDate:   time.Now(),
		Memo:        fmt.Sprintf("Vendor Invoice %s", invoiceID),
		Source:      SourceVendorInv,
		SourceRefID: &invoiceID,
		Status:      StatusPosted,
		PostedBy:    "system",
		Lines: []JournalLine{
			{AccountID: uuid.Nil, Description: "Accounts Payable", Debit: 0, Credit: totalCents},
		},
	}

	for _, line := range lineDetails {
		acctID := uuid.Nil
		if line.GLAccountID != nil {
			acctID = *line.GLAccountID
		}
		entry.Lines = append(entry.Lines, JournalLine{
			AccountID:   acctID,
			Description: line.Description,
			Debit:       line.AmountCents,
			Credit:      0,
		})
	}

	// If line GL IDs were missing, try to resolve AP by name
	if entry.Lines[0].AccountID == uuid.Nil {
		accounts, err := s.repo.ListAccounts(ctx)
		if err == nil {
			for _, a := range accounts {
				if a.Name == "Accounts Payable" {
					entry.Lines[0].AccountID = a.ID
					break
				}
			}
		}
	}

	if err := s.repo.CreateJournalEntry(ctx, entry); err != nil {
		s.logger.Warn("Failed to post vendor invoice to internal GL", "error", err, "invoice_id", invoiceID)
	}

	return nil
}

// SyncVendorPayment creates a journal entry: DR Accounts Payable / CR Cash.
func (s *Service) SyncVendorPayment(ctx context.Context, paymentID uuid.UUID, amount int64) error {
	entry := &JournalEntry{
		EntryDate:   time.Now(),
		Memo:        fmt.Sprintf("Vendor Payment %s", paymentID),
		Source:      SourceVendorPmt,
		SourceRefID: &paymentID,
		Status:      StatusPosted,
		PostedBy:    "system",
		Lines: []JournalLine{
			{AccountID: uuid.Nil, Description: "Accounts Payable", Debit: amount, Credit: 0},
			{AccountID: uuid.Nil, Description: "Cash", Debit: 0, Credit: amount},
		},
	}

	accounts, err := s.repo.ListAccounts(ctx)
	if err == nil {
		acctMap := make(map[string]uuid.UUID)
		for _, a := range accounts {
			acctMap[a.Name] = a.ID
		}
		for i := range entry.Lines {
			if id, ok := acctMap[entry.Lines[i].Description]; ok {
				entry.Lines[i].AccountID = id
			}
		}
	}

	if err := s.repo.CreateJournalEntry(ctx, entry); err != nil {
		s.logger.Warn("Failed to post vendor payment to internal GL", "error", err, "payment_id", paymentID)
	}

	return nil
}

type VendorInvoiceLineDetail struct {
	Description string
	AmountCents int64
	GLAccountID *uuid.UUID
}

// --- Helpers ---

func isValidAccountType(t string) bool {
	switch t {
	case AccountTypeAsset, AccountTypeLiability, AccountTypeEquity, AccountTypeRevenue, AccountTypeExpense:
		return true
	}
	return false
}

func defaultNormalBalance(accountType string) string {
	switch accountType {
	case AccountTypeAsset, AccountTypeExpense:
		return NormalDebit
	default:
		return NormalCredit
	}
}
