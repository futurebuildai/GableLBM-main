# OSS Migration — Landed State & Next-Session Pickup

**Status:** ✅ **SHIPPED.** Both tracks (A = AI, R = Routing) are merged to `master` **and**
`community`, and **live on demo** (demo.gablelbm.com). Async image-gen, runtime ORS key, and the
dispatch Optimize button are all in.
**Read order for a fresh session:**
this doc → [`oss-migration-plan.md`](./oss-migration-plan.md) (as-built file-by-file reference) →
[`production-external-services-roadmap.md`](./production-external-services-roadmap.md) (the
*downstream* production repo — self-hosting decisions, still forward-looking) → root `CLAUDE.md`.
**Last updated:** 2026-06-18

> This file used to be the *pre-implementation* orchestration plan (two parallel CLI threads).
> That work is done. It's now the **close-out record**: what shipped, where it lives, how to
> operate it, and the only things still open. The original kickoff prompts are preserved at the
> bottom for historical reference.

---

## TL;DR — where everything is

| | State |
|---|---|
| **AI layer** | One **OpenRouter** key (`openrouter_api_key`) → one OpenAI-compatible `ai.Client`. Text + vision OCR + image gen all through it. Anthropic/Gemini/Stability clients removed. |
| **Image gen** | Default **`black-forest-labs/flux.2-pro`**, **asynchronous** (202 + placeholder + background goroutine + frontend polling). Verified on demo (~13s, no gateway 504). |
| **Routing** | **OpenRouteService** (VROOM optimization + Pelias geocoding, `driving-hgv`). Key is **runtime-settable** in Tech Admin → Routing; flips mock ↔ real per request, no redeploy. |
| **Dispatch UI** | **Optimize Route** button in `/dispatch` delivery manifest (reorders stops + fills ETAs). |
| **`master`** | `5f3f4ac` — full stack mirrored. |
| **`community`** | `1c229f8` — source of truth for demo; auto-deploys to demo.gablelbm.com. |
| **demo** | Live & ACTIVE on the above. AI works (real OpenRouter key was set at runtime & tested). Routing is in **mock mode** (ORS key deleted after round-trip test — see "Open items"). |
| **Worktrees** | Removed. Main checkout is on `master`. |

### Merged PRs (this effort)
- **master:** #18 (Track A AI), #19 (Track R routing), #21 (FLUX.2 Pro default), #24 (fetch-timeout + async roadmap note), #27 (async image-gen, incl. the 42P08 + modalities fixes), #31 (runtime ORS key + Optimize button).
- **community:** #20 (Track A), #22 (FLUX.2 Pro), #23 (fetch timeout), plus direct commits `9836005` (Track R port), `2078459`/`7e6bc3e`/`b8d657d` (async + SQL-type + modalities fixes), `1c229f8` (runtime ORS + Optimize).

---

## 🔴 Open items (pick these up next session)

1. **Test REAL ORS routing** — *needs the user to act.* Demo is in mock mode right now.
   - Get a free key at **openrouteservice.org/dev** (instant, free tier).
   - demo.gablelbm.com → **Tech Admin → Routing** → paste → Save. Takes effect within ~30s
     (keystore cache TTL); **no redeploy**.
   - `/dispatch` → select the seeded route → **Optimize** → you should now get a real
     road-optimal stop order with **varied** per-leg times/distances (mock = uniform 15-min/5-mi,
     identity order). New order assignments geocode to real coords via Pelias.
   - Mechanism already verified end-to-end: `PUT … /admin/settings/routing` → `GET` shows
     `{configured:true, source:"admin"}` → `DELETE` → back to `{configured:false, source:"none"}`.
2. **🔑 Rotate/revoke the plaintext secrets** the user pasted into chat during testing:
   - **OpenRouter key** `sk-or-v1-6fbb…` — rotate at openrouter.ai (it was set on demo's runtime
     keystore; reissue and re-paste the new one in Tech Admin → AI).
   - **DigitalOcean token** `dop_v1_854f…` — **revoke** (full-account access; was used for manual
     `doctl apps create-deployment`). Reissue a scoped token if manual deploys are still wanted.
3. **Auto-deploy on push is OFF for demo** (user chose manual for now). The live DO app uses a
   generic `git:` clone source (no webhook). To enable `deploy_on_push`, re-create the app source
   as a `github:` integration (OAuth). Until then, deploy with:
   `doctl apps create-deployment cddad7a6-2afb-4dfe-b5b1-887ec5f46000 --force-rebuild`.

---

## How it works now (operator + maintainer notes)

### AI — single OpenRouter key
- Key + base URL are two keystores: `ai.NewKeyStore(pool, "openrouter_api_key", env)` and
  `…("openrouter_base_url", env)`. DB-first (`system_settings`), env fallback, 30s cache.
- Set at runtime: **Tech Admin → AI** (key + optional base URL). Guardrails allowlist gates which
  model slugs are callable.
- `ai.Client` (`backend/internal/ai/openrouter.go`) is OpenAI-compatible: `Generate(text)`,
  multimodal (image→`image_url`, pdf→`file` + file-parser plugin), `GenerateImage`→FLUX.
- **Graceful degradation preserved** (do not unify): `parsing` = silent rule-based fallback,
  `purchase_order` freight = hard 400, `pim` image = SVG-placeholder fallback.
- **Load-bearing invariants** (regressions here fail silently): JSON fence-strip runs on the
  OpenAI `choices[0].message.content` shape; FLUX requests must send `modalities:["image"]` only
  (image-only models reject `["image","text"]` — this caused a systematic SVG-fallback bug).

### Image gen — async (the part most likely to confuse a future session)
- Synchronous FLUX exceeded the demo's ~24s App Platform/Cloudflare gateway → 504 (model returns
  in ~8–13s; the multi-MB base64 + DB write pushed total over the edge).
- Flow: `HandleGenerateImage` → `pim.GenerateImage` inserts a `pim_media` row
  `status:"generating"` (empty URL), returns **202** with that row, then
  `go generateImageAsync(...)` (detached `context.Background()` + 90s timeout + `recover()`) calls
  `ai.GenerateImage`; on success/SVG-fallback it `UpdateMediaResult(... 'ready'|'failed')`.
- **SQL gotcha (fixed, don't reintroduce):** `UpdateMediaResult` casts `$5::text` in *both* the
  `status = $5` assignment and the `$5 = 'ready'` guard — without the cast Postgres throws
  `42P08 inconsistent types deduced` and rows stick on `generating`.
- Frontend (`ProductMediaTab.ts`) polls `PIMService.listMedia` every 2.5s until no row is
  `generating`; gallery renders spinner/error/img per `status`.
- `fetchClient` default timeout is 10s; **AI calls override to 120s** (`AI_GENERATION_TIMEOUT`).
- Schema: `pim_media.status VARCHAR(20) NOT NULL DEFAULT 'ready'` — migration `073` (master) /
  `076` (community). `model.go` PIMMedia + `types/pim.ts` carry `status`.

### Routing — OpenRouteService, runtime key
- `delivery.NewORSClientWithKeyStore(orsKeyStore.Get, baseURL, profile, logger)`; the service
  flips per request via `routingEnabled(ctx) = routing != nil && routing.IsConfigured(ctx)`.
  No key → keyless **mock** path (uniform legs, identity order). Key present → real VROOM + Pelias.
- Wiring is **unconditional** in `main.go` (~L492): keystore + client always built;
  `techAdminHandler.WithORSKeyStore(orsKeyStore)` exposes the admin routes.
- Admin API: `GET/PUT/DELETE /api/v1/admin/settings/routing` (key-only, masked hint, source
  `admin|env|none`). Frontend: TechAdminPage **Routing** tab + `deliveryService.optimizeRoute`
  + the DeliveryList **Optimize** button (gated ≥2 stops, non-terminal route).
- **`[lng,lat]` ordering** everywhere in ORS/VROOM/Pelias (reverse of Google) — the #1 porting
  bug; conversion is centralized.
- Branch origin is real: `orders.branch_id` → `locations.latitude/longitude` (migration `072`
  master / `075` community), not the old hardcoded SF point.
- **Free-tier cap:** VROOM optimization is **1 vehicle / call** as used here (one truck per
  route) → stays inside the 3-vehicle managed cap. Multi-truck fleet VRP is deferred to the
  production roadmap §1.5.

---

## Divergence between `master` and `community` (don't trip on this)

`community` is **ahead** of `master` and has features `master` lacks (e.g. `service.go`'s
`exposureGate ExposureGate` lumber-index field). When porting/cherry-picking between them:
- **Migration numbers differ** — same change, different number: `pim_media.status` = `073`
  (master) / `076` (community); `locations` geolocation = `072` (master) / `075` (community).
  Renumber when moving a migration across.
- Resolve `service.go`/`main.go` conflicts **additively** — preserve community-only fields.
- Demo deploys from **`community`**, so land there first when the goal is "test on demo," then
  mirror to `master`.

---

## Pre-flight (unchanged, still required before declaring work done)
- `cd backend && go build ./... && go vet ./...` and run the touched module tests.
- `cd app && npx tsc --noEmit`.
- Money/UOM conventions untouched by this work — leave them.

---

## Production roadmap (the *next* big arc, separate repo)
`production-external-services-roadmap.md` captures the downstream managed/core-repo decisions:
self-hosting the routing stack (Valhalla/ORS + Pelias + VROOM — they're **three** deployments),
AI hosting (managed OpenRouter vs self-hosted OpenAI-compatible gateway vs hybrid LiteLLM), PII
/ data-residency, metering via `usage.cost` or the dormant Maestro/Brain hook, and the async
image-gen requirement (now validated). It's decision-capture, not yet implementation — the
community seams (one base-URL-swappable AI client, one ORS-shaped routing client, narrow
`Geocode()` interface, `locations.lat/lng` + a future geocode cache) were kept so production is a
**config swap, not a rewrite**.

---

<details>
<summary>Historical: original two-thread kickoff prompts (work is done — kept for reference)</summary>

### Track A thread (AI → OpenRouter)
```
Read docs/oss-migration-handoff.md and docs/oss-migration-plan.md (Part 1) and CLAUDE.md, then
implement Track A — the AI service layer migration to a single OpenRouter key — on this branch
(feat/oss-ai-openrouter-master). Work phase by phase A1→A6 per the plan. Preserve the three
unconfigured-key behaviors (parsing=silent fallback, freight=hard 400, pim=hard error) and the
JSON fence-strip invariant. Pin model slugs against GET /api/v1/models. Pre-flight: go build/vet
and npx tsc --noEmit. Do NOT touch routing/delivery files — that's a parallel thread.
```

### Track R thread (Routing → OpenRouteService)
```
Read docs/oss-migration-handoff.md and docs/oss-migration-plan.md (Part 2) and CLAUDE.md, then
implement Track R — delivery routing → OpenRouteService + real geocoding — on this branch
(feat/oss-routing-ors-master). Work R1→R4 per the plan. ORS/VROOM/Pelias use [lng,lat] (reverse
of Google) — centralize the conversion. Verify the ORS free-tier 3-vehicle cap and driving-hgv
params. Pre-flight: go build/vet, go run ./cmd/migrate, npx tsc --noEmit. Do NOT touch AI/pim
files — that's a parallel thread.
```
</details>
