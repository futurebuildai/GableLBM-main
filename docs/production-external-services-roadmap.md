# Production External-Services Roadmap (downstream managed/core repo)

**Status:** Planning / decision-capture (no code — forward-looking)
**Applies to:** the future, more production-oriented **core repo** (separate from this
open `community` repo)
**Companion doc:** [`oss-migration-plan.md`](./oss-migration-plan.md) — the community-repo
implementation this builds on
**Last updated:** 2026-06-18

---

## Purpose

The community/demo repo deliberately takes the **fastest open path**: managed OpenRouter for
AI and managed OpenRouteService (ORS) for routing/geocoding, each behind one maintainer-issued
key, set at runtime. That's the right call for a fork-ready, low-ops, demo-facing trunk.

The downstream **managed production core repo** has different constraints — real LBM dispatch
volume, multi-truck routes, customer PII in scanned documents, SLA/uptime, cost control, and
data residency. This doc captures the **more robust decisions** to make there, the trade-offs,
and a recommendation for each, so the production repo starts from an evidence-based position
rather than re-deriving it.

**Design intent:** the community implementation is built so that production hardening is mostly
a **config/base-URL swap, not a rewrite.** One thin OpenAI-compatible AI client (base URL +
key) and one ORS-shaped routing client (base URL + key) mean "point at a self-hosted endpoint"
is the migration. Keep it that way.

---

## 1. Routing & geocoding — the headline production decision

### 1.1 Why the managed free tier doesn't survive to production

| Constraint (managed ORS free/Standard tier) | Production impact |
|---|---|
| **Optimization (VROOM) capped at 3 vehicles / 50 jobs** per request | Hard blocker for multi-truck dispatch (a yard running >3 delivery trucks/run can't optimize the fleet in one call). |
| Per-endpoint **daily + per-minute quotas** (e.g. ~2k/day directions on FAQ; dashboard varies) | Real dispatch + per-stop ETA refresh + geocoding-on-create blows the free tier quickly. |
| **No per-request cost / shared global limits** | Can't buy predictable headroom by adding keys; capacity is account-global. |
| **CC-BY attribution required on every UI surface**; ODbL underneath | Operationally fine, but must be enforced product-wide. |
| **Data egress** — every address geocoded and every route leaves your infra | Customer PII (delivery addresses) sent to a third party; may be unacceptable for some dealers/contracts. |

→ Production realistically needs a **paid HeiGIT plan** or, more likely for a managed core,
**self-hosting** the stack.

### 1.2 The single most consequential fact

> ORS's hosted **geocoder (Pelias)** and **optimization (VROOM)** are **HeiGIT "public API"
> services — NOT part of the self-hostable openrouteservice routing engine.** The ORS docs
> state the geocoder *"is not available when running an own instance of openrouteservice."*

So "self-host ORS" is really **three** separate deployments:
1. **Routing engine** (directions + matrix) — the ORS Docker image (or an alternative engine).
2. **Geocoder** — a separate **Pelias** stack (or Nominatim/Photon).
3. **Optimizer** — a separate **VROOM** (`vroom-express`) service pointed at the routing matrix.

### 1.3 Routing-engine options

| Engine | Strengths | Weaknesses | Truck (HGV) support |
|---|---|---|---|
| **Self-hosted ORS** | Same API as community managed → near-zero client change; matrix + isochrones; HGV profile with dimension restrictions | Heavier Java service; graph build RAM/disk; no bundled geocoder/optimizer | ✅ `driving-hgv` + dimension restrictions in **directions** |
| **OSRM** | Extremely fast; simple; `/trip` (TSP) ≈ `optimize:true`, `/table` (matrix) | No native truck-dimension routing; custom profiles are Lua + full re-extract; no live traffic | ⚠️ via custom profile only |
| **Valhalla** | Tiled routing, matrix, isochrones, **`optimized_route`**, elevation, good truck `costing=truck` with dimension params | More moving parts; tile build | ✅ strong truck costing |
| **GraphHopper** | Good routing + matrix; mature; commercial VRP optimizer | Best optimization is paid/commercial; open core is routing+matrix | ✅ truck profiles |

**Lean recommendation:** **Valhalla** for the routing engine (best open truck-dimension costing
+ built-in matrix/optimized-route/isochrones in one service), **or** self-hosted **ORS** if
minimizing client divergence from the community repo outweighs Valhalla's feature set. Decide
against a real US-region extract benchmark (below).

### 1.4 Geocoder options

| Geocoder | Strengths | Weaknesses |
|---|---|---|
| **Pelias** | Same API/response shape as community ORS geocoding (structured US address search, confidence scores); multi-source (OSM + OpenAddresses + WOF + GeoNames) | Largest to operate (Elasticsearch + multiple importers); heaviest data pipeline |
| **Nominatim** | Canonical OSM geocoder; well-documented Docker; good for precise address → point | Heavier on free-text; rate-sensitive; OSM-only coverage |
| **Photon** | Fast type-ahead/autocomplete; light; OSM-based | Less precise for full structured US addresses; OSM-only |

**Lean recommendation:** **Pelias** (keeps the community geocoding client shape; best US
structured-address quality), with **Photon** as a lightweight autocomplete layer if the
dispatch UI wants type-ahead. Nominatim is the fallback if Pelias ops cost is too high.

### 1.5 Optimizer (multi-truck VRP)

- Self-host **VROOM** + `vroom-express`, pointed at the routing engine's matrix. Removes the
  3-vehicle cap and unlocks real fleet VRP (capacities, skills, time windows, multi-depot).
- **Truck-dimension-aware optimization caveat:** hosted VROOM (and a naive self-host) optimizes
  on the routing *profile graph* but does **not** enforce per-vehicle dimension restrictions
  during optimization. For strict dimension-aware fleet optimization, feed VROOM a **custom
  matrix** computed by a dimension-aware engine (Valhalla truck costing / ORS HGV) rather than
  letting it use a generic profile.

### 1.6 Topology & ops (to specify in the production repo)

- **Hub-hosted shared services** (one Valhalla + Pelias + VROOM cluster the maintainer runs,
  spokes call it) **vs. per-spoke** deployment. Hub keeps PII flowing to maintainer infra
  (clear data-processing terms needed); per-spoke keeps data local but multiplies ops.
- **OSM data pipeline:** region extract (`.pbf`) sourcing, graph/tile build sizing (RAM/disk for
  a US or per-region extract), and **update cadence** (monthly OSM refresh).
- **Zero-downtime graph rebuilds:** dual-instance / blue-green so a rebuild doesn't drop
  routing.
- **Geocode caching:** cache `address → (lat,lng,confidence)` in `system`/a geocode table so
  repeat addresses don't re-hit the geocoder; invalidate on address edit.
- **Attribution & licensing at scale:** CC-BY string product-wide; confirm commercial terms;
  ODbL share-alike only triggers if you distribute a derived *database*, not from using results.

### 1.7 Decision checklist (routing)
- [ ] Engine: Valhalla vs self-hosted ORS (benchmark on a real region extract).
- [ ] Geocoder: Pelias vs Nominatim (+ Photon for autocomplete?).
- [ ] Optimizer: self-host VROOM; dimension-aware matrix source.
- [ ] Topology: hub-shared vs per-spoke (drives the PII/data-processing story).
- [ ] Data refresh cadence + zero-downtime rebuild strategy.
- [ ] Geocode cache table + invalidation.

---

## 2. AI layer — production hardening

The community repo runs everything through one OpenRouter key. For production:

### 2.1 Hosting options

| Option | When it fits | Trade-offs |
|---|---|---|
| **OpenRouter (managed), production plan** | Fastest; broad model choice; per-request `usage.cost` for billing; no GPU ops | Customer-document content (freight invoices, material lists with names/addresses) leaves infra; per-token cost; provider routing opacity |
| **Self-hosted OpenAI-compatible gateway** (vLLM / LiteLLM proxy / Ollama) | Data residency, fixed cost at volume, model pinning | GPU capacity + ops; you own model availability/scaling; lose OpenRouter extras (`file-parser`, `modalities` image-out, `usage.cost`, provider routing) |
| **Hybrid via LiteLLM** | Route cheap/bulk calls to self-hosted OSS, hard OCR/vision to a managed VLM | One more component to run; routing policy to maintain |

Because the community client is **OpenAI-compatible and base-URL-swappable**, all three are a
config change — *except* the OpenRouter-only extensions (`plugins` file-parser for PDFs,
`modalities:["image"]` for FLUX, `usage.cost`). **Gate those behind the OpenRouter base URL** so
a self-hosted target degrades gracefully (e.g. self-host its own OCR/PDF + image-gen path).

### 2.2 Production concerns to specify
- **Data residency / PII:** freight invoices and material lists contain customer names,
  addresses, pricing. Decide per-tenant whether documents may transit a third-party model;
  offer a self-hosted inference option for dealers that require it.
- **Metering / billing:** the dormant **Maestro/Brain** gateway hook (`ai.Client.WithMaestro`,
  currently dead) is the natural place to meter and bill AI usage per org; OpenRouter's
  `usage.cost` gives authoritative per-call spend for attribution.
- **Model pinning + eval harness:** pin slugs (not floating versions) and add a small eval set
  for the OCR/extraction tasks so a model swap is regression-tested before rollout.
- **Image generation:** confirm FLUX licensing for commercial product imagery, or self-host
  SDXL/FLUX behind the same OpenAI-style image path.
- **Fallback chain:** managed → self-hosted → rule-based (preserve the community
  graceful-degradation matrix at scale).

### 2.3 Decision checklist (AI)
- [ ] Managed OpenRouter vs self-hosted gateway vs hybrid (per-tenant data-residency policy).
- [ ] Metering path (Maestro/Brain vs direct `usage.cost` ledger).
- [ ] Pinned slugs + eval harness for extraction tasks.
- [ ] Self-hosted PDF/OCR + image-gen path for the non-OpenRouter base URL.

---

## 3. Other services at production grade

| Service | Community state | Production decision to make |
|---|---|---|
| **Email** | log-only stub | SMTP relay (self-host Postfix) vs SES/managed; deliverability, DKIM/SPF, bounce handling. |
| **SMS** | Twilio (optional) | No OSS carrier exists — pick a provider behind the existing `SMSService` interface; consider per-region providers. |
| **Payments** | Run Payments (optional) | PCI scope is the driver; processor choice is a compliance decision, kept behind `PaymentGateway`. |
| **Sales tax** | Avalara (optional) / branch-rate fallback | Avalara/TaxJar for compliance-grade filing vs maintained internal rate tables; jurisdiction coverage requirement. |

None of these are "open vs proprietary" in the way AI/maps are — SMS, card processing, and tax
compliance need a commercial counterparty. The production decision is *provider + compliance*,
not *open-source replacement*. Keep them behind their existing interfaces.

---

## 4. Relationship to the community repo (keep the swap cheap)

The community implementation should preserve these seams so production is config, not rewrite:

1. **AI:** one OpenAI-compatible client; provider = `base_url` + `api_key`. Don't leak
   OpenRouter-only request fields into the core call path — keep them behind a capability flag
   tied to the base URL.
2. **Routing:** one ORS-shaped client; engine = `base_url` + `api_key`. Self-hosted ORS uses the
   identical `/v2/directions` + `/v2/matrix` shape (drop the key); Valhalla would need a thin
   adapter — note that divergence when choosing the engine.
3. **Geocoding:** keep the `Geocode(address) → (lat,lng,confidence)` interface narrow so Pelias
   (community + self-host) or Nominatim/Photon are drop-in.
4. **Caching & schema:** the `locations.latitude/longitude` columns and a geocode cache added in
   the community repo carry straight into production.

---

## 5. Open questions to resolve in the production repo

- Hub-shared vs per-spoke hosting for routing/geocoding/AI (the central PII + ops decision).
- Region coverage (US-only first? per-region OSM extracts?) and refresh cadence.
- Per-tenant data-residency tiers for AI document processing.
- Fleet size assumptions (drives VROOM sizing + whether the 3-vehicle managed cap is ever
  acceptable as a fallback).
- Billing model for maintainer-provided keys/services (flat vs metered via `usage.cost`).

---

*This is a decision-capture doc, not an implementation plan. Sizing benchmarks (graph/tile
build RAM/disk, geocoder import time, GPU capacity for self-hosted inference) should be run and
recorded here before the production repo commits to a stack.*
