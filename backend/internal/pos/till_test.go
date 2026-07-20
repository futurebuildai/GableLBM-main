package pos

import "testing"

func TestExpectedFromTenders_CashMath(t *testing.T) {
	// $200 float, $412.35 cash tendered, $12.35 change given back,
	// $500 card, $150 check.
	expected := expectedFromTenders(20000, map[string]int64{
		"CASH":  41235,
		"CARD":  50000,
		"CHECK": 15000,
	}, 1235)

	if expected["CASH"] != 20000+41235-1235 {
		t.Fatalf("cash expectation wrong: got %d", expected["CASH"])
	}
	if expected["CARD"] != 50000 || expected["CHECK"] != 15000 {
		t.Fatalf("non-cash methods must pass through: %v", expected)
	}
}

func TestExpectedFromTenders_NoSales(t *testing.T) {
	expected := expectedFromTenders(15000, map[string]int64{}, 0)
	if expected["CASH"] != 15000 {
		t.Fatalf("empty session should expect the float, got %d", expected["CASH"])
	}
}

func TestOverShortTotal(t *testing.T) {
	expected := map[string]int64{"CASH": 60000, "CARD": 50000}
	// Cashier counts the drawer $5 short; cards aren't counted.
	counted := map[string]int64{"CASH": 59500}
	if got := overShortTotal(expected, counted); got != -500 {
		t.Fatalf("want -500 (short $5), got %d", got)
	}
	// Overage on cash and an exact card count.
	counted = map[string]int64{"CASH": 60250, "CARD": 50000}
	if got := overShortTotal(expected, counted); got != 250 {
		t.Fatalf("want +250, got %d", got)
	}
}
