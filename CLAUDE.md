# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What Is This?
GableLBM is an open-source ERP platform purpose-built for lumber and building materials (LBM) dealers. It replaces legacy systems like Epicor BisTrack, ECI Spruce, and DMSi Agility.

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
- **Pattern:** Modular monolith — single Go binary, ~50 modules under `backend/internal/<module>/`
- **Module shape:** Each module typically has `repository.go` (pgx), `service.go` (business logic), `handler.go` + `routes.go` (HTTP). Wired together in `backend/cmd/server/main.go`
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
- The root contains a ~60 MB binary named `docker-compose` — likely a packaged tool, not source. Don't commit modifications to it
- README.md says the frontend is "React + TypeScript + Tailwind"; it is actually **Lit 3**. Trust this file over the README for stack details
- `.agent/workflows/development.md` references `app/src/App.tsx`; the actual route table is `app/src/routes.ts`
- Default Postgres port in the app/config is **5434** (matches docker-compose), not 5432
- AI features degrade gracefully when no key is configured — don't add hard failures for missing AI keys; resolve via `KeyStore` instead

## Detailed Specs
See `docs/architecture.md`, `docs/design-system.md`, and `docs/database-erd.md` for deeper documentation.
