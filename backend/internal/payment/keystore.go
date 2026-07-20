package payment

import (
	"context"
	"sync"
	"time"

	"github.com/gablelbm/gable/pkg/database"
)

// KeyStore resolves Run Payments credentials DB-first (system_settings keys
// run_payments_api_key / run_payments_public_key / run_payments_base_url)
// with env-config fallback and a 30s TTL cache — the same pattern as
// ai.KeyStore, so operators can set gateway keys at runtime in Tech Admin
// and card processing lights up without a restart.
type KeyStore struct {
	db  *database.DB
	env GatewayConfig // fallback values from environment configuration

	mu       sync.RWMutex
	cached   GatewayConfig
	cachedAt time.Time
}

const keyStoreTTL = 30 * time.Second

// NewKeyStore creates a KeyStore. envFallback carries the RUN_PAYMENTS_*
// environment values (may be empty).
func NewKeyStore(db *database.DB, envFallback GatewayConfig) *KeyStore {
	return &KeyStore{db: db, env: envFallback}
}

// Resolve returns the current gateway configuration. DB values win; env
// fills gaps; failures fall back to env so payments never break on a
// settings-table hiccup.
func (k *KeyStore) Resolve() GatewayConfig {
	k.mu.RLock()
	if time.Since(k.cachedAt) < keyStoreTTL {
		cfg := k.cached
		k.mu.RUnlock()
		return cfg
	}
	k.mu.RUnlock()

	cfg := k.env
	if k.db != nil {
		ctx, cancel := context.WithTimeout(context.Background(), 3*time.Second)
		defer cancel()
		rows, err := k.db.Pool.Query(ctx,
			`SELECT key, value FROM system_settings WHERE key IN
			 ('run_payments_api_key','run_payments_public_key','run_payments_base_url')`)
		if err == nil {
			defer rows.Close()
			for rows.Next() {
				var key, value string
				if rows.Scan(&key, &value) != nil {
					continue
				}
				if value == "" {
					continue
				}
				switch key {
				case "run_payments_api_key":
					cfg.APIKey = value
				case "run_payments_public_key":
					cfg.PublicKey = value
				case "run_payments_base_url":
					cfg.BaseURL = value
				}
			}
		}
	}

	k.mu.Lock()
	k.cached = cfg
	k.cachedAt = time.Now()
	k.mu.Unlock()
	return cfg
}

// Configured reports whether an API key is currently available.
func (k *KeyStore) Configured() bool {
	return k.Resolve().APIKey != ""
}
