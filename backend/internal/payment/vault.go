package payment

import (
	"crypto/aes"
	"crypto/cipher"
	"crypto/rand"
	"encoding/base64"
	"encoding/hex"
	"errors"
	"fmt"
	"io"
	"strings"
)

// sealEnvelopePrefix marks a value as AES-256-GCM sealed (base64 of
// nonce||ciphertext follows). Values without it are treated as legacy
// plaintext so the vault can be introduced without a data migration.
const sealEnvelopePrefix = "enc:v1:"

// Vault seals processor credentials at rest with AES-256-GCM. The key comes
// from PAYMENT_VAULT_KEY (32-byte hex). When no key is configured the vault
// is absent: Seal is a passthrough (values stay plaintext, as before) and
// Open only passes through legacy plaintext — a sealed value with no key to
// open it is an explicit error rather than a silent leak.
//
// (Re-derived standard AEAD envelope; converges with the Gable/hardscapeos
// vault pattern without lifting code.)
type Vault struct {
	aead    cipher.AEAD
	present bool
}

// NewVault builds a vault from a 32-byte hex key. An empty key yields an
// absent vault (plaintext passthrough — dev/unconfigured). A malformed key
// is an error the caller should surface loudly (do not silently downgrade).
func NewVault(keyHex string) (*Vault, error) {
	if keyHex == "" {
		return &Vault{present: false}, nil
	}
	key, err := hex.DecodeString(strings.TrimSpace(keyHex))
	if err != nil {
		return nil, fmt.Errorf("PAYMENT_VAULT_KEY is not valid hex: %w", err)
	}
	if len(key) != 32 {
		return nil, fmt.Errorf("PAYMENT_VAULT_KEY must be 32 bytes (64 hex chars), got %d", len(key))
	}
	block, err := aes.NewCipher(key)
	if err != nil {
		return nil, err
	}
	aead, err := cipher.NewGCM(block)
	if err != nil {
		return nil, err
	}
	return &Vault{aead: aead, present: true}, nil
}

// Present reports whether a real key is configured (sealing is active).
func (v *Vault) Present() bool { return v != nil && v.present }

// IsSealed reports whether s carries the seal envelope.
func IsSealed(s string) bool { return strings.HasPrefix(s, sealEnvelopePrefix) }

// Seal encrypts a plaintext secret. With no key configured it returns the
// plaintext unchanged (caller decides whether to warn).
func (v *Vault) Seal(plaintext string) (string, error) {
	if !v.Present() {
		return plaintext, nil
	}
	nonce := make([]byte, v.aead.NonceSize())
	if _, err := io.ReadFull(rand.Reader, nonce); err != nil {
		return "", err
	}
	ct := v.aead.Seal(nonce, nonce, []byte(plaintext), nil)
	return sealEnvelopePrefix + base64.StdEncoding.EncodeToString(ct), nil
}

// Open decrypts a sealed value. Legacy (unsealed) values pass through so a
// vault can be adopted against existing plaintext rows.
func (v *Vault) Open(s string) (string, error) {
	if !IsSealed(s) {
		return s, nil // legacy plaintext
	}
	if !v.Present() {
		return "", errors.New("value is sealed but PAYMENT_VAULT_KEY is not configured")
	}
	raw, err := base64.StdEncoding.DecodeString(strings.TrimPrefix(s, sealEnvelopePrefix))
	if err != nil {
		return "", fmt.Errorf("sealed value is not valid base64: %w", err)
	}
	ns := v.aead.NonceSize()
	if len(raw) < ns {
		return "", errors.New("sealed value too short")
	}
	nonce, ct := raw[:ns], raw[ns:]
	pt, err := v.aead.Open(nil, nonce, ct, nil)
	if err != nil {
		return "", fmt.Errorf("decrypt failed (wrong key or corrupt value): %w", err)
	}
	return string(pt), nil
}
