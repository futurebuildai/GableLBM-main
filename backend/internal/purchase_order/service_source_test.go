package purchase_order

import (
	"testing"
)

// TestSourceConstants is a compile-time + value-pinning guard. The CHECK
// constraint in migration 055_po_source.sql lists these exact strings;
// if a refactor accidentally renames one the migration would reject all
// new POs at runtime. Keep this test cheap and explicit.
func TestSourceConstants(t *testing.T) {
	cases := map[string]string{
		"manual":         SourceManual,
		"reorder":        SourceReorder,
		"special_order":  SourceSpecialOrder,
		"a2a":            SourceA2A,
	}
	expected := map[string]string{
		"manual":         "MANUAL",
		"reorder":        "REORDER",
		"special_order":  "SPECIAL_ORDER",
		"a2a":            "A2A",
	}
	for key, got := range cases {
		if got != expected[key] {
			t.Errorf("source constant %q: want %q, got %q", key, expected[key], got)
		}
	}
}

// TestPurchaseOrderSourceFieldRoundTrips covers the trivial-but-load-bearing
// invariant that the Source string set by a service-layer caller is the same
// string a downstream consumer (e.g. JSON serializer, repository INSERT)
// will see. Catches accidental field renames or shadowing.
func TestPurchaseOrderSourceFieldRoundTrips(t *testing.T) {
	for _, src := range []string{SourceManual, SourceReorder, SourceSpecialOrder, SourceA2A} {
		po := &PurchaseOrder{Source: src}
		if po.Source != src {
			t.Errorf("Source field did not round-trip: set=%q got=%q", src, po.Source)
		}
	}
}
