package gl

import (
	"context"
	"testing"
	"time"

	"github.com/google/uuid"
)

// --- Mock Repository ---

type MockRepository struct {
	accounts         []GLAccount
	entries          []JournalEntry
	periods          []FiscalPeriod
	trialBalance     []TrialBalanceRow
	lastCreatedEntry *JournalEntry
}

func (m *MockRepository) ListAccounts(ctx context.Context) ([]GLAccount, error) {
	return m.accounts, nil
}

func (m *MockRepository) GetAccount(ctx context.Context, id uuid.UUID) (*GLAccount, error) {
	for _, a := range m.accounts {
		if a.ID == id {
			return &a, nil
		}
	}
	return nil, nil
}

func (m *MockRepository) CreateAccount(ctx context.Context, acct *GLAccount) error {
	if acct.ID == uuid.Nil {
		acct.ID = uuid.New()
	}
	m.accounts = append(m.accounts, *acct)
	return nil
}

func (m *MockRepository) UpdateAccount(ctx context.Context, acct *GLAccount) error {
	return nil
}

func (m *MockRepository) CreateJournalEntry(ctx context.Context, entry *JournalEntry) error {
	if entry.ID == uuid.Nil {
		entry.ID = uuid.New()
	}
	entry.EntryNumber = len(m.entries) + 1
	m.entries = append(m.entries, *entry)
	m.lastCreatedEntry = entry
	return nil
}

func (m *MockRepository) GetJournalEntry(ctx context.Context, id uuid.UUID) (*JournalEntry, error) {
	for _, e := range m.entries {
		if e.ID == id {
			return &e, nil
		}
	}
	return nil, nil
}

func (m *MockRepository) ListJournalEntries(ctx context.Context) ([]JournalEntry, error) {
	return m.entries, nil
}

func (m *MockRepository) UpdateJournalEntryStatus(ctx context.Context, id uuid.UUID, status string, postedBy string) error {
	for i := range m.entries {
		if m.entries[i].ID == id {
			m.entries[i].Status = status
			m.entries[i].PostedBy = postedBy
			return nil
		}
	}
	return nil
}

func (m *MockRepository) GetTrialBalance(ctx context.Context, asOfDate time.Time) ([]TrialBalanceRow, error) {
	return m.trialBalance, nil
}

func (m *MockRepository) ListFiscalPeriods(ctx context.Context) ([]FiscalPeriod, error) {
	return m.periods, nil
}

func (m *MockRepository) GetFiscalPeriodForDate(ctx context.Context, date time.Time) (*FiscalPeriod, error) {
	for _, p := range m.periods {
		if !date.Before(p.StartDate) && !date.After(p.EndDate) {
			return &p, nil
		}
	}
	return nil, nil
}

func (m *MockRepository) CloseFiscalPeriod(ctx context.Context, id uuid.UUID, closedBy string) error {
	for i := range m.periods {
		if m.periods[i].ID == id {
			m.periods[i].Status = PeriodClosed
			return nil
		}
	}
	return nil
}

// --- Tests ---

func newTestService() (*Service, *MockRepository) {
	arID := uuid.New()
	revenueID := uuid.New()
	cashID := uuid.New()

	repo := &MockRepository{
		accounts: []GLAccount{
			{ID: cashID, Code: "1010", Name: "Cash", Type: AccountTypeAsset, NormalBalance: NormalDebit},
			{ID: arID, Code: "1020", Name: "Accounts Receivable", Type: AccountTypeAsset, NormalBalance: NormalDebit},
			{ID: revenueID, Code: "4010", Name: "Sales Revenue", Type: AccountTypeRevenue, NormalBalance: NormalCredit},
		},
		periods: []FiscalPeriod{
			{ID: uuid.New(), Name: "Jan 2026", StartDate: time.Date(2026, 1, 1, 0, 0, 0, 0, time.UTC), EndDate: time.Date(2026, 1, 31, 0, 0, 0, 0, time.UTC), Status: PeriodOpen},
			{ID: uuid.New(), Name: "Dec 2025", StartDate: time.Date(2025, 12, 1, 0, 0, 0, 0, time.UTC), EndDate: time.Date(2025, 12, 31, 0, 0, 0, 0, time.UTC), Status: PeriodClosed},
		},
	}

	svc := NewService(repo, nil, nil)
	return svc, repo
}

func TestCreateJournalEntry_Balanced(t *testing.T) {
	svc, repo := newTestService()
	arID := repo.accounts[1].ID
	revenueID := repo.accounts[2].ID

	entry := &JournalEntry{
		EntryDate: time.Now(),
		Memo:      "Test sale",
		Lines: []JournalLine{
			{AccountID: arID, Debit: 10000, Credit: 0},      // $100.00 DR
			{AccountID: revenueID, Debit: 0, Credit: 10000}, // $100.00 CR
		},
	}

	err := svc.CreateJournalEntry(context.Background(), entry)
	if err != nil {
		t.Fatalf("expected no error, got: %v", err)
	}
	if len(repo.entries) != 1 {
		t.Errorf("expected 1 entry, got %d", len(repo.entries))
	}
	if entry.Status != StatusDraft {
		t.Errorf("expected DRAFT status, got %s", entry.Status)
	}
}

func TestCreateJournalEntry_Unbalanced(t *testing.T) {
	svc, repo := newTestService()
	arID := repo.accounts[1].ID
	revenueID := repo.accounts[2].ID

	entry := &JournalEntry{
		EntryDate: time.Now(),
		Memo:      "Unbalanced entry",
		Lines: []JournalLine{
			{AccountID: arID, Debit: 10000, Credit: 0},     // $100.00 DR
			{AccountID: revenueID, Debit: 0, Credit: 5000}, // $50.00 CR — UNBALANCED!
		},
	}

	err := svc.CreateJournalEntry(context.Background(), entry)
	if err == nil {
		t.Fatal("expected error for unbalanced entry, got nil")
	}
}

func TestCreateJournalEntry_TooFewLines(t *testing.T) {
	svc, repo := newTestService()
	arID := repo.accounts[1].ID

	entry := &JournalEntry{
		EntryDate: time.Now(),
		Memo:      "Single line entry",
		Lines: []JournalLine{
			{AccountID: arID, Debit: 10000, Credit: 0},
		},
	}

	err := svc.CreateJournalEntry(context.Background(), entry)
	if err == nil {
		t.Fatal("expected error for single-line entry, got nil")
	}
}

func TestPostJournalEntry_Success(t *testing.T) {
	svc, repo := newTestService()
	arID := repo.accounts[1].ID
	revenueID := repo.accounts[2].ID

	entry := &JournalEntry{
		EntryDate: time.Date(2026, 1, 15, 0, 0, 0, 0, time.UTC), // In open period
		Memo:      "Postable entry",
		Lines: []JournalLine{
			{AccountID: arID, Debit: 5000, Credit: 0},
			{AccountID: revenueID, Debit: 0, Credit: 5000},
		},
	}

	if err := svc.CreateJournalEntry(context.Background(), entry); err != nil {
		t.Fatalf("create failed: %v", err)
	}

	if err := svc.PostJournalEntry(context.Background(), entry.ID); err != nil {
		t.Fatalf("post failed: %v", err)
	}

	// Verify status changed
	posted := repo.entries[0]
	if posted.Status != StatusPosted {
		t.Errorf("expected POSTED, got %s", posted.Status)
	}
}

func TestPostJournalEntry_ClosedPeriod(t *testing.T) {
	svc, repo := newTestService()
	arID := repo.accounts[1].ID
	revenueID := repo.accounts[2].ID

	entry := &JournalEntry{
		EntryDate: time.Date(2025, 12, 15, 0, 0, 0, 0, time.UTC), // In CLOSED period
		Memo:      "Should fail",
		Lines: []JournalLine{
			{AccountID: arID, Debit: 5000, Credit: 0},
			{AccountID: revenueID, Debit: 0, Credit: 5000},
		},
	}

	if err := svc.CreateJournalEntry(context.Background(), entry); err != nil {
		t.Fatalf("create failed: %v", err)
	}

	err := svc.PostJournalEntry(context.Background(), entry.ID)
	if err == nil {
		t.Fatal("expected error when posting to closed period, got nil")
	}
}

func TestSyncInvoice_CreatesEntry(t *testing.T) {
	svc, repo := newTestService()

	invoiceID := uuid.New().String()
	err := svc.SyncInvoice(context.Background(), invoiceID, 25000) // $250.00
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	if len(repo.entries) != 1 {
		t.Fatalf("expected 1 entry, got %d", len(repo.entries))
	}
	entry := repo.entries[0]
	if entry.Source != SourceInvoice {
		t.Errorf("expected INVOICE source, got %s", entry.Source)
	}
	if len(entry.Lines) != 2 {
		t.Errorf("expected 2 lines, got %d", len(entry.Lines))
	}
}

func TestCreateAccount_ValidatesType(t *testing.T) {
	svc, _ := newTestService()

	acct := &GLAccount{
		Code: "9999",
		Name: "Bad Account",
		Type: "INVALID",
	}

	err := svc.CreateAccount(context.Background(), acct)
	if err == nil {
		t.Fatal("expected error for invalid account type, got nil")
	}
}

func TestVoidJournalEntry(t *testing.T) {
	svc, repo := newTestService()
	arID := repo.accounts[1].ID
	revenueID := repo.accounts[2].ID

	entry := &JournalEntry{
		EntryDate: time.Date(2026, 1, 15, 0, 0, 0, 0, time.UTC),
		Memo:      "To be voided",
		Lines: []JournalLine{
			{AccountID: arID, Debit: 5000, Credit: 0},
			{AccountID: revenueID, Debit: 0, Credit: 5000},
		},
	}

	svc.CreateJournalEntry(context.Background(), entry)
	svc.PostJournalEntry(context.Background(), entry.ID)

	if err := svc.VoidJournalEntry(context.Background(), entry.ID); err != nil {
		t.Fatalf("void failed: %v", err)
	}

	voided := repo.entries[0]
	if voided.Status != StatusVoid {
		t.Errorf("expected VOID, got %s", voided.Status)
	}
}
