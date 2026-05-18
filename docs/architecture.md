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
- **Messaging:** NATS JetStream is **aspirational / not yet wired** — the
  `nats` container in `docker-compose.yml` is unused, no NATS client is
  imported in Go code. All inter-module writes currently go through
  synchronous Go interface calls. Treat the event-bus sections below as
  forward-looking design, not current behaviour.
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
NATS JetStream Subjects.

**Example:** Order is Confirmed.
1. Sales publishes `sales.order.confirmed`
2. Inventory subscribes → Reserves Stock
3. Logistics subscribes → Creates Pick Ticket
4. Billing subscribes → Checks Credit Limit

## 5. API Strategy
- **Style:** RESTful JSON at `/api/v1/*`
- **Router:** Chi v5 with middleware chain
- **Auth:** OAuth2 / OIDC (Keycloak integration ready via JWKS)
- **Config:** Environment variables with `godotenv` fallback

## 6. Frontend Architecture
- **Routing:** React Router 7 with nested route groups:
    - `/erp/*` — ERP desktop (AppShell layout)
    - `/portal/*` — B2B dealer portal (PortalLayout)
    - `/driver/*` — Mobile driver app (DriverLayout)
    - `/yard/*` — Warehouse/yard app (YardLayout)
    - `/pos` — Point of sale terminal
- **State:** Component-local state + service classes for API calls
- **AI Keys:** Managed via Admin UI → stored in DB → resolved dynamically by backend KeyStore

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
