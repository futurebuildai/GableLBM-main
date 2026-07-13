# Ridge — GableLBM-side specs

**Ridge** is the go-to-market layer on top of GableLBM ERP (customer ordering + sales/marketing CRM + CMS/growth). The **canonical PRD set** lives in the `lumbernow` repo at `product_docs/ridge/` (branch `claude/module-planning-prd-enpwrh`), alongside the hi-fi design preview and the Miro flow board. This folder mirrors the specs whose **implementation home is GableLBM**.

> Status: **v0.1 — planning.** Companion renderings: design preview → `claude.ai/code/artifact/6eb6b408-4280-4ebb-bd7e-e968c4b2f57d` · Miro → `miro.com/app/board/uXjVH8y-DTY=/`.

## Documents here

| Doc | GableLBM work it drives |
|---|---|
| `00_RIDGE_MASTER_PRD.md` | Cross-surface architecture, personas, phasing, the revenue flywheel. |
| `02_SALES_MARKETING_CRM_PRD.md` | New Go modules (`lead`, `opportunity`, `pipeline`, `task`, `campaign`, `territory`, `quota`, `sales_ai`) + `/sales/*` `gable-*` route tree. Reuses `customer`, `quote`, `order`, `crm`, `salesteam`. |
| `03_CMS_GROWTH_AGENTS_PRD.md` | CMS content service + `/api/v1/cms/*`, Astro SSR content site, and autonomous SEO/GEO + lead-gen agents on the existing `ai.Client` + `robfig/cron` + A2A runtime. |
| `04_DESIGN_AND_FLOWS.md` | Design language (Industrial Dark + light theme), IA, user flows. |
| `05_EXECUTION_ROADMAP.md` | Phase 0→1 epics/stories, critical path, sizing, wave-based build order, decision gates. |
| `06_MONEY_CENTS_MIGRATION.md` | Build-ready money → int64 cents plan (F7): Stage A (app-layer, portal-first, low-risk) vs Stage B (DB column flip, deferred). Names the exact modules/files/lines. |

> The customer-app / ordering spec (`01_ORDERING_PROCUREMENT_PRD.md`) lives in the `lumbernow` repo — it's the Ridge frontend side.

## Decisions affecting GableLBM
- **D1 = per-dealer subdomain → dedicated Gable deployment.** No ERP re-architecture; each dealer keeps its own single-tenant deployment; Ridge resolves host → portal base URL at the edge.
- **D2 = migrate to int64 cents first.** Do **Stage A** (app-layer: `portal`, `quote`, `reporting`, `pricing`, `pos` DTOs → `int64` cents at the repo boundary), **portal-first**, to unblock Ridge Ordering. **Stage B** (flip `DECIMAL` money columns → `BIGINT`) is deferred/optional. See `06`.
- **D2a (open)** — sub-cent unit prices (mills vs decimal vs cent-round). Resolve before F7/A1 tickets.

## Foundational GableLBM changes these depend on
- Real `EmailSender` (SMTP/SendGrid) — only `LogEmailService` exists. Blocks CRM sequences and lead-gen outreach.
- Honor portal `POST /checkout` delivery/payment fields (currently only logged).
- Persist Ridge Project Boards server-side (extend `internal/project` or new portal endpoints).
- Money → int64 cents (Stage A, per `06`).
