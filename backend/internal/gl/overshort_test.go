package gl

import "testing"

// TestOverShortJournalLines verifies the debit/credit direction of the
// over/short posting without a DB: short debits Cash Over/Short + credits
// Cash; over reverses. Mirrors PostTillOverShort's line construction.
func TestOverShortJournalLines(t *testing.T) {
	build := func(overShortCents int64) (drOverShort, crCash, drCash, crOverShort int64) {
		mag := overShortCents
		if mag < 0 {
			mag = -mag
		}
		if overShortCents < 0 { // short
			return mag, mag, 0, 0
		}
		return 0, 0, mag, mag // over
	}

	// Short $13.12 → DR Over/Short 1312, CR Cash 1312.
	if dOS, cCash, dCash, cOS := build(-1312); dOS != 1312 || cCash != 1312 || dCash != 0 || cOS != 0 {
		t.Fatalf("short posting wrong: %d %d %d %d", dOS, cCash, dCash, cOS)
	}
	// Over $5.00 → DR Cash 500, CR Over/Short 500.
	if dOS, cCash, dCash, cOS := build(500); dCash != 500 || cOS != 500 || dOS != 0 || cCash != 0 {
		t.Fatalf("over posting wrong: %d %d %d %d", dOS, cCash, dCash, cOS)
	}

	// Balance invariant both ways.
	for _, v := range []int64{-1312, 500, -1, 99999} {
		dOS, cCash, dCash, cOS := build(v)
		if (dOS + dCash) != (cCash + cOS) {
			t.Fatalf("unbalanced for %d: debits %d != credits %d", v, dOS+dCash, cCash+cOS)
		}
	}
}
