package deposit

import (
	"context"
	"log/slog"
	"testing"

	"github.com/google/uuid"
)

// These cover the guard logic that runs BEFORE the DB transaction (the
// money-moving paths are verified live against the real ledger). A service
// with nil deps is safe here because every asserted case returns before any
// repository, GL, or db.RunInTx call.
func newGuardService() *Service {
	return NewService(nil, nil, nil, nil, slog.Default())
}

func TestRecordDeposit_RejectsMissingCustomer(t *testing.T) {
	_, err := newGuardService().RecordDeposit(context.Background(), RecordDepositRequest{Amount: 5000})
	if err == nil {
		t.Fatal("expected error when customer_id is missing")
	}
}

func TestRecordDeposit_RejectsNonPositiveAmount(t *testing.T) {
	req := RecordDepositRequest{CustomerID: uuid.New(), Amount: 0}
	if _, err := newGuardService().RecordDeposit(context.Background(), req); err == nil {
		t.Fatal("expected error when amount is zero")
	}
	req.Amount = -100
	if _, err := newGuardService().RecordDeposit(context.Background(), req); err == nil {
		t.Fatal("expected error when amount is negative")
	}
}

func TestApplyDeposit_RejectsNonPositiveAmount(t *testing.T) {
	_, err := newGuardService().ApplyDeposit(context.Background(), uuid.New(), ApplyDepositRequest{Amount: 0})
	if err == nil {
		t.Fatal("expected error when apply amount is zero")
	}
}
