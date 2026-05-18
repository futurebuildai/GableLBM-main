package ai

import (
	"context"
	"log/slog"
	"sync"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
)

// KeyStore provides a centralized, dynamically-refreshable API key store.
// It checks the system_settings DB table first, falling back to an env var default.
// The value is cached in memory and refreshed periodically.
type KeyStore struct {
	pool       *pgxpool.Pool
	envDefault string
	settingKey string

	mu       sync.RWMutex
	cached   string
	cachedAt time.Time
	ttl      time.Duration
}

// NewKeyStore creates a key store that reads from system_settings table.
// envDefault is the fallback value (from ANTHROPIC_API_KEY env var).
func NewKeyStore(pool *pgxpool.Pool, settingKey, envDefault string) *KeyStore {
	return &KeyStore{
		pool:       pool,
		envDefault: envDefault,
		settingKey: settingKey,
		ttl:        30 * time.Second,
	}
}

// Get returns the current API key, checking DB first then env var fallback.
func (ks *KeyStore) Get(ctx context.Context) string {
	ks.mu.RLock()
	if ks.cached != "" && time.Since(ks.cachedAt) < ks.ttl {
		val := ks.cached
		ks.mu.RUnlock()
		return val
	}
	ks.mu.RUnlock()

	// Refresh from DB
	val := ks.loadFromDB(ctx)

	ks.mu.Lock()
	ks.cached = val
	ks.cachedAt = time.Now()
	ks.mu.Unlock()

	return val
}

// Set stores a new key in the DB and updates the cache immediately.
func (ks *KeyStore) Set(ctx context.Context, value string) error {
	query := `
		INSERT INTO system_settings (key, value, updated_at)
		VALUES ($1, $2, NOW())
		ON CONFLICT (key) DO UPDATE SET value = $2, updated_at = NOW()
	`
	_, err := ks.pool.Exec(ctx, query, ks.settingKey, value)
	if err != nil {
		return err
	}

	ks.mu.Lock()
	if value != "" {
		ks.cached = value
	} else {
		ks.cached = ks.envDefault
	}
	ks.cachedAt = time.Now()
	ks.mu.Unlock()

	return nil
}

// Delete removes the key from DB, reverting to env var.
func (ks *KeyStore) Delete(ctx context.Context) error {
	_, err := ks.pool.Exec(ctx, "DELETE FROM system_settings WHERE key = $1", ks.settingKey)
	if err != nil {
		return err
	}

	ks.mu.Lock()
	ks.cached = ks.envDefault
	ks.cachedAt = time.Now()
	ks.mu.Unlock()

	return nil
}

// IsConfigured returns true if a key is available (from DB or env).
func (ks *KeyStore) IsConfigured(ctx context.Context) bool {
	return ks.Get(ctx) != ""
}

// HasDBOverride returns true if a key has been saved in the DB.
func (ks *KeyStore) HasDBOverride(ctx context.Context) bool {
	var count int
	err := ks.pool.QueryRow(ctx, "SELECT COUNT(*) FROM system_settings WHERE key = $1", ks.settingKey).Scan(&count)
	if err != nil {
		return false
	}
	return count > 0
}

func (ks *KeyStore) loadFromDB(ctx context.Context) string {
	var val string
	err := ks.pool.QueryRow(ctx, "SELECT value FROM system_settings WHERE key = $1", ks.settingKey).Scan(&val)
	if err == nil && val != "" {
		return val
	}
	if err != nil {
		slog.Debug("No DB setting found, using env fallback", "key", ks.settingKey)
	}
	return ks.envDefault
}
