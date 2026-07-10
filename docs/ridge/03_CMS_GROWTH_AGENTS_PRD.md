# Ridge Surface 3 — CMS & Autonomous Growth Agents

> **Product:** Ridge (aka *Gable Ridge*) — the go-to-market layer on top of the GableLBM ERP.
> **This surface:** (A) a **CMS** for the customer-facing content site, and (B) scaffolding for **autonomous lead-generation and SEO/GEO agents** that grow top-line customer accounts.
> **Status:** Draft PRD, engineering-grade. Companion docs: `01_customer_portal.md`, `02_SALES_MARKETING_CRM_PRD.md` (the CRM `lead` module this surface feeds), `DESIGN_SYSTEM.md`.
> **Owning repos:** content site (new SSG package), CMS + agent services in `GableLBM-main/backend`, agent config UI in `GableLBM-main/app`.

---

## 1. Overview & Context

Ridge splits the customer-facing web experience into **two sub-products with fundamentally different rendering requirements**:

1. **The public content site** — home, category, product, brand, location, guides/blog, and FAQ pages that must be discoverable by search engines *and* citable by AI answer engines. These need real, server-rendered HTML with structured data at first byte.
2. **The authenticated Pro Workspace** — the existing LumberNow/Ridge ordering SPA (Lit 3, hash-routed `RouterService`, `ln-page-*` components). This is app software: it lives behind login, is never indexed, and is fine as a client-rendered SPA.

Today the entire public surface is trapped inside the SPA. `frontend/index.html` ships only a static `<title>` and one `<meta name="description">`; the hash router means Google and GPTBot see an empty shell — there is no per-page meta, no `og:`, no JSON-LD, no `sitemap.xml`, no `robots.txt`, and no SSR (confirmed absent in both repos). Content pages `ln-page-landing.ts` / `ln-page-about.ts` are "content-driven but layout-hard-coded": copy and images come from `GET /v1/storefront/config` (`backend/internal/api/server/storefront.go`, backed by the single-row `storefront_config` table — `hero_title`, `hero_subtitle`, `hero_image_url`, `about_content`, `about_blocks JSONB`, `announcement_text`), but the page structure is baked into Lit templates. `about_blocks` (a JSONB bag) is the closest thing to editable content blocks that exists.

**LOCKED architectural decision:** a **dedicated SSG/SSR content site (recommend Astro)** renders the public marketing + content surface as real HTML with structured data. The Lit SPA stays as the Pro Workspace. Client-rendered SPAs cannot be reliably ranked or cited; a hydration-optional SSG can.

**The growth loop this unlocks** — content → organic/AI-referral traffic → captured web lead → CRM opportunity (Surface 2) → order (ERP). The CMS produces the content; the SSG site makes it discoverable; the SEO/GEO agent keeps it optimized; the lead-gen agent turns visitors into rows in the CRM `lead` module. Every stage is measurable, which is what makes the agents' autonomy safe to expand over time.

**GEO/GIO (Generative Engine Optimization)** = optimizing content to be *cited by AI answer engines* (ChatGPT, Perplexity, Google AI Overviews), run alongside classic SEO. Load-bearing 2026 tactics baked into this spec: direct-answer-first blocks (≤40 words, then expand), AI crawlers explicitly allowed in `robots.txt`, schema.org structured data on every page, query fan-out coverage, natural-language Q&A content, authority signals, and per-page canonical/OG tags.

## 2. Goals / Non-Goals

**Goals**
- A block-based CMS that models pages, reusable components, articles, and location pages — white-labeled per dealer/tenant.
- An Astro content site that renders those pages as SSR/SSG HTML with full structured data, `sitemap.xml`, and `robots.txt`.
- An autonomous SEO/GEO agent that drafts and optimizes content with human-in-the-loop publish, plus rank/citation monitoring.
- An autonomous lead-gen agent that captures/enriches/scores inbound leads into the CRM and (V2) runs compliant outbound sequences.
- Reuse of the GableLBM PIM (`pim_content`, `pim_media`, `pim_collateral`) as the product-content source of truth.

**Non-Goals**
- **Not** converting the Pro Workspace SPA to SSR. It stays a client-rendered Lit app behind auth.
- **Not** replacing PIM. Product descriptions, images, and per-product SEO stay in `internal/pim`; the CMS *consumes* them.
- **Not** building a general-purpose page builder for arbitrary HTML/JS. Blocks are a curated, typed set.
- **Not** a new AI vendor. All generation goes through the existing `ai.Client` (OpenRouter) / optional `MaestroClient`.

## 3. Personas

- **Marketing/Growth operator (primary).** Owns the content calendar and the growth agents. Reviews AI-drafted pages, approves publishes, watches the rank/citation dashboard. Wants leverage, not a keyboard job — the agents should do 80% and ask for sign-off.
- **Merchandising/Admin Manager (secondary).** Per `PERSONAS.md §2`: "Comfortable with CMS interfaces," works directly with vendor reps (e.g., Trex) to keep product data accurate, and struggles to push battlecards/collateral to the field. Maps product landing pages and brand pages to real vendor relationships; is the human who curates PIM output into published pages.
- **The dealer (tenant owner, e.g., Gable Supply).** Wants top-line account growth and a professional web presence without a marketing hire. Cares about lead volume and CAC, not schema markup.
- **The end-searcher (contractor / builder / DIY).** Discovers the dealer via a Google search or an AI answer ("best pressure-treated deck boards near me"). Lands on a product/location/guide page, converts on a quote/contact form. Never sees the CMS; is the reason SSR exists.

## 4. Part A — CMS: Content Model & Authoring

### Content types
- **Pages** — composed of ordered **blocks**; slug-addressed; per-page SEO metadata. Covers home, about, static marketing pages.
- **Reusable blocks/components** — a curated typed set: `hero`, `rich_text`, `direct_answer` (the ≤40-word GEO block), `product_grid`, `product_spotlight`, `cta`, `faq`, `comparison_table`, `image`, `gallery`, `testimonial`, `location_card`, `guide_steps`. Each block is a JSON object validated against a schema (extends the existing `about_blocks JSONB` idea into a first-class, versioned model).
- **Articles / blog** — buying guides, how-tos, comparisons, news. First-class `Article` schema.org type. Primary GEO surface (natural-language Q&A, direct-answer blocks).
- **Product landing pages** — generated from a product + its PIM aggregate (`pim_content.long_description`, `pim_content.attributes`, `pim_media`, `pim_content.seo_*`), enriched with CMS blocks (comparison, FAQ, related guides).
- **Category & brand pages** — hub pages over the portal catalog (`GET /v1/catalog/categories`, `/brands`) + editorial intro blocks. Brand pages tie to the Merchandising persona's vendor relationships.
- **Location/store pages** — one page per branch (GableLBM `locations`), the core **local SEO** surface: address, hours, service area, `LocalBusiness` + `BreadcrumbList` schema, inventory highlights.
- **Resource / guide / FAQ pages** — evergreen Q&A; `FAQPage` schema; direct-answer-first.

### Build-vs-buy for the authoring layer

| Option | Pros | Cons | Verdict |
|---|---|---|---|
| **DB-backed content service in GableLBM** (recommended) | Native multi-tenant isolation (already solved per-tenant), reuses `ai.Client`/PIM/auth/audit, no new vendor bill, agents write directly to the same tables | We build the block editor UI | **Recommend.** The agent-authoring requirement (agents mutate content programmatically with an audit trail) makes an in-house model far cleaner than webhooking a SaaS CMS. |
| Sanity / Payload / Strapi (headless SaaS/OSS) | Mature block editors, previews | Multi-tenant content isolation becomes their problem; agent writes go through their API; second source of truth; per-seat/usage cost | Reject for v1. Revisit only if authoring UX becomes the bottleneck. |

**Authoring UX:** a `gable-*` admin route tree under `/erp/marketing/cms/*` (Lit, Light DOM, design-system tokens). Block-list editor with add/reorder/duplicate, per-block typed forms, live preview against the Astro renderer, and a **"generate with AI"** action per block (SEO/GEO agent drafts, human edits).

**Draft/publish/versioning:** every page has a `status` (`draft`/`in_review`/`published`/`archived`) and an immutable `content_versions` history (who/what/when, human vs. agent author). Publishing snapshots the block tree; the SSG reads only `published`. This is the human-in-the-loop gate for autonomous content.

**White-label per dealer:** content is tenant-scoped exactly like `storefront_config`/`branding_config` today. Branding (logo, primary color, company name) already resolves via `GET /v1/tenant/branding`; the CMS extends this so each tenant's Astro site is themed and content-isolated.

**Media & i18n-ready:** media references reuse `pim_media` for product imagery plus a CMS media table for editorial assets (data-URI or object-store URL, `alt_text` required for schema/accessibility). Schema carries an optional `locale` column so translations attach to a canonical page id (i18n deferred, not designed out).

**PIM integration:** the CMS never re-authors product copy — it references `pim_content`/`pim_media`/`pim_collateral` by `product_id`. `pim_collateral` (sell sheet / facebook / instagram / linkedin / email_blast, from `037_pim_content.sql`) becomes a social/email content source for the growth agents.

**Content API for the SSG:** a read endpoint (see §9) returns the published block tree + resolved SEO metadata + referenced PIM/catalog data in one payload, so Astro can render a page with minimal round-trips at build/request time.

## 5. Part A — Rendering / SSG Site (Astro)

**Structure** (new package, e.g. `ridge-site/`): file-based routes with hybrid rendering — SSG for stable pages (guides, brand, location), SSR/ISR for catalog pages that change with pricing/inventory.

**Routes:** `/` (home), `/products/[slug]`, `/categories/[slug]`, `/brands/[slug]`, `/locations/[slug]`, `/guides/[slug]` + `/blog`, `/faq`, plus a CTA/contact route hosting the lead-capture form.

**Structured data (JSON-LD, per route):**
- Product pages → `Product` + `Offer` (price/availability from portal catalog) + `BreadcrumbList`.
- Brand/category → `BreadcrumbList` + `ItemList`.
- Location → `LocalBusiness` (address, geo, hours) + `BreadcrumbList`.
- Guides/blog → `Article`; FAQ → `FAQPage`; site-wide → `Organization`.

**Crawlability:** generated `sitemap.xml` (all published pages) and a `robots.txt` that **explicitly allows AI crawlers** — `GPTBot`, `PerplexityBot`, `Google-Extended`, `ClaudeBot`, `CCBot` — alongside classic bots. Every page emits canonical, OpenGraph, and Twitter-card tags; product/location pages set `og:image` from `pim_media`/branding.

**GEO on-page:** each page leads with a `direct_answer` block (≤40 words) rendered above the fold and marked up for answer extraction, then expands. Guides use natural-language Q&A headings to cover query fan-out.

**Data sources:** the CMS content API (§9) for blocks/SEO; the LumberNow portal catalog (`/v1/catalog/*`) for live product/price/availability; `/v1/tenant/branding` for theme. Multi-tenant: the site resolves tenant by host (`gablesupply.com` → tenant id → `X-Tenant-ID`), mirroring the existing per-tenant pattern.

**Core Web Vitals & design parity:** SSG HTML + minimal hydration keeps LCP/CLS/INP green. Styling ships the **Industrial Dark** system (`#00FFA3`, `#0A0B10`, `#161821`, `#F43F5E`, `#38BDF8`; Inter + JetBrains Mono for numbers/SKUs/prices) so the public site and Pro Workspace read as one brand.

**Deploy target:** Vercel (native Astro SSR/ISR, matches LumberNow's existing Vercel usage) or DO App Platform to sit beside the ERP. Preview deploys per content branch feed the CMS "live preview."

## 6. Part B — Autonomous SEO/GEO Agent

**Responsibilities:** generate & optimize content — product landing pages, buying guides, FAQ, comparison pages, location pages; author direct-answer blocks; propose internal links; attach schema; cover target keywords and query fan-out; detect thin/missing/stale pages (coverage gaps).

**Runtime & reuse:** hosted in GableLBM as a module (`internal/seo` or `internal/growth`) following the established shape (`repository.go`/`service.go`/`handler.go`/`routes.go`, wired in `cmd/server/main.go`). Generation goes through `ai.Client.Generate` (`internal/ai/openrouter.go`) with keys resolved via `ai.KeyStore` (runtime-settable in Tech Admin → AI). It **reuses PIM's `GenerateSEO` and `GenerateCollateral`** (`internal/pim/service.go`) rather than reimplementing them — those already produce `seo_title`/`seo_description`/`seo_keywords`/`seo_slug` and social/email collateral against a lumber-domain system prompt. Scheduling uses **`robfig/cron`**, copying the auto-reorder precedent (`internal/purchase_order/scheduler.go`): an operator flips `seo.enabled=true` in `system_settings`, sets cron expressions, and runs in `dry_run` until trusted.

**Human-in-the-loop:** the agent writes pages/blocks in `status='in_review'`, never `published`. The Marketing operator approves in the CMS; publish transitions status and snapshots a `content_version`. Autonomy is dialable per content type (e.g., FAQ auto-publish once trusted; location pages always reviewed).

**Citation & rank monitoring:** a `citation_checks` table logs, per query, whether the dealer's content was cited/mentioned by an AI answer engine and its classic keyword position. The agent runs periodic checks (query the engines, parse for the tenant's domain/brand), storing verdicts for the dashboard. This closes the GEO measurement loop.

**Observability:** an `seo_runs` table mirroring `reorder_runs` (`056_reorder_runs.sql`) — one row per job execution: `job`, `started_at`/`finished_at`, `dry_run`, `status` (`RUNNING/SUCCESS/FAILED/SKIPPED`), counters (`pages_drafted`, `pages_optimized`, `gaps_found`), `error_message`. Powers "did the agent run last night?" and a recent-runs feed, with manual triggers exactly like `/purchase-orders/refresh-reorder-targets` + `/purchase-orders/reorder-runs`.

**Optional metered routing:** for tenants on Brain billing, text generation can route through `MaestroClient` (`internal/ai/maestro_client.go`), which forwards the JWT for org-level AI metering — the same extension point already stubbed in `ai.Client.WithMaestro`.

## 7. Part B — Autonomous Lead-Gen Agent

**Inbound (V1):** capture web-form and content-driven leads from the Astro site, enrich (company/domain/geo lookups), score, and **write them into the CRM `lead` module** built in Surface 2 (`02_SALES_MARKETING_CRM_PRD.md`). Until that module lands, leads persist in a `web_leads` staging table (§8) and sync when the CRM is ready. Scoring uses `ai.Client` (fit + intent from page context, form fields, referral source — organic vs. AI-referral is a signal).

**Outbound prospecting (V2):** identify likely accounts (contractors/builders in the dealer's service area, informed by category interest and location-page traffic), draft personalized email sequences using `pim_collateral` and guide content, and queue them for operator approval before send. Fully autonomous send stays gated until deliverability and compliance are proven.

**EmailSender dependency (blocking):** outreach and nurture require real email, which **does not exist yet** — `internal/notification/email.go` ships only `LogEmailService` (a mock that logs `SendInvoice`/`SendDeliveryNotification`). A real SMTP/SendGrid `EmailSender` must be built (also on the GableLBM backlog for scheduled reports). SMS reuse is available via the existing `TwilioSMSService`.

**Compliance:** CAN-SPAM/CASL — physical address in every outbound email, one-click unsubscribe honored before send, suppression list, and per-message audit via `pkg/audit.Logger`. No purchased lists; enrichment only on inbound-consented or public-business data.

**Events:** inbound captures and lead hand-offs are emitted as signed events, reusing the **A2A JWS pattern** (`internal/purchase_order/a2a_receiver.go`: RS256 detached JWS, `X-Idempotency-Key`, dedup log) for a new `web_lead_captured` / `lead_qualified` event type, or via `/api/integration/*` (`X-Integration-Key`) for service-to-service sync into the CRM.

## 8. Data Model (new tables, UUID PKs)

- **`content_pages`** — `id`, `tenant_id`, `type` (`page/article/product_landing/category/brand/location/faq/guide`), `slug` (unique per tenant+type), `title`, `status`, `locale`, `ref_id` (product/category/brand/location FK when generated), `published_at`, timestamps.
- **`content_blocks`** — `id`, `page_id` FK, `block_type`, `sort_order`, `data JSONB` (schema-validated per type). (Supersedes the ad-hoc `about_blocks` JSONB.)
- **`content_versions`** — `id`, `page_id`, `version`, `snapshot JSONB` (full block tree + SEO), `authored_by`, `author_kind` (`human`/`agent`), `created_at`.
- **`articles`** — optional projection over `content_pages` where `type='article'` for editorial fields (author, excerpt, tags, hero).
- **`seo_metadata`** — `id`, `page_id`, `seo_title`, `seo_description`, `canonical_url`, `og_image_url`, `keywords TEXT[]`, `jsonld JSONB`. (Product pages inherit from `pim_content.seo_*`; CMS can override.)
- **`redirects`** — `id`, `tenant_id`, `from_path`, `to_path`, `code` (301/302) — preserve link equity when slugs change.
- **`seo_runs`** — observability, mirrors `reorder_runs` (see §6).
- **`citation_checks`** — `id`, `tenant_id`, `query`, `engine` (`chatgpt/perplexity/google_ai/google_serp`), `cited BOOLEAN`, `position INT`, `snippet TEXT`, `checked_at`.
- **`web_leads`** — `id`, `tenant_id`, `source_page_id`, `email`, `name`, `company`, `phone`, `referral` (`organic/ai/direct/paid`), `enrichment JSONB`, `score INT`, `crm_lead_id` (nullable, set on sync), `created_at`. Reuse the CRM `leads` table directly once Surface 2 exposes it; `web_leads` is the staging seam.
- **`campaigns`** (linkage) — associates outbound sequences with `content_pages`, `pim_collateral`, and target lead segments for attribution.

## 9. API Surface

- **CMS admin CRUD** — `/api/v1/cms/pages`, `/pages/{id}`, `/pages/{id}/blocks`, `/pages/{id}/versions`, `/pages/{id}/publish`, `/media`, `/redirects`. Role-gated with `middleware.RequireRole("admin","owner","marketing")`, wired via `RegisterRoutes` in `cmd/server/main.go`.
- **Public content read (for the SSG)** — `/api/portal/v1/content/pages/{slug}` and `/api/portal/v1/content/sitemap` returning only `published` content + resolved SEO + referenced PIM/catalog data. Public paths follow the portal whitelist pattern; tenant resolved by host/`X-Tenant-ID`. Alternatively `/api/integration/content/*` (`X-Integration-Key`) for a trusted build-time pull.
- **Agent trigger + observability** — mirror the PO reorder endpoints: `POST /api/v1/seo/generate` (draft/optimize a page or scan for gaps), `POST /api/v1/seo/refresh-citations`, `GET /api/v1/seo/runs` (like `GET /api/v1/purchase-orders/reorder-runs`), `GET /api/v1/seo/citations`.
- **Lead events** — `POST /api/portal/v1/leads` (public form submit) → `web_leads`; `POST /api/v1/a2a/lead-captured` (signed, idempotent) or `/api/integration/leads/sync` into the CRM.
- **Reuse existing** — `GET /v1/storefront/config`, `/v1/tenant/branding`, `/v1/catalog/*` for the SSG; `POST /api/v1/products/{id}/pim/generate/{seo,collateral}` for product-page content.

## 10. Architecture (described)

```
        end-searcher (Google / ChatGPT / Perplexity)
                        │  crawl + cite
                        ▼
   ┌─────────────────────────────────────────────┐
   │   Astro SSG/SSR content site  (Vercel/DO)     │
   │   home·category·product·brand·location·guides │
   │   JSON-LD · sitemap.xml · robots(AI-allowed)  │
   └──────┬───────────────────────────┬───────────┘
   reads  │ content API               │ catalog/branding
          ▼                           ▼
   ┌──────────────┐            ┌──────────────────┐
   │  CMS service │◀──writes───│  LumberNow portal│
   │ content_*    │  (agent)   │  /v1/catalog/*   │
   │ seo_metadata │            └──────────────────┘
   └──┬────────▲──┘
      │        │ reuses GenerateSEO / GenerateCollateral, pim_media
      │        ▼
      │   ┌──────────────┐   ai.Client (OpenRouter) · KeyStore · cron
      │   │  PIM module  │   ┌───────────────────────────────────────┐
      │   └──────────────┘   │ SEO/GEO agent  → seo_runs, citation_* │
      │                      │ Lead-gen agent → web_leads, EmailSender│
      │                      └───────────────┬───────────────────────┘
      │ lead capture (public form)           │ signed events (A2A JWS)
      ▼                                       ▼
   ┌──────────────┐   sync    ┌──────────────┐    metering   ┌────────┐
   │  web_leads   │──────────▶│ CRM `leads`  │◀─── JWT ──────│ Brain  │
   │  (staging)   │           │ (Surface 2)  │   Maestro     │Gateway │
   └──────────────┘           └──────┬───────┘               └────────┘
                                      ▼
                               opportunity → order (ERP)
```

## 11. Phasing

- **MVP — CMS + SSG foundation.** Content model (`content_pages`/`content_blocks`/`content_versions`/`seo_metadata`), block editor in the GableLBM admin, public content-read API. Astro site rendering home/category/product/location with full JSON-LD, `sitemap.xml`, `robots.txt` (AI crawlers allowed), canonical/OG. Product pages source PIM. No agents yet — humans author. **Exit:** a tenant's pages are indexable and pass Core Web Vitals + Rich Results tests.
- **V1 — SEO/GEO agent + inbound leads.** Agent drafts/optimizes into `in_review` with human approval; `seo_runs` + manual triggers; `citation_checks` monitoring dashboard. Real SMTP/SendGrid `EmailSender` shipped. Inbound lead capture → `web_leads` → CRM sync. **Exit:** agent-drafted pages publish after review; first web leads land in the CRM.
- **V2 — Autonomous outbound + continuous GEO.** Compliant outbound prospecting sequences (approval-gated → progressively autonomous), a continuous GEO optimization loop (detect gap → draft → review → publish → measure → iterate), and multi-dealer scale (per-tenant content isolation, per-tenant sites at scale).

## 12. Success Metrics

- **Traffic:** organic sessions, AI-referral sessions (ChatGPT/Perplexity referrers), indexed page count.
- **GEO:** AI-answer citations/mentions (`citation_checks.cited` rate), share-of-answer vs. competitors.
- **SEO:** keyword coverage & average position, % of catalog with a live product landing page.
- **Content velocity:** pages published/week, agent-drafted %, human-edit rate before publish (quality signal).
- **Funnel:** leads generated, lead→opportunity→order conversion, CAC, and the north-star — **net new customer accounts / top-line revenue growth** attributable to Ridge content.
- **Ops health:** agent run success rate (`seo_runs`), email deliverability, unsubscribe/complaint rate.

## 13. Risks / Open Questions

- **SSG data freshness vs. live catalog.** Prices/inventory change constantly; fully static product pages go stale. *Mitigation:* SSR/ISR for catalog routes, static for evergreen guides; short ISR TTLs + on-publish revalidation webhooks.
- **Oversight of autonomous publishing.** An agent shipping wrong specs/prices is a brand and liability risk in LBM. *Mitigation:* `in_review` gate by default, autonomy dialed per content type, `content_versions` audit + one-click rollback, and factual grounding from PIM (never fabricate species/grade/treatment — the existing `lumberSystemPrompt` guardrail).
- **GEO measurability.** AI-answer citations are noisy and engine-dependent; `citation_checks` is a sampling, not ground truth. *Open question:* which engines/APIs to poll and at what cadence/cost.
- **EmailSender & deliverability.** No real sender exists today; cold-start domain reputation, SPF/DKIM/DMARC, and CAN-SPAM/CASL compliance gate all outbound. *Open question:* SendGrid vs. self-hosted SMTP; per-tenant sending domains.
- **Multi-tenant content isolation.** Content, media, leads, and citation data must be strictly tenant-scoped (as `storefront_config` already is) and the Astro host→tenant resolution must be spoof-proof.
- **Two front-end codebases.** The Astro site and the Lit Pro Workspace must stay visually and navigationally coherent (shared Industrial Dark tokens, shared auth hand-off from public CTA into the logged-in app).
- **Sequencing dependency.** Lead-gen value is capped until the Surface 2 CRM `lead` module lands; `web_leads` staging de-risks but doesn't eliminate the ordering constraint.
