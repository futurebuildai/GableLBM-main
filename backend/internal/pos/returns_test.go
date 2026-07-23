package pos

import (
	"context"
	"log/slog"
	"testing"

	"github.com/google/uuid"
)

// ReturnSale's guard logic runs before any repository/db call, so a service
// with only a logger set exercises it safely. The restock + GL-reversal money
// path is verified live against the real ledger.
func newGuardPOSService() *Service {
	return &Service{logger: slog.Default()}
}

func validLine() ReturnLineRequest {
	return ReturnLineRequest{ProductID: uuid.New(), Quantity: 1, UnitPrice: 10.0}
}

func TestReturnSale_RejectsMissingRegister(t *testing.T) {
	_, err := newGuardPOSService().ReturnSale(context.Background(), uuid.New(), ReturnRequest{
		Lines: []ReturnLineRequest{validLine()},
	})
	if err == nil {
		t.Fatal("expected error when register_id is empty")
	}
}

func TestReturnSale_RejectsNoLines(t *testing.T) {
	_, err := newGuardPOSService().ReturnSale(context.Background(), uuid.New(), ReturnRequest{
		RegisterID: "REG-01",
	})
	if err == nil {
		t.Fatal("expected error when there are no lines")
	}
}

func TestReturnSale_RejectsInvalidRefundMethod(t *testing.T) {
	_, err := newGuardPOSService().ReturnSale(context.Background(), uuid.New(), ReturnRequest{
		RegisterID:   "REG-01",
		RefundMethod: "BITCOIN",
		Lines:        []ReturnLineRequest{validLine()},
	})
	if err == nil {
		t.Fatal("expected error for an unsupported refund method")
	}
}

func TestReturnSale_AccountRefundRequiresCustomer(t *testing.T) {
	_, err := newGuardPOSService().ReturnSale(context.Background(), uuid.New(), ReturnRequest{
		RegisterID:   "REG-01",
		RefundMethod: "ACCOUNT",
		Lines:        []ReturnLineRequest{validLine()},
	})
	if err == nil {
		t.Fatal("expected error: ACCOUNT refund without a customer")
	}
}

func TestReturnSale_RejectsNonPositiveQuantity(t *testing.T) {
	_, err := newGuardPOSService().ReturnSale(context.Background(), uuid.New(), ReturnRequest{
		RegisterID:   "REG-01",
		RefundMethod: "CASH",
		Lines:        []ReturnLineRequest{{ProductID: uuid.New(), Quantity: 0, UnitPrice: 5.0}},
	})
	if err == nil {
		t.Fatal("expected error for a non-positive return quantity")
	}
}
