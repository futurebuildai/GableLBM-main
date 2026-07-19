# Modularization Blueprint: GableLBM as an Installable-Apps Platform

Status: **Phase 0 landed** (app framework scaffold + two reference conversions).
Companion audit: repo audit of July 2026 (see PR `feat/modular-apps-platform`).

## 1. Vision

GableLBM becomes an Odoo-style platform: a small core (auth, branches,
settings, design system, router) plus **apps** — self-contained vertical
slices (backend module + frontend pages + nav + migrations) that a dealer
enables or disables from an Apps page.

The tenancy mapping matters: Odoo installs apps *per database*. GableLBM is
deployed one instance + one database per dealer, so **"installed for this
company" = "enabled on this instance."** The registry is a DB table, so
enablement survives redeploys and is runtime-toggleable without a rebuild.

This is a formalization, not a rewrite. The backend is already ~40 modules
with a mostly uniform contract; the work is to (a) give modules a declared
identity (manifest), (b) gate their routes and nav on enablement, and
(c) progressively replace imperative wiring with manifest-driven wiring.

## 2. Concepts

| Term | Meaning |
|---|---|
| **App** | A feature slice a dealer can reason about: Millwork, POS, Bank Reconciliation. Usually 1 backend module + N frontend pages + nav entries. |
| **Manifest** | Declared metadata: `key`, `name`, `summary`, `category`, `core`, `depends_on`. Backend manifest lives in the module (`manifest.go`); frontend manifest in `app/src/apps/<key>.ts` (routes + nav). |
| **Core app** | Cannot be disabled (product, inventory, order, invoice, customer, settings…). Still listed on the Apps page. |
| **Registry (backend)** | `pkg/apps.Registry`: syncs manifests to the `apps` table at boot, answers `IsEnabled` (30s cache, same pattern as `ai.KeyStore`), gates routes, exposes `/api/v1/apps`. |
| **Registry (frontend)** | `app/src/apps/registry.ts`: aggregates frontend manifests into the route table, the path→tag map, and generated nav items; filters by enablement via `AppsService`. |

## 3. Backend design (as built in Phase 0)

- **`apps` table** (migration `074_apps_registry.sql`): `key TEXT PRIMARY KEY,
  name, summary, category, core BOOL, enabled BOOL DEFAULT TRUE, depends_on
  TEXT[], installed_at, updated_at`. Natural-key PK follows the
  `system_settings` precedent (registry row, not business data).
- **`pkg/apps`** (platform package, alongside `pkg/middleware`):
  - `Manifest` + `App{Manifest, Register func(Router)}`.
  - `Router` interface (`Handle`/`HandleFunc`) satisfied by `*http.ServeMux`;
    the registry hands converted modules a *gated* Router that wraps every
    handler with an enablement check. Because `http.ServeMux` cannot
    unregister patterns, disable = per-request gate (404
    `{"error":"app_disabled"}`), which also makes toggles take effect within
    the cache TTL, no restart.
  - `Registry.Sync` upserts every known manifest at boot (name/summary/
    category/core/depends refresh from code; `enabled` is *never* overwritten
    by sync — it belongs to the operator). Unknown DB rows are left alone and
    reported (`orphaned` in the list API) so branch/fork drift is visible.
  - `SetEnabled` enforces the dependency graph both directions: enabling an
    app requires its `depends_on` enabled; disabling requires no enabled
    dependents; `core` apps refuse disable. Toggles are audit-logged.
  - HTTP: `GET /api/v1/apps` (any authenticated role — the SPA needs it to
    build nav), `POST /api/v1/apps/{key}/enable|disable` (admin/owner).
- **Catalog for unconverted modules** (`cmd/server/catalog.go`): every module
  not yet converted is declared `core: true` so the Apps page shows the full
  platform truthfully from day one. Converting a module = moving its manifest
  into the module, marking `core: false` where appropriate, and registering
  through the gated Router.

### Target module contract (converge as modules are converted)

```go
// internal/<module>/manifest.go
var App = apps.Manifest{Key: "millwork", Name: "Millwork", Category: "Operations", DependsOn: []string{...}}

// handler.go — dominant signature, now against the Router interface
func (h *Handler) RegisterRoutes(mux apps.Router, roleGuard ...func(http.Handler) http.Handler)
```

The five current signature variants (portal, partner/project, integrations,
reporting, pricing, location) converge on this shape during Phase 1.

## 4. Frontend design (as built in Phase 0)

- **`app/src/apps/`**: `types.ts` (manifest shape), one manifest per
  converted app (routes: `{path, tag, load, layout}`; nav:
  `{label, path, icon, section, order}`), `registry.ts` aggregating them.
- **Single source of truth**: for converted apps, the manifest feeds
  (1) `routes.ts` (spread via `appRoutes()`), (2) the path→tag resolution in
  `app.ts` (registry consulted before the legacy `_pathToTag` map), and
  (3) generated sidebar items in `app-shell.ts`. The legacy dual-table
  pattern (`routes.ts` + `_pathToTag`) retires app by app.
- **`AppsService`**: fetches `/api/v1/apps` once per session (refreshes on
  toggle), exposes `isEnabled(key)`, emits `apps-changed`. Nav re-renders on
  the event; a route belonging to a disabled app renders a friendly
  "app disabled" panel (backend 404s its API regardless — the UI gate is UX,
  the API gate is enforcement).
- **Apps page** (`/admin/apps`): Odoo-style catalog grouped by category —
  toggles for non-core apps, dependency hints, core badges. Platform UI, not
  itself an app.

## 5. Conversion recipe (per module)

1. Backend: add `manifest.go`; switch `RegisterRoutes` to `apps.Router`;
   register in `main.go` via `registry.Add(apps.App{...})` instead of a bare
   `RegisterRoutes` call; delete its row from `cmd/server/catalog.go`.
2. Frontend: create `app/src/apps/<key>.ts`; move its routes out of
   `routes.ts` and its tag mappings out of `app.ts`; delete its hardcoded nav
   item(s); add nav entries to the manifest.
3. Add/verify at least one backend smoke test for the module (22 modules
   currently have zero tests — conversions are the vehicle to fix that).
4. Verify: `go build ./... && go test ./internal/<module>/...`,
   `npx tsc --noEmit`, toggle the app off and on against a live backend.

Good next conversions (leaf modules, no enabled dependents): the five
**dark pages** shipped but never routed — `bankrecon` (BankReconciliation.ts),
`matching` (POMatching.ts), rebates (RebatePrograms/RebateReport under
pricing), purchasing recommendations — plus `crm`, `salesteam`, `project`,
`vision`, `edi`. The dark pages are the best demos: enabling the app is what
lights the feature up.

## 6. Phases

**Phase 0 — Framework + references (this PR).** Registry, gate, Apps API,
Apps page, generated-nav plumbing, `millwork` + `governance` converted
end-to-end, full catalog visible. Cleanup: binaries, doc drift, NATS orphan,
CI triggers, dead deps.

**Phase 1 — Convert the long tail.** All leaf apps via the recipe; unify the
five `RegisterRoutes` variants; retire `_pathToTag` and all hardcoded nav
arrays (ERP, portal, yard; give driver a generated nav); wire the dark pages
as installable apps; per-app smoke tests.

**Phase 2 — Manifest-driven construction.** Move service construction out of
statement-ordered `main.go`: manifests declare provided/required service
interfaces; a small init resolver builds the DAG (today's order is encoded
only by line order). Replace `WithX` post-construction mutators with declared
optional dependencies. Public-path auth whitelist becomes a manifest field so
portal/integration surfaces stop needing hand-synced strings.

**Phase 3 — Full lifecycle.** Per-app migration directories with an
install/upgrade runner (today: one global numbered stream); real
install/uninstall semantics (uninstall = disable + data retained; purge as an
explicit, audited step); optional per-branch enablement (needs a
branch-scoped settings store — deliberately out of scope until a dealer asks);
community app packaging (out-of-tree modules) if the OSS ecosystem wants it.

## 7. Risks & mitigations

- **Gate staleness (≤30s cache):** acceptable for admin toggles; toggle API
  busts the local cache immediately, other replicas converge within TTL.
- **Dependency-graph mistakes:** `SetEnabled` validates both directions and
  the API returns 409 with the offending keys; core flags protect the spine.
- **Frontend/backend enablement skew:** UI treats `/api/v1/apps` as truth and
  refetches on toggle and on any `app_disabled` API response.
- **Fork/branch drift:** `Sync` never deletes and flags orphans instead, so a
  fork with extra modules keeps working.
- **Demo/staging seeds:** all apps default `enabled=TRUE`; deploys are
  behavior-neutral until an operator toggles.
- **History rewrite (cleanup follow-up)** is deliberately *not* in the PR;
  purging the ~76 MB of binary blobs needs a coordinated force-push across
  `master`/`staging`/`community`.
