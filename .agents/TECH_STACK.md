# GableLBM Tech Stack

This is the single source of truth for GableLBM's technology choices. All pipeline workflows reference this file automatically.

---

## Backend

- **Language:** Go 1.24+
- **Router:** Chi v5 (`github.com/go-chi/chi/v5`)
- **Data Access:** pgx v5 pool (raw SQL — no ORM)
- **Migrations:** Plain SQL files in `backend/migrations/`, numbered `NNN_description.sql`

## Frontend

- **Framework:** Lit 3 Web Components
- **Bundler:** Vite 7
- **Styling:** Tailwind CSS 3.4 + custom design tokens in `tailwind.config.js`
- **Language:** TypeScript 5.9
- **Component convention:** `gable-*` prefix, Light DOM (`createRenderRoot() { return this; }`)

## Database

- **Primary:** PostgreSQL 16+ (port 5434 locally via Docker)
- **Extensions:** pgvector (AI embeddings), PostGIS (geospatial), uuid-ossp
- **Message Queue:** NATS 2.10 with JetStream (port 4222 locally)

## API

- **Style:** REST JSON
- **Base path:** `/api/v1/*`
- **Auth:** JWT (Keycloak-ready via JWKS)
- **Conventions:** UUID params, DECIMAL money, ISO timestamps

## Infrastructure

- **CI/CD:** GitHub Actions (`.github/workflows/ci.yml`)
- **Containerization:** Docker + Docker Compose (`docker-compose.yml`)
- **Services:** `postgres` (5434→5432), `nats` (4222, 8222)

## Developer Tooling

- **Package Manager:** Go modules (backend), npm (frontend)
- **Task Runner:** Makefile at repo root
- **Linter/Formatter:** `golangci-lint` (Go), ESLint + Prettier (TS)

## Testing

- **Backend:** `go test ./...` (standard library)
- **Frontend:** Vitest (`app/vitest.config.ts`)

## Observability

- **Logging:** `log/slog` structured JSON
- **Metrics:** Prometheus endpoint at `/metrics`

## Key Constraints

- All PKs are UUID v4 (`gen_random_uuid()`)
- Physical quantities: `DECIMAL(19,4)` — never float
- Money: stored in `DECIMAL(19,4)` in DB (as dollars, not cents)
- Every inventory quantity paired with a UOM
- Inventory uses double-entry moves (from_location → to_location)
- Modular monolith: inter-module reads via Go interfaces, writes via NATS events
- App routes: `/erp/*` (ERP desktop), `/portal/*` (B2B portal), `/driver/*` (mobile), `/yard/*` (warehouse), `/pos` (POS)

## GableLBM Modules (existing)

| Module | Package | Domain |
|--------|---------|--------|
| Inventory | `internal/inventory` | Stock levels, moves, locations |
| Product | `internal/product` | SKUs, UOMs, pricing, PIM |
| Sales / Quotes | `internal/quote` | Quote builder, quote-to-order |
| Orders | `internal/order` | Sales orders, fulfillment |
| Invoicing | `internal/invoice` | Invoice generation, AR |
| Payments | `internal/payment` | Cash, check, credit card |
| Delivery | `internal/delivery` | Dispatch, routes, drivers, POD |
| Purchase Orders | `internal/purchase_order` | PO creation, receiving |
| Vendors | `internal/vendor` | Vendor master, contacts |
| Customers | `internal/customer` | Customer master, CRM |
| General Ledger | `internal/gl` | Chart of accounts, journal entries |
| Accounts Payable | `internal/ap` | AP bills, payments |
| POS | `internal/pos` | Point of sale, till |
| Configurator | `internal/configurator` / `internal/millwork` | Millwork CPQ |
| Reporting | `internal/reporting` | Report builder, BI |
| CRM | `internal/crm` | Activity tracking |
| Portal | `internal/portal` | B2B dealer portal |
| EDI | `internal/edi` | Electronic data interchange |
| AI / PIM | `internal/ai`, `internal/pim` | AI features, product content |
| Tech Admin | `internal/techadmin` | API keys, integrations |
