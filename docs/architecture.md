# Architecture Specification

## 1. System Principles
- **Modular Monolith:** Single deployment binary, but internally strictly decoupled modules.
- **Zero-Trust Modules:** Modules never access another module's database tables directly.
- **Event-Driven:** Side effects (e.g., updating ledger after invoice posting) occur asynchronously via events.
- **Interface-Driven Interop:** Internal services use Go interfaces to allow for "Mock" or "Legacy Service" implementations (essential for migrations).
- **Federated Governance:** The platform supports a distributed contribution model, where industry partners (Co-ops) can propose core changes via a dedicated AI-mediated portal.

## 2. Technology Stack
- **Backend:** Go (Golang) 1.25+
- **Database:** PostgreSQL 16+
    - Extensions: `pgvector` (AI embeddings), `postgis` (Geospatial/Delivery).
- **Messaging:** `pkg/eventbus` wraps **NATS JetStream** behind a `Bus` seam with a
  transparent **in-process fallback**. `NATS_URL` selects the backend (unset → in-process;
  the DO demo/staging manifests leave it unset). Boot never blocks or hard-fails when NATS
  is down. First consumer is the quote price-exposure feature
  (`quote.exposure.*` → `notification.ExposureNotifier`); most other side-effects still use
  synchronous Go interface calls and are migrating onto the bus incrementally.
- **Frontend:**
    - **Core:** Lit 3 Web Components + TypeScript 5.9 + Vite 7.
    - **Styling:** Tailwind CSS 3.4 + custom design tokens (no Shadcn).
    - **Charts:** Chart.js 4. **Maps:** Leaflet.
    - **Components:** Light DOM (`createRenderRoot() { return this; }`) so
      Tailwind classes apply directly.

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

## 3. Module Boundaries

| Module | Package | Responsibility |
|--------|---------|---------------|
| Inventory | `internal/inventory` | Products, UOM, stock quants, moves, cycle counts |
| Sales | `internal/sales` | Quotes, orders, pricing rules, price levels |
| Finance | `internal/finance` | Invoices, payments, AR, chart of accounts, ledger |
| Logistics | `internal/logistics` | Dispatch, routes, deliveries, fleet management |
| PIM | `internal/pim` | AI-powered product content, images, descriptions |
| Purchasing | `internal/purchasing` | Purchase orders, vendor management, receiving |
| Configurator | `internal/configurator` | Millwork door/product configurator |

## 4. Inter-Module Communication

### 4.1. Synchronous (Reads)
Direct Go Interface calls within the same process.

**Example:** Sales needs to check stock.
```go
InventoryService.GetAvailability(sku, location) // returns strict struct
```

### 4.2. Asynchronous (Writes / Side Effects)
`pkg/eventbus` subjects — NATS JetStream when `NATS_URL` is set, in-process otherwise.

**Live today:** the quote price-exposure feature publishes `quote.exposure.*`, consumed by
`notification.ExposureNotifier`.

**Forward-looking pattern** (most flows are still synchronous and migrating onto the bus):
1. Sales publishes `sales.order.confirmed`
2. Inventory subscribes → Reserves Stock
3. Logistics subscribes → Creates Pick Ticket
4. Billing subscribes → Checks Credit Limit

## 5. API Strategy
- **Style:** RESTful JSON. Prefixes: `/api/v1/*` (ERP), `/api/portal/v1/*` (B2B portal),
  `/api/integration/*` (service-to-service via `X-Integration-Key`), `/api/v1/a2a/*`
  (Brain agent-to-agent, JWS-signed).
- **Router:** Go 1.22+ **stdlib `net/http.ServeMux`** — *not* Chi. Each module exposes
  `RegisterRoutes(mux, mw)`; everything is wired in `backend/cmd/server/main.go`.
- **Auth:** JWT verified against JWKS (`pkg/middleware`). `AUTH_MODE=dev` bypasses for
  local/demo; otherwise `JWKS_URL` is required (fail-closed).
- **Config:** Environment variables with `godotenv` fallback.
- See `INTEGRATIONS.md` for the full third-party / cross-service contract surface.

## 6. Frontend Architecture
- **Framework:** **Lit 3 Web Components** + TypeScript 5.9 + Vite 7 (*not* React). Custom
  `gable-*` elements render in Light DOM so Tailwind utilities apply.
- **Routing:** custom SPA router (`app/src/lib/router.ts`, route table `app/src/routes.ts`)
  with nested route groups:
    - `/erp/*` — ERP desktop (`<gable-app-shell>`)
    - `/portal/*` — B2B dealer portal (`<gable-portal-layout>`)
    - `/driver/*` — mobile driver app (`<gable-driver-layout>`)
    - `/yard/*` — warehouse/yard app (`<gable-yard-layout>`)
    - `/pos` — point-of-sale terminal
- **3D:** Three.js powers `<gable-product-twin-3d>` (PIM product geometry preview).
- **State:** `@state()` internal / `@property()` external + framework-agnostic singleton
  services under `app/src/services/`.
- **AI Keys:** managed via Admin UI → stored in DB → resolved dynamically by backend KeyStore.

## 6a. Canonical Product Geometry → AI_LM Digital Twin

The PIM is the **canonical source of per-product 3D geometry**. `products` carries optional
`length_in` / `width_in` / `height_in`, `stackable`, and `geometry_source` (migration `073`).
Each SKU is a parametric L×W×H **digital twin** rendered identically in the PIM Geometry tab
and in the AI_LM Load Builder under a shared **1 inch = 1/12 Three.js world unit** scaling
contract. The supplementary **AI_LM** service (own DB, own UI) pulls these dims over
`/api/integration/products`, resolves them as OVERRIDE → PIM → FALLBACK, and renders scaled
boxes against a truck bed for axle/GVW load planning. Editing is via
`PATCH /api/v1/products/{id}/dimensions`. This keeps the ERP schema canonical while leaving
AI_LM portable to other ERPs — see `INTEGRATIONS.md`.

## 7. The Partner Portal & AI Governance Layer
- **Partner Portal:** Separate web interface for co-op administrators to submit requirements.
- **AI Governance Engine:**
    - Parser: Converts natural language requests into RFC-style technical specifications.
    - Impact Analyzer: Evaluates how a requested change affects core modules.
    - Backlog Orchestrator: Queues validated requests into the development pipeline.
- **Federated Catalog Service:** Multi-tenant sync layer for co-ops to push Master SKU Data to all member dealer instances.

## 8. Legacy Interop & Migration Strategy
- **Adaptor Layer:** Every core module includes an `adaptors/` directory with mappers for:
    - Epicor BisTrack (REST JSON)
    - ECI Spruce (SOAP XML)
    - DMSi Agility (REST JSON)
- **Sync Engine:** Dedicated `pkg/sync` module for bi-directional data flow during phase-in.
- **Schema Mapping:** Semantic mapping layer translates legacy terms into core GableLBM models.
