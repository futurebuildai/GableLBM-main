package techadmin

import (
	"context"
	"crypto/rand"
	"crypto/subtle"
	"encoding/base64"
	"errors"
	"time"

	"golang.org/x/crypto/argon2"
)

type Service struct {
	repo Repository
}

func NewService(repo Repository) *Service {
	return &Service{repo: repo}
}

// GenerateKey creates a new API key, hashes it, and stores the hash.
// Returns the raw key (only time it's visible) and the key object.
func (s *Service) GenerateKey(ctx context.Context, name string, scopes []string) (string, *APIKey, error) {
	// 1. Generate random key
	keyBytes := make([]byte, 32)
	if _, err := rand.Read(keyBytes); err != nil {
		return "", nil, err
	}
	rawKey := "sk_live_" + base64.RawURLEncoding.EncodeToString(keyBytes)

	// 2. Hash key for storage using Argon2
	// Minimal params for speed while maintaining security for API keys
	salt := make([]byte, 16)
	if _, err := rand.Read(salt); err != nil {
		return "", nil, err
	}

	hash := argon2.IDKey([]byte(rawKey), salt, 1, 64*1024, 4, 32)
	// Combine salt and hash for storage: salt$hash (or just store hash if salt is part of verify)
	// For simplicity, we'll store base64(salt) + "$" + base64(hash)
	storedHash := base64.RawURLEncoding.EncodeToString(salt) + "$" + base64.RawURLEncoding.EncodeToString(hash)

	// 3. Store in DB
	apiKey := &APIKey{
		Name:      name,
		KeyHash:   storedHash,
		KeyPrefix: rawKey[:12], // "sk_live_xxxx"
		Scopes:    scopes,
		CreatedAt: time.Now(),
	}

	if err := s.repo.CreateKey(ctx, apiKey); err != nil {
		return "", nil, err
	}

	return rawKey, apiKey, nil
}

// ValidateKey checks if a raw key matches a stored hash.
// If valid, returns the APIKey object and updates LastUsedAt.
func (s *Service) ValidateKey(ctx context.Context, rawKey string) (*APIKey, error) {
	// Basic format check
	if len(rawKey) < 12 {
		return nil, errors.New("invalid key format")
	}

	prefix := rawKey[:12]
	candidates, err := s.repo.GetKeysByPrefix(ctx, prefix)
	if err != nil {
		return nil, err
	}

	for _, k := range candidates {
		// key_hash format: salt$hash
		parts := splitHash(k.KeyHash)
		if len(parts) != 2 {
			continue
		}

		salt, err := base64.RawURLEncoding.DecodeString(parts[0])
		if err != nil {
			continue
		}

		expectedHash, err := base64.RawURLEncoding.DecodeString(parts[1])
		if err != nil {
			continue
		}

		computedHash := argon2.IDKey([]byte(rawKey), salt, 1, 64*1024, 4, 32)

		if subtle.ConstantTimeCompare(expectedHash, computedHash) == 1 {
			// Match! Update usage
			_ = s.repo.UpdateLastUsed(ctx, k.ID)
			return k, nil
		}
	}

	return nil, errors.New("invalid api key")
}

func (s *Service) ListKeys(ctx context.Context) ([]APIKey, error) {
	return s.repo.ListKeys(ctx)
}

func (s *Service) RevokeKey(ctx context.Context, id string) error {
	return s.repo.RevokeKey(ctx, id)
}

func splitHash(h string) []string {
	// Helper to split "salt$hash"
	// Implementation depends on storage format
	// Here assuming "$" separator
	var parts []string
	start := 0
	for i, c := range h {
		if c == '$' {
			parts = append(parts, h[start:i])
			start = i + 1
		}
	}
	parts = append(parts, h[start:])
	return parts
}

type APIKey struct {
	ID         string     `json:"id"`
	Name       string     `json:"name"`
	KeyHash    string     `json:"-"`
	KeyPrefix  string     `json:"prefix"`
	Scopes     []string   `json:"scopes"`
	CreatedAt  time.Time  `json:"created_at"`
	LastUsedAt *time.Time `json:"last_used_at"`
	RevokedAt  *time.Time `json:"revoked_at"`
}
