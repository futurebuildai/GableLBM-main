# Ridge — Sales & Marketing CRM (Internal Sales Team Module)

**Product:** Gable Ridge (go-to-market layer on GableLBM ERP)
**Surface:** Internal-facing Sales Team + Marketing CRM (inside & outside sales)
**Parity target:** SalesJack (LBM-specific CRM)
**Status:** PRD / pre-build. Screens live in Miro + HTML artifacts (linked separately).
**Owner:** Ridge PM · **Eng:** GableLBM backend + `app/` frontend
**Doc version:** 1.0 · 2026-07-10

---

## 1. Overview & Context

Ridge is the go-to-market layer on top of GableLBM, the open-source LBM ERP. This surface is the **internal CRM for the dealer's own sales team** — inside reps at the pro desk and outside reps in the field — replacing the CRM bolt-ons dealers buy alongside legacy ERPs (Epicor BisTrack, ECI Spruce, DMSi Agility).

The competitive target is **SalesJack**, an LBM-specialized CRM whose thesis is four-fold: (1) **ERP-integrated** — quotes, accounts, purchase history, and sales activity auto-sync from the ERP so reps never double-enter; (2) role-based **dashboards + follow-up nudges** surfacing which accounts are slipping, which reps are closing, and where the biggest opportunities are; (3) **AI cross-sell** that attacks the "cross-sell blind spot" — recommend what similar accounts buy that this account doesn't; (4) a **mobile field app** for outside reps, with inside and outside reps working the same accounts across locations.

**Ridge's structural advantage over SalesJack: the ERP is not a sync target, it is the same database.** GableLBM already holds every fact a CRM has to import elsewhere. `customer.Customer` (`backend/internal/customer/model.go`) carries `Tier` (RETAIL/SILVER/GOLD/PLATINUM), `PriceLevelID`, `SalespersonID`, `CreditLimit`, `BalanceDue`. Contacts exist (`customer/contacts.go`: `Contact{FirstName, LastName, Title, Email, Phone, Role(Buyer/AP/Owner/Site Super), IsPrimary}`). Quotes with win/loss analytics exist (`quote/` + `migrations/038_quote_analytics.sql`). Orders, invoices, and live AR exist (`invoice.OpenInvoiceStatuses`, `account.PostTransaction`). Activity logging exists (`crm/activity.go`: `crm_activities`). Purchase history is `order_lines`. **We do not import — we join.** A native CRM built inside the modular monolith reads these tables directly and writes CRM-specific tables (leads, opportunities, tasks, campaigns) alongside them in one Postgres, one transaction boundary, one auth model.

**LOCKED decision:** build a **native CRM inside GableLBM** — new Go modules under `backend/internal/*` exposing `RegisterRoutes(mux, mw)`, plus a `gable-*` `/sales/*` frontend page tree. No separate DB, no external SaaS, no HubSpot. Rationale in §12.

---

## 2. Goals / Non-Goals

**Goals**
- Give inside reps a single **Accounts 360** + pipeline + task surface that never requires re-keying ERP data.
- Reach SalesJack parity on: leads/intake, opportunities/pipeline, tasks/follow-ups, role dashboards, forecasting, marketing sequences, and AI cross-sell.
- Convert the never-built LumberNow "Nudge Sidebar / SKU-mapped playbook" rep-coaching concept (`lumbernow/product_docs/PRD.md`, `PERSONAS.md`) into a live coaching surface inside the quoting flow.
- Preserve GableLBM conventions: UUID PKs, money-as-cents in app code, `RequireRole` middleware, Light-DOM `gable-*` components, Industrial Dark tokens, JetBrains Mono for all numerics.

**Non-Goals**
- No new datastore or event bus (NATS remains an orphan container; cross-module calls stay synchronous Go interfaces).
- No customer-facing marketing site; Ridge marketing = **outbound to the dealer's customer/lead list**, not consumer web.
- No replacement of the B2B `/portal/*` self-service portal — that is a separate surface.
- Not migrating the legacy float-dollar money convention in this project (tracked as cross-cutting debt; §12).
- No net-new telephony/email infra beyond a real `EmailSender` (SMS already exists via `notification/sms.go` `TwilioSMSService`).

---

## 3. Personas & Jobs-To-Be-Done

**P1 — Inside Sales Rep ("Pro-desk Pat").** Fields calls/texts/emails from contractors, juggles many quotes at once. Power user of the quoting UI, hates "learning new portals," decides in <5 seconds (`lumbernow/product_docs/PERSONAS.md §1`). Two documented failure modes: **forgets accessories** ("don't forget the hidden fasteners") and **caves on price** when a contractor pushes back on a premium SKU. **JTBD:** "When I'm building a quote on the phone, help me add the right accessories and hold margin without slowing me down." → Nudge/coaching (§4.11) + cross-sell (§4.11).
- **P2 — Outside / Field Rep ("Truck-cab Terry").** Drives to jobsites and yards, visits accounts, logs activity from a phone with spotty signal. Works the same accounts as inside reps. **JTBD:** "Before a visit, show me this account's open quotes, AR status, and what they've stopped buying; let me log the visit even offline." → Mobile field app (§8) + Accounts 360 (§4.1).
- **P3 — Sales Manager / Owner ("Corner-office Casey").** Owns the number. Wants pipeline, forecast, rep attainment, coaching signal. **JTBD:** "Show me which deals will close this month, which reps are behind quota, and which accounts are slipping — before it's a miss." → Role dashboards (§4.9) + forecasting/quotas (§4.7).
- **P4 — Marketing / Growth Operator ("Campaign Casey").** Runs segmented email/SMS to the customer base, reactivates lapsed accounts, launches promos. **JTBD:** "Segment accounts by tier/territory/buying pattern and run a sequence that lands as activity on the rep's timeline." → Campaigns/sequences (§4.10) + PIM collateral (§4.10).

---

## 4. Feature Areas

Each area lists functional requirements, the data model delta, the API surface, and which existing module it extends.

### 4.1 Accounts 360 (extends `customer/` + `crm/` + `app/src/pages/accounts/`)
Extend the existing `AccountDetailPage.ts` (tabs already include `contacts` + `crm`) into a full 360: header shows Tier, live AR (derived per `invoice.OpenInvoiceStatuses`, not the stale `customers.balance_due`), credit limit + utilization, assigned salesperson. New tabs: **Opportunities**, **Tasks**, **Buying Pattern** (order_lines category velocity), **Health** (§4.11). Purchase history reads `order`/`order_lines`; open quotes read `quote/`.
- **FR:** account health badge (green/amber/red) computed nightly; "last order N days ago" and "categories dropped" callouts; one-click "Log activity" and "Create task."
- **API:** reuse `GET /api/v1/customers/{id}`, `GET /customers/{customerId}/activities`, `GET /customers/{customerId}/contacts`; add `GET /api/v1/customers/{id}/health`, `GET /api/v1/customers/{id}/cross-sell` (§4.11).

### 4.2 Contacts (extends `customer/contacts.go`)
Already complete (`customer_contacts`, CRUD at `/api/v1/customers/{customerId}/contacts`). Add per-contact activity roll-up and "primary buyer" surfacing on Accounts 360; add optional `contact_id` linkage to tasks and opportunity_activities.

### 4.3 Activity & Tasks (extends `crm/activity.go`)
`crm_activities` today is append-only logging (CALL/MEETING/EMAIL/NOTE, `GET/POST /customers/{customerId}/activities`, `GET/PUT/DELETE /activities/{id}`). **Net-new: a `tasks` table** for forward-looking follow-ups (due date, assignee, status, linked customer/opportunity/contact). Auto-capture ERP events as activities: quote sent (`quote` state → SENT), order placed (`order` create), payment received — written via synchronous calls from those services into `crm.Repository.Create` (or a thin `activity.Recorder` interface) so the timeline is complete without rep effort.
- **API (new `task` module):** `GET/POST /api/v1/tasks`, `GET/PUT/DELETE /api/v1/tasks/{id}`, `GET /api/v1/tasks?assignee=&due_before=&status=`, `POST /api/v1/tasks/{id}/complete`.

### 4.4 Leads & Intake (net-new `lead` module)
No leads exist anywhere today (grep-confirmed). Build capture from: **web forms** (public intake endpoint), **CSV import**, and **agent-generated** leads (ties to Ridge Surface 3 growth agents via `/api/integration/*` with `X-Integration-Key`, or `/api/v1/a2a/*` JWS). Lead scoring, source attribution, and lead→customer conversion (creates a `customers` row + optionally seeds an opportunity).
- **API:** `POST /api/integration/leads` (public/service intake, keyed), `GET/POST /api/v1/leads`, `GET/PUT /api/v1/leads/{id}`, `POST /api/v1/leads/{id}/convert` (→ customer + opportunity), `POST /api/v1/leads/import`.

### 4.5 Opportunities & Pipeline (net-new `opportunity` module)
The core missing primitive. An **opportunity** = a tracked deal against a customer (or unconverted lead), moving through configurable **pipeline_stages** with weighted value and expected close date. Win/loss with reason codes. Kanban board on the frontend (§7).
- **FR:** stage change writes an `opportunity_activities` row; weighted pipeline value = `Σ expected_value_cents × stage.probability`; aging highlights (stalled > N days); owner = `sales_team` member.
- **API:** `GET/POST /api/v1/opportunities`, `GET/PUT /api/v1/opportunities/{id}`, `PUT /api/v1/opportunities/{id}/stage`, `POST /api/v1/opportunities/{id}/close` (won/lost + reason), `GET /api/v1/pipeline` (board view grouped by stage), `GET/POST/PUT /api/v1/pipeline/stages` (admin stage config).

### 4.6 Quotes-as-Opportunities (extends `quote/`)
A quote should **roll up to an opportunity**, not float free. Add nullable `opportunity_id` to `quotes`; creating a quote against a customer with an open opportunity links automatically (or prompts to create one). Quote state transitions drive opportunity signal: `SENT`→advance stage, `ACCEPTED`→ opportunity Won (and existing `POST /api/v1/quotes/{id}/convert` fires order creation), `REJECTED`→ Lost with reason. Quote analytics (`quote/model.go QuoteAnalytics`: conversion rate, avg margin accepted/rejected, avg days to close, AI vs manual) feed the manager dashboard and the win/loss prediction model (§4.11).

### 4.7 Forecasting & Quotas (net-new, in `opportunity` + new `quota` table)
Per-rep and per-team **quotas** (period, target_cents) with attainment tracked against Won opportunities and/or booked orders. **Forecast** = weighted pipeline + commit/best-case/pipeline categories, rolled to period.
- **API:** `GET/POST/PUT /api/v1/quotas`, `GET /api/v1/forecast?period=&rep=&territory=` (returns commit / best-case / weighted, plus attainment vs quota).

### 4.8 Territories & Assignment (net-new `territory` table; extends `salesteam/` + `customer` `/salesperson`)
`salesteam` is read-only today (`SalesPerson{Name,Email,Phone,Role,IsActive}`, `GET /api/v1/sales-team`) and customers already carry `SalespersonID` with `PATCH /customers/{id}/salesperson`. Add **territories** (by branch/location, postal region, or customer tier) and **assignment rules** (round-robin, by geography, by tier) that auto-set `SalespersonID` on lead conversion and new customers.
- **API:** `GET/POST/PUT /api/v1/territories`, `POST /api/v1/territories/assign` (bulk/rule apply), `GET /api/v1/territories/{id}/accounts`.

### 4.9 Role Dashboards (extends `dashboard/`)
Existing `dashboard/` is operational (summary, top-customers, revenue-trend, inventory-alerts, order-activity) — not pipeline-oriented. Add **sales dashboards keyed by role**:
- **Inside rep:** my open opportunities, tasks due today, quotes awaiting response, accounts slipping (health red), today's cross-sell nudges.
- **Outside rep:** my accounts map, visits due, mobile pipeline (§8).
- **Manager/Owner:** pipeline by stage, forecast vs quota by rep, win rate, activities/rep, follow-up SLA breaches, biggest open opportunities.
- **API (new `sales_dashboard` handlers under dashboard module):** `GET /api/v1/dashboard/sales/rep`, `GET /api/v1/dashboard/sales/manager`, `GET /api/v1/dashboard/sales/pipeline-summary`.

### 4.10 Marketing / Campaigns & Sequences (net-new `campaign` module + real EmailSender)
No campaigns/sequences/segments exist. Build a **campaign** model (one-shot blast or multi-step **sequence**), **segments** (query over `customers` by tier/territory/buying pattern/lapsed), and **campaign_sends** (per-recipient send log, dedup, status). Content sources: freeform templates + the existing **PIM collateral generator** (`pim.GenerateCollateral`, `POST /api/v1/products/{id}/pim/generate/collateral`, types `sell_sheet`/`facebook`/`instagram`/`linkedin`/`email_blast`, stored in `pim_collateral`). Every send writes a `crm_activities` row so it shows on the rep timeline.
- **Hard dependency:** a real `EmailSender`. Today only `notification.LogEmailService` exists ("MOCK EMAIL SENT", `notification/email.go`) with a two-method interface (`SendInvoice`, `SendDeliveryNotification`); SMS already works (`notification/sms.go TwilioSMSService`). Build an **SMTP/SendGrid `EmailSender`** with a `SendCampaignEmail(to, subject, html)` / `SendEmailWithAttachment` surface; key runtime-settable via `ai.KeyStore` pattern under a `smtp.*`/`sendgrid.api_key` `system_settings` key.
- **API:** `GET/POST /api/v1/campaigns`, `GET/PUT /api/v1/campaigns/{id}`, `POST /api/v1/campaigns/{id}/send`, `POST /api/v1/campaigns/{id}/schedule`, `GET /api/v1/segments`, `POST /api/v1/segments/preview` (count + sample). Sequence steps run on the `robfig/cron` pattern (§9).

### 4.11 AI Intelligence (net-new `sales_ai` module; uses `ai.Client` + `MaestroClient` + cron)
Five intelligence surfaces, all resolving keys via `ai.KeyStore` and degrading gracefully when unconfigured (no hard failures — per repo convention):
1. **Cross-sell "blind spot" engine.** For an account, compute the set of categories/SKUs bought by **similar accounts** (same tier, territory, or nearest-neighbor by purchase vector) and subtract this account's own `order_lines` history → ranked gap recommendations. Deterministic gap analysis runs in SQL/Go; `ai.Client.Generate` writes the rep-facing "why/how to pitch" copy. Output cached on the account and surfaced on Accounts 360 + rep dashboard.
2. **Account health / churn-risk scoring.** Inputs: order velocity trend (`order_lines` recency/frequency), AR aging (`invoice.OpenInvoiceStatuses`), dropped categories, days-since-last-order. Nightly cron writes a `health_score` + reason; red accounts feed "accounts slipping."
3. **Lead scoring.** Score inbound leads (source, firmographics, requested products) → priority for rep routing.
4. **Quote win/loss prediction.** Train/heuristic on `quote` analytics (margin, days open, source, tier) to flag quotes likely to slip; nudge follow-up.
5. **Rep-coaching Nudge (the LumberNow concept, finally built).** SKU-mapped playbooks: when a rep adds a SKU to a quote, slide in objection-handling + accessory-attach guidance (<100ms target, pre-fetched; markdown sanitized before render — `lumbernow/product_docs/PRD.md §3`). Content authored by merchandising, augmented by `ai.Client`.
- **API:** `GET /api/v1/customers/{id}/cross-sell`, `GET /api/v1/customers/{id}/health`, `GET /api/v1/leads/{id}/score`, `GET /api/v1/quotes/{id}/win-prediction`, `GET /api/v1/sales/nudges?sku=`.

---

## 5. Data Model (new tables)

All PKs `UUID` v4 (`uuid_generate_v4()`), timestamps `created_at/updated_at`, **money in cents (`BIGINT`)** per the target convention in app code (DB may store `DECIMAL(19,4)`; see §12 caveat). New migrations continue the numbered sequence (latest is `073_pim_media_status.sql`).

- **`leads`** — `id, name, company, email, phone, source, source_detail, score INT, status(NEW/WORKING/QUALIFIED/CONVERTED/DISQUALIFIED), assigned_salesperson_id → sales_team, converted_customer_id → customers (nullable), territory_id → territories (nullable), notes, created_at, updated_at`.
- **`pipeline_stages`** — `id, name, sort_order INT, probability NUMERIC(5,4), is_won BOOL, is_lost BOOL, is_active BOOL`. Seeded default: Qualify → Quoted → Negotiation → Won / Lost.
- **`opportunities`** — `id, customer_id → customers (nullable if lead), lead_id → leads (nullable), name, stage_id → pipeline_stages, owner_id → sales_team, expected_value_cents BIGINT, expected_close_date DATE, primary_quote_id → quotes (nullable), status(OPEN/WON/LOST), close_reason, closed_at, territory_id → territories (nullable), created_at, updated_at`.
- **`opportunity_activities`** — `id, opportunity_id → opportunities, activity_type(STAGE_CHANGE/NOTE/QUOTE_LINKED/…), from_stage_id, to_stage_id, description, logged_by → sales_team, activity_date`. (Mirrors `crm_activities` shape for consistency.)
- **`tasks`** — `id, title, description, due_date TIMESTAMPTZ, status(OPEN/DONE/CANCELLED), assignee_id → sales_team, customer_id → customers (nullable), opportunity_id → opportunities (nullable), contact_id → customer_contacts (nullable), completed_at, created_by, created_at, updated_at`.
- **`territories`** — `id, name, definition JSONB (branch_ids/postal patterns/tiers), assignment_rule(ROUND_ROBIN/GEO/TIER/MANUAL), is_active`.
- **`territory_members`** — `territory_id → territories, salesperson_id → sales_team` (M:N).
- **`quotas`** — `id, salesperson_id → sales_team (nullable for team), territory_id (nullable), period_start DATE, period_end DATE, target_cents BIGINT, created_at`.
- **`campaigns`** — `id, name, type(BLAST/SEQUENCE), channel(EMAIL/SMS), status(DRAFT/SCHEDULED/SENDING/SENT/PAUSED), segment_definition JSONB, template_body, pim_collateral_id → pim_collateral (nullable), scheduled_at, created_by, created_at, updated_at`.
- **`campaign_steps`** — `id, campaign_id → campaigns, step_order INT, delay_days INT, channel, subject, body` (for sequences).
- **`campaign_sends`** — `id, campaign_id → campaigns, step_id → campaign_steps (nullable), customer_id → customers, contact_id → customer_contacts (nullable), to_address, status(QUEUED/SENT/FAILED/BOUNCED/OPENED), sent_at, error`.
- **`account_health`** (or columns on a `sales_intelligence` table) — `customer_id → customers, health_score INT, churn_risk NUMERIC, drivers JSONB, computed_at`.
- **Column adds:** `quotes.opportunity_id` (nullable FK); optional `crm_activities` extension is avoided — tasks/opportunity_activities are separate tables to keep the append-only log clean.

FKs use `ON DELETE` behavior consistent with `migrations/048_fk_on_delete_fix.sql`. Every generated **transactional** table (opportunities, opportunity_activities, tasks, leads, campaign_sends) must be added to `resetTransactionalData()` in `backend/cmd/seed/main.go`; reference tables (pipeline_stages, territories, quotas, campaigns) use `ON CONFLICT DO UPDATE` upserts.

---

## 6. API Surface

New Go modules under `backend/internal/`, each shaped `repository.go` / `service.go` / `handler.go` (with `RegisterRoutes(mux, mw...)`), wired in `backend/cmd/server/main.go`:

- **`lead`** → `/api/v1/leads*`, `/api/integration/leads`
- **`opportunity`** → `/api/v1/opportunities*`, `/api/v1/pipeline*`, `/api/v1/forecast`
- **`task`** → `/api/v1/tasks*`
- **`territory`** → `/api/v1/territories*`, `/api/v1/quotas*`
- **`campaign`** → `/api/v1/campaigns*`, `/api/v1/segments*`
- **`sales_ai`** → `/api/v1/customers/{id}/cross-sell`, `/health`, `/api/v1/sales/nudges`, `/api/v1/quotes/{id}/win-prediction`
- **`dashboard`** (extend) → `/api/v1/dashboard/sales/*`

Auth: guard all with `middleware.RequireRole("sales", "admin", "owner")` at registration (the same per-module pattern used across the monolith, e.g. `crm/handler.go`, `dashboard/handler.go`, `quote/handler.go`). The public lead-intake path uses the `X-Integration-Key` `/api/integration/*` prefix (already in the no-auth whitelist in `cmd/server/main.go`), never a bare `/api/v1` route. `AUTH_MODE=dev` continues to pass through the seeded `demo@gable.com` as admin on demo/staging. JSON only; follow existing handler error/response helpers.

---

## 7. Frontend — `/sales/*` route tree

Replace the current stub `{ path: '/sales', redirect: '/quotes' }` (`app/src/routes.ts:67`) with a real tree. All pages: Light-DOM `gable-*` components (`createRenderRoot(){return this;}`), lazy `load: () => import()` + `layout: 'erp'`, Industrial Dark tokens (`#00FFA3` Gable Green primary, `#161821` Slate Steel cards, `#F43F5E` Safety Red for stockout/credit-hold/at-risk, `#38BDF8` Blueprint Blue for data/links), **Inter** UI, **JetBrains Mono** for every currency/SKU/dimension/number. HTTP strictly via `services/fetchClient.ts` (`fetchWithAuth`), never raw `fetch`; toasts via `ToastService.show`; icons via `icon()` from `lib/icons.ts`. New services mirror `crmApi.ts`/`QuoteService.ts` (e.g. `OpportunityService.ts`, `LeadService.ts`, `TaskService.ts`, `CampaignService.ts`, `SalesDashboardService.ts`) with types in `app/src/types/`.

Pages:
- `/sales` → **Rep Dashboard** (default landing; my pipeline, tasks due, slipping accounts, nudges).
- `/sales/pipeline` → **Pipeline board** (Kanban, drag-to-stage, weighted totals per column in JetBrains Mono).
- `/sales/leads` → **Lead inbox** (score-sorted, source badges, convert action).
- `/sales/opportunities/:id` → **Opportunity detail** (stage timeline, linked quotes, tasks, activity).
- `/sales/dashboard/manager` → **Manager dashboard** (forecast vs quota, win rate, activities/rep, SLA breaches) using Chart.js 4.
- `/sales/accounts` and `/sales/accounts/:id` → reuse/extend existing `pages/accounts/AccountsPage.ts` + `AccountDetailPage.ts` (add Opportunities/Tasks/Buying-Pattern/Health tabs).
- `/sales/tasks` → **Activity/Task timeline** (agenda + calendar).
- `/sales/territories` → **Territory & assignment admin** (rules, members).
- `/sales/forecast` → **Forecast** (commit/best-case/weighted).
- `/sales/campaigns` and `/sales/campaigns/:id` → **Campaign manager** (segment builder, sequence steps, send log, PIM-collateral picker).

Screens will be produced in **Miro + HTML artifacts** and linked from this doc; the route list above is the build contract.

---

## 8. Mobile Field App (outside reps)

Precedent exists: the app already ships **role-scoped mobile layouts** (`/driver/*` layout `driver`, `/yard/*` layout `yard`) as Light-DOM shells (`<gable-driver-layout>`, `<gable-yard-layout>`). Build a **`/field/*` (or `/sales/mobile/*`) tree with a `field` layout** for outside reps:
- **Account visit check-ins** — geo-stamped, write a `crm_activities` MEETING row (+ optional `tasks` follow-up).
- **Mobile pipeline** — read-only-fast Kanban + one-tap stage advance.
- **Offline-tolerant activity logging** — queue writes locally and flush on reconnect. The repo already has an offline-sync foundation (`migrations/044_offline_sync.sql`) to build on; reuse rather than invent.
- **On-visit context** — account's open quotes, live AR/credit status, and cross-sell gaps prefetched for offline read.
Design constraint: large tap targets, `#0A0B10` Deep Space background reads well outdoors; the LumberNow "field-mode" AMOLED-black precedent validates the pattern.

---

## 9. Intelligence Layer (detail)

Runtime substrate already exists and is reused wholesale:
- **`ai.Client`** (`internal/ai/openrouter.go`) — one OpenAI-compatible OpenRouter client for text/vision/image; key via `ai.KeyStore` (DB-first `system_settings`, env fallback, 30s TTL), runtime-settable in **Tech Admin → AI**. Degrade gracefully when unset.
- **`MaestroClient`** (`internal/ai/maestro_client.go`) — optional Brain gateway for org-metered AI; usable for conversational coaching if enabled.
- **`robfig/cron`** — the proven pattern in `purchase_order/scheduler.go` (settings-driven cron exprs like `reorder.refresh_cron`, `AddFunc`, per-run rows in `reorder_runs`). Mirror it for CRM: a `sales_intel_runs` observability table + `sales.health_cron` / `sales.crosssell_cron` settings.

Where each runs:
| Surface | Inputs | Compute | Where | Cadence |
|---|---|---|---|---|
| Cross-sell blind spot | `order_lines` (this vs peer accounts), `products`/categories, `customer.Tier`/territory | SQL gap analysis + `ai.Client.Generate` for pitch copy | `sales_ai` service | Nightly cron + on-demand `GET /cross-sell` |
| Account health / churn | order velocity, `invoice.OpenInvoiceStatuses` AR aging, dropped categories | Go scoring, cache to `account_health` | cron | Nightly (`sales.health_cron`) |
| Lead scoring | lead source/firmographics/products | heuristic + `ai.Client` | `sales_ai` on lead create | On write |
| Quote win/loss prediction | `quote` analytics (margin, days open, source, tier) | heuristic model | `sales_ai` | On quote view / nightly |
| Rep-coaching Nudge | active quote SKUs → mapped playbooks (`pim_collateral`/authored) | prefetched lookup + `ai.Client` augmentation | frontend + `GET /sales/nudges` | Real-time (<100ms, prefetched) |

All AI outputs are advisory and logged as activities where user-visible; no AI result hard-blocks a sales action.

---

## 10. Phasing

- **MVP** — `lead` + `opportunity`/`pipeline` + `task` modules, quotes-as-opportunities linkage, **Rep Dashboard** + Pipeline board + Lead inbox, reusing existing accounts/quotes/activities. Auto-capture quote/order events as activities. No new AI, no EmailSender.
- **V1** — Forecasting + quotas + territories/assignment, Manager dashboard, **Marketing campaigns + email sequences** (ships the SMTP/SendGrid `EmailSender`), PIM-collateral-as-content, segment builder.
- **V2** — AI cross-sell blind-spot + account health/churn + lead scoring + quote win prediction + rep-coaching Nudge; **mobile field app** (offline activity logging, visit check-ins, mobile pipeline).

---

## 11. Success Metrics

- **Pipeline created** (# and $ weighted) per rep/period.
- **Win rate** (Won / closed opportunities) and **quote conversion** (from `quote` analytics).
- **Cross-sell attach rate** — % of orders including an AI-recommended gap category; incremental $ attributed.
- **Activities / rep / week** and **task follow-up SLA** (% tasks completed by due date; % slipping accounts touched within N days).
- **Forecast accuracy** — |forecast − actual| by period.
- **Top-line account growth** — same-account YoY revenue for accounts under active CRM management vs control.
- **Adoption** — % of quotes linked to an opportunity; DAU of `/sales/*` among the sales team.

---

## 12. Risks / Open Questions

- **Money convention drift.** Quotes/reporting use **float dollars** (legacy); ERP orders/invoices and `account` use **int64 cents**; portal uses float dollars (`portal/model.go` TODO). New CRM money (`expected_value_cents`, `target_cents`) will be **cents in app code** per the target convention, but must convert carefully at every join to `quote.TotalAmount` (float) and `customer.CreditLimit`/`BalanceDue` (float). Render ERP-derived money with `formatCents()`; never `.toFixed(2)` a cents field. **Open:** whether to fold the `customer.credit_limit`/quote float→cents migration into V1 or keep as separate debt (currently separate).
- **EmailSender is a hard build.** Only `LogEmailService` (mock) exists and its interface (`SendInvoice`/`SendDeliveryNotification`) doesn't match campaign needs. Sequences/campaigns are blocked until a real SMTP/SendGrid sender with `SendCampaignEmail`/`SendEmailWithAttachment` lands, keyed via `KeyStore`. Deliverability (SPF/DKIM, bounce handling, unsubscribe/CAN-SPAM) is net-new scope. SMS piggybacks on existing `TwilioSMSService`.
- **Native vs HubSpot boundary — native chosen (locked).** Rationale: the ERP *is* the CRM's database, so a bolt-on re-imports data we already own and fragments auth/roles; a native module reads `customers`/`quotes`/`orders`/`order_lines` directly in one transaction. Risk: we rebuild table-stakes CRM UX (sequences, reporting) that mature SaaS ships free. Mitigation: reuse existing dashboard/quote-analytics/PIM/AI/cron infrastructure; scope marketing to outbound-to-owned-list only.
- **AI data volume.** Cross-sell nearest-neighbor and health scoring depend on sufficient `order_lines` history; sparse/new tenants get weak recommendations. Mitigation: tier/territory cohort fallback when per-account history is thin; graceful "not enough signal yet" states; nightly precompute (not request-time) to control cost/latency.
- **Auto-captured activity noise.** Writing an activity for every quote-sent/order/payment could bury human notes. Open: separate "system" vs "manual" activity streams / filters on the timeline.
- **Assignment vs. existing `SalespersonID`.** Territory rules must reconcile with manual `PATCH /customers/{id}/salesperson` overrides — manual assignment wins; rules fill gaps only. Open: audit-log assignment changes via `pkg/audit.Logger`.
