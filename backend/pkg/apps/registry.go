package apps

import (
	"context"
	"errors"
	"fmt"
	"log/slog"
	"net/http"
	"sort"
	"strings"
	"sync"
	"time"

	"github.com/gablelbm/gable/pkg/audit"
	"github.com/gablelbm/gable/pkg/database"
	"github.com/google/uuid"
)

// cacheTTL matches the ai.KeyStore precedent for DB-backed runtime config.
const cacheTTL = 30 * time.Second

// ErrUnknownApp is returned when toggling a key with no compiled-in manifest
// (including orphaned DB rows from another branch/fork build).
var ErrUnknownApp = errors.New("unknown app")

// ErrCoreApp is returned when attempting to disable a core app.
var ErrCoreApp = errors.New("core apps cannot be disabled")

// DependencyError reports the keys blocking an enable/disable.
type DependencyError struct {
	Key      string
	Enabling bool
	Blockers []string
}

func (e *DependencyError) Error() string {
	if e.Enabling {
		return fmt.Sprintf("cannot enable %q: requires disabled app(s) %s", e.Key, strings.Join(e.Blockers, ", "))
	}
	return fmt.Sprintf("cannot disable %q: still required by enabled app(s) %s", e.Key, strings.Join(e.Blockers, ", "))
}

// Status is the list-API view of one app.
type Status struct {
	Manifest
	Enabled bool `json:"enabled"`
	// Orphaned marks DB rows with no compiled-in manifest (fork/branch
	// drift). Orphaned apps cannot be toggled from this build.
	Orphaned bool `json:"orphaned,omitempty"`
}

// Registry owns the app catalog for one process: compiled-in manifests, the
// synced `apps` table, the enablement cache, and route gating.
type Registry struct {
	db     *database.DB
	logger *slog.Logger
	audit  *audit.Logger

	mu       sync.RWMutex
	apps     []App               // gated, convertible apps (registration order preserved)
	static   []Manifest          // catalog-only entries (unconverted modules)
	byKey    map[string]Manifest // all known manifests
	disabled map[string]bool     // enablement cache: key -> disabled
	cachedAt time.Time
}

// NewRegistry creates a Registry. logger must be non-nil; db may be nil only
// in tests (gating then fails open).
func NewRegistry(db *database.DB, logger *slog.Logger) *Registry {
	return &Registry{
		db:       db,
		logger:   logger,
		byKey:    map[string]Manifest{},
		disabled: map[string]bool{},
	}
}

// WithAudit attaches the platform audit logger; app toggles are governance
// events and land in audit_log when configured.
func (r *Registry) WithAudit(a *audit.Logger) *Registry {
	r.audit = a
	return r
}

// Add registers a convertible app: its manifest joins the catalog and its
// Register closure will be invoked with a gated Router at Mount time.
func (r *Registry) Add(app App) {
	r.mu.Lock()
	defer r.mu.Unlock()
	if _, dup := r.byKey[app.Key]; dup {
		panic(fmt.Sprintf("apps: duplicate app key %q", app.Key))
	}
	r.byKey[app.Key] = app.Manifest
	r.apps = append(r.apps, app)
}

// AddStatic registers catalog-only manifests for modules not yet converted
// to gated registration. They appear on the Apps page (typically core) but
// their routes are wired the legacy way in main.go.
func (r *Registry) AddStatic(manifests ...Manifest) {
	r.mu.Lock()
	defer r.mu.Unlock()
	for _, m := range manifests {
		if _, dup := r.byKey[m.Key]; dup {
			panic(fmt.Sprintf("apps: duplicate app key %q", m.Key))
		}
		r.byKey[m.Key] = m
		r.static = append(r.static, m)
	}
}

// Mount invokes every added app's Register closure against a gated view of
// mux. Call after all Add calls, before the server starts.
func (r *Registry) Mount(mux Router) {
	r.mu.RLock()
	apps := append([]App(nil), r.apps...)
	r.mu.RUnlock()
	for _, app := range apps {
		app.Register(gatedRouter{key: app.Key, reg: r, next: mux})
	}
}

// Sync upserts every known manifest into the apps table. Metadata columns
// refresh from code; `enabled` is never overwritten. Unknown DB rows are left
// alone and logged as orphans.
func (r *Registry) Sync(ctx context.Context) error {
	if r.db == nil {
		return errors.New("apps: registry has no database")
	}
	r.mu.RLock()
	manifests := make([]Manifest, 0, len(r.byKey))
	for _, m := range r.byKey {
		manifests = append(manifests, m)
	}
	r.mu.RUnlock()

	for _, m := range manifests {
		deps := m.DependsOn
		if deps == nil {
			deps = []string{}
		}
		_, err := r.db.Pool.Exec(ctx, `
			INSERT INTO apps (key, name, summary, category, core, depends_on)
			VALUES ($1, $2, $3, $4, $5, $6)
			ON CONFLICT (key) DO UPDATE SET
				name = EXCLUDED.name,
				summary = EXCLUDED.summary,
				category = EXCLUDED.category,
				core = EXCLUDED.core,
				depends_on = EXCLUDED.depends_on,
				updated_at = NOW()`,
			m.Key, m.Name, m.Summary, m.Category, m.Core, deps)
		if err != nil {
			return fmt.Errorf("apps: sync %q: %w", m.Key, err)
		}
	}

	// Surface orphans (rows from another branch/fork build) without touching them.
	rows, err := r.db.Pool.Query(ctx, `SELECT key FROM apps`)
	if err != nil {
		return fmt.Errorf("apps: sync orphan scan: %w", err)
	}
	defer rows.Close()
	var orphans []string
	for rows.Next() {
		var key string
		if err := rows.Scan(&key); err != nil {
			return fmt.Errorf("apps: sync orphan scan: %w", err)
		}
		if _, known := r.byKey[key]; !known {
			orphans = append(orphans, key)
		}
	}
	if len(orphans) > 0 {
		r.logger.Warn("apps registry has orphaned rows (no manifest in this build)", "keys", orphans)
	}
	r.logger.Info("apps registry synced", "apps", len(manifests), "orphans", len(orphans))
	return nil
}

// IsEnabled reports whether an app is enabled, from a cache refreshed at most
// every cacheTTL. Unknown keys and DB failures fail open (enabled) — the
// registry must never take a working ERP down.
func (r *Registry) IsEnabled(key string) bool {
	r.mu.RLock()
	fresh := time.Since(r.cachedAt) < cacheTTL
	dis := r.disabled[key]
	r.mu.RUnlock()
	if fresh {
		return !dis
	}
	r.refreshCache()
	r.mu.RLock()
	defer r.mu.RUnlock()
	return !r.disabled[key]
}

func (r *Registry) refreshCache() {
	if r.db == nil {
		r.mu.Lock()
		r.cachedAt = time.Now()
		r.mu.Unlock()
		return
	}
	ctx, cancel := context.WithTimeout(context.Background(), 3*time.Second)
	defer cancel()
	rows, err := r.db.Pool.Query(ctx, `SELECT key FROM apps WHERE enabled = FALSE`)
	if err != nil {
		// Keep serving from the stale cache; try again next TTL.
		r.logger.Warn("apps: enablement cache refresh failed; serving stale state", "error", err)
		r.mu.Lock()
		r.cachedAt = time.Now()
		r.mu.Unlock()
		return
	}
	defer rows.Close()
	disabled := map[string]bool{}
	for rows.Next() {
		var key string
		if err := rows.Scan(&key); err != nil {
			r.logger.Warn("apps: enablement cache scan failed", "error", err)
			return
		}
		disabled[key] = true
	}
	r.mu.Lock()
	r.disabled = disabled
	r.cachedAt = time.Now()
	r.mu.Unlock()
}

// bustCache forces the next IsEnabled/List to re-read the DB.
func (r *Registry) bustCache() {
	r.mu.Lock()
	r.cachedAt = time.Time{}
	r.mu.Unlock()
}

// List returns the full catalog (known manifests + orphaned rows), sorted by
// category then name, with live enablement state.
func (r *Registry) List(ctx context.Context) ([]Status, error) {
	if r.db == nil {
		return nil, errors.New("apps: registry has no database")
	}
	rows, err := r.db.Pool.Query(ctx, `SELECT key, name, summary, category, core, enabled, depends_on FROM apps`)
	if err != nil {
		return nil, fmt.Errorf("apps: list: %w", err)
	}
	defer rows.Close()

	r.mu.RLock()
	known := r.byKey
	r.mu.RUnlock()

	var out []Status
	for rows.Next() {
		var s Status
		if err := rows.Scan(&s.Key, &s.Name, &s.Summary, &s.Category, &s.Core, &s.Enabled, &s.DependsOn); err != nil {
			return nil, fmt.Errorf("apps: list scan: %w", err)
		}
		if _, ok := known[s.Key]; !ok {
			s.Orphaned = true
		}
		out = append(out, s)
	}
	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("apps: list: %w", err)
	}
	sort.Slice(out, func(i, j int) bool {
		if out[i].Category != out[j].Category {
			return out[i].Category < out[j].Category
		}
		return out[i].Name < out[j].Name
	})
	return out, nil
}

// SetEnabled toggles an app after validating the dependency graph in both
// directions. It writes through to the DB, busts the cache, and audit-logs
// the change.
func (r *Registry) SetEnabled(ctx context.Context, key string, enabled bool) error {
	if r.db == nil {
		return errors.New("apps: registry has no database")
	}
	r.mu.RLock()
	manifests := r.byKey
	r.mu.RUnlock()

	// Current enablement, fresh from the DB (validation must not trust a
	// 30s-old cache).
	current := map[string]bool{}
	rows, err := r.db.Pool.Query(ctx, `SELECT key, enabled FROM apps`)
	if err != nil {
		return fmt.Errorf("apps: toggle read: %w", err)
	}
	defer rows.Close()
	for rows.Next() {
		var k string
		var en bool
		if err := rows.Scan(&k, &en); err != nil {
			return fmt.Errorf("apps: toggle read: %w", err)
		}
		current[k] = en
	}

	if err := validateToggle(manifests, current, key, enabled); err != nil {
		return err
	}

	tag, err := r.db.Pool.Exec(ctx, `UPDATE apps SET enabled = $2, updated_at = NOW() WHERE key = $1`, key, enabled)
	if err != nil {
		return fmt.Errorf("apps: toggle write: %w", err)
	}
	if tag.RowsAffected() == 0 {
		return fmt.Errorf("%w: %q has no registry row (run migrations / restart to sync)", ErrUnknownApp, key)
	}
	r.bustCache()
	r.logger.Info("app toggled", "key", key, "enabled", enabled)
	if r.audit != nil {
		r.audit.Log(ctx, audit.Entry{
			Action:     map[bool]string{true: "app.enable", false: "app.disable"}[enabled],
			EntityType: "app",
			EntityID:   uuid.Nil, // apps use TEXT natural keys; the key travels in Changes
			Changes:    map[string]interface{}{"key": key, "enabled": enabled},
		})
	}
	return nil
}

// validateToggle enforces: known key, core protection, and the dependency
// graph in both directions. Pure function for testability.
func validateToggle(manifests map[string]Manifest, current map[string]bool, key string, enable bool) error {
	m, known := manifests[key]
	if !known {
		return fmt.Errorf("%w: %q", ErrUnknownApp, key)
	}
	if enable {
		var missing []string
		for _, dep := range m.DependsOn {
			if depM, ok := manifests[dep]; ok && depM.Core {
				continue // core deps are always enabled
			}
			if en, ok := current[dep]; ok && !en {
				missing = append(missing, dep)
			}
		}
		if len(missing) > 0 {
			sort.Strings(missing)
			return &DependencyError{Key: key, Enabling: true, Blockers: missing}
		}
		return nil
	}
	if m.Core {
		return fmt.Errorf("%w: %q", ErrCoreApp, key)
	}
	var dependents []string
	for k, other := range manifests {
		if k == key {
			continue
		}
		enabled, ok := current[k]
		if ok && !enabled {
			continue // disabled apps don't block
		}
		for _, dep := range other.DependsOn {
			if dep == key {
				dependents = append(dependents, k)
				break
			}
		}
	}
	if len(dependents) > 0 {
		sort.Strings(dependents)
		return &DependencyError{Key: key, Enabling: false, Blockers: dependents}
	}
	return nil
}

// gate wraps a handler with the per-request enablement check.
func (r *Registry) gate(key string, next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, req *http.Request) {
		if !r.IsEnabled(key) {
			respondDisabled(w, key)
			return
		}
		next.ServeHTTP(w, req)
	})
}
