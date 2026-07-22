package payment

import (
	"context"
	"log/slog"
	"sync"
	"time"

	"github.com/gablelbm/gable/pkg/database"
)

// KeyStore resolves Run Payments credentials DB-first (system_settings keys
// run_payments_api_key / run_payments_public_key / run_payments_mid /
// run_payments_base_url) with env-config fallback and a 30s TTL cache — the
// same pattern as ai.KeyStore, so operators can set gateway keys at runtime
// and card processing lights up without a restart.
//
// Secret values (api_key, refresh_token) are sealed at rest with the Vault
// (AES-256-GCM, PAYMENT_VAULT_KEY) and transparently opened on read; legacy
// plaintext rows still open (passthrough) so the vault is adoptable without a
// data migration. Non-secret values (public_key, mid, base_url) stay plaintext.
type KeyStore struct {
	db     *database.DB
	env    GatewayConfig // fallback values from environment configuration
	vault  *Vault
	logger *slog.Logger

	mu       sync.RWMutex
	cached   GatewayConfig
	cachedAt time.Time
}

const keyStoreTTL = 30 * time.Second

// NewKeyStore creates a KeyStore. envFallback carries the RUN_PAYMENTS_*
// environment values (may be empty).
func NewKeyStore(db *database.DB, envFallback GatewayConfig) *KeyStore {
	return &KeyStore{db: db, env: envFallback, vault: &Vault{}, logger: slog.Default()}
}

// WithVault attaches the sealing vault and returns the store for chaining.
func (k *KeyStore) WithVault(v *Vault) *KeyStore {
	if v != nil {
		k.vault = v
	}
	return k
}

// WithLogger attaches a logger for vault/open diagnostics.
func (k *KeyStore) WithLogger(l *slog.Logger) *KeyStore {
	if l != nil {
		k.logger = l
	}
	return k
}

// Resolve returns the current gateway configuration. DB values win; env
// fills gaps; failures fall back to env so payments never break on a
// settings-table hiccup. Sealed secret values are opened here.
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
			 ('run_payments_api_key','run_payments_public_key','run_payments_mid','run_payments_base_url')`)
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
					cfg.APIKey = k.open(value, "run_payments_api_key")
				case "run_payments_public_key":
					cfg.PublicKey = value // public by design; not sealed
				case "run_payments_mid":
					cfg.MID = value
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

// open transparently decrypts a sealed value; a decrypt failure logs and
// yields "" (fail closed) so a mis-keyed secret can't be used as if plaintext.
func (k *KeyStore) open(value, name string) string {
	pt, err := k.vault.Open(value)
	if err != nil {
		k.logger.Error("failed to open sealed payment secret", "setting", name, "error", err)
		return ""
	}
	return pt
}

// Configured reports whether card charging is possible (api key + MID + base).
func (k *KeyStore) Configured() bool {
	cfg := k.Resolve()
	return cfg.APIKey != "" && cfg.MID != "" && cfg.BaseURL != ""
}

// SetSecret seals and upserts a secret setting (api_key / refresh_token),
// then busts the cache. Use this to store credentials encrypted at rest.
func (k *KeyStore) SetSecret(ctx context.Context, key, plaintext string) error {
	if k.db == nil {
		return nil
	}
	sealed, err := k.vault.Seal(plaintext)
	if err != nil {
		return err
	}
	if _, err := k.db.Pool.Exec(ctx,
		`INSERT INTO system_settings (key, value) VALUES ($1, $2)
		 ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value`, key, sealed); err != nil {
		return err
	}
	k.mu.Lock()
	k.cachedAt = time.Time{}
	k.mu.Unlock()
	return nil
}

// PersistRotatedKey seals + writes a refreshed api_key (and optional refresh
// token) back to system_settings so the rotation survives restarts, then
// busts the cache. Best-effort: a failure is logged by the caller.
func (k *KeyStore) PersistRotatedKey(apiKey, refreshToken string) error {
	if k.db == nil || apiKey == "" {
		return nil
	}
	ctx, cancel := context.WithTimeout(context.Background(), 3*time.Second)
	defer cancel()
	if err := k.SetSecret(ctx, "run_payments_api_key", apiKey); err != nil {
		return err
	}
	if refreshToken != "" {
		_ = k.SetSecret(ctx, "run_payments_refresh_token", refreshToken)
	}
	return nil
}
