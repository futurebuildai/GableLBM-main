# INTEGRATIONS.md — Third-Party & Cross-Service Integrations

How GableLBM exchanges data with other systems — both **inside the FutureBuild ecosystem**
(AI_LM, the Brain) and with **true third parties** (co-op EDI, legacy ERPs). This is the
contract surface; keep it in sync with `backend/internal/integrations/handler.go` and the
A2A wiring in `backend/cmd/server/main.go`.

## Integration surfaces at a glance

| Surface | Prefix | Auth | Direction | Consumer |
|---|---|---|---|---|
| Service integration API | `/api/integration/*` | `X-Integration-Key` header | read + write-back | **AI_LM** (ecosystem) |
| Agent-to-agent (A2A) | `/api/v1/a2a/*` | JWS-signed envelopes | bidirectional | **FutureBuild Brain** (ecosystem) |
| B2B dealer portal | `/api/portal/v1/*` | portal JWT | read + write | partner dealers |
| EDI / co-op | `internal/edi` | ANSI X12 files | import/export | **true 3p** co-ops |
| Legacy ERP adaptors | `internal/*/adaptors` | per-vendor | migration sync | **true 3p** (BisTrack, Spruce, Agility) |

---

## 1. Service Integration API (`/api/integration/*`) — the AI_LM contract

The **primary ecosystem integration**. AI_LM (AI Load Management & Compliance) is a
standalone microservice that treats GableLBM as its source of truth. Every route is gated
by the `X-Integration-Key` header (validated in `integrations/handler.go` →
`authMiddleware`); the key is the backend's `INTEGRATION_API_KEY` env var, set on the
consumer as `GABLE_INTEGRATION_KEY`. These paths are on the no-auth (no-JWT) whitelist in
`main.go` because they authenticate via the integration key instead.

### Registered routes (`handler.go:48-57`)

| Method | Path | Purpose |
|---|---|---|
| `GET` | `/api/integration/products` | Catalog pull with weight **and 3D geometry** |
| `POST` | `/api/integration/quotes/bulk-price` | Price a basket of lines |
| `POST` | `/api/integration/quotes` | Create a quote |
| `POST` | `/api/integration/quotes/{id}/accept-and-convert` | Accept quote → order |
| `GET` | `/api/integration/vehicles` | Fleet (id, name, type, capacity, make/model/year) |
| `GET` | `/api/integration/drivers` | Drivers for route write-back |
| `GET` | `/api/integration/orders` | Orders + line items + delivery geo |
| `POST` | `/api/integration/delivery-routes` | Write-back of an approved route plan |

### `GET /api/integration/products` — catalog + geometry

Query params (both optional):
- `category` — filter by product category.
- `q` — free-text SKU/description search.

**Filtering behavior (important):** with **either** filter present the result is a small
typeahead-style list (`LIMIT 20`). With **no filter at all** (`category` and `q` both
empty) it returns a **bulk catalog pull** (`LIMIT 1000`) — this is what AI_LM uses to
hydrate its entire load-planning catalog in a single call. An empty `?q=` still counts as
"no filter" (Go's `Query().Get("q")` returns `""`). Prior to commit `b5170de` the endpoint
required a filter and returned `400`; that guard was removed precisely so AI_LM's
unfiltered pull works.

Each row (`ProductResponse`):

```json
{
  "sku": "LUM-21216-NO2",
  "description": "2x12x16 Hem-Fir No.2",
  "category": "Lumber",
  "uom_primary": "EA",
  "base_price": 54.0,
  "weight_lbs": 54,
  "length_in": 192.0,
  "width_in": 11.25,
  "height_in": 1.5,
  "stackable": true,
  "geometry_source": "parametric"
}
```

`length_in` / `width_in` / `height_in` are **nullable** — `null` means "no geometry set in
the PIM yet", and AI_LM flags the item (FALLBACK) rather than rendering a zero-size box.
`geometry_source` defaults to `parametric`; it is the forward-compat seam for a future
`mesh` value. See CLAUDE.md "Product Geometry & the AI_LM Digital Twin".

### Geometry resolution (owned by AI_LM)

AI_LM merges this payload with its own optional per-product overrides and resolves the
winning geometry as **OVERRIDE → PIM → FALLBACK**. GableLBM stays canonical; AI_LM stays
portable. The shared render contract is **1 inch = 1/12 Three.js world unit**.

### `POST /api/integration/delivery-routes` — write-back

AI_LM posts an approved plan back: `{ vehicle_id, driver_id, scheduled_date,
stops[]{order_id, sequence, lat, lng} }`. Idempotent on `(vehicle_id, scheduled_date)`.

### Replacing GableLBM as the backend

Any ERP that satisfies the four read endpoints + the write-back can host AI_LM unchanged —
that is the deliberate licensing seam.

---

## 2. Agent-to-Agent (`/api/v1/a2a/*`) — the Brain

GableLBM exposes a JWS-signed agent-to-agent surface for the proprietary **FutureBuild
Brain** (Maestro intents, federated governance). Envelopes are signed/verified rather than
bearer-authenticated. This is an ecosystem integration; see `backend/cmd/server/main.go`
for the whitelist and the `a2a` wiring.

---

## 3. B2B Dealer Portal (`/api/portal/v1/*`)

Partner-facing surface for dealer accounts (orders, AR, catalog). Authenticated with a
portal-scoped JWT, partially public (login/config). Money on this surface is **float
dollars**, unlike the ERP's int64 cents — see CLAUDE.md "Money convention".

---

## 4. EDI & Co-Op (true third parties)

`internal/edi` handles ANSI X12 import/export and cooperative mappers (purchasing co-ops,
rebate ledgers). Internal event distribution rides `pkg/eventbus` (NATS JetStream when
`NATS_URL` is set, in-process fallback otherwise) — not an external integration surface,
but the substrate co-op event flows will build on.

---

## 5. Legacy ERP Adaptors (migration)

Each core module reserves an `adaptors/` directory for bi-directional mappers against
legacy systems being migrated off: **Epicor BisTrack** (REST), **ECI Spruce** (SOAP/XML),
**DMSi Agility** (REST). A semantic mapping layer translates legacy terms into GableLBM
models during phase-in.

---

## Auth quick reference

| Surface | Mechanism | Where |
|---|---|---|
| `/api/integration/*` | `X-Integration-Key` == `INTEGRATION_API_KEY` | `integrations/handler.go` |
| `/api/v1/a2a/*` | JWS-signed envelopes | `main.go` a2a wiring |
| `/api/portal/v1/*` | portal JWT | `internal/portal` |
| `/api/v1/*` (ERP) | JWKS-verified JWT (`AUTH_MODE=dev` bypass on demo/staging) | `pkg/middleware` |
