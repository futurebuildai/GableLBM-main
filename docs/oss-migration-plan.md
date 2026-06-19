# OSS Migration Plan — Single-Key AI (OpenRouter) + Open Routing (OpenRouteService)

**Status:** Proposed (planning only — no code written yet)
**Target branch / repo:** `community` (the open, fork-ready, demo-facing repo)
**Audience:** maintainers
**Last updated:** 2026-06-18

> A separate, more production-grade decision (self-hosted routing/geocoding, AI hosting at
> scale, data residency) is deliberately **out of scope here** and lives in
> [`production-external-services-roadmap.md`](./production-external-services-roadmap.md).
> This document is the concrete, file-by-file plan for the community repo.

---

## 1. Goal & decisions

Replace the proprietary external-service layer with open/OSS-friendly options so that an LBM
dealer operating a spoke can plug in **one all-in-one AI key the maintainer provides**, with
no per-provider configuration.

| Area | Today | Target (community repo) | Decision |
|---|---|---|---|
| AI (text + vision OCR + image gen) | Anthropic Claude + Google Gemini + Stability AI, three direct REST clients, two keystores | **One OpenRouter key**, one OpenAI-compatible client, an intelligence/model router that picks the OSS model per task | ✅ confirmed |
| Product image generation | Gemini primary / Stability fallback | **FLUX via OpenRouter** (`black-forest-labs/flux.2-*`) through the same key | ✅ confirmed (OpenRouter runs FLUX through `/chat/completions`) |
| Delivery routing / optimization / ETA | Google Maps Directions (`optimize:true`) | **OpenRouteService** managed key (directions + VROOM optimization) | ✅ confirmed for community repo |
| Geocoding (address → lat/lng) | **Mock** (byte-math on order UUID, hardcoded to San Francisco) | **OpenRouteService / Pelias** geocoding (real) | ✅ new capability |
| Map tiles (frontend) | OpenStreetMap + Leaflet | unchanged — already open, no key | ✅ no work |

**Single-key principle:** the maintainer issues each spoke (a) one `openrouter_api_key` and
(b) one `openrouteservice_api_key`. Both are set per-environment through the Tech Admin UI
(written to `system_settings`), exactly as the Anthropic key is set today — there is no
manifest/secret to edit (verified: `.do/app-*.yaml`, `docker-compose.yml` reference **none**
of these keys today).

---

## 2. Current-state inventory (verified)

### AI consumers (the things that must keep working)

| Module | Entry point | What it does | Unconfigured-key behavior **(must preserve)** |
|---|---|---|---|
| `parsing` | `ai.Client.ExtractMaterialList` (image/pdf/text/csv) | OCR a material list → quote lines | **Silent fallback** to rule-based list (`parsing/service.go:30-37`) — never a hard error |
| `purchase_order` | `ai.Client.ExtractFreightInvoice` (image/pdf) | OCR a freight invoice → carrier/total/# | **Hard 400** "enter the freight total manually" (`purchase_order/service.go:607-609`) |
| `pim` (text ×4) | `TextAIClient.Generate` | descriptions, SEO, SVG fallback, collateral | **Hard error** per call-site (`pim/service.go:159,252,337,460`) |
| `pim` (image) | `GeminiImageClient.Generate` / `ImageAIClient` | product hero image | Gemini → Claude-SVG fallback → hard error |
| `techadmin` | holds both keystores, 6 admin endpoints | runtime key management UI | — |

There are **two duplicate Anthropic clients**: the shared `ai/claude.go` (multimodal) and
PIM's own `pim/ai_client.go` `TextAIClient` (text-only). Both hardcode
`https://api.anthropic.com/v1/messages` + `anthropic-version: 2023-06-01`.

**Dead code (safe to ignore / remove):** the FB-Brain "Maestro" AI gateway —
`ai.Client.WithMaestro` has **zero call-sites**, `maestroClient` is built then discarded
(`main.go:593-594` `_ = maestroClient`), and `ai.ContextWithJWT` is never called. The Brain
*notifier* + *A2A receiver* (`main.go:597-612`) are financial/webhook, **not** LLM — leave
them untouched.

**Test coverage:** none. No `*_test.go` exercises any AI client, `MapsClient`, or
`OptimizeRoute`. The JSON-fence-strip / multimodal / fallback behaviors we are about to change
have **no test guarding them** — so this plan adds the first tests for them (§8).

### Routing consumer

`delivery` is the only map/geocode consumer. `LatLng`, `OptimizeRoute`,
`RouteOptimizationResult`, and all Google references live in `delivery/{maps,service,handler}.go`
+ `config.go` + `main.go`. **The frontend never calls `/optimize`** (no `optimizeRoute` in
`deliveryService.ts`), so the wire contract is internally flexible — only the *persisted*
reorder side-effect and the `Delivery.latitude/longitude` fields are load-bearing for the map.

---

## PART 1 — AI layer → single OpenRouter key

### 1.1 Target architecture

```
                ┌─────────────────────────────────────────────┐
                │  ai.Client  (one OpenAI-compatible client)   │
   parsing ───▶ │  base = openrouter_base_url                  │
   purchase  ─▶ │  key  = openrouter_api_key   (KeyStore)      │ ──▶ OpenRouter
   pim ───────▶ │  model = ModelRouter.Resolve(task)           │     /chat/completions
                │   • Generate(text)      → ai.model.text       │     (text, vision, FLUX)
                │   • ExtractFromFile()   → ai.model.vision     │
                │   • GenerateImage()     → ai.model.image      │
                └─────────────────────────────────────────────┘
```

One client, one key, one base URL (config-swappable to a self-hosted vLLM/Ollama/LiteLLM
endpoint). A **ModelRouter** maps each task to a model slug, overridable at runtime via
`system_settings` so the maintainer can re-tune models without a redeploy or code change.

**Why this is clean:** OpenRouter is OpenAI-compatible — one `POST /chat/completions` handles
text, base64 images (`image_url` blocks), PDFs (`file` blocks + `file-parser` plugin), **and**
FLUX image generation (`modalities:["image"]`, image returned as a base64 data-URI in
`message.images[]`). So all three of today's providers collapse into one endpoint shape.

### 1.2 Config + `system_settings` keys

**`backend/internal/config/config.go`** — add (keep the old fields for one release for
back-compat, then remove in cleanup §1.12):

```go
// OpenRouter (unified AI)
OpenRouterAPIKey   string // OPENROUTER_API_KEY  (env fallback; primary source is system_settings)
OpenRouterBaseURL  string // OPENROUTER_BASE_URL (default "https://openrouter.ai/api/v1")
AIModelText        string // AI_MODEL_TEXT   (default e.g. "deepseek/deepseek-chat")
AIModelVision      string // AI_MODEL_VISION (default e.g. "qwen/qwen3-vl")
AIModelCheap       string // AI_MODEL_CHEAP  (default e.g. "meta-llama/llama-3.1-8b-instruct")
AIModelImage       string // AI_MODEL_IMAGE  (default e.g. "black-forest-labs/flux.2-flex")
```

**`system_settings` keys** (key/value text table — **no migration needed**, `KeyStore.Set`
upserts by key):

| Key | Purpose | Notes |
|---|---|---|
| `openrouter_api_key` | the one AI secret | replaces `anthropic_api_key` + `gemini_api_key` |
| `openrouter_base_url` | optional override | needs a **second** KeyStore — `KeyStore` is single-valued (see §1.8) |
| `ai.model.text` / `.vision` / `.cheap` / `.image` | runtime model overrides | optional; fall back to config defaults |

> **Model slugs are the volatile part.** OpenRouter's catalog churns; every slug above is a
> *starting suggestion to verify* against `GET https://openrouter.ai/api/v1/models` (filter
> `?input_modalities=image` for vision/image) before pinning. The endpoint shapes and headers
> are stable; the names move. See Appendix A.

### 1.3 New unified client — `backend/internal/ai/openrouter.go`

Refactor the `ai` package so `ai.Client` targets OpenRouter while **keeping its public method
signatures** (`NewClientWithKeyStore`, `IsConfigured`, `ExtractMaterialList`,
`ExtractFreightInvoice`, `WithMaestro`) so the `parsing` and `purchase_order` injection sites
don't change. Internally:

- Add fields: `baseURLStore *KeyStore`, `models ModelRouter`.
- One private `chatCompletion(ctx, model, payload) (*chatResponse, error)` doing
  `POST {base}/chat/completions` with `Authorization: Bearer <key>`, OpenAI request/response
  structs, optional `HTTP-Referer` + `X-Title` headers, and reads `usage.cost` for logging.
- **Response extraction changes:** OpenAI shape puts text at `choices[0].message.content`
  (Anthropic was `content[0].text`). The fence-strip helper (today duplicated at
  `ai/claude.go:255-266` and `pim/ai_client.go:138-148`) moves to **one** shared
  `stripJSONFence(string) string` — this is a **load-bearing, currently-untested invariant**
  (critique Risk #1); add tests.
- Add a new public method PIM will use:
  `Generate(ctx, system, user string, maxTokens int) (text, model string, err error)` —
  preserves PIM's existing `(text, model, error)` 3-tuple contract.
- Add `GenerateImage(ctx, prompt, style string) (dataURI, model string, err error)` —
  `modalities:["image"]`, model = `ai.model.image` (FLUX); reads
  `choices[0].message.images[0].image_url.url` (base64 data-URI), which is exactly the
  `data:image/...;base64,...` shape PIM persists today.

### 1.4 Multimodal translation (Anthropic blocks → OpenAI blocks)

`ExtractMaterialList` and `ExtractFreightInvoice` (`ai/claude.go:151-430`) are rewritten to
emit OpenAI content blocks instead of Anthropic ones — the content-type branching and the
`"unsupported content type"` errors must map exactly:

| Input | Today (Anthropic) | OpenRouter (OpenAI shape) |
|---|---|---|
| `image/*` | `{type:"image", source:{base64}}` | `{type:"image_url", image_url:{url:"data:image/…;base64,…"}}` |
| `application/pdf` | `{type:"document", source:{base64}}` | `{type:"file", file:{filename, file_data:"data:application/pdf;base64,…"}}` + top-level `plugins:[{id:"file-parser", pdf:{engine:"mistral-ocr"}}]` |
| `text/plain`,`text/csv` | `{type:"text"}` | `{type:"text"}` (unchanged) |

Pair extraction calls with `response_format: {type:"json_schema", strict:true, …}` to drop the
brittle text-JSON parsing — **optionally**; the lower-risk path keeps the fence-strip +
`json.Unmarshal` and just re-points the response extraction. Recommend: keep fence-strip for
v1 (smaller diff, no model-support assumptions), adopt `json_schema` as a fast-follow once a
model is chosen. (Set `provider:{require_parameters:true}` if you do, so OpenRouter doesn't
silently route to a model that ignores the schema.)

> **Verify at impl time (critique):** the PDF `file`-block + `file-parser` mechanism is the
> highest-risk assertion — the freight-invoice path depends on PDFs working. Smoke-test a
> scanned PDF through the chosen vision slug before committing.

### 1.5 Collapse the PIM duplicate client

Delete `TextAIClient`, `ImageAIClient`, `GeminiImageClient` from
`backend/internal/pim/ai_client.go` (the whole file can go). PIM instead takes a single
`*ai.Client` (or a narrow `pim.AIClient` interface implemented by it) via a `WithAI(*ai.Client)`
setter. Re-point the call-sites:

| PIM call-site | Today | After |
|---|---|---|
| `GenerateDescriptions` `service.go:206` | `s.textAI.Generate(...)` | `s.ai.Generate(ctx, lumberSystemPrompt, user, 2048)` |
| `GenerateSEO` `service.go:281` | `s.textAI.Generate(...)` | `s.ai.Generate(...)` |
| `generateImageSVG` `service.go:425` | `s.textAI.Generate(svg…)` | `s.ai.Generate(...)` |
| `GenerateCollateral` `service.go:528` | `s.textAI.Generate(...)` | `s.ai.Generate(...)` |
| `generateImageGemini` `service.go:360` | `s.geminiAI.Generate(prompt,style)` | `s.ai.GenerateImage(ctx, prompt, style)` (FLUX) |

Notes / gotchas to carry over:
- The hardcoded `GenModel = "gemini-2.0-flash"` literal (`service.go:373`) is **wrong today**
  (the client model is actually `gemini-3.1-flash-image-preview`). Replace it with the `model`
  returned by `GenerateImage` (the real slug used).
- `service.go:325-356` `GenerateImage` dispatcher logic (dynamic key re-resolution +
  Gemini-then-SVG fallback) simplifies: FLUX via `s.ai.GenerateImage`; on failure fall back to
  `generateImageSVG` (still uses the text model). Preserve the "no AI configured" hard error.

### 1.6 KeyStore consolidation + base-URL storage (`techadmin` backend)

The TechAdmin **backend** handler (`backend/internal/techadmin/handler.go`) is a 6th importer
of `ai` and owns the admin key API. This is the **first** thing to settle because the frontend
depends on it.

- It holds `aiKeyStore` + `geminiKeyStore` (`handler.go:13-14`) and exposes
  `GET/PUT/DELETE /api/v1/admin/settings/ai` and `…/gemini` (`handler.go:45-50`).
- **Drop** the three `…/gemini` routes + `GetGeminiSettings`/`SaveGeminiSettings`/
  `DeleteGeminiSettings` (`handler.go:196-265`) and `WithGeminiKeyStore` (`:26-28`).
- **Base-URL gap:** `KeyStore` stores exactly **one** string per `settingKey` (`keystore.go`
  `Get`/`Set`/`Delete` are single-valued). To support an admin-editable base URL you need a
  **second** KeyStore (`openrouter_base_url`) wired into the handler, and the response struct
  must carry it. Extend `AISettingsResponse` (`handler.go:111-114`):

  ```go
  type AISettingsResponse struct {
      Configured bool   `json:"configured"`
      Source     string `json:"source"`
      KeyHint    string `json:"key_hint,omitempty"`
      BaseURL    string `json:"base_url,omitempty"` // NEW
  }
  ```
  `SaveAISettings` (`handler.go:152`) reads `{api_key}` only today — extend the body to
  `{api_key, base_url?}` and write the base URL to its KeyStore. **Without this the UI base-URL
  field is write-nothing** (critique Gap #1/#2).

### 1.7 Frontend Tech Admin UI consolidation

Collapse the two stacked provider panels into one "AI Provider" panel
(`app/src/pages/admin/tech_admin/TechAdminPage.ts`, `app/src/services/TechAdminService.ts`):

- **Service:** extend `AISettings` interface (`TechAdminService.ts:20-24`) with `base_url?`;
  change `saveAIKey` PUT body to `{api_key, base_url}` (`:71`); **delete** the entire Gemini
  service block (`:86-111`).
- **Component:** remove all 7 Gemini state fields (`:37-44`), `_loadGeminiSettings`
  (`:55`,`:152-161`), `_handleSaveGeminiKey`/`_handleDeleteGeminiKey` (`:163-190`), and
  `_renderGeminiSettingsPanel()` (`:468-553`); collapse the `space-y-10` render wrapper
  (`:684-689`) to the single panel; add an `aiNewBaseUrl` state + optional base-URL input in
  the key form (`:422-444`); update key placeholder `sk-ant-api03-…` → `sk-or-…` (`:432`);
  rename "Features Powered by Claude" → "Features Powered by AI" (`:451`).
- **Copy fix (pre-existing bug):** the panel advertises **"Blueprint Verification"** as
  Claude-powered (`:376-380`), but `internal/vision` is pure regex (no LLM) — drop the false
  "AI-powered" claim. Fold the Gemini "Product Image Generation" feature into the unified
  feature list (keeps the `ImageIcon` import meaningful).

### 1.8 `main.go` rewiring (exact)

| Line(s) | Today | After |
|---|---|---|
| `171` | `aiKeyStore := ai.NewKeyStore(db.Pool, "anthropic_api_key", cfg.AnthropicAPIKey)` | `aiKeyStore := ai.NewKeyStore(db.Pool, "openrouter_api_key", cfg.OpenRouterAPIKey)` |
| (new) | — | `aiBaseURLStore := ai.NewKeyStore(db.Pool, "openrouter_base_url", cfg.OpenRouterBaseURL)` |
| `172` | `claudeClient := ai.NewClientWithKeyStore(aiKeyStore)` | `aiClient := ai.NewClientWithKeyStore(aiKeyStore).WithBaseURLStore(aiBaseURLStore).WithModels(cfg)` |
| `185` | `geminiKeyStore := ai.NewKeyStore(…"gemini_api_key"…)` | **delete** |
| `194-210` | PIM `WithTextAI`/`WithGeminiKeyStore`/`WithGeminiAI`/`WithImageAI` block | `pimSvc.WithAI(aiClient)` (one line) |
| `180` | `parsing.NewService(productRepo, claudeClient)` | `parsing.NewService(productRepo, aiClient)` (rename only) |
| `323-324` | `poSvc.WithAIClient(claudeClient)` | `poSvc.WithAIClient(aiClient)` (rename only) |
| `511-516` | `techAdminHandler.WithAIKeyStore(aiKeyStore)` + `.WithGeminiKeyStore(geminiKeyStore)` | `.WithAIKeyStore(aiKeyStore)` + `.WithAIBaseURLStore(aiBaseURLStore)`; drop Gemini |
| `593-594` | dead `maestroClient` | leave as-is, or remove; if kept, preserve the `WithMaestro` hook on the new client |

All three text consumers (`parsing` ctor, `purchase_order.WithAIClient`, `pim.WithAI`) flip to
the **same** `aiClient` so the switch is atomic.

### 1.9 Preserve the graceful-degradation matrix (acceptance criteria)

Three call-sites share one keystore today but behave **oppositely** when AI is unconfigured.
The single-OpenRouter nil/empty-key gate must reproduce each — do **not** unify them:

- `parsing`: unconfigured / error → **silent** rule-based fallback (CLAUDE.md mandates "degrade
  gracefully"). A bare nil-check must not become a hard error.
- `purchase_order` freight: unconfigured → **hard 400** "enter the freight total manually".
- `pim`: all paths → **hard error**.

### 1.10 Cleanup / removals (after one back-compat release)

- Remove `AnthropicAPIKey`, `AnthropicModel`, `StabilityAPIKey`, `GeminiAPIKey` from config.
- Delete `backend/internal/ai/maestro_client.go` if Brain AI-gateway routing is abandoned (or
  keep the `WithMaestro` hook documented as the metered-routing extension point).
- Check/`update .do/README.md` if it documents the old `ANTHROPIC_API_KEY`/`GEMINI_API_KEY`.

### 1.11 AI phasing

| Phase | Work | Acceptance |
|---|---|---|
| **A1** | TechAdmin backend: single key + base-URL KeyStore, drop Gemini routes, extend response struct | `GET/PUT/DELETE /admin/settings/ai` round-trips key **and** base URL |
| **A2** | New `ai.Client` over OpenRouter (`chatCompletion`, `Generate`, multimodal translate, fence-strip, `GenerateImage`/FLUX) + first unit tests | text + image OCR + FLUX image all return through one key; tests green |
| **A3** | Collapse PIM duplicate (`pim.WithAI`), repoint 5 PIM call-sites, fix `gen_model` literal | PIM features work via OpenRouter; image = FLUX |
| **A4** | `main.go` rewiring + config fields + graceful-degradation matrix per call-site | one key drives parsing/PO/PIM; fallbacks verified per §1.9 |
| **A5** | Frontend single-panel UI | one AI panel, base-URL field prefills, Gemini panel gone |
| **A6** | Cleanup/removals (§1.10) | old provider env/keys removed; `go build ./...` + `npx tsc --noEmit` clean |

---

## PART 2 — Routing / maps / geocoding → OpenRouteService (community)

### 2.1 Target architecture

- **Directions / optimization:** ORS hosted API. The **VROOM `/optimization`** endpoint
  replaces Google's `optimize:true` **and** returns per-stop ETAs in one call (Google needed a
  separate step). One `openrouteservice_api_key`.
- **Geocoding:** ORS **Pelias** (`/geocode/search/structured` for clean US addresses) — this is
  **net-new** (today's geocoder is a fake), turning real `customers.address` and branch
  addresses into coordinates.
- **Tiles:** unchanged (OSM/Leaflet).

> **Coordinate-ordering gotcha:** ORS/VROOM/Pelias use `[lng, lat]` **everywhere** — the
> reverse of Google's `lat,lng`. This is the most common porting bug; centralize conversion.

### 2.2 Config + `system_settings`

`config.go`: add `ORSAPIKey` (`OPENROUTESERVICE_API_KEY`), `ORSBaseURL`
(`OPENROUTESERVICE_BASE_URL`, default `https://api.openrouteservice.org`),
`ORSProfile` (default `driving-hgv` — lumber trucks). `system_settings` key
`openrouteservice_api_key` (admin-settable, mirrors the AI key).

> **Auth quirk:** ORS POST endpoints (directions/matrix/optimization) take the key in the
> `Authorization` header **as the raw key, not `Bearer`**; GET endpoints (geocoding) take it as
> the `api_key` query param.

### 2.3 New ORS client — replace `backend/internal/delivery/maps.go`

Rewrite `MapsClient` → `ORSClient` (or keep the name to minimize churn), preserving the
**`RouteOptimizationResult` JSON shape exactly** (`maps.go:20-34`) — the TS mirror
(`app/src/types/notification.ts:36-48`) then needs **zero changes**.

- `OptimizeRoute(ctx, origin, stops)`:
  - `POST {base}/optimization` with one `vehicle` (`profile: driving-hgv`, `start`/`end` =
    branch origin) and one `job` per stop (`location:[lng,lat]`, optional `service`,
    `time_windows`).
  - Map response `routes[0].steps[]` (type `job`) → `OptimizedOrder` (visit order) + `Legs`
    (each step's `arrival` seconds → ETA RFC3339, cumulative `distance` m → miles). Surface
    `unassigned` jobs (capacity/time/skill violations) to dispatchers.
  - **Free-tier cap = 3 vehicles** — fine for single-truck routes; multi-truck dispatch beyond
    3 trucks/run is a known limit pushed to the production roadmap.
- Keep `MockOptimizeRoute` for the no-key path (unchanged).
- Optional enhancement: add a `Geometry` field (encoded polyline from `/v2/directions`) so the
  frontend can draw a **road-following** line instead of straight segments — net-new, not
  required for parity (today Google's `overview_polyline` is parsed-then-**discarded** at
  `maps.go:62-64`).

### 2.4 Geocoding — greenfield (the biggest under-scoped item)

There is **no real geocoder**; the only producer is byte-math in `AssignOrderToRoute`
(`service.go:310-329`) that ignores the address entirely.

- Add an `ORSClient.Geocode(ctx, address) (LatLng, confidence, err)` using
  `GET /geocode/search/structured` (`api_key` query param; response coords `[lng,lat]`).
- In `AssignOrderToRoute`, **replace the byte-math** with a real geocode of the order's
  delivery address. This needs a **new repo method** — `AssignOrderToRoute` currently only has
  `req.OrderID` and never loads the address. Add e.g. `GetOrderDeliveryAddress(orderID)`
  joining `orders → customers.address` (the join already exists in read queries at
  `repository.go:341,370-375`).
- Store `properties.confidence` / `match_type`; flag low-confidence matches for manual review
  rather than silently routing to a wrong point.
- Deliveries already persist `latitude`/`longitude` (`repository.go:324-333`, migration
  `021`) — reuse those columns.

### 2.5 Branch-origin schema migration (the one DB change strictly implied)

Route origin is **hardcoded to San Francisco twice** (`service.go:435` and the mock anchor
`:318-319`). Real origin = the **branch** of the route's orders.

- **New migration** (mirror `021_add_delivery_geolocation.sql`): add `latitude`/`longitude`
  `DOUBLE PRECISION` columns to `locations` (branches have `address/city/state/zip` from
  migration `057` but **no lat/lng** today).
- One-time geocode of each branch address (a seed/backfill step or admin action).
- Thread `branch_id` into the route/optimize path: resolve the route's origin from
  `orders.branch_id` → `locations` (precedent: `invoice.GetBranchTaxRate` resolves
  `locations.default_tax_rate` by branch). The `delivery` module touches neither `branch_id`
  nor `locations` today, so this is net-new wiring.

### 2.6 Fix the index-desync bug while swapping

`OptimizeRoute` silently drops deliveries with nil lat/lng from `stops`
(`service.go:426-430`), desyncing `OptimizedOrder` indices from the `deliveries` slice. Fix
during the swap (carry original indices or geocode-on-demand so no stop is dropped). Also
consider **persisting ETAs** — `result.Legs` are returned but never written;
`deliveries.estimated_arrival` exists (migration `032`) but is unset. VROOM gives per-stop
`arrival` for free — write it.

### 2.7 `main.go` + handler

- `main.go:443-449`: branch on `cfg.ORSAPIKey != ""` (or the `system_settings` key) instead of
  `GOOGLE_MAPS_API_KEY`; build the ORS client + `deliverySvc.WithMaps`.
- Handler `handler.go:296-313` (`POST /api/v1/delivery/routes/{id}/optimize`) is
  contract-preserving — no change. (The frontend still doesn't call it; add a
  `deliveryService.optimizeRoute()` method only if optimization should become user-triggered.)

### 2.8 Frontend + attribution

- `RouteMap.ts` already uses OSM tiles and reads `d.latitude/d.longitude`. **Required:** add the
  ORS/OSM attribution string to any view showing ORS-derived routes/geocodes:
  `© openrouteservice.org by HeiGIT | Map data © OpenStreetMap contributors` (ToS requirement;
  geocoding may also need OpenAddresses / GeoNames / Who's On First credit per the matched
  `properties.source`). Fix the default map center (`RouteMap.ts:66`, currently Portland) once
  real geocodes land.

### 2.9 Routing phasing

| Phase | Work | Acceptance |
|---|---|---|
| **R1** | ORS client (directions + `/optimization`), config/env, `main.go` branch | `/optimize` returns ORS-backed order+ETA; mock still works keyless |
| **R2** | `locations` lat/lng migration + branch geocode backfill + `branch_id` threading | route origin = real branch, not SF |
| **R3** | Pelias geocoding in `AssignOrderToRoute` + new address repo method; fix index-desync; persist ETAs | new deliveries get real coords from `customers.address` |
| **R4** | Frontend attribution + map-center fix (+ optional road polyline) | attribution shown; markers centered |

---

## PART 3 — Other proprietary services (disposition)

These are **already optional with graceful fallbacks** and don't block the open-source goal;
listed for completeness. Deeper production treatment → roadmap doc.

| Service | Vendor | Disposition (community repo) |
|---|---|---|
| Email | `LogEmailService` stub only | Not locked in — no proprietary dep. Implement plain SMTP when needed (backlog). |
| SMS | Twilio (optional, logs if unset) | No true OSS carrier exists; keep the `SMSService` interface, leave provider to operator. |
| Payments | Run Payments (optional, cash/check fallback) | PCI processing can't be "open"; keep the `PaymentGateway` interface. |
| Sales tax | Avalara (optional, branch-rate/0% fallback) | Replaceable by the existing `locations.default_tax_rate` tables — no external dep required. |
| FB Brain / Maestro | internal, disabled by default | AI path is dead code; notifier/A2A are financial/webhook — untouched. |

---

## 4. Risks & invariants to preserve (from the completeness critique)

1. **JSON fence-strip is load-bearing and untested** — response extraction moves from
   `content[0].text` (Anthropic) to `choices[0].message.content` (OpenAI); preserve the strip
   on the new shape or every JSON call-site breaks silently. *Add tests.*
2. **Three different unconfigured-key behaviors** must be reproduced per call-site (§1.9).
3. **Multimodal block translation** (image→`image_url`, pdf→`file`+plugin) is a real rewrite,
   not a find-replace; re-map the `"unsupported content type"` errors exactly.
4. **`[lng,lat]` ordering** in all ORS/VROOM/Pelias calls (reverse of Google).
5. **Index-desync** when stops lack coords; **ETAs never persisted** today.
6. **Geocoding is greenfield** — `AssignOrderToRoute` doesn't even load the address yet.
7. **Maestro/Brain AI path is dead** — safe to ignore; if revived later, keep the `WithMaestro`
   hook.
8. **PDF-on-OpenRouter** and **FLUX response shape** are the two highest-risk technical
   assertions — smoke-test before committing (§1.4, §1.5).

## 5. Verify-at-impl-time checklist

- [ ] Pin model slugs against live `GET /api/v1/models` (Appendix A).
- [ ] Scanned-PDF freight invoice → JSON via chosen vision slug + `file-parser`/`mistral-ocr`.
- [ ] FLUX returns `choices[0].message.images[0].image_url.url` as a `data:image/png;base64,…`
      URI that PIM can persist unchanged.
- [ ] OpenRouter `json_schema`+`strict` support for the chosen slug (if adopting structured
      output) with `provider:{require_parameters:true}`.
- [ ] ORS free-tier quotas on the live `account.heigit.org` dashboard (the least-stable facts);
      confirm the **3-vehicle** optimization cap vs. expected truck count.
- [ ] `driving-hgv` `vehicle_type` + `profile_params.restrictions` smoke test (note: hosted
      VROOM optimization applies the profile graph but **not** per-vehicle dimension limits).

## 6. Overall sequencing

```
A1 (admin key+baseURL)  ─▶  A2 (ai.Client)  ─▶  A3 (PIM collapse)  ─▶  A4 (main.go + fallbacks)  ─▶  A5 (UI)  ─▶  A6 (cleanup)
R1 (ORS client)  ─▶  R2 (locations lat/lng + branch origin)  ─▶  R3 (Pelias geocode)  ─▶  R4 (frontend attribution)
```
The AI track and routing track are independent and can proceed in parallel. Within each,
respect the arrows (the admin key/base-URL decision gates the AI UI; the `locations` migration
gates real routing origin).

## 7. Pre-flight (per CLAUDE.md)
- `cd backend && go build ./... && go vet ./...`
- `cd app && npx tsc --noEmit` (or `npm run build`)
- New migration: `locations.latitude/longitude DOUBLE PRECISION` (mirror `021`).
- No hardcoded colors; JetBrains Mono for numeric data on any new UI.

---

## Appendix A — model-slug starting set (VERIFY before pinning)

| Task | `system_settings` key | Starting slug (verify live) |
|---|---|---|
| General text / reasoning | `ai.model.text` | `deepseek/deepseek-chat`, `qwen/qwen3-235b`, `meta-llama/llama-3.3-70b-instruct` |
| Cheap / fast classification | `ai.model.cheap` | `mistralai/mistral-small-3.2-24b-instruct`, `meta-llama/llama-3.1-8b-instruct` |
| Vision OCR (invoices/material lists) | `ai.model.vision` | `qwen/qwen3-vl`, `meta-llama/llama-4-scout` |
| Image generation | `ai.model.image` | `black-forest-labs/flux.2-flex`, `black-forest-labs/flux.2-pro` |
| Meta-router fallback | — | `openrouter/auto` (`cost_quality_tradeoff` 0–10) |

Filter the catalog by capability: `https://openrouter.ai/models?input_modalities=image`, or
inspect each model's `architecture.input_modalities` / `context_length` /
`supported_parameters` via `GET /api/v1/models`.

## Appendix B — env var summary (community repo)

| Env var | Default | Primary source |
|---|---|---|
| `OPENROUTER_API_KEY` | `""` | `system_settings.openrouter_api_key` (admin UI) |
| `OPENROUTER_BASE_URL` | `https://openrouter.ai/api/v1` | `system_settings.openrouter_base_url` |
| `AI_MODEL_TEXT` / `_VISION` / `_CHEAP` / `_IMAGE` | see Appendix A | `system_settings.ai.model.*` |
| `OPENROUTESERVICE_API_KEY` | `""` | `system_settings.openrouteservice_api_key` |
| `OPENROUTESERVICE_BASE_URL` | `https://api.openrouteservice.org` | env |
| `ORS_PROFILE` | `driving-hgv` | env |

*(All AI/ORS keys are runtime-settable via Tech Admin → AI Settings; no manifest edit, matching
today's behavior.)*
