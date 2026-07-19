# Architecture Specification

> Rewritten July 2026 to describe the system **as built**. Forward-looking
> design is explicitly labelled. For the installable-apps direction, see
> [`modularization-blueprint.md`](./modularization-blueprint.md).

## 1. System Principles
- **Modular Monolith:** Single deployment binary; ~40 modules under `backend/internal/`, wired in `backend/cmd/server/main.go`.
- **Zero-Trust Modules:** Modules never access another module's database tables directly — cross-module needs go through the other module's service or repository types.
- **Synchronous Interop:** All inter-module effects are synchronous Go calls today. (An event bus is a Phase 2+ consideration — see blueprint. There is no NATS client in the codebase.)
- **Interface Seams Where They Earn Their Keep:** Most coupling is concrete `*Service` injection; consumer-defined interfaces + adapters in `main.go` exist where cycles had to be broken (`quote.AutoPOService`, `delivery.InvoiceServiceInterface`, `pos.PriceCalculator`, `gl` → `integrations.GLAdapter`).
- **Apps Platform (Phase 0 landed):** Modules are becoming *apps* — declared manifests, a DB-backed registry (`apps` table), per-instance enable/disable, and an Apps admin page. See the blueprint for the full model.

## 2. Technology Stack
- **Backend:** Go 1.25+, stdlib `net/http.ServeMux` (Go 1.22+ pattern routing) — **not** Chi. Middleware lives in `pkg/middleware`.
- **Database:** PostgreSQL 16+ via pgx v5.
    - Extensions in use: `uuid-ossp` (migration 001), `ltree` (migration 049). (`pgvector`/`postgis` are not installed; adopt only when a feature needs them.)
- **Frontend:**
    - **Core:** Lit 3 Web Components + TypeScript 5.9 + Vite 7 — **not** React. Custom SPA router (`app/src/lib/router.ts`).
    - **Styling:** Tailwind CSS 3.4 + custom design tokens (no Shadcn).
    - **Charts:** Chart.js 4. **Maps:** Leaflet.
    - **Components:** Light DOM (`createRenderRoot() { return this; }`) so Tailwind classes apply directly.

## 2a. Hosting

Non-production environments are hosted on **Digital Ocean App Platform**
(PaaS, Dockerfile-based). A single DO Managed Postgres 16 cluster
(`gable-pg`) hosts two logical databases:

| Environment | Branch | URL | Logical DB |
|---|---|---|---|
| Demo | `community` | https://demo.gablelbm.com | `gable_demo` |
| Staging | `staging` | https://staging.gablelbm.com | `gable_staging` |

`master` / production is **not** deployed by this repo. App Platform specs
are version-controlled at `.do/app-demo.yaml` and `.do/app-staging.yaml`;
operational notes live in `.do/README.md`. Both apps share the backend
Docker image — the same image runs `main` (API server) as a service and
`migrate && seed` as a post-deploy job.

## 3. Module Boundaries (as built)

Actual packages under `backend/internal/` (the older draft of this document
described an idealized `sales`/`finance`/`logistics` grouping that never
existed as packages). Grouped by domain:

| Domain | Packages | Responsibility |
|--------|----------|---------------|
| Catalog & Inventory | `product`, `inventory`, `pim`, `location` | Products, UOM, stock quants/moves, cycle counts, AI product content, locations/branches |
| Sales | `quote`, `order`, `pricing`, `configurator`, `millwork` | Quotes, orders, pricing rules/categories/rebates, millwork configurator |
| Finance | `invoice`, `payment`, `account`, `gl`, `ap`, `bankrecon`, `tax`, `matching` | Invoicing, payments, AR subledger, general ledger, AP, bank reconciliation, tax, 3-way matching |
| Purchasing | `purchase_order`, `vendor`, `edi` | POs, vendors, EDI X12, auto-reorder scheduler |
| Logistics | `delivery` | Dispatch, routing (OpenRouteService), fleet, POD |
| Front-of-house | `pos`, `dashboard`, `reporting`, `document` | POS terminal, dashboards, report builder, generated documents |
| CRM & People | `crm`, `salesteam`, `customer` | Activities, sales teams, customer master |
| External surfaces | `portal`, `partner`, `project`, `integrations` | B2B portal, co-op partner API, portal projects, service-to-service integration |
| Platform (not apps) | `config`, `ai`, `domain`, `notification`, `techadmin`, `governance` | Env config, OpenRouter AI client + KeyStore, shared types, email/SMS stubs, admin settings, RFC governance |

Platform primitives live in `backend/pkg/`: `apps` (app registry/gating),
`middleware` (auth/branch/cors/rate-limit/idempotency/…), `database`,
`audit`, `metrics`, `httputil`, `pagination`, `branchctx`.

## 4. Inter-Module Communication

### 4.1. Synchronous calls (everything today)
Direct Go calls within the same process — usually a concrete `*Service`
dependency injected at construction in `main.go`; occasionally an interface
defined by the consumer with an adapter in `main.go`.

**Example:** Order fulfilment posts an invoice + GL entry + AR subledger
debit in one transaction (`order.FulfillOrder` → `invoice.PostInvoiceToLedger`
→ `gl.SyncInvoice` + `account.PostTransaction`).

### 4.2. Asynchronous events — future design (not implemented)
There is **no event bus**. If/when one lands (Phase 2+ of the blueprint), the
intended shape is subjects like `sales.order.confirmed` fanning out to
inventory/logistics/billing consumers. Until then, do not design features
that assume eventual consistency between modules.

## 5. API Strategy
- **Style:** RESTful JSON.
- **Surfaces:** `/api/v1/*` (ERP, JWT), `/api/portal/v1/*` (B2B portal — portal-session auth; `project` also mounts here), `/api/partner/v1/*` (co-op partner API), `/api/integration/*` (service-to-service via `X-Integration-Key`), `/api/v1/a2a/*` (Brain agent-to-agent JWS).
- **Router:** Go stdlib `http.ServeMux` with method+path patterns; per-module registration via `RegisterRoutes(mux, roleGuard…)`, converging on the gated `apps.Router` as modules convert.
- **Auth:** JWT verified against JWKS (`pkg/middleware.NewAuthMiddleware`); `AUTH_MODE=dev` pass-through for local/demo. Role gating via `middleware.RequireRole`.
- **App gating:** converted modules' routes 404 with `{"error":"app_disabled"}` when the app is disabled in the registry.
- **Config:** Environment variables with `godotenv` fallback.

## 6. Frontend Architecture
- **Routing:** custom singleton router (`app/src/lib/router.ts`) + flat route
  table (`app/src/routes.ts`) with lazy `import()` per route. Surfaces:
    - `/erp/*` — ERP desktop (`<gable-app-shell>`) *(ERP pages actually mount at root paths like `/orders`, with `layout: 'erp'`)*
    - `/portal/*` — B2B dealer portal (`<gable-portal-layout>`)
    - `/driver/*` — Mobile driver app (`<gable-driver-layout>`)
    - `/yard/*` — Warehouse/yard app (`<gable-yard-layout>`)
    - `/pos` — Point of sale terminal (no layout)
- **Apps:** converted apps declare routes + nav in `app/src/apps/<key>.ts`;
  the app registry feeds the route table, tag resolution, and generated
  sidebar entries, filtered by enablement from `GET /api/v1/apps`.
- **State:** component-local state + framework-agnostic singleton services (`app/src/services/`); HTTP via `services/fetchClient.ts` only.
- **AI Keys:** Managed via Tech Admin UI → stored in `system_settings` → resolved dynamically by backend `ai.KeyStore`.

## 7. Partner & Governance (present state vs. vision)
- **Built:** `internal/partner` exposes a read-only co-op partner API
  (`/api/partner/v1/dashboard|quotes`); `internal/governance` manages RFCs
  (`/api/v1/governance/rfcs`) with AI assistance (`governance/ai.go`);
  governance UI pages exist under `app/src/pages/governance/`.
- **Vision (not built):** AI-mediated impact analysis of proposed changes,
  backlog orchestration, and a federated catalog sync layer for co-ops to
  push master SKU data to member dealer instances.

## 8. Legacy Interop & Migration Strategy
- **Reference specs:** `industry_erps/` holds captured API specs for Epicor
  BisTrack (REST/OpenAPI), ECI Spruce (SOAP WSDL), and DMSi Agility
  (OpenAPI) — the raw material for future import/sync adapters.
- **Built today:** `internal/integrations` (X12 EDI helpers, GL adapter
  interface with mock + QuickBooks stub, FB-Brain connector).
- **Vision (not built):** per-module `adaptors/` mappers and a dedicated sync
  engine for bi-directional phase-in from legacy systems. Design these as
  *apps* once the platform work (blueprint Phases 1–2) is in place.
