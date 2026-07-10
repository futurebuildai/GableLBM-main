# Ridge — Money → int64 Cents Migration (build-ready)

> Build-ready technical plan for **F7** (decision **D2 = migrate to cents first**). Grounded in a full call-site inventory of `/home/user/GableLBM-main`.
> **Companion:** `05_EXECUTION_ROADMAP.md` (F7 epic). **Status:** ready to size/ticket.

---

## 0. The reframe that makes this safe

"Migrate to cents" hides **two different migrations**. Getting this distinction right is the whole plan:

| | **Stage A — app-layer cents** | **Stage B — storage-layer cents** |
|---|---|---|
| What changes | Go structs/DTOs + JSON wire → `int64` cents; each repo converts at its boundary | DB money columns `DECIMAL(_,2)` → `BIGINT`; delete the ×/÷100 conversion layer |
| Risk | **Low** — localized per module, no schema change, no cross-module column flip | **High** — every reader of a shared column must flip atomically |
| Required for Ridge? | **Yes** — gives Ridge one consistent cents wire format for Ordering | **No** — a correctness/cleanliness hardening, not a Ridge blocker |
| Effort | ~`L`, but **incremental & shippable** module-by-module | separate `L`+ expand-contract project |

**Ground truth (from inventory):** only `customer_transactions.amount`/`balance_after` are `BIGINT` cents in the DB (`migrations/015:14-15`). Every other money column is `DECIMAL/NUMERIC(_,2)` **dollars**. The modules we call "cents" (`order`, `invoice`, `account`, `payment`, `gl`, `ap`, `pos`, `dashboard`) hold `int64` cents **in Go** and convert ×/÷100 at the repo against dollar columns.

**Therefore the plan: do Stage A now (it satisfies D2 for Ridge), defer Stage B** to a later hardening sprint (or skip indefinitely). Stage A alone makes the entire API surface Ridge touches speak `int64` cents, which is the actual goal. Stage B is tracked here so we don't lose it, but it is explicitly **out of Phase 1 scope**.

> Why Stage A neutralizes the scary part: the inventory's danger zones (§5 below) are all "one dollar column read as different units by different modules." Once every reader converts dollars→cents **at its own boundary** (Stage A), those readers agree — *without* touching the column type. The shared-column atomic-flip hazard only exists in Stage B.

---

## 1. Current state (grounded)

**Already `int64` cents in Go (convert at repo boundary — leave as-is in Stage A):**
`order` (`repository.go:17-19` `dollarsToInt64Cents`, writes ÷100 `:56,82`, reads `:117,142-143,189,230`), `invoice` (`repository.go` writes `:59-61,95,319`, reads `:186-188,209,246-248,292-294,354`), `account` (`:98,111` read, `:115` write; `customer_transactions` written raw cents `:38-47`), `payment` (`:39,86` / `:72,127`), `gl`, `ap`, `bankrecon`, `matching`, `pos` (Go already cents; only edge DTOs are dollars), `dashboard` (already cents via SQL `*100::bigint`).

**`float64` dollars — the Stage A migration targets:**
- **`portal`** (`portal/model.go`): `PortalDashboardDTO.BalanceDue/CreditLimit/PastDue` (`:61-66`), `PortalOrderDTO.TotalAmount` (`:71`), `PortalLineDTO.PriceEach` (`:81`), `PortalInvoiceDTO.TotalAmount/Subtotal/TaxAmount` (`:90-97`), `CartDTO.Subtotal` (`:177`), `CartItemDTO.UnitPrice/LineTotal` (`:186-195`), `CatalogProductDTO.BasePrice/CustomerPrice` (`:159-160`). Reads treat columns as dollars (`portal/repository.go:78-115,158-292`). The one existing conversion is `cart.go:106` (dollars→cents to hand to `order`).
- **`quote`** (`quote/model.go`): `Quote.TotalAmount/FreightAmount/MarginTotal` (`:28,40,45`), `QuoteLine.UnitPrice/UnitCost/LineTotal` (`:67-69`), analytics money (`:82-100`). Repo binds/scans as float, no ÷100 (`quote/repository.go`).
- **`reporting`** (`reporting/model.go`): daily-till, sales-summary, AR-aging, statement money all float; reads are **mixed unit** — daily-till/sales/aging read dollar columns raw (`repository.go:42-180`) while statements read the cents `customer_transactions` with a local `÷100` (`:201-203,227,236`).
- **`pricing`**: `CalculatePrice`/`CalculatePriceWithQty` return `float64` **dollars** (`pricing/service.go:34-199`); consumed by `portal/cart.go:52` and `pos`.
- **`pos`**: internal math already cents; only the edge DTOs are dollars (`AddTenderRequest.Amount`, `QuickSearchResult.UnitPrice`, `CatalogProduct.Price`).

**Frontend:** `app/src/lib/utils.ts:14-17` `formatCents()` (÷100, confirmed). 10 ERP pages already use it; **9 portal pages** use a local dollars `formatCurrency`; **82 `.toFixed(2)`** money renders across ~30 files (quote, reporting, pricing, accounts, purchasing, millwork) format dollars directly. `POSTerminal.ts` mixes both (manual `/100` on cents fields + `.toFixed(2)` on a dollar search field).

---

## 2. Target state (Stage A)

- Every money value on a Go **struct** and every money field on the **JSON wire** is `int64` cents.
- Each repository converts at its boundary (the `order`/`invoice` pattern, generalized via a shared helper).
- DB columns stay `DECIMAL(_,2)` dollars in Stage A (no schema change).
- Frontend: **all** money renders through `formatCents()`; delete the portal `formatCurrency` and money `.toFixed(2)` sites.
- Ridge consumes `/api/portal/v1/*` and sees `int64` cents uniformly.

---

## 3. Sub-decisions to lock before coding

- **D2a — sub-cent unit prices.** `products.base_price`, `quote_lines.unit_price`, `customer_contracts.contract_price`, `pricing_rules.fixed_price` are `NUMERIC(_,4)` (sub-cent — e.g. per-board-foot pricing). Integer **cents** would truncate them. **Recommendation:** keep **unit prices** at higher precision as `int64` **mills** (1 mill = 1/1000 dollar, i.e. tenths of a cent) *or* leave unit prices decimal and only round to cents at **line-extension/total** time. Pick one convention app-wide. Line totals, order/invoice/payment/AR amounts are whole cents. (This mirrors real ERP practice: extended amounts in cents, unit prices in a finer unit.)
- **D2b — rounding.** Today: `invoice` **truncates** subtotal/tax (`service.go:47-50,67`), `order`/`account` use `math.Round`, read paths use half-up `x*100+0.5`. **Recommendation:** one shared helper, **half-up** (`math.Round`), applied symmetrically for negatives (credit memos post `-amount`); standardize every site on it.
- **D2c — do Stage B at all, and when.** **Recommendation:** defer; revisit before card payments (Phase 3) if at all. Stage A gives Ridge everything it needs.
- **D2d — `customers.balance_due` single writer.** Two writers today with different unit intent: `account.UpdateCustomerBalance` (dollars ÷100 from cents) and `customer.UpdateBalance` (dollars delta). Portal no longer reads it (computes AR live). **Recommendation:** make `account.PostTransaction` the **single writer**, keep it a secondary subledger figure (already the documented intent), and have `customer.BalanceDue` become read-through. Resolve this even in Stage A because both writers touch app structs.

---

## 4. Stage A plan (ordered, incremental, shippable)

Each step is independently shippable and testable. **A1 is the "portal subset" the roadmap sequences first** — it unblocks Ordering without waiting for the rest.

**A0 · Shared money primitives** `S`
- Go: add `internal/money` — `type Cents int64`, `DollarsToCents(float64) Cents` (half-up, per D2b), `CentsToDollars(Cents) float64`, and (per D2a) `type Mills int64` for unit prices + `ExtendMills(unit Mills, qty Decimal) Cents`. Replace the ad-hoc `order.dollarsToInt64Cents`.
- TS: `formatCents` already exists; add `formatMills` if D2a = mills. Delete portal `formatCurrency`.

**A1 · Portal → cents (unblocks Ordering)** `M`
- `portal/model.go`: flip the 11 tagged money fields + `CatalogProductDTO.BasePrice/CustomerPrice` to `int64` cents (drop the `TODO` comments).
- `portal/repository.go`: convert at scan (dollar column → cents via `money.DollarsToCents`) in `GetCustomerARSummary` (`:78-115`), `getOrderLines` (`:158-183`), invoice reads (`:212-292`).
- `portal/cart.go`: `AddToCart` stores cents; `Checkout` (`:106`) drops the inline `*100` (cart is already cents) when handing to `order.OrderLineRequest.PriceEach`.
- Frontend portal pages (9): `PortalDashboard/Orders/Invoices/Cart/Checkout/ProductDetail.ts`, `components/portal/ProductCard.ts`, `CartSidebar.ts`, `projects/ProjectDashboard.ts` → `formatCents`.
- **This is the surface Ridge's Ordering MVP (O1/O2/O4) binds to.**

**A2 · Quote → cents** `M`
- `quote/model.go`: `TotalAmount/FreightAmount/MarginTotal/UnitPrice/UnitCost/LineTotal` + analytics fields → cents (unit price per D2a). `quote/repository.go`: convert on scan/bind (`:72-157,357-447`).
- Frontend: `QuoteBuilder.ts` (12), `quotes/QuoteDetail.ts` (10), `QuoteList/QuoteAnalytics.ts`, `EscalatorToggle/ParsedResultsPanel.ts` → `formatCents`/`formatMills`.
- Ripples to CRM Surface 2 (quote-as-opportunity value rolls up in cents).

**A3 · Reporting → cents (fix the mixed-unit reads)** `M`
- `reporting/model.go`: money fields → cents. `reporting/repository.go`: daily-till/sales/aging convert dollar columns → cents on read (`:42-180`); **remove the local `÷100`** on `customer_transactions` in statements (`:201-203,227,236`) since that source is already cents — after A this is the *only* already-cents read and must not double-convert.
- Frontend: `DailyTill.ts` (5), `reports/CustomerStatementPage.ts`, `reports/ARAgingReport.ts` → `formatCents`.

**A4 · Pricing return type → cents** `S`–`M`
- `pricing/service.go`: `CalculatedPrice.FinalPrice/OriginalPrice` → cents (or mills per D2a); drop the 2-decimal `math.Round(x*100)/100` double-round. Update consumers `portal/cart.go:52`, `pos/service.go:104`. Admin pricing pages (`RuleDrawer/MatrixGrid/AccountRulesTable.ts`) → `formatCents`/`formatMills`.

**A5 · POS edge DTOs → cents** `S`
- `pos/model.go`: `AddTenderRequest.Amount`, `QuickSearchResult.UnitPrice`, `CatalogProduct.Price` → cents; drop the `*100` at `service.go:110,160,171`. `POSTerminal.ts`: replace manual `/100` + `.toFixed(2)` with `formatCents`.

---

## 5. Danger zones — and how Stage A handles each

| # | Hazard (inventory §6) | Stage A resolution |
|---|---|---|
| 1 | `customers.balance_due` — two writers, mixed intent | D2d: single writer (`account.PostTransaction`); `customer.BalanceDue` read-through. |
| 2 | `customers.credit_limit` read as cents (`account`,`order`) and dollars (`portal`) | Both now convert dollars→cents at boundary → agree. Column unchanged. |
| 3 | Portal→Order checkout unit hop (`cart.go:106`) | Cart is cents end-to-end; the hop becomes identity. |
| 4 | `customer_transactions` is cents while siblings are dollars | A3 removes the statement-only `÷100`; no other reader double-converts. |
| 5 | Reporting straddles both conventions | A3 makes every reporting read explicit-convert; no silent 100× errors. |
| 6 | Shared columns (`orders.total_amount`, `invoices.*`, `payments.amount`) read by cents + dollar modules | **All readers convert at boundary → consistent.** No column flip = no atomic-flip risk. (This is the whole reason Stage A is safe.) |
| 7 | 4-decimal sub-cent price/cost columns | D2a: unit prices in mills or decimal; only extended amounts in cents. |

---

## 6. Rounding & tax (inventory §7)
- Standardize on the `money` half-up helper (D2b). Fix `invoice/service.go:47-50,67` truncation → rounded. Keep tax **rate** as `float64` ratio (`DECIMAL(5,4)` — not money, do not migrate); tax **amount** computed on cents. Preserve branch-rate resolution (`invoice.CreateInvoice` → `locations.default_tax_rate`, fallback `0.0825`). Verify credit-memo negatives and bankrecon `-0.5` bias round symmetrically.

## 7. Test plan
- **Golden values:** the canonical `$73.88` must never render `$7,388.07` (the `formatCents`-on-dollars / `toFixed`-on-cents class of bug). One test per migrated page.
- **Round-trip property tests:** `CentsToDollars(DollarsToCents(x)) ≈ x` within ½¢; mills for unit prices.
- **Reconciliation:** order total == Σ line extensions; invoice total == subtotal+tax; AR live-from-invoices (cents) == dashboard (cents) == portal dashboard (cents).
- **Credit gate:** `order.overCreditLimit` still correct in pure cents (drop the `creditLimit*100`).
- **Regression sweep:** the 10 ERP pages already on `formatCents` (unchanged) + the 9 portal + ~14 quote/reporting/pricing pages (migrated). Snapshot money renders before/after.
- **Boundary/tax edges:** $0, negative (credit memo), large ($1M+), sub-cent unit price × fractional qty (board-foot), 12% BC tax vs 8.25% fallback.

## 8. Rollout
- Stage A is **app + wire + frontend only — no DB migration**, so it ships as normal PRs per module (A0→A5), each behind tests. Ridge Ordering can start against A1 as soon as it merges.
- Stage B (if ever): expand-contract per column — add `*_cents BIGINT`, dual-write, backfill (`UPDATE ... = ROUND(col*100)`), cut readers over, drop the `DECIMAL` column and the ×/÷100 layer. One module family at a time; the shared-column groups (orders+order_lines; invoices+invoice_lines; payments) flip together.

## 9. Effort
| Step | Size | Ships |
|---|---|---|
| A0 helpers | S | prerequisite |
| **A1 portal** | **M** | **unblocks Ordering O1/O2/O4** |
| A2 quote | M | CRM value rollups |
| A3 reporting | M | reports correct |
| A4 pricing | S–M | consistent price source |
| A5 pos | S | POS cleanup |
| **Stage A total** | **~L, incremental** | |
| Stage B (deferred) | L+ | not Phase 1 |

**Bottom line:** honor D2 by doing **Stage A now, portal-first**; it gives Ridge a uniform cents API with low, module-scoped risk and no schema change. Book Stage B (DB column flip) as a separate, optional hardening sprint gated on card-payment precision needs.
