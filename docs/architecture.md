# Architecture Specification

## 1. System Principles
- **Modular Monolith:** Single deployment binary, but internally strictly decoupled modules.
- **Zero-Trust Modules:** Modules never access another module's database tables directly.
- **Event-Driven:** Side effects (e.g., updating ledger after invoice posting) occur asynchronously via events.
- **Interface-Driven Interop:** Internal services use Go interfaces to allow for "Mock" or "Legacy Service" implementations (essential for migrations).
- **Federated Governance:** The platform supports a distributed contribution model, where industry partners (Co-ops) can propose core changes via a dedicated AI-mediated portal.

## 2. Technology Stack
- **Backend:** Go (Golang) 1.24+
- **Database:** PostgreSQL 16+
    - Extensions: `pgvector` (AI embeddings), `postgis` (Geospatial/Delivery).
- **Messaging:** NATS JetStream (embedded or external) for Event Bus.
- **Frontend:**
    - **Core:** React 19 + TypeScript 5.9 + Vite 7.
    - **UI Library:** Shadcn/UI (Tailwind).
    - **Animation:** Framer Motion 12.
    - **Charts:** Recharts 3, React Leaflet 5 (maps).

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
