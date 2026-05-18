package ap

import (
	"context"
	"log/slog"
	"testing"
	"time"

	"github.com/gablelbm/gable/internal/gl"
	"github.com/google/uuid"
)

// --- Mock Repositories ---

type MockAPRepository struct {
	invoices     map[uuid.UUID]*VendorInvoice
	payments     map[uuid.UUID]*APPayment
	invoiceLines map[uuid.UUID][]VendorInvoiceLine
}

func (m *MockAPRepository) CreateVendorInvoice(ctx context.Context, inv *VendorInvoice) error {
	m.invoices[inv.ID] = inv
	return nil
}
func (m *MockAPRepository) GetVendorInvoice(ctx context.Context, id uuid.UUID) (*VendorInvoice, error) {
	return m.invoices[id], nil
}
func (m *MockAPRepository) ListVendorInvoices(ctx context.Context, vID *uuid.UUID, status string) ([]VendorInvoice, error) {
	var res []VendorInvoice
	for _, inv := range m.invoices {
		res = append(res, *inv)
	}
	return res, nil
}
func (m *MockAPRepository) UpdateVendorInvoice(ctx context.Context, inv *VendorInvoice) error {
	m.invoices[inv.ID] = inv
	return nil
}
func (m *MockAPRepository) AddInvoiceLine(ctx context.Context, line *VendorInvoiceLine) error {
	m.invoiceLines[line.InvoiceID] = append(m.invoiceLines[line.InvoiceID], *line)
	return nil
}
func (m *MockAPRepository) GetInvoiceLines(ctx context.Context, invoiceID uuid.UUID) ([]VendorInvoiceLine, error) {
	return m.invoiceLines[invoiceID], nil
}
func (m *MockAPRepository) CreatePayment(ctx context.Context, pmt *APPayment) error {
	m.payments[pmt.ID] = pmt
	return nil
}
func (m *MockAPRepository) CreatePaymentApplication(ctx context.Context, app *APPaymentApplication) error {
	return nil
}
func (m *MockAPRepository) ListPayments(ctx context.Context, vID *uuid.UUID) ([]APPayment, error) {
	return nil, nil
}
func (m *MockAPRepository) GetAgingSummary(ctx context.Context) ([]APAgingSummary, error) {
	return nil, nil
}

type MockGLRepository struct {
	entries []gl.JournalEntry
}

func (m *MockGLRepository) CreateJournalEntry(ctx context.Context, entry *gl.JournalEntry) error {
	m.entries = append(m.entries, *entry)
	return nil
}
func (m *MockGLRepository) GetJournalEntry(ctx context.Context, id uuid.UUID) (*gl.JournalEntry, error) {
	return nil, nil
}
func (m *MockGLRepository) ListJournalEntries(ctx context.Context) ([]gl.JournalEntry, error) {
	return nil, nil
}
func (m *MockGLRepository) UpdateJournalEntryStatus(ctx context.Context, id uuid.UUID, status, user string) error {
	return nil
}
func (m *MockGLRepository) ListAccounts(ctx context.Context) ([]gl.GLAccount, error) {
	return []gl.GLAccount{
		{ID: uuid.New(), Name: "Accounts Payable", Code: "2010"},
		{ID: uuid.New(), Name: "Cash", Code: "1010"},
	}, nil
}
func (m *MockGLRepository) GetAccount(ctx context.Context, id uuid.UUID) (*gl.GLAccount, error) {
	return nil, nil
}
func (m *MockGLRepository) CreateAccount(ctx context.Context, acct *gl.GLAccount) error { return nil }
func (m *MockGLRepository) UpdateAccount(ctx context.Context, acct *gl.GLAccount) error { return nil }
func (m *MockGLRepository) GetTrialBalance(ctx context.Context, asOf time.Time) ([]gl.TrialBalanceRow, error) {
	return nil, nil
}
func (m *MockGLRepository) ListFiscalPeriods(ctx context.Context) ([]gl.FiscalPeriod, error) {
	return nil, nil
}
func (m *MockGLRepository) GetFiscalPeriodForDate(ctx context.Context, date time.Time) (*gl.FiscalPeriod, error) {
	return nil, nil
}
func (m *MockGLRepository) CloseFiscalPeriod(ctx context.Context, id uuid.UUID, user string) error {
	return nil
}

type MockDatabase struct{}

func (m *MockDatabase) RunInTx(ctx context.Context, fn func(ctx context.Context) error) error {
	return fn(ctx)
}

func TestGLIntegration_ApproveInvoice(t *testing.T) {
	apRepo := &MockAPRepository{
		invoices:     make(map[uuid.UUID]*VendorInvoice),
		invoiceLines: make(map[uuid.UUID][]VendorInvoiceLine),
	}
	glRepo := &MockGLRepository{}
	glSvc := gl.NewService(glRepo, nil, nil)
	apSvc := NewService(&MockDatabase{}, apRepo, nil, slog.Default())
	apSvc.glSvc = glSvc // Wire it up

	invID := uuid.New()
	expenseAcctID := uuid.New()
	inv := &VendorInvoice{
		ID:     invID,
		Total:  10000, // $100
		Status: InvoiceStatusPending,
		Lines: []VendorInvoiceLine{
			{ID: uuid.New(), Description: "Lumber", LineTotal: 10000, GLAccountID: &expenseAcctID},
		},
	}
	apRepo.invoices[invID] = inv
	apRepo.invoiceLines[invID] = inv.Lines

	_, err := apSvc.ApproveInvoice(context.Background(), invID, uuid.New())
	if err != nil {
		t.Fatalf("ApproveInvoice failed: %v", err)
	}

	if len(glRepo.entries) != 1 {
		t.Fatalf("expected 1 GL entry, got %d", len(glRepo.entries))
	}

	entry := glRepo.entries[0]
	if entry.Source != gl.SourceVendorInv {
		t.Errorf("expected source %s, got %s", gl.SourceVendorInv, entry.Source)
	}

	// Check lines (1 AP credit, 1 Expense debit)
	if len(entry.Lines) != 2 {
		t.Fatalf("expected 2 GL lines, got %d", len(entry.Lines))
	}
}

func TestGLIntegration_PayVendor(t *testing.T) {
	apRepo := &MockAPRepository{
		invoices: make(map[uuid.UUID]*VendorInvoice),
		payments: make(map[uuid.UUID]*APPayment),
	}
	glRepo := &MockGLRepository{}
	glSvc := gl.NewService(glRepo, nil, nil)
	apSvc := NewService(&MockDatabase{}, apRepo, nil, slog.Default())
	apSvc.glSvc = glSvc

	invID := uuid.New()
	inv := &VendorInvoice{ID: invID, Total: 5000, AmountPaid: 0}
	apRepo.invoices[invID] = inv

	req := CreateAPPaymentRequest{
		VendorID:    uuid.New(),
		Amount:      50.0,
		Method:      PaymentMethodCheck,
		PaymentDate: "2026-03-03",
		InvoiceIDs:  []uuid.UUID{invID},
	}

	_, err := apSvc.PayVendor(context.Background(), req)
	if err != nil {
		t.Fatalf("PayVendor failed: %v", err)
	}

	if len(glRepo.entries) != 1 {
		t.Fatalf("expected 1 GL entry, got %d", len(glRepo.entries))
	}

	entry := glRepo.entries[0]
	if entry.Source != gl.SourceVendorPmt {
		t.Errorf("expected source %s, got %s", gl.SourceVendorPmt, entry.Source)
	}
}
