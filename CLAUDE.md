# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What Is This?
GableLBM is an open-source ERP platform purpose-built for lumber and building materials (LBM) dealers. It replaces legacy systems like Epicor BisTrack, ECI Spruce, and DMSi Agility.

## Branches & Deployment

| Branch | Auto-deploys to | Notes |
|---|---|---|
| `master` | **nothing** | Pristine, fork-ready trunk. No demo seed runs. Devs `make seed` locally. |
| `staging` | https://staging.gablelbm.com | Digital Ocean App Platform, db `gable_staging`. Internal demos. |
| `community` | https://demo.gablelbm.com | Digital Ocean App Platform, db `gable_demo`. Community PRs target this branch. |

Both deployed environments run with `AUTH_MODE=dev` — the seeded `demo@gable.com` user is treated as full admin/owner via the dev-mode pass-through in `backend/pkg/middleware/auth.go`. This is intentional and safe (demo data is non-confidential) but must **never** propagate to a future `master` production deploy. Manifests live in `.do/app-demo.yaml` and `.do/app-staging.yaml`; operational notes in `.do/README.md`.

## Repo Structure
```
app/          → Lit 3 frontend (Vite + TypeScript + Tailwind)
backend/      → Go backend (stdlib http.ServeMux + pgx + PostgreSQL)
docs/         → Architecture, design system, and database specs
.agent/       → Antigravity agent workflows
```

## Tech Stack

### Backend
- **Language:** Go 1.25 (`backend/go.mod`)
- **Router:** Go 1.22+ stdlib `net/http.ServeMux` — **not** Chi. Modules expose `RegisterRoutes(mux, mw)` to attach handlers
- **Database:** PostgreSQL 16+ via pgx v5 (`pkg/database` wraps a `*pgxpool.Pool`)
- **Auth:** JWT verified against JWKS (`pkg/middleware.NewAuthMiddleware`). `AUTH_MODE=dev` disables auth for local dev; otherwise `JWKS_URL` is required (fail-closed)
- **PDF:** maroto v2 | **Excel:** excelize v2 | **Cron:** robfig/cron v3 | **Metrics:** Prometheus
- **Event bus:** `pkg/eventbus` wraps NATS JetStream behind a `Bus` seam with a transparent **in-process fallback**. `NATS_URL` selects the backend (unset → in-process; the DO demo/staging manifests leave it unset). Boot never blocks or hard-fails when NATS is down. First consumer is the quote price-exposure feature (`quote.exposure.*` subjects → `notification.ExposureNotifier`)

### Frontend
- **Framework:** Lit 3 Web Components + TypeScript 5.9 + Vite 7
- **Styling:** Tailwind CSS 3.4 + custom design tokens
- **Components:** Custom `gable-*` web components, **Light DOM** (`createRenderRoot() { return this; }`) so Tailwind classes apply
- **Routing:** Custom SPA router in `app/src/lib/router.ts` (singleton, popstate/pushState). Route table is `app/src/routes.ts` (lazy `import()` per route)
- **Charts:** Chart.js 4 | **Maps:** Leaflet | **Icons:** Lucide via `lib/icons.ts` helper
- **State:** `@state()` internal, `@property()` external; framework-agnostic singleton services under `app/src/services/`

## Architecture
- **Pattern:** Modular monolith — single Go binary, ~50 modules under `backend/internal/<module>/`
- **Module shape:** Each module typically has `repository.go` (pgx), `service.go` (business logic), `handler.go` + `routes.go` (HTTP). Wired together in `backend/cmd/server/main.go`
- **Cross-module:** Synchronous Go interfaces for reads/writes; asynchronous side-effects via `pkg/eventbus` (NATS JetStream or in-process fallback). The quote price-exposure feature publishes `quote.exposure.*` events consumed by the notification module
- **API surface:** REST JSON at `/api/v1/*` (ERP), `/api/portal/v1/*` (B2B portal, partially public), `/api/integration/*` (service-to-service via `X-Integration-Key`), `/api/v1/a2a/*` (Brain agent-to-agent JWS)
- **Public paths** (no auth): `/health`, `/healthz/live`, `/healthz/ready`, `/metrics`, portal login/config, integration, a2a — see whitelist in `backend/cmd/server/main.go`

## Product Geometry & the AI_LM Digital Twin

GableLBM's PIM is the **canonical source of per-product 3D geometry**. The `products`
table carries optional `length_in` / `width_in` / `height_in` (`DECIMAL(19,4)`),
`stackable` (`BOOLEAN`), and `geometry_source` (`TEXT`, default `parametric`) columns
(migration `073_product_dimensions.sql`). These describe each SKU as a scaled
**digital twin** — a parametric L×W×H box that renders identically in the PIM's Geometry
tab (`<gable-product-twin-3d>`) and in the AI_LM Load Builder next to the truck bed.

- **Shared scaling contract:** `1 inch = 1/12 Three.js world unit`. Both the PIM preview
  and AI_LM's `Load3DVisualizer` use the same factor, so a 96″ board is `8` world units
  in either app. Never change one side without the other.
- **Editing:** Inventory → product → **Geometry** tab, persisted via
  `PATCH /api/v1/products/{id}/dimensions`. The demo seed sets a few representative lumber
  SKUs (`backend/cmd/seed/main.go`, `productDims` map) so dims survive redeploys.
- **Consumption:** dims are exposed over the integration API (`/api/integration/products`)
  and consumed by AI_LM, which resolves geometry as OVERRIDE → PIM → FALLBACK. Nullable
  dims mean "no geometry yet" → AI_LM flags the item rather than rendering a zero-size box.
- `geometry_source` is the forward-compat seam for a future `mesh` value + `mesh_url`
  (GLTF asset upload) — parametric boxes only for now.

See `INTEGRATIONS.md` for the full contract and `docs/architecture.md` for where this sits
in the module map.

## Key Conventions

### Database
- PKs are UUID v4. Migrations use `uuid_generate_v4()` (the `uuid-ossp` extension, enabled in `001_initial_schema.sql`)
- Physical quantities: `DECIMAL(19,4)` — never float
- Money: stored in **cents** (integer) in application code, `DECIMAL(19,4)` in DB
- Inventory uses **double-entry** moves (from_location → to_location)
- Every quantity paired with a UOM ID
- Migrations live in `backend/migrations/` as plain numbered SQL files (`001_…`, `002_…`, etc.) — apply via `go run ./cmd/migrate`

### Backend Code
- Config: env vars with `godotenv` fallback (see `backend/internal/config/config.go`). Default DB URL points to **port 5434** (the docker-compose mapping), not the standard 5432
- AI keys resolved dynamically via `ai.KeyStore` (DB-first via `system_settings`, env fallback, 30s TTL cache). Admins can set keys at runtime in Tech Admin > AI Settings
- Server entry point: `backend/cmd/server/main.go` — long initializer that wires every module's repo→service→handler→routes
- Role middleware: `middleware.RequireRole("admin", "owner", "sales", …)` is applied per-module at registration
- Audit logging: financial operations should use `pkg/audit.Logger`

### Frontend Code
- App route trees: `/erp/*` (ERP desktop), `/portal/*` (B2B dealer portal), `/driver/*` (mobile), `/yard/*` (warehouse), `/pos` (POS terminal, no layout)
- Layout shells (Light DOM): `<gable-app-shell>`, `<gable-portal-layout>`, `<gable-driver-layout>`, `<gable-yard-layout>`
- All custom elements use the `gable-` prefix
- Adding a page: create the component under `app/src/pages/…`, register it in `app/src/routes.ts` with a lazy `load: () => import(...)` and the correct `layout`
- Routing API: `router.navigate(path)` from the `router` singleton; route params come in via `@property({ attribute: 'route-id' })`
- Toast notifications: `ToastService.show(message, type)` singleton
- Icons: `icon(LucideIcon, size, classes)` helper from `lib/icons.ts`
- Design tokens in `tailwind.config.js` — never hardcode colors. Use JetBrains Mono for all numbers/SKUs/prices/dimensions
- HTTP: use `services/fetchClient.ts` (wraps auth and base URL); never call `fetch` directly from pages

### Design System (Quick Ref)
| Token | Hex | Usage |
|-------|-----|-------|
| Gable Green | `#00FFA3` | Primary actions, success, active glow |
| Deep Space | `#0A0B10` | Global background |
| Slate Steel | `#161821` | Cards, sidebar, modals |
| Safety Red | `#F43F5E` | Errors, stockouts, credit hold |
| Blueprint Blue | `#38BDF8` | Technical data, links |

- **Body font:** Inter (400, 500, 600) | **Data font:** JetBrains Mono | **Theme:** Industrial Dark

## Common Commands

### Backend (`cd backend`)
```bash
go run ./cmd/server                # run API (port 8080, needs DB on :5434)
go run ./cmd/migrate               # apply SQL migrations in order
go build ./...                     # full build check
go test ./...                      # run all Go tests
go test ./internal/<module>/...    # tests for a single module
go vet ./...                       # static analysis
```

Override DB connection when Postgres is on the standard port:
```bash
DATABASE_URL="postgres://gable_user:gable_password@localhost:5432/gable_db?sslmode=disable" go run ./cmd/server
```

### Frontend (`cd app`)
```bash
npm install
npm run dev          # Vite dev server on :5173
npm run build        # tsc -b && vite build (type-check + bundle)
npm run lint         # eslint .
npm run test         # vitest run (one-shot)
npm run test:watch   # vitest watch mode
npx tsc --noEmit     # type-check only
```

### Infrastructure (root Makefile)
```bash
make up              # docker compose up -d (Postgres on :5434, NATS on :4222)
make down
make logs
make ps
make pg-shell        # psql into the gable_postgres container
```

## Pre-Flight Checks (before declaring work done)
- `cd app && npx tsc --noEmit` (or `npm run build`)
- `cd backend && go build ./...`
- New DB columns: UUID PKs, `DECIMAL(19,4)` for quantities, money-as-cents in app code
- UI uses design-system tokens (no hardcoded colors), JetBrains Mono for numerical data
- New endpoints under the correct prefix (`/api/v1`, `/api/portal/v1`, `/api/integration`, `/api/v1/a2a`) and wired into a `RegisterRoutes` call in `backend/cmd/server/main.go`

## Notes & Gotchas
- The root contains a ~60 MB binary named `docker-compose` — likely a packaged tool, not source. Don't commit modifications to it (it's gitignored at `/docker-compose`)
- README.md says the frontend is "React + TypeScript + Tailwind"; it is actually **Lit 3**. Trust this file over the README for stack details
- `.agent/workflows/development.md` references `app/src/App.tsx`; the actual route table is `app/src/routes.ts`
- Default Postgres port in the app/config is **5434** (matches docker-compose), not 5432
- AI features degrade gracefully when no key is configured — don't add hard failures for missing AI keys; resolve via `KeyStore` instead

### Money convention is not uniform across modules
The convention table at `Key Conventions → Database` ("cents in app code") is **the target**, not the current reality. Audit before assuming:

| Surface | Wire format | Notes |
|---|---|---|
| ERP `/api/v1/orders`, `/api/v1/invoices` | **int64 cents** | `order/repository.go` does `dollarsToInt64Cents()` on read, `/100.0` on write. DB column is `DECIMAL(10,2)` dollars |
| Portal `/api/portal/v1/*` | **float64 dollars** | `portal/model.go:61` has a TODO to migrate. Don't mix with ERP frontend helpers |
| Quotes, DailyTill, reporting | **float64 dollars** | Legacy float convention |
| `account` module | **int64 cents** | Reads/writes `customers.balance_due` as cents — incompatible with portal's dollar interpretation of the same column |

When rendering money on **ERP pages**, use `formatCents()` from `app/src/lib/utils.ts` (divides by 100 + locale-formats). Calling `.toFixed(2)` directly on an ERP money field will render $73.88 as $7,388.07. Portal/quotes pages already get dollars from the API and should format directly.

### `customers.balance_due` is unmaintained — compute live
The denormalized `customers.balance_due` column is **not kept in sync** by the seed pipeline or the invoice write paths. Reading it returns stale zeros for fresh seed data. The portal AR summary (`backend/internal/portal/repository.go:GetCustomerARSummary`) computes balance live as `SUM(total_amount) FROM invoices WHERE status IN ('UNPAID', 'OVERDUE')` — mirror this pattern in any new AR surface. Don't trust the column.

### Seed re-runs must use `ON CONFLICT (id) DO UPDATE`
`backend/cmd/seed/main.go` runs on every demo/staging deploy via the DO post-deploy job. Rows seeded with `ON CONFLICT DO NOTHING` will **not** pick up future edits to names, emails, etc. Sales reps (line 468), drivers (line 689), and any other deterministic-UUID seed data use `ON CONFLICT (id) DO UPDATE SET ...` so rebrand commits actually overwrite existing demo data. If you're touching seed strings on a row that already exists in production demo, verify the upsert clause names every column you changed.

## Detailed Specs
- `docs/architecture.md` — system principles, module map, the AI_LM digital-twin integration.
- `docs/design-system.md`, `docs/database-erd.md` — design tokens and schema.
- `INTEGRATIONS.md` — every `/api/integration/*` contract (AI_LM, Brain A2A, portal), auth, and the geometry payload.
- `DEVOPS.md` — deployment source-of-truth: branches → DO apps, `doctl` runbook, app IDs, post-deploy migrate/seed, rollback.
- `.do/README.md` — first-time App Platform setup (DNS, cluster, secrets).

## Roadmap & Recommended Next Work

Each item below is grounded in evidence in this repo. Scope is approximate;
read the referenced files before sizing.

### Recently completed (do not re-recommend)
- **#7** Canonical `products.vendor_id` UUID FK to vendors (commit `f100454`).
- **#8** PO source attribution column + `/purchase-orders/source-summary` endpoint for the replenishment-automation KPI (commit `1315a37`).
- **#9** Scheduled auto-reorder via robfig/cron + real demand signal from `order_lines` velocity, with `reorder_runs` observability table and manual triggers at `/purchase-orders/refresh-reorder-targets` and `/purchase-orders/reorder-runs` (commit `078a4cc`).
- **Lumber index price protection** Quote lines snapshot a baseline market-index value at SEND; the `pricing` exposure scanner detects index moves past a per-customer threshold and applies the customer policy (AUTO_ESCALATE / FLAG_FOR_REQUOTE / REQUIRE_ACK). Migration `072`, `pkg/eventbus` (`quote.exposure.*`), salesperson at-risk view (`/quotes/exposure`), owner portfolio rollup (`/reports/exposure`), market-index admin (`/admin/market-indices`), quote-detail exposure banner + margin-erosion fold-in, in-app acknowledgment modal, and the non-bypassable pre-ship gate on orders/delivery.
- **#11** Canonical per-product 3D geometry (`products.length_in/width_in/height_in/stackable/geometry_source`, migration `073`), the PIM Geometry tab (`<gable-product-twin-3d>`), `PATCH /api/v1/products/{id}/dimensions`, and exposure over `/api/integration/products` so AI_LM renders scaled digital twins (commits `14210d6`, `915b26e`).
- **#12** Unfiltered bulk product catalog pull on `/api/integration/products` (no `category`/`q` → `LIMIT 1000`) so AI_LM can hydrate its full load-planning catalog in one call (commit `b5170de`).

### #10 candidates — pick one based on the active discovery doc

**A. Finish reporting scheduler.** `backend/internal/reporting/scheduler.go` exists but is never instantiated in `main.go` (only the handler is wired at lines 396-402). `ExecuteAndSendReport` has 3 stub TODOs (definition unmarshal at `scheduler.go:92-93`, the inline "implementation omitted" at `:91`, and schedule status update at `:116`). No `EmailSender` implementation matches the interface — `notification.LogEmailService` has different methods (`SendInvoice`, `SendDeliveryNotification`). Needs: wire in main.go, finish unmarshal of `DefinitionJSON map[string]interface{}` → `ReportDefinition`, add `SendEmailWithAttachment` to `LogEmailService`, add a `report_schedule_runs` observability table.

**B. Will-call / pickup ticket workflow.** Orders currently flow `DRAFT → CONFIRMED → FULFILLED` with no pickup path. Real LBM dealers split delivery vs. will-call pickup as a hard distinction (the customer drives to the yard). Needs: new `will_call_tickets` table, `READY_FOR_PICKUP` order status, signature-on-pickup (POD reuse from `delivery/`), customer notification when ready. Greenfield module — biggest scope of these four.

**C. Pick-list workflow.** Insert a `PICKED` status between `CONFIRMED` and `FULFILLED`, generate printable/scannable pick lists from confirmed orders, add warehouse pick endpoints. Yard module exists but skips the pick step. Unblocks the existing yard/warehouse mobile app route tree (`/yard/*`).

**D. Customer credit hold enforcement.** `customer.credit_limit` exists with a known `float64` TODO around money. Order-create path doesn't hard-block when `current_balance + order_total > credit_limit`. Needs: blocking check in `order.Service.Create`, manual override with audit-log entry (`pkg/audit.Logger`), AR aging integration so the balance is real, and a UI surface on the order page. Direct AR-risk reduction for dealers.

### Digital-twin / AI_LM geometry follow-ups
- **Bulk-set geometry from UOM defaults.** Most SKUs have no dims (AI_LM falls back). Add a backfill that seeds parametric L/W/H from nominal lumber dimensions (a "2x4" → actual 1.5″×3.5″) keyed on SKU/category so the Load Builder loads more of the catalog as twins without per-product manual entry.
- **Mesh/GLTF geometry source.** `geometry_source` already reserves a non-`parametric` value; add a `mesh_url` column + asset upload + a Three.js GLTF loader path in `<gable-product-twin-3d>` for irregular products (trusses, fixtures) that a box can't represent.
- **Per-line geometry on the integration orders endpoint.** `IntegrationOrderLine` carries weight but not dims; folding L/W/H in lets AI_LM build a load straight from an order pull without a second catalog call.
- **Bundle/kit composition.** Geometry is per-product only; composite products (door units, framing packages) need a BOM-aware bounding-box or sub-box layout before they render correctly.

### Cross-cutting / lower-priority backlog
- Migrate `customer.credit_limit`, order/invoice money fields from `float64` to `int64` cents per the convention in `Key Conventions → Database`. Many call-sites; do as a focused refactor sprint.
- Frontend admin UI for `system_settings` (currently operators edit via psql). Unblocks self-service for the `reorder.*` keys added in #9.
- Add an SMTP/SendGrid `EmailSender` implementation (currently only `LogEmailService` exists). Required before scheduled reports and customer-facing email features are useful in prod.
- ~~Wire NATS or remove the orphan container~~ DONE: `pkg/eventbus` wires NATS JetStream with an in-process fallback (first consumer: quote price-exposure events).
- Pre-existing `inventory.MockRepository` is missing `DeallocateStock`, so `go vet ./internal/inventory/...` fails on master (pre-existing, unrelated to #9). Trivial fix.
