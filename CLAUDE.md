# GableLBM — Project Conventions

## What Is This?
GableLBM is an open-source ERP platform purpose-built for lumber and building materials (LBM) dealers. It replaces legacy systems like Epicor BisTrack, ECI Spruce, and DMSi Agility.

## Repo Structure
```
app/          → Lit 3 frontend (Vite + TypeScript + Tailwind)
backend/      → Go backend (Chi router + pgx + PostgreSQL)
docs/         → Architecture, design system, and database specs
.agent/       → Antigravity agent workflows
```

## Tech Stack

### Backend
- **Language:** Go 1.24+
- **Router:** Chi v5 (`go-chi/chi/v5`)
- **Database:** PostgreSQL 16+ via pgx v5 (connection pool)
- **Extensions:** pgvector (AI embeddings), PostGIS (geospatial)
- **Messaging:** NATS JetStream (event bus, embedded or external)
- **Auth:** JWT (Keycloak-ready via JWKS)
- **PDF:** maroto | **Excel:** excelize | **Cron:** robfig/cron v3

### Frontend
- **Framework:** Lit 3 Web Components + TypeScript 5.9 + Vite 7
- **Styling:** Tailwind CSS 3.4 + custom design tokens
- **Components:** Custom `gable-*` web components (Light DOM for Tailwind compatibility)
- **Routing:** Custom SPA router (singleton service with popstate/pushState)
- **Animation:** CSS transitions/animations (defined in tailwind.config.js)
- **Charts:** Chart.js 4 | **Maps:** Vanilla Leaflet | **Icons:** Lucide (vanilla SVG)

## Architecture
- **Pattern:** Modular monolith — single Go binary, strictly decoupled internal modules
- **Modules:** Inventory, Sales, Finance, Logistics, PIM (AI), Purchasing, Configurator
- **Inter-module reads:** Synchronous Go interfaces
- **Inter-module writes:** Async events via NATS (`sales.order.confirmed`, etc.)
- **API:** REST JSON at `/api/v1/*`

## Key Conventions

### Database
- All PKs are UUID v4 (`gen_random_uuid()`)
- Physical quantities: `DECIMAL(19,4)` — never float
- Money: stored in **cents** (integer) in application code, `DECIMAL(19,4)` in DB
- Inventory uses **double-entry** moves (from_location → to_location)
- Every quantity paired with a UOM ID

### Backend Code
- Config via env vars with `godotenv` fallback (see `backend/internal/config/config.go`)
- Default DB: `postgres://gable_user:gable_password@localhost:5434/gable_db?sslmode=disable`
- Migrations in `backend/migrations/` (plain SQL, numbered)
- AI API keys resolved dynamically via `KeyStore` (DB-first, env fallback, 30s TTL cache)
- Server entry point: `backend/cmd/server/main.go`

### Frontend Code
- App routes: `/erp/*` (ERP desktop), `/portal/*` (B2B dealer portal), `/driver/*` (mobile), `/yard/*` (warehouse), `/pos` (point of sale)
- Layout shells: `<gable-app-shell>` (ERP), `<gable-portal-layout>` (portal), `<gable-driver-layout>`, `<gable-yard-layout>`
- All custom elements use `gable-` prefix and Light DOM (`createRenderRoot() { return this; }`)
- State: `@state()` for internal, `@property()` for external; services are framework-agnostic singletons
- Routing: `router.navigate(path)` via singleton; route params as `@property({ attribute: 'route-id' })`
- Toast notifications: `ToastService.show(message, type)` singleton
- Icons: `icon(LucideIcon, size, classes)` helper from `lib/icons.ts`
- Design tokens defined in `tailwind.config.js` — never hardcode colors

### Design System (Quick Ref)
| Token | Hex | Usage |
|-------|-----|-------|
| Gable Green | `#00FFA3` | Primary actions, success, active glow |
| Deep Space | `#0A0B10` | Global background |
| Slate Steel | `#161821` | Cards, sidebar, modals |
| Safety Red | `#F43F5E` | Errors, stockouts, credit hold |
| Blueprint Blue | `#38BDF8` | Technical data, links |

- **Body font:** Inter (400, 500, 600)
- **Data font:** JetBrains Mono (all numbers, SKUs, prices, dimensions)
- **Theme:** Industrial Dark — high contrast, data-dense, zero clutter

## Running Locally
```bash
# Backend
cd backend
DATABASE_URL="postgres://gable_user:gable_password@localhost:5434/gable_db?sslmode=disable" go run ./cmd/server

# Frontend
cd app
npm install
npm run dev
```

## Detailed Specs
See `docs/` for full architecture, design system, and database ERD documentation.
