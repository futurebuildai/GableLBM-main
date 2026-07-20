// Package apps implements the installable-apps platform layer: declared
// module manifests, a DB-backed registry (`apps` table, migration 074),
// per-instance enable/disable with dependency validation, and per-request
// route gating.
//
// Design notes (full rationale in docs/modularization-blueprint.md):
//
//   - "Installed for this company" == "enabled on this instance" — GableLBM
//     deploys one instance + one database per dealer, the same tenancy shape
//     as one Odoo database.
//   - http.ServeMux cannot unregister patterns, so disable is enforced as a
//     per-request gate (404 app_disabled) with a short-TTL cache, which also
//     makes toggles take effect without a restart.
//   - Sync never deletes rows and never touches `enabled`: operator state is
//     operator-owned, and fork/branch drift stays visible as orphaned rows.
package apps

import (
	"encoding/json"
	"net/http"
)

// Manifest is an app's declared identity. Converted modules define their own
// (internal/<module>/manifest.go); unconverted modules are declared centrally
// in cmd/server/catalog.go until they are converted.
type Manifest struct {
	// Key is the stable identifier (module name by convention).
	Key string `json:"key"`
	// Name is the human-facing app name shown on the Apps page.
	Name string `json:"name"`
	// Summary is a one-line description for the Apps page.
	Summary string `json:"summary"`
	// Category groups apps on the Apps page (Sales, Finance, Platform, …).
	Category string `json:"category"`
	// Core apps cannot be disabled (the platform spine and every module not
	// yet converted to gated registration).
	Core bool `json:"core"`
	// DependsOn lists app keys that must be enabled for this app to be
	// enabled. Platform library packages (config, ai, domain, notification)
	// are not apps and never appear here.
	DependsOn []string `json:"depends_on"`
}

// Router is the registration surface handed to converted modules — the
// subset of *http.ServeMux they actually use. The registry passes a gated
// implementation so every registered handler checks enablement per request;
// *http.ServeMux itself also satisfies the interface for tests and
// transitional call sites.
type Router interface {
	Handle(pattern string, handler http.Handler)
	HandleFunc(pattern string, handler func(http.ResponseWriter, *http.Request))
}

// App pairs a manifest with the closure that registers the app's routes.
// Register receives the gated Router; guards/middleware are bound inside the
// closure by main.go exactly as before conversion. One app may register the
// routes of several backend modules (e.g. millwork + configurator register
// under the single "millwork" app).
type App struct {
	Manifest
	Register func(r Router)
}

// gatedRouter wraps a real mux, interposing an enablement check on every
// handler registered through it.
type gatedRouter struct {
	key  string
	reg  *Registry
	next Router
}

func (g gatedRouter) Handle(pattern string, handler http.Handler) {
	g.next.Handle(pattern, g.reg.gate(g.key, handler))
}

func (g gatedRouter) HandleFunc(pattern string, handler func(http.ResponseWriter, *http.Request)) {
	g.next.Handle(pattern, g.reg.gate(g.key, http.HandlerFunc(handler)))
}

// respondDisabled emits the standard error envelope (see pkg/httputil) with a
// machine-readable app_disabled code the SPA keys off to refresh its app
// state and show the "app disabled" panel.
func respondDisabled(w http.ResponseWriter, appKey string) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusNotFound)
	_ = json.NewEncoder(w).Encode(map[string]any{
		"error": map[string]string{
			"code":    "app_disabled",
			"message": "The \"" + appKey + "\" app is disabled on this instance. An administrator can enable it under Tech Admin → Apps.",
		},
	})
}
