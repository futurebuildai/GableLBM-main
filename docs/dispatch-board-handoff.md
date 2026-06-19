# Dispatch Board UX Handoff

_Last updated: 2026-06-19_

Records the state of the **Logistics & Dispatch** (`/dispatch`) rework and the
open items to resolve in a future session. Companion to the code in
`app/src/pages/DispatchBoard.ts` and `app/src/components/logistics/{DeliveryList,RouteMap}.ts`.

## What shipped this session

Reworked the Dispatch page so the Delivery Manifest is usable and the map is a
first-class view:

- **Tabbed Manifest / Map** (`DispatchBoard.ts`). Fixes the original bug: the
  manifest stop-list was clipped by the map and could not scroll. Root cause was
  a broken flex height chain at the Light-DOM custom-element hosts
  (`gable-delivery-list` / `gable-route-list-component` had no `flex-1 min-h-0`,
  so the inner `h-full` collapsed). Both panes stay mounted; the inactive one
  gets a `hidden` class.
- **List ↔ map selection sync.** Shared `_selectedDeliveryId`; `stop-select`
  CustomEvent from both children; clicking a stop card highlights it and pans +
  opens its map pin popup, and vice-versa. Selection persists across tabs and
  clears on route change.
- **Leaflet 0×0-in-hidden-tab fix.** `RouteMap.refresh()` (`invalidateSize` +
  fit/highlight) is called on tab-switch via `requestAnimationFrame`, plus a
  `ResizeObserver` on the map container, plus `offsetWidth === 0` guards in
  `_fitToStops` / `_highlightSelected`.
- **Scroll affordance** — a bottom fade on the manifest, toggled imperatively on
  a `[data-scroll-fade]` node (post-layout measurement, no reactive re-render).
- **Accessibility** — `role="tablist"/"tab"` + `aria-selected`; stop cards use an
  overlay-`<button>` pattern (keyboard + `aria-pressed`, no nested-interactive
  violation); `focus-visible` rings; reorder controls reveal on
  `group-focus-within`.
- **Security** — `esc()` escapes all server-supplied fields in the raw Leaflet
  popup HTML string (stored-XSS guard).
- **Tokens** — replaced hardcoded `#0A0B10` / `#161821` with `deep-space` /
  `slate-steel`; selected-card glow uses `shadow-glow`.
- **Tests** — first vitest component tests in the app (3 files, 10 tests):
  `DeliveryList.test.ts`, `RouteMap.test.ts`, `DispatchBoard.test.ts`.

### Verification (PASS)

Driven in a real browser against a locally seeded stack. Confirmed: tabs render
with correct ARIA; manifest overflows and **scrolls** (`scrollHeight 928 >
clientHeight 489`); map sizes to full height on tab reveal (564×623, tiles load —
the 0×0 fix); selection sync + popup on selected pin; scroll fade toggles both
directions; `<img onerror>` XSS payload neutralized live; graceful with
coordinate-less data. Gates: `tsc -b`, `eslint .`, `vitest` (10/10),
`vite build` all green.

---

## Open items — resolve next session

### 1. Map shows straight "crow-flies" lines, not the street-level route  ⬅ priority

`RouteMap._updateMap()` draws the polyline from raw stop coordinates
(`routePath = validDeliveries.map(d => [lat, lng])`), so the route is direct
lines between stops, not roads.

**Approach (road-following geometry from OpenRouteService):**
- The VROOM `/optimization` call in `backend/internal/delivery/ors.go` can request
  geometry (`options.g`, noted around `ors.go:139`). VROOM then returns an encoded
  polyline for the route. Confirm it's requested and **capture `routes[].geometry`**.
- Plumb it through: add a `geometry` (encoded polyline string) field to the
  optimize result and, ideally, persist it on the route so a GET returns it
  without re-optimizing. Frontend type lives at
  `app/src/types/notification.ts` (`RouteOptimizationResult`).
- Frontend: decode the polyline (small decoder or `@mapbox/polyline`) and render
  the decoded path in `RouteMap._updateMap()` instead of `routePath`. Keep the
  `[lng,lat]` ↔ `[lat,lng]` ordering straight (ORS uses `[lng,lat]`).
- **Fallback:** when no ORS key is configured (mock routing) or a route has no
  geometry, keep the current straight-line polyline. Don't hard-fail.
- Verify against a real ORS key (see local-run notes) since geometry only exists
  on real optimization, not the mock path.

### 2. Pre-existing Lit dev-mode update warning (not introduced here)

Console shows `Element gable-delivery-list scheduled an update ... after an update
completed`. Source is `_loadDeliveries()` setting `this._loading = true`
synchronously inside the `updated()`→load path — **identical in `git HEAD`**, so
it predates this change. It's dev-mode-only (stripped in prod) and is the
deliberate trade-off for showing the spinner immediately (deferring it would flash
an empty state). If we want a clean dev console: fetch via a Lit `Task`/`willUpdate`
pattern, or accept it. Low priority.

### 3. Local seed has no geocoded coordinates

With no `OPENROUTESERVICE_API_KEY`, seeded deliveries have `latitude/longitude =
null`, so the map renders tiles but **no markers/route locally**. The page handles
this gracefully (empty overlay, no crash). To exercise markers/routing locally,
set an ORS key in **Tech Admin → Routing** (or env) and re-optimize a route so
Pelias geocodes the stops. The real demo (`demo.gablelbm.com`) has ORS configured.

### 4. Responsive `lg:` breakpoints not runtime-verified

The stacked-below-`lg` layout (`w-full lg:w-1/3`, `h-[45vh]/[75vh] lg:h-auto`) is
pure CSS and was reviewed but not exercised at a narrow viewport at runtime.
Quick check next session: resize to < 1024px and confirm the columns stack and
each panel scrolls internally.

### 5. Pre-existing, unrelated console 404s

`BranchContext: /me/branches` and Omnibar `/products` 404 locally — global
app-shell features, **not** the dispatch board, present regardless of this change.
Noted so they aren't mistaken for a regression.

---

## Local run / verify recipe

`:5173`/`:8080`/`:5174` may be taken by other local projects — pick free ports.

```bash
# DB (gable_postgres on :5434 — docker)
cd backend
go run ./cmd/migrate          # apply migrations to gable_db
go run ./cmd/seed             # 15 routes / 44 deliveries (Kelowna, BC)

# Backend (AUTH_MODE=dev opens the API; pick a free PORT)
PORT=8771 AUTH_MODE=dev go run ./cmd/server

# Frontend (point the proxy at the backend port; vite auto-bumps if 5173 taken)
cd ../app
VITE_API_PROXY=http://localhost:8771 npm run dev -- --port 5174
```

Then open `/dispatch`, pick a route, exercise the Manifest/Map tabs. Confirm
you're on **your** dev server (check the served `DispatchBoard` has
`role="tablist"`) — a stale dev server running old code is an easy trap.
