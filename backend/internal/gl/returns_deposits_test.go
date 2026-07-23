package gl

import (
	"context"
	"testing"

	"github.com/google/uuid"
)

// acctID returns the seeded account UUID for a code (test helper).
func acctID(repo *MockRepository, code string) uuid.UUID {
	for _, a := range repo.accounts {
		if a.Code == code {
			return a.ID
		}
	}
	return uuid.Nil
}

// assertLeg checks that the entry debits `drCode` and credits `crCode` for
// exactly `amount`, and that the whole entry balances.
func assertLeg(t *testing.T, repo *MockRepository, entry JournalEntry, drCode, crCode string, amount int64) {
	t.Helper()
	var totalDr, totalCr int64
	var drOK, crOK bool
	for _, l := range entry.Lines {
		totalDr += l.Debit
		totalCr += l.Credit
		if l.AccountID == acctID(repo, drCode) && l.Debit == amount && l.Credit == 0 {
			drOK = true
		}
		if l.AccountID == acctID(repo, crCode) && l.Credit == amount && l.Debit == 0 {
			crOK = true
		}
	}
	if totalDr != totalCr {
		t.Errorf("entry not balanced: debits %d != credits %d", totalDr, totalCr)
	}
	if !drOK {
		t.Errorf("expected a %s debit of %d", drCode, amount)
	}
	if !crOK {
		t.Errorf("expected a %s credit of %d", crCode, amount)
	}
}

func TestSyncCashReturn_ReversesCashSale(t *testing.T) {
	svc, repo := newTestService()

	id, err := svc.SyncCashReturn(context.Background(), uuid.New().String(), 7500) // $75.00
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if id == uuid.Nil {
		t.Fatal("expected a non-nil journal entry ID")
	}
	if len(repo.entries) != 1 {
		t.Fatalf("expected 1 entry, got %d", len(repo.entries))
	}
	e := repo.entries[0]
	if e.Source != SourceReturn {
		t.Errorf("expected RETURN source, got %s", e.Source)
	}
	// Mirror of a cash sale: DR Revenue / CR Cash.
	assertLeg(t, repo, e, AccountCodeRevenue, AccountCodeCash, 7500)
}

func TestSyncAccountReturn_CreditsAR(t *testing.T) {
	svc, repo := newTestService()

	id, err := svc.SyncAccountReturn(context.Background(), uuid.New().String(), 4200)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if id == uuid.Nil {
		t.Fatal("expected a non-nil journal entry ID")
	}
	e := repo.entries[0]
	if e.Source != SourceReturn {
		t.Errorf("expected RETURN source, got %s", e.Source)
	}
	// Store credit: DR Revenue / CR AR.
	assertLeg(t, repo, e, AccountCodeRevenue, AccountCodeAR, 4200)
}

func TestSyncCustomerDeposit_BooksLiability(t *testing.T) {
	svc, repo := newTestService()

	depID := uuid.New()
	glID, err := svc.SyncCustomerDeposit(context.Background(), depID, 50000) // $500.00
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if glID == uuid.Nil {
		t.Fatal("expected a non-nil journal entry ID")
	}
	e := repo.entries[0]
	if e.Source != SourceDeposit {
		t.Errorf("expected DEPOSIT source, got %s", e.Source)
	}
	// Take a prepayment: DR Cash / CR Customer Deposits.
	assertLeg(t, repo, e, AccountCodeCash, AccountCodeCustomerDeposit, 50000)
}

func TestApplyCustomerDeposit_RelievesLiabilityAgainstAR(t *testing.T) {
	svc, repo := newTestService()

	depID := uuid.New()
	glID, err := svc.ApplyCustomerDeposit(context.Background(), depID, 30000) // $300.00
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if glID == uuid.Nil {
		t.Fatal("expected a non-nil journal entry ID")
	}
	e := repo.entries[0]
	if e.Source != SourceDeposit {
		t.Errorf("expected DEPOSIT source, got %s", e.Source)
	}
	// Apply against AR: DR Customer Deposits / CR AR.
	assertLeg(t, repo, e, AccountCodeCustomerDeposit, AccountCodeAR, 30000)
}

func TestReturnsDeposits_RejectNonPositiveAmounts(t *testing.T) {
	svc, _ := newTestService()
	ctx := context.Background()
	ref := uuid.New()

	if _, err := svc.SyncCashReturn(ctx, ref.String(), 0); err == nil {
		t.Error("SyncCashReturn should reject a zero amount")
	}
	if _, err := svc.SyncAccountReturn(ctx, ref.String(), -100); err == nil {
		t.Error("SyncAccountReturn should reject a negative amount")
	}
	if _, err := svc.SyncCustomerDeposit(ctx, ref, 0); err == nil {
		t.Error("SyncCustomerDeposit should reject a zero amount")
	}
	if _, err := svc.ApplyCustomerDeposit(ctx, ref, -1); err == nil {
		t.Error("ApplyCustomerDeposit should reject a negative amount")
	}
}
