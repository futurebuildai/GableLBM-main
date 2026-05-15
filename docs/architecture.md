# GableLBM Architecture Specification

## 1. System Principles

- **Modular Monolith:** Single Go binary, internally decoupled modules — one process, no microservices overhead.
- **Zero-Trust Modules:** Modules never query another module's tables directly. Cross-module reads use Go interfaces; cross-module writes use NATS events.
- **Event-Driven Side Effects:** State changes with downstream consequences (GL posting on invoice, inventory reserve on order confirm) fire NATS subjects asynchronously.
- **Interface-Driven Interop:** Each module exposes a Go interface, enabling mock implementations for testing and legacy adaptor injection.

---

## 2. Technology Stack

### Backend
| Concern | Technology |
|---------|-----------|
| Language | Go 1.24+ |
| Router | Chi v5 (`github.com/go-chi/chi/v5`) |
| Database | PostgreSQL 16+ via pgx v5 pool (raw SQL, no ORM) |
| Migrations | Plain `.sql` files in `backend/migrations/`, numbered sequentially |
| DB Extensions | `pgvector` (AI embeddings), `postgis` (geospatial/delivery) |
| Message Bus | NATS 2.10 JetStream (embedded or external) |
| Auth | JWT — Keycloak-ready via JWKS endpoint |
| PDF generation | maroto v2 |
| Excel export | excelize v2 |
| Cron | robfig/cron v3 |
| Metrics | Prometheus (`/metrics` endpoint) |
| Logging | `log/slog` — structured JSON |
| Config | `godotenv` + environment variables |

### Frontend
| Concern | Technology |
|---------|-----------|
| Framework | **Lit 3 Web Components** (`lit` npm package) |
| Language | TypeScript 5.9 |
| Bundler | Vite 7 |
| Styling | Tailwind CSS 3.4 + custom design tokens (`tailwind.config.js`) |
| Charts | Chart.js 4 |
| Maps | Vanilla Leaflet |
| Icons | Lucide (vanilla SVG via `lib/icons.ts` helper) |
| Routing | Custom SPA router — singleton `RouterService` using `popstate`/`pushState` |
| Notifications | `ToastService` singleton (`lib/toast-service.ts`) |
| Offline | IndexedDB via `lib/offlineStore.ts` |

**Component convention:** All custom elements use the `gable-` prefix and Light DOM (`createRenderRoot() { return this; }`) for Tailwind class compatibility. No Shadow DOM. Pages live in `app/src/pages/`, reusable components in `app/src/components/`.

---

## 3. Go Module Map

All modules live under `backend/internal/`. Each follows the 4-file pattern: `model.go`, `repository.go`, `service.go`, `handler.go`.

| Module | Package Path | Domain |
|--------|-------------|--------|
| Product / PIM | `internal/product` | SKU master, UOM, pricing, AI content |
| Inventory | `internal/inventory` | Stock levels, moves, cycle counts |
| Location | `internal/location` | Yard hierarchy (zone/aisle/bin) |
| Customer | `internal/customer` | Customer master, contacts, CRM |
| Quote | `internal/quote` | Quote builder, pricing waterfall, quote-to-order |
| Order | `internal/order` | Sales orders, fulfillment |
| Invoice | `internal/invoice` | Invoice generation, AR aging |
| Payment | `internal/payment` | Cash, check, card, ACCOUNT payments |
| Pricing | `internal/pricing` | Pricing rules (quantity breaks, job overrides, promos) |
| Purchase Order | `internal/purchase_order` | PO creation, receiving, reorder |
| Vendor | `internal/vendor` | Vendor master, performance metrics |
| Delivery | `internal/delivery` | Dispatch, routes, drivers, vehicles, POD |
| General Ledger | `internal/gl` | Chart of accounts, journal entries, fiscal periods |
| Accounts Payable | `internal/ap` | AP bills, payment runs |
| Bank Recon | `internal/bankrecon` | Statement import, transaction matching |
| Matching | `internal/matching` | PO-to-invoice matching, 3-way match |
| POS | `internal/pos` | Point of sale terminal, till, offline sync |
| Portal | `internal/portal` | B2B dealer portal — catalog, cart, orders |
| CRM | `internal/crm` | Activity log, follow-ups |
| Reporting | `internal/reporting` | Report builder, saved reports, BI |
| Millwork | `internal/millwork` | Door/window configurator (CPQ) |
| Configurator | `internal/configurator` | Product configurator (generic CPQ) |
| EDI | `internal/edi` | Trading partners, 850/855/856/810 |
| Governance | `internal/governance` | RFC workflow, community feature proposals |
| Tax | `internal/tax` | Sales tax rates and jurisdiction |
| Sales Team | `internal/salesteam` | Salesperson master, commission |
| AI / Vision | `internal/ai`, `internal/vision` | Claude API, AI features, image parsing |
| Account | `internal/account` | User accounts |
| Dashboard | `internal/dashboard` | KPI aggregation |
| Tech Admin | `internal/techadmin` | API key management, integrations config |
| Notifications | `internal/notification` | Push notifications, delivery alerts |
| Partner | `internal/partner` | Co-op/partner management |
| Parsing | `internal/parsing` | Material list OCR / AI parsing |
| Project | `internal/project` | Portal project tracking |
| Document | `internal/document` | PDF/document generation |
| Integrations | `internal/integrations` | External ERP connectors |

### Shared Packages (`backend/pkg/`)

| Package | Purpose |
|---------|---------|
| `pkg/database` | pgxpool initialization and helpers |
| `pkg/middleware` | JWT auth, request logging, CORS |
| `pkg/audit` | Audit log writer |
| `pkg/metrics` | Prometheus metric definitions |
| `pkg/pagination` | Cursor and offset pagination helpers |
| `pkg/httputil` | JSON response helpers |

---

## 4. Inter-Module Communication

### Synchronous (Reads) — Direct Go Interface Calls
Used when one module needs data from another in the same request lifecycle.

```go
// Example: Quote service checks inventory availability
type InventoryChecker interface {
    GetAvailableQty(ctx context.Context, productID uuid.UUID) (decimal.Decimal, error)
}
```

### Asynchronous (Writes/Side Effects) — NATS JetStream
Used when a state change in one module should trigger work in another.

| Subject | Publisher | Subscribers | Effect |
|---------|-----------|-------------|--------|
| `sales.order.confirmed` | `order` | `inventory`, `delivery`, `gl` | Reserve stock, create pick, post AR |
| `invoice.posted` | `invoice` | `gl`, `customer` | Journal entry, update balance |
| `payment.applied` | `payment` | `gl`, `invoice` | Post payment, update AR |
| `po.received` | `purchase_order` | `inventory`, `gl` | Receive stock, post AP |
| `delivery.completed` | `delivery` | `order`, `invoice` | Mark fulfilled, trigger invoice |

---

## 5. API Strategy

- **Base path:** `/api/v1/*` (all routes; legacy POS uses `/api/pos/*` — migration pending)
- **Router:** Chi v5 — handlers registered via `RegisterRoutes(r chi.Router, db *pgxpool.Pool)`
- **Auth:** JWT Bearer — validated via JWKS middleware in `pkg/middleware`
- **Response format:** JSON — `{"field": value}` for success, `{"error": "message"}` for errors
- **Pagination:** Offset-based (`?page=1&limit=50`) via `pkg/pagination`

---

## 6. Frontend Architecture

### Layout Shells

| Shell Component | File | Route Prefix | Context |
|----------------|------|-------------|---------|
| `<gable-app-shell>` | `components/layout/app-shell.ts` | `/erp/*` and most ERP routes | Full ERP desktop with sidebar |
| `<gable-portal-layout>` | `components/layout/portal-layout.ts` | `/portal/*` | B2B dealer portal |
| `<gable-driver-layout>` | `components/layout/driver-layout.ts` | `/driver/*` | Mobile driver app |
| `<gable-yard-layout>` | `components/layout/yard-layout.ts` | `/yard/*` | Warehouse tablet |
| *(none)* | — | `/pos` | Full-screen POS terminal |

### Route Structure

Routes are defined in `app/src/routes.ts` as `RouteConfig[]`. Each route specifies:
- `path` — URL pattern (supports `:param` segments)
- `load` — dynamic import returning the page module
- `layout` — which shell to render (`'erp'` | `'portal'` | `'driver'` | `'yard'` | `'none'`)

Navigation: `router.navigate('/path')` via the singleton `RouterService` instance.  
Route params: accessed via `@property({ attribute: 'route-id' })` on the page component.

### ERP Routes (current)

| Path | Page | Module |
|------|------|--------|
| `/` | Dashboard | dashboard |
| `/inventory` | Inventory list | product/inventory |
| `/inventory/:id` | Product detail | product/pim |
| `/quotes` | Quote list | quote |
| `/quotes/new`, `/quotes/:id/edit` | Quote builder | quote |
| `/orders` | Order list | order |
| `/invoices` | Invoice list | invoice |
| `/dispatch` | Dispatch board | delivery |
| `/fleet` | Fleet management | delivery |
| `/purchasing` | PO list | purchase_order |
| `/purchasing/vendors` | Vendor list | vendor |
| `/accounts` | Customer accounts | customer/crm |
| `/accounting/chart-of-accounts` | GL chart | gl |
| `/accounting/journal-entries` | Journal entries | gl |
| `/accounting/trial-balance` | Trial balance | gl |
| `/pricing` | Pricing matrix | pricing |
| `/millwork/*` | Configurator | millwork/configurator |
| `/governance` | RFC dashboard | governance |
| `/admin` | Tech admin | techadmin |
| `/reports/*` | Reports | reporting |
| `/pos` | POS terminal | pos |
| `/portal/*` | B2B portal | portal |
| `/driver/*` | Driver app | delivery |
| `/yard/*` | Yard app | inventory |

---

## 7. Database Conventions

- **All PKs:** `UUID v4` — `gen_random_uuid()` (preferred) or `uuid_generate_v4()`
- **Physical quantities:** `DECIMAL(19,4)` — never `FLOAT`, never `NUMERIC(12,2)`
- **Money:** `DECIMAL(19,4)` in DB (stored as dollars)
- **Timestamps:** `TIMESTAMPTZ` — always with timezone
- **Text fields:** `TEXT` (not `VARCHAR`) for variable-length strings
- **Migrations:** `backend/migrations/NNN_description.sql` — sequential, plain SQL, never modified after merge

---

## 8. Local Development

```bash
# Start infrastructure (Postgres + NATS)
make up

# Run all migrations
make migrate

# Seed demo data (Cascade Building Supply)
make seed

# Full stack: up + migrate + seed + backend
make dev

# Frontend (second terminal)
make frontend
```

Default database: `postgres://gable_user:gable_password@localhost:5434/gable_db?sslmode=disable`
