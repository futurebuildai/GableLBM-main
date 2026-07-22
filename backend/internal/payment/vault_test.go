package payment

import "testing"

const testVaultKey = "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef" // 32 bytes

func TestVault_SealOpenRoundTrip(t *testing.T) {
	v, err := NewVault(testVaultKey)
	if err != nil {
		t.Fatalf("NewVault: %v", err)
	}
	if !v.Present() {
		t.Fatal("vault should be present with a key")
	}
	secret := "rp_live_super_secret_jwt"
	sealed, err := v.Seal(secret)
	if err != nil {
		t.Fatalf("Seal: %v", err)
	}
	if !IsSealed(sealed) {
		t.Fatalf("sealed value missing envelope: %q", sealed)
	}
	if sealed == secret || contains(sealed, secret) {
		t.Fatalf("plaintext leaked into sealed value: %q", sealed)
	}
	opened, err := v.Open(sealed)
	if err != nil {
		t.Fatalf("Open: %v", err)
	}
	if opened != secret {
		t.Fatalf("round-trip mismatch: got %q", opened)
	}
}

func TestVault_LegacyPlaintextPassthrough(t *testing.T) {
	v, _ := NewVault(testVaultKey)
	out, err := v.Open("plain-legacy-value")
	if err != nil || out != "plain-legacy-value" {
		t.Fatalf("legacy plaintext should pass through, got %q err=%v", out, err)
	}
}

func TestVault_AbsentIsPassthrough(t *testing.T) {
	v, err := NewVault("")
	if err != nil {
		t.Fatalf("NewVault empty: %v", err)
	}
	if v.Present() {
		t.Fatal("empty-key vault must not be present")
	}
	sealed, _ := v.Seal("x")
	if sealed != "x" {
		t.Fatalf("absent vault Seal must passthrough, got %q", sealed)
	}
}

func TestVault_SealedWithoutKeyFailsClosed(t *testing.T) {
	real, _ := NewVault(testVaultKey)
	sealed, _ := real.Seal("secret")

	absent, _ := NewVault("")
	if _, err := absent.Open(sealed); err == nil {
		t.Fatal("opening a sealed value without a key must error, not passthrough")
	}
}

func TestVault_WrongKeyFails(t *testing.T) {
	v1, _ := NewVault(testVaultKey)
	sealed, _ := v1.Seal("secret")
	v2, _ := NewVault("fedcba9876543210fedcba9876543210fedcba9876543210fedcba9876543210")
	if _, err := v2.Open(sealed); err == nil {
		t.Fatal("wrong key must fail to decrypt")
	}
}

func TestNewVault_BadKey(t *testing.T) {
	if _, err := NewVault("nothex"); err == nil {
		t.Fatal("non-hex key must error")
	}
	if _, err := NewVault("abcd"); err == nil {
		t.Fatal("short key must error")
	}
}

func contains(haystack, needle string) bool {
	return len(haystack) >= len(needle) && (haystack == needle ||
		indexOf(haystack, needle) >= 0)
}

func indexOf(s, sub string) int {
	for i := 0; i+len(sub) <= len(s); i++ {
		if s[i:i+len(sub)] == sub {
			return i
		}
	}
	return -1
}
