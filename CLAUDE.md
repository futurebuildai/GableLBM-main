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
- **Note:** `docker-compose.yml` runs a `nats` container, but no NATS client is imported in Go code — the event bus described in `docs/architecture.md` is aspirational / not yet wired

### Frontend
- **Framework:** Lit 3 Web Components + TypeScript 5.9 + Vite 7
- **Styling:** Tailwind CSS 3.4 + custom design tokens
- **Components:** Custom `gable-*` web components, **Light DOM** (`createRenderRoot() { return this; }`) so Tailwind classes apply
- **Routing:** Custom SPA router in `app/src/lib/router.ts` (singleton, popstate/pushState). Route table is `app/src/routes.ts` (lazy `import()` per route)
- **Charts:** Chart.js 4 | **Maps:** Leaflet | **Icons:** Lucide via `lib/icons.ts` helper
- **State:** `@state()` internal, `@property()` external; framework-agnostic singleton services under `app/src/services/`

## Architecture
- **Pattern:** Modular monolith — single Go binary, ~40 modules under `backend/internal/<module>/`
- **Module shape:** Each module typically has `repository.go` (pgx), `service.go` (business logic), and `handler.go` (HTTP handlers + `RegisterRoutes` — there is no separate `routes.go`). Wired together in `backend/cmd/server/main.go`
- **Apps platform (Phase 0):** modules are becoming installable *apps* — manifest + DB registry (`apps` table, migration 074) + per-instance enable/disable via `pkg/apps`, managed at **Tech Admin → Apps** (`/admin/apps`). Converted so far: `millwork`, `governance`. Conversion recipe + phases: `docs/modularization-blueprint.md`
- **Cross-module:** Synchronous Go interfaces (writes via NATS events are not implemented yet)
- **API surface:** REST JSON at `/api/v1/*` (ERP), `/api/portal/v1/*` (B2B portal, partially public), `/api/integration/*` (service-to-service via `X-Integration-Key`), `/api/v1/a2a/*` (Brain agent-to-agent JWS)
- **Public paths** (no auth): `/health`, `/healthz/live`, `/healthz/ready`, `/metrics`, portal login/config, integration, a2a — see whitelist in `backend/cmd/server/main.go`

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
make up              # docker compose up -d (Postgres on :5434)
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
- Never commit build binaries. The repo used to ship a ~60 MB `docker-compose` binary and a 15 MB `backend/main` — both removed July 2026 and gitignored (`/docker-compose`, `backend/main`). If `git status` shows a binary, it belongs in `.gitignore`, not the tree
- The route table is `app/src/routes.ts`; converted apps declare routes in `app/src/apps/<key>.ts` instead
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

### AR balance: read live from invoices; `customers.balance_due` is a secondary record
For **reads / decisions**, compute the customer's AR balance live from open invoices —
`SUM(total_amount) FROM invoices WHERE status IN ('UNPAID','PARTIAL','OVERDUE')`. The
canonical status set lives in `invoice.OpenInvoiceStatuses`; the portal AR summary,
dashboard, reporting, and the order **credit-limit gate** (`order.Service.overCreditLimit`)
all go through it, so they agree. The credit gate no longer reads the denormalized
`customers.balance_due` column.

The `balance_due` column **is** now written — but only as a secondary subledger figure:
`order.FulfillOrder` posts each invoice to the GL + the AR subledger via
`invoice.PostInvoiceToLedger` (single AR writer = `account.PostTransaction`, which updates
`balance_due` + inserts a `customer_transactions` row), and `payment.ProcessPayment` credits
it. It can still drift from the live-invoice figure for historical/seed rows, so don't trust
it for decisions — derive live.

> Financial posting is now wired (was aspirational): a fulfilled order produces one
> tax-inclusive invoice + a balanced `DR Accounts Receivable / CR Sales Revenue` GL entry
> (`gl.SyncInvoice`, accounts resolved by stable code 1010/1020/4010) + an AR subledger
> debit, all in one transaction. POS completion posts `DR Cash / CR Sales Revenue`
> post-commit (best-effort). An over-limit order is parked `ON_HOLD` (a valid `orders.status`
> as of migration 071).
>
> **Invoice tax rate:** `invoice.CreateInvoice` resolves the rate from the invoice's branch
> (`locations.default_tax_rate`, e.g. 0.12 in BC) via `repo.GetBranchTaxRate`; the
> order-fulfil and delivery paths stamp the invoice with the order's `branch_id` so it
> resolves correctly. `invoice.DefaultTaxRate = 0.0825` is only the fallback when the branch
> has no configured rate.

### Seed resets transactional data each run; reference data upserts
`backend/cmd/seed/main.go` runs on every demo/staging deploy via the DO post-deploy job.
- **Transactional data** (orders, invoices, quotes, deliveries, payments, GL entries, POs,
  POS/CRM/rebate rows, …) is **TRUNCATEd at the start of every run** by
  `resetTransactionalData()` — these rows use random UUIDs with no upsert key, so without the
  reset every redeploy *accumulated* another full dataset (the demo once held 1,216 invoices
  vs the ~50 seeded, which inflated AR and parked every order `ON_HOLD`). The reset is
  existence-filtered so it's safe across branch/fork schema differences. If you add a new
  generated transactional table, add it to the candidate list.
- **Reference data** (sales reps, drivers, customers, products, vendors, locations, chart of
  accounts, …) must use `ON CONFLICT (...) DO UPDATE` keyed on a natural/deterministic key so
  edits (names, emails, prices) overwrite existing demo rows on redeploy. `ON CONFLICT DO
  NOTHING` will silently ignore future edits — verify the upsert names every column you change.

### External services are OSS-migrated (AI = OpenRouter, routing = OpenRouteService)
The proprietary external-service layer has been replaced with single-key open options — landed on
`master` + `community`, live on demo. Full as-built record in
[`docs/oss-migration-handoff.md`](docs/oss-migration-handoff.md). The load-bearing bits:
- **AI:** one `openrouter_api_key` (+ optional `openrouter_base_url`) → one OpenAI-compatible
  `ai.Client` (`backend/internal/ai/openrouter.go`) for text + vision OCR + image gen. No more
  Anthropic/Gemini/Stability clients. Keys are runtime-settable in **Tech Admin → AI**.
- **Image gen** is **asynchronous** — `pim.GenerateImage` returns `202` + a `pim_media` row with
  `status:"generating"` and finalizes in a detached goroutine; frontend polls. Default model
  `black-forest-labs/flux.2-pro`; FLUX requests must send `modalities:["image"]` only. Sync gen
  500s on the demo's ~24s gateway — keep it async.
- **Routing:** OpenRouteService (VROOM + Pelias, `driving-hgv`), key runtime-settable in
  **Tech Admin → Routing**; flips mock ↔ real per request, no redeploy. `[lng,lat]` ordering
  everywhere (reverse of Google). Single-vehicle-per-call (3-vehicle free-tier cap).
- Production self-hosting decisions live in `docs/production-external-services-roadmap.md`.

## Detailed Specs
See `docs/architecture.md`, `docs/design-system.md`, and `docs/database-erd.md` for deeper documentation.

## Tier 1 Backlog (next-up work)

Each item below is grounded in evidence in this repo. Scope is approximate;
read the referenced files before sizing.

### Recently completed (do not re-recommend)
- **#7** Canonical `products.vendor_id` UUID FK to vendors (commit `f100454`).
- **#8** PO source attribution column + `/purchase-orders/source-summary` endpoint for the replenishment-automation KPI (commit `1315a37`).
- **#9** Scheduled auto-reorder via robfig/cron + real demand signal from `order_lines` velocity, with `reorder_runs` observability table and manual triggers at `/purchase-orders/refresh-reorder-targets` and `/purchase-orders/reorder-runs` (commit `078a4cc`).

### #10 candidates — pick one based on the active discovery doc

**A. Finish reporting scheduler.** `backend/internal/reporting/scheduler.go` exists but is never instantiated in `main.go` (only the handler is wired at lines 396-402). `ExecuteAndSendReport` has 3 stub TODOs (definition unmarshal at `scheduler.go:92-93`, the inline "implementation omitted" at `:91`, and schedule status update at `:116`). No `EmailSender` implementation matches the interface — `notification.LogEmailService` has different methods (`SendInvoice`, `SendDeliveryNotification`). Needs: wire in main.go, finish unmarshal of `DefinitionJSON map[string]interface{}` → `ReportDefinition`, add `SendEmailWithAttachment` to `LogEmailService`, add a `report_schedule_runs` observability table.

**B. Will-call / pickup ticket workflow.** Orders currently flow `DRAFT → CONFIRMED → FULFILLED` with no pickup path. Real LBM dealers split delivery vs. will-call pickup as a hard distinction (the customer drives to the yard). Needs: new `will_call_tickets` table, `READY_FOR_PICKUP` order status, signature-on-pickup (POD reuse from `delivery/`), customer notification when ready. Greenfield module — biggest scope of these four.

**C. Pick-list workflow.** Insert a `PICKED` status between `CONFIRMED` and `FULFILLED`, generate printable/scannable pick lists from confirmed orders, add warehouse pick endpoints. Yard module exists but skips the pick step. Unblocks the existing yard/warehouse mobile app route tree (`/yard/*`).

**D. Customer credit hold enforcement.** `customer.credit_limit` exists with a known `float64` TODO around money. Order-create path doesn't hard-block when `current_balance + order_total > credit_limit`. Needs: blocking check in `order.Service.Create`, manual override with audit-log entry (`pkg/audit.Logger`), AR aging integration so the balance is real, and a UI surface on the order page. Direct AR-risk reduction for dealers.

### Cross-cutting / lower-priority backlog
- Migrate `customer.credit_limit`, order/invoice money fields from `float64` to `int64` cents per the convention in `Key Conventions → Database`. Many call-sites; do as a focused refactor sprint.
- Frontend admin UI for `system_settings` (currently operators edit via psql). Unblocks self-service for the `reorder.*` keys added in #9.
- Add an SMTP/SendGrid `EmailSender` implementation (currently only `LogEmailService` exists). Required before scheduled reports and customer-facing email features are useful in prod.
- ~~Wire NATS or remove the orphan container~~ **Done July 2026:** orphan NATS container removed from `docker-compose.yml`; the event bus remains future design (blueprint Phase 2+).
- ~~`inventory.MockRepository` missing `DeallocateStock` breaks `go vet`~~ **Already fixed** — the mock implements it (`internal/inventory/service_test.go`); `go vet ./...` is clean.
- Convert remaining leaf modules to installable apps per `docs/modularization-blueprint.md` §5 — the five dark pages (bankrecon, matching, rebates, purchasing recommendations) are the best next candidates.
