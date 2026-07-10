# Ridge — GableLBM-side specs

**Ridge** is the go-to-market layer on top of GableLBM ERP (customer ordering + sales/marketing CRM + CMS/growth). The **canonical, full PRD set** lives in the `lumbernow` repo at `product_docs/ridge/` (branch `claude/module-planning-prd-enpwrh`), alongside the hi-fi design preview and Miro flow board.

This folder mirrors the specs whose **implementation home is GableLBM**, so the ERP team has them in-repo:

| Doc | GableLBM work it drives |
|---|---|
| `00_RIDGE_MASTER_PRD.md` | Cross-surface architecture, personas, phasing, the revenue flywheel. |
| `02_SALES_MARKETING_CRM_PRD.md` | New Go modules (`lead`, `opportunity`, `pipeline`, `task`, `campaign`, `territory`, `quota`, `sales_ai`) + `/sales/*` `gable-*` route tree. Reuses `customer`, `quote`, `order`, `crm`, `salesteam`. |
| `03_CMS_GROWTH_AGENTS_PRD.md` | CMS content service + `/api/v1/cms/*`, an Astro SSR content site, and autonomous SEO/GEO + lead-gen agents on the existing `ai.Client` + `robfig/cron` + A2A runtime. |
| `04_DESIGN_AND_FLOWS.md` | Design language (Industrial Dark + light theme), IA, and user flows. |

**Foundational GableLBM changes these depend on** (cross-referenced with the Tier-1 backlog):
- Real `EmailSender` (SMTP/SendGrid) — only `LogEmailService` exists today. Blocks CRM sequences and lead-gen outreach.
- Honor portal `POST /checkout` delivery/payment fields (currently only logged).
- Persist Ridge Project Boards server-side (extend `internal/project` or new portal endpoints).
- Money convention: portal float-dollars vs ERP int64-cents — convert only at boundaries; the cents migration is already on the backlog.

See the ordering-surface spec (`01_ORDERING_PROCUREMENT_PRD.md`) in the `lumbernow` repo for the customer-app integration details.
