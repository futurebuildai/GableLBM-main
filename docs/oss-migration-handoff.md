# OSS Migration — Implementation Handoff

**Status:** Ready to implement (planning complete)
**Read first:**
[`oss-migration-plan.md`](./oss-migration-plan.md) (the file-by-file plan) ·
[`production-external-services-roadmap.md`](./production-external-services-roadmap.md)
(future production repo — *not* in scope for these threads) · root `CLAUDE.md`
**Last updated:** 2026-06-18

---

## What this is

We're replacing the proprietary external-service layer in the **community** repo with open
options, so an LBM dealer can plug in **one maintainer-issued AI key** and **one routing key**:

- **Track A — AI → single OpenRouter key.** Collapse Anthropic + Gemini + Stability (three
  direct clients, two keystores) into one OpenAI-compatible client behind `openrouter_api_key`,
  with a task→model router and FLUX image generation through the same key.
- **Track R — Routing → OpenRouteService.** Replace Google Maps Directions with ORS
  (directions + VROOM optimization), add **real geocoding** (today it's mocked to San
  Francisco), and source route origin from the real branch location.

The two tracks are **independent** and meant to run as **two parallel Claude CLI threads**.
Full step-by-step detail (exact files, line numbers, request/response shapes, model slugs) is in
`oss-migration-plan.md` — this doc is the orchestration layer: scope per thread, what must not
break, how to avoid stepping on each other, and the kickoff prompts.

---

## Ground rules for both threads

1. **Read `oss-migration-plan.md` end-to-end before writing code.** It has the verified file:line
   map and the risk list. Don't re-derive it.
2. **Preserve graceful degradation.** Every external service degrades when its key is absent.
   Do not turn a missing key into a hard failure where the current code falls back. The AI
   thread specifically must preserve **three different** unconfigured-key behaviors (see Track A).
3. **No hardcoded colors; JetBrains Mono for numeric UI** (design-system rule).
4. **Pre-flight before declaring done:** `cd backend && go build ./... && go vet ./...` and
   `cd app && npx tsc --noEmit`. Run the relevant module tests; add tests where the plan says so.
5. **Money/UOM conventions** are unaffected by this work — don't touch them.
6. **Verify-at-impl-time items** (Track A: PDF-via-file-parser, FLUX response shape; Track R:
   ORS free-tier 3-vehicle cap, `driving-hgv` params) — confirm against live docs/endpoints
   before committing the dependent code. See plan §5.

---

## Branch & worktree strategy (run them truly in parallel)

Use a separate **git worktree** per thread so each has its own working directory and branch —
no file collisions while both run.

> **Base the worktrees on the docs branch** (`docs/oss-migration-plan-master`), not `master` —
> these plan docs are not on `master` yet, and each thread needs to read them. Once the docs PR
> is merged to `master`, base off `master` instead (then the docs are a no-op in each branch's
> diff). Each implementation branch carrying the docs commit as an ancestor is harmless.

```bash
# from the main checkout (this repo root):
git fetch origin

# Track A — AI / OpenRouter
git worktree add ../GableLBM-ai      -b feat/oss-ai-openrouter-master  origin/docs/oss-migration-plan-master

# Track R — Routing / OpenRouteService
git worktree add ../GableLBM-routing -b feat/oss-routing-ors-master    origin/docs/oss-migration-plan-master
```

Then open a Claude CLI in each worktree directory:

```bash
cd ../GableLBM-ai      && claude     # paste the Track A kickoff prompt (below)
cd ../GableLBM-routing && claude     # paste the Track R kickoff prompt (below)
```

When done, each thread opens its own PR targeting `master`. Land one, then rebase the other.

### ⚠️ Shared-file coordination (the only place the tracks overlap)

Both tracks add fields to **`backend/internal/config/config.go`** and rewire
**`backend/cmd/server/main.go`**. These edits are **additive** (new config fields, new wiring
lines) and conflict only trivially. To keep it clean:

- Each thread edits **only its own** config fields and **only its own** wiring lines (AI keystore
  block vs. the maps `WithMaps` block — different regions of `main.go`).
- Land **Track A first** (it's lower-risk and has no DB migration), then **rebase Track R** onto
  it; resolve the additive `config.go`/`main.go` conflicts (a few lines each).
- Track R owns the **only DB migration** in this effort (`locations.latitude/longitude`); Track A
  has none — so there's no migration-number collision.

---

## Track A — AI → single OpenRouter key

**Branch:** `feat/oss-ai-openrouter-master` · **Plan:** `oss-migration-plan.md` Part 1 (§1.1–§1.11)
**DB migrations:** none.

### Scope / phases (acceptance in plan §1.11)
- **A1** TechAdmin **backend**: one key + a **second** KeyStore for `openrouter_base_url`
  (KeyStore is single-valued), drop the `…/gemini` routes, add `base_url` to
  `AISettingsResponse` and the PUT body. *Do this first — the UI depends on it.*
- **A2** New OpenRouter `ai.Client` (`backend/internal/ai/openrouter.go`): OpenAI-compatible
  `chatCompletion`, `Generate(text)→(text,model,err)`, multimodal translation
  (image→`image_url`, pdf→`file`+`file-parser` plugin), shared `stripJSONFence`,
  `GenerateImage`→FLUX. **Add the first unit tests** for fence-strip + response extraction.
- **A3** Collapse PIM's duplicate client — delete `pim/ai_client.go`'s three clients, add
  `pim.WithAI(*ai.Client)`, repoint the 5 PIM call-sites, fix the wrong
  `gen_model="gemini-2.0-flash"` literal.
- **A4** `main.go` rewiring (exact lines in plan §1.8) + config fields; reproduce the
  graceful-degradation matrix per call-site (plan §1.9).
- **A5** Frontend: collapse the two AI panels into one "AI Provider" panel (key + optional
  base-URL), delete the Gemini block, fix the false "Blueprint Verification = AI" copy.
- **A6** Cleanup: remove old provider env/keys after one back-compat release.

### Must-not-break invariants (Track A)
- **JSON fence-strip is load-bearing and untested today.** Response text moves from Anthropic's
  `content[0].text` to OpenAI's `choices[0].message.content`. Preserve the strip on the new
  shape or every JSON extractor breaks silently.
- **Three different unconfigured-key behaviors** — `parsing` = silent rule-based fallback (never
  errors), `purchase_order` freight = hard 400 "enter freight total manually", `pim` = hard
  error. Reproduce each; do **not** unify.
- **Maestro/FB-Brain AI path is dead code** (`WithMaestro` never called) — ignore it, but keep
  the hook if trivially preservable.
- **Verify before committing:** scanned-PDF → JSON through the chosen vision slug + `file-parser`;
  FLUX returns `choices[0].message.images[0].image_url.url` as a `data:image/png;base64,…` URI
  PIM can persist unchanged.

---

## Track R — Routing → OpenRouteService + real geocoding

**Branch:** `feat/oss-routing-ors-master` · **Plan:** `oss-migration-plan.md` Part 2 (§2.1–§2.9)
**DB migrations:** one (add `latitude/longitude` to `locations`).

### Scope / phases (acceptance in plan §2.9)
- **R1** New ORS client replacing `delivery/maps.go`: `POST /optimization` (VROOM) →
  preserve the `RouteOptimizationResult` JSON shape exactly (so the TS mirror needs no change);
  map per-stop `arrival` → ETA. Config/env (`OPENROUTESERVICE_API_KEY`, base URL,
  `driving-hgv` profile); branch `main.go:443-449` on the ORS key. Mock path stays keyless.
- **R2** Migration: add `locations.latitude/longitude` (mirror `021_add_delivery_geolocation.sql`);
  geocode branch addresses once; thread `orders.branch_id` → `locations` so origin = real branch
  (today hardcoded to SF twice). Precedent: `invoice.GetBranchTaxRate`.
- **R3** Real geocoding in `AssignOrderToRoute` (`service.go:310-329`): replace the byte-math
  with ORS/Pelias `GET /geocode/search/structured`; add a repo method to load the order's
  delivery address (`orders → customers.address`). Fix the **index-desync** bug (stops with nil
  coords are silently dropped); persist ETAs to the unused `deliveries.estimated_arrival`.
- **R4** Frontend: add the required attribution string
  (`© openrouteservice.org by HeiGIT | Map data © OpenStreetMap contributors`); fix the default
  map center (`RouteMap.ts:66`, currently Portland). Tiles are already OSM. Optional: road-
  following polyline from ORS geometry (net-new; today straight lines between stops).

### Must-not-break invariants (Track R)
- **`[lng,lat]` ordering everywhere** in ORS/VROOM/Pelias — reverse of Google's `lat,lng`.
  Centralize the conversion; this is the #1 porting bug.
- **Keep `RouteOptimizationResult` JSON tags identical** → zero frontend type changes
  (`app/src/types/notification.ts:36-48`). The frontend doesn't call `/optimize` yet, so the
  wire contract is internally flexible — only the **persisted reorder** and
  `Delivery.latitude/longitude` are load-bearing for what the user sees.
- **Geocoding is greenfield, not a swap** — `AssignOrderToRoute` doesn't even load the address
  today. This is the most under-scoped item; budget accordingly.
- **Verify before committing:** ORS free-tier **3-vehicle** optimization cap (a multi-truck
  blocker — single-truck routes are fine; note it and defer fleet VRP to the production
  roadmap); `driving-hgv` `vehicle_type` + `profile_params.restrictions` smoke test.

---

## Kickoff prompts (paste into each fresh CLI thread)

### Track A thread
```
Read docs/oss-migration-handoff.md and docs/oss-migration-plan.md (Part 1) and CLAUDE.md, then
implement Track A — the AI service layer migration to a single OpenRouter key — on this branch
(feat/oss-ai-openrouter-master).

Work phase by phase A1→A6 per the plan. Start with A1 (TechAdmin backend: single openrouter_api_key
+ a second KeyStore for openrouter_base_url, drop the Gemini admin routes, add base_url to the
settings response + PUT body). Before writing the OpenRouter client (A2), verify against live
OpenRouter docs that (a) PDFs work via the `file` content block + file-parser/mistral-ocr plugin
and (b) FLUX returns a base64 data-URI at choices[0].message.images[0].image_url.url.

Preserve the three different unconfigured-key behaviors (parsing=silent fallback, freight=hard
400, pim=hard error) and the JSON fence-strip invariant — add unit tests for fence-strip and the
new OpenAI-shaped response extraction. Pin model slugs against GET /api/v1/models before
hardcoding them. Pre-flight: go build ./... && go vet ./... and (app) npx tsc --noEmit. Open a PR
to master when green. Do NOT touch the routing/delivery files — that's a parallel thread.
```

### Track R thread
```
Read docs/oss-migration-handoff.md and docs/oss-migration-plan.md (Part 2) and CLAUDE.md, then
implement Track R — delivery routing → OpenRouteService + real geocoding — on this branch
(feat/oss-routing-ors-master).

Work phase by phase R1→R4 per the plan. Start with R1 (ORS client replacing delivery/maps.go:
POST /optimization via VROOM, preserving the RouteOptimizationResult JSON shape exactly; config +
main.go branch on the ORS key; keep the keyless mock path). Then R2 (the locations
latitude/longitude migration mirroring 021_add_delivery_geolocation.sql + branch-origin wiring via
orders.branch_id), R3 (real Pelias geocoding in AssignOrderToRoute + a new order→customers.address
repo method; fix the index-desync bug; persist ETAs), R4 (frontend attribution + map-center fix).

Remember ORS/VROOM/Pelias use [lng,lat] ordering (reverse of Google) — centralize the conversion.
Verify the ORS free-tier 3-vehicle optimization cap and driving-hgv params against live docs; if
multi-truck dispatch exceeds the cap, note it and defer fleet VRP to
production-external-services-roadmap.md. Pre-flight: go build ./... && go vet ./..., go run
./cmd/migrate for the new migration, and (app) npx tsc --noEmit. Open a PR to master when green.
Do NOT touch the AI/pim/ai files — that's a parallel thread.
```

---

## Coordination summary

| | Track A (AI) | Track R (Routing) |
|---|---|---|
| Branch | `feat/oss-ai-openrouter-master` | `feat/oss-routing-ors-master` |
| Plan section | Part 1 | Part 2 |
| DB migration | none | `locations.lat/lng` (one) |
| Shared files (additive) | `config.go`, `main.go` (AI block) | `config.go`, `main.go` (maps block) |
| Land order | **first** | rebase onto A, resolve additive conflicts |
| Frontend | TechAdmin AI panel | RouteMap attribution/center |
| Biggest risk | fence-strip + multimodal translation | greenfield geocoding + branch-origin schema |
