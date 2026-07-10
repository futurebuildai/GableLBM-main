# Ridge — Master PRD

> **Product:** Ridge (formerly "LumberNow" / "Gable Supply" storefront)
> **Parent platform:** GableLBM ERP
> **Status:** Draft v0.1 — planning
> **Author:** Product/Eng planning session (community-call follow-up)
> **Companion docs:** `01_ORDERING_PROCUREMENT_PRD.md` · `02_SALES_MARKETING_CRM_PRD.md` · `03_CMS_GROWTH_AGENTS_PRD.md` · `04_DESIGN_AND_FLOWS.md`

---

## 1. Context — why this, why now

Ridge grows out of the LumberNow storefront, but the last community call reset its ambition. The module is no longer "a headless storefront for a lumber dealer." It is being repositioned as the **entire go-to-market surface** for an LBM (lumber & building-materials) dealer running on the **GableLBM** ERP — three connected products under one roof:

1. **Ordering & Procurement (customer-facing)** — a next-gen, *intelligent* online ordering and procurement workspace for professional contractors, integrated with GableLBM as the source ERP.
2. **Sales & Marketing (internal-facing)** — a native CRM + marketing module for inside and outside sales teams, targeting **SalesJack** parity, purpose-built for LBM.
3. **CMS + Growth (content & acquisition)** — a content management system for the public marketing surface, plus scaffolding for **autonomous lead-generation and SEO/GEO agents** that grow top-line customer accounts.

### The name

**Ridge** (full: **Gable Ridge**). Gable ERP is the structure; **Ridge is the top line that sits at the peak and grows the revenue over it.** The customer-facing storefront stays **white-labeled per dealer** — shoppers see the dealer's brand (demo tenant "Gable Supply"), not "Ridge." "Ridge" is the platform/product name and the name the dealer's sales/marketing users see internally.

### Why these three together

They are one revenue flywheel, not three features:

```
  CMS + GEO/SEO agents  ─▶  organic traffic & AI-answer citations
          │
          ▼
  Autonomous lead-gen   ─▶  qualified leads
          │
          ▼
  Sales CRM (pipeline)  ─▶  opportunities → quotes → orders
          │
          ▼
  Ordering/Procurement  ─▶  recurring orders, reorders, cross-sell
          │
          ▼
  GableLBM ERP (source of truth: customers, orders, AR, inventory)
          │
          └────────────▶ signals feed back into CRM + agents (account health, cross-sell, next content)
```

Content earns discovery; agents convert discovery into leads; the CRM works leads into accounts; the ordering app turns accounts into repeat revenue; the ERP's transactional data feeds the intelligence that powers all of it. **Top-line account growth is the north star that stitches the surfaces together.**

---

## 2. Where we're starting from (grounded current state)

This PRD is written against the actual repositories, not a greenfield assumption.

**Surface 1 is further along than "storefront."** The customer app (`/home/user/lumbernow/frontend`) is already rebranded to *Gable Supply* and has replaced cart/checkout with **Project Boards → phased Orders → line items → Quote Builder → white-label Client Presentation**, a slide-out Project Workspace, and a full-screen **"Agent Mode" AI orchestrator** wired to real Claude (`claude-sonnet-4-6`) for material takeoffs. The catch: the entire workspace lives in **browser `localStorage`** and never round-trips — there is no server persistence, **no ERP integration, no real order submission or payment**. "Generate PO" and "Send RFQ" are `alert()` stubs. So Surface 1 is **"wire it to the ERP and deepen the intelligence," not rebuild.**

**GableLBM already ships most of the transactional surface.** `/api/portal/v1/*` provides portal auth (httpOnly `portal_token` cookie), a customer-priced catalog (pricing waterfall + inventory availability), cart, checkout→order (credit gate, GL + AR postings), order history, reorder, invoices, an AR dashboard, deliveries with POD/ETA, and multi-user team management — plus a working `/portal/*` Lit reference UI. **We integrate; we do not re-implement commerce.**

**Surface 2 is near-greenfield.** Both repos have only *account-centric operational CRM* — GableLBM has customer contacts, an activity log (`crm_activities`: CALL/MEETING/EMAIL/NOTE), a read-only rep directory, rep assignment, and customer tiers. `/sales` in the ERP frontend is literally a redirect to `/quotes`. **Leads, opportunities, pipeline, forecasting, tasks/reminders, quotas, territories, campaigns, sequences, and funnel reporting do not exist.**

**Surface 3 is greenfield.** Content today is one `storefront_config` row + an `about_blocks` JSONB array; PIM (`pim_content`, `pim_media`, `pim_collateral`) already generates AI product copy, images, SEO fields, and social collateral — a strong reuse hook. But there is **no page-builder, no per-page meta/`og:`, no JSON-LD, no sitemap, no robots.txt, no SSR** — and the client-rendered Lit SPA is itself a GEO/SEO obstacle. The agent runtime to build on already exists in GableLBM: `ai.KeyStore`, an OpenRouter `ai.Client`, `robfig/cron`, a JWS **A2A** receiver (`/api/v1/a2a/*`), and a `MaestroClient` → **FB Brain** gateway.

**Design system is already ~unified.** Both repos run the same **Industrial Dark** tokens. The remaining work is a light-mode theme + toggle, a shared token source, and reconciling Shadow-DOM (LumberNow) vs Light-DOM/Tailwind (GableLBM) for any shared components.

---

## 3. Personas

| Persona | Surface | Core job | Pain today |
|---|---|---|---|
| **Pro Contractor** (e.g. Chris, custom decks) | Ordering/Procurement | Price a job, build an accurate material takeoff, order & reorder, track delivery, manage AR — fast, often from a jobsite | "Don't shop online"; a cart doesn't model a multi-phase project; forgets accessories; can't self-serve AR/reorder |
| **Dealer Buyer / AP / View-Only** (contractor's team) | Ordering/Procurement | Purchase within approval limits; reconcile invoices | No team roles, no approval flow in the current app |
| **Inside Sales Rep** (pro desk) — *primary internal persona* | Sales CRM | Convert estimates to orders fast, maximize margin, never drop a follow-up | Speed obsessed ("5-second spec lookup"); caves on price; no pipeline, no nudges, double-enters into spreadsheets |
| **Outside / Field Sales Rep** | Sales CRM (mobile) | Visit accounts, log activity, work the pipeline on the road | No mobile CRM; activity lives in memory/email |
| **Sales Manager / Owner** | Sales CRM | See which accounts are slipping, which reps are closing, where the biggest opportunities are; forecast | Only top-customers/revenue-trend dashboards; no funnel, no forecast, no coaching |
| **Merchandising / Admin Manager** | CMS + PIM | Enrich catalog, publish content, keep the site current | Sparse ERP product data; static hard-coded pages; "comfortable with CMS interfaces" but has none |
| **Marketing / Growth Operator** | CMS + Growth | Grow qualified traffic and top-line accounts | No CMS, no SEO/GEO tooling, no lead-gen, no analytics |

---

## 4. Locked architecture decisions

These four were decided in the planning session and drive every companion PRD.

### 4.1 Customer app talks **directly** to GableLBM `/api/portal/v1/*`
The Ridge ordering app authenticates with GableLBM's `portal_token` cookie (HS256 `PortalClaims`) and reads/writes through the portal API. **LumberNow's own Go backend is largely retired** — GableLBM is the single system of record. New capability goes into GableLBM (server-side, close to the data), not a Ridge middle tier.

**Consequences to manage:**
- **Multi-dealer tenant mapping.** GableLBM is single-tenant-per-deployment; Ridge is the multi-dealer face. We need a routing/mapping layer (which dealer → which GableLBM deployment/customer) — a thin edge concern, not a full BFF.
- **Money convention.** Portal DTOs are **float64 dollars** (each carries a `TODO: align with int64 cents`); ERP orders/invoices are int64 cents. Do not mix conventions or reuse ERP `formatCents()` on portal data.
- **Portal checkout gaps.** `POST /checkout` currently passes line items but only *logs* delivery/payment fields — an ERP change is required before delivery/pickup + card flows are real.
- **Project Board persistence.** Ridge's rich Project Boards (phases, labor, markup, takeoff provenance) have no server home. We persist them in GableLBM (extend `internal/project` or add portal endpoints).

### 4.2 Native CRM built **inside GableLBM**
New Go modules (`lead`, `opportunity`, `pipeline`, `task`, `campaign`, `territory`, `quota`) + a real `gable-*` `/sales/*` frontend route tree, reusing existing `customer`, `quote`, `order`, `crm activity`, and `salesteam` data. No separate DB, no per-seat SaaS. This keeps the CRM's data one JOIN away from orders and AR — the exact ERP-integrated advantage SalesJack markets.

### 4.3 CMS renders through a **dedicated SSG/SSR content site**
A new server-rendered public surface (recommend **Astro**) emits real HTML + structured data for SEO/GEO. The **Lit SPA stays for the authenticated Pro Workspace.** Client-rendered SPAs can't be reliably crawled, ranked, or cited by AI answer engines — the SSG site is what makes the growth agents' output actually rank.

### 4.4 Deliverables = **Miro + HTML artifacts + markdown PRDs**
User flows, IA, and system architecture on Miro; clickable hi-fi screens as HTML artifacts (in **both** light and dark themes, see §5); this PRD set as the written spec.

---

## 5. Unified design system (Industrial Dark + Light)

Ridge inherits GableLBM's **Industrial Dark** language — it is already the de-facto system in both repos.

| Token | Hex | Usage |
|---|---|---|
| Gable Green | `#00FFA3` | Primary actions, success, active glow |
| Deep Space | `#0A0B10` | Global background (dark) |
| Slate Steel | `#161821` | Cards, sidebar, modals (dark) |
| Safety Red | `#F43F5E` | Errors, stockouts, credit hold, past-due |
| Blueprint Blue | `#38BDF8` | Technical data, links |
| Body font | **Inter** | UI text |
| Data font | **JetBrains Mono** | All numbers, SKUs, prices, dimensions |

**Light mode is a first-class, toggled theme** (per session decision — *"make sure there is a light mode toggle and we show both"*). Today the system is dark-only: `theme.css` has no light palette, and `ThemeService` sets a `data-palette` attribute with no matching CSS. Ridge adds:
- A **light token set** — near-white surfaces (`#FFFFFF` / `#F6F8FA`), slate text (`#0F172A`), Gable Green retained as primary (with an accessibility-checked darker green `#00CC82` for text-on-light contrast), Safety Red / Blueprint Blue retained.
- A **user-facing light/dark toggle** persisted per user (extend `ThemeService`; on the ERP/Tailwind side use the existing `darkMode: ["class"]` config).
- WCAG AA contrast validated in both themes. Every hi-fi artifact ships **both** themes with the toggle.

Design deliverables also reconcile the **Shadow-DOM (LumberNow `ln-`)** vs **Light-DOM/Tailwind (GableLBM `gable-`)** split and pull from the team's **Claude Design Projects** (links pending) via Miro's `import-claude-design-from-url`. A shared token source (one JSON/`@theme` file generating both `theme.css` `--ln-*` and `tailwind.config.js` colors) is the recommended way to keep `#00FFA3` defined once.

---

## 6. System architecture (cross-surface)

```
                         ┌─────────────────────────────────────────────┐
                         │              Public internet                 │
                         │   (contractors, searchers, AI answer bots)   │
                         └───────────────┬─────────────────────────────┘
                                         │
                    ┌────────────────────┴───────────────────┐
                    │  Ridge SSG/SSR Content Site (Astro)     │  ◀── Surface 3
                    │  JSON-LD · sitemap · robots(AI crawlers)│
                    └───────┬───────────────────────┬─────────┘
                            │ content API           │ catalog read
                            ▼                        ▼
        ┌───────────────────────────────┐   ┌───────────────────────────────┐
        │  Ridge Pro Workspace (Lit SPA)│   │       GableLBM ERP (Go)        │
        │  ordering / boards / takeoff  │──▶│  /api/portal/v1/* (customer)   │  ◀── Surface 1
        │  light/dark toggle            │   │  /api/v1/*        (staff)       │
        └───────────────────────────────┘   │                                │
                                             │  NEW: /api/v1 CRM modules      │  ◀── Surface 2
        ┌───────────────────────────────┐   │  (lead, opportunity, pipeline, │
        │  Ridge Sales Console (gable-*) │──▶│   task, campaign, territory)   │
        │  /sales/* pipeline · dashboards│   │  NEW: /api/v1/cms/* content     │  ◀── Surface 3
        └───────────────────────────────┘   │  NEW: growth agents (cron+AI)   │
                                             └───────┬────────────────┬───────┘
                                                     │                │
                                          ai.KeyStore/ai.Client   A2A JWS (/a2a/*)
                                          (OpenRouter)            MaestroClient
                                                     │                │
                                                     └──────┬─────────┘
                                                            ▼
                                                   FB Brain (agent gateway)
```

**Hosting of intelligence:** all AI/agent work runs server-side in GableLBM via `ai.Client` (OpenRouter, runtime-settable keys), `robfig/cron` for scheduled agents, the A2A JWS receiver for signed inbound events, and `MaestroClient` → FB Brain when org-level metering/routing is wanted. This is the single most important reuse decision: **we already have an agent runtime; we extend it, we don't build a new one.**

---

## 7. Roadmap & phasing

Phasing is detailed per surface in the companion PRDs; this is the cross-surface sequencing.

**Phase 0 — Foundations (unblocks everything)**
- Multi-dealer → GableLBM tenant mapping at the edge.
- Real `EmailSender` (SMTP/SendGrid) in `internal/notification` — currently only `LogEmailService` mock exists; blocks CRM sequences *and* lead-gen outreach.
- Light-mode token set + toggle; shared token source.
- Persist Ridge Project Boards server-side; honor checkout delivery/payment fields.

**Phase 1 — Wire the money surface (Surface 1 MVP + Surface 2 MVP)**
- Ordering app live against `/api/portal/v1/*`: catalog/pricing, cart, checkout→order, orders, invoices, AR dashboard, reorder.
- CRM MVP: leads + pipeline + tasks + rep dashboard, reusing accounts/quotes.

**Phase 2 — Depth & discovery (Surface 3 MVP + Surface 1/2 V1)**
- CMS content model + Astro site (home/category/product/location) with schema, sitemap, robots.
- AI takeoff live end-to-end; deliveries/POD; teams/approvals.
- CRM V1: forecasting, territories, quotas, manager dashboards, marketing sequences.

**Phase 3 — Autonomy & intelligence (all surfaces V2)**
- Autonomous SEO/GEO content agent (human-in-the-loop) + citation monitoring; inbound lead-gen → CRM.
- Cross-sell / next-best-action, account-health scoring, rep-coaching nudge.
- Mobile field app; Field Mode polish; card payments; autonomous outbound prospecting.

---

## 8. Success metrics (north star + supporting)

**North star:** top-line revenue per dealer account, and count of growing accounts.

| Surface | Leading metrics |
|---|---|
| Ordering/Procurement | % orders placed online, takeoff usage, cart→order conversion, reorder rate, cross-sell attach rate, AR self-service rate |
| Sales CRM | pipeline created, win rate, activities per rep, follow-up SLA adherence, forecast accuracy, cross-sell attach |
| CMS + Growth | organic sessions, AI-answer citations/mentions, indexed pages & keyword coverage, content velocity, leads generated, lead→opportunity→order conversion, CAC |

---

## 9. Risks & open questions

- **Multi-tenant vs single-tenant ERP.** GableLBM is one-DB-per-dealer; the direct-to-portal model needs a clean dealer-routing story. *Open:* edge router vs per-dealer subdomains vs a thin gateway.
- **Money convention drift.** Portal float-dollars vs ERP cents; a focused cents migration is on the GableLBM backlog. Until then, convert only at boundaries.
- **Autonomous publishing oversight.** SEO/GEO and outbound lead-gen agents must be human-in-the-loop before anything customer-facing is published or sent (brand + CAN-SPAM risk).
- **GEO measurability.** AI-answer citation tracking is nascent; we need a defensible measurement approach.
- **Email deliverability.** New `EmailSender` must handle SPF/DKIM/DMARC and opt-out from day one.
- **Design source.** Awaiting the **Claude Design Project** links to finalize the visual system; building against the shared Industrial Dark tokens meanwhile.
- **Shadow vs Light DOM.** Any component shared between the ordering SPA and the sales console must resolve the rendering-model split.

---

## 10. Deliverables in this planning pass

1. This master PRD + three surface PRDs + a design/flows doc (`product_docs/ridge/`).
2. **Miro** board(s): end-to-end user flows, information architecture, and system/integration architecture.
3. **HTML artifacts**: clickable hi-fi screens for the key surfaces, in **both light and dark** themes with a working toggle.
