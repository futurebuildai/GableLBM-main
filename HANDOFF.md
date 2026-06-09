# Session Handoff — 2026-06-09

End-to-end code review of the repo → fixes → deploy → live verification, plus two
follow-up bugs the verification surfaced. Everything below is **merged and live**.

## What shipped (merged)

| PR | Branch | Summary |
|---|---|---|
| #8 | `master` | Review fixes (financial integrity, security, inventory) |
| #9 | `community` | Same fixes ported onto community's diverged tree |
| #11 | `master` | `ON_HOLD` status migration + seed idempotency |
| #10 | `community` | `ON_HOLD` status migration + seed idempotency |

### Review fixes (#8 / #9)
- **Financial posting wired**: order fulfilment creates one tax-inclusive invoice and posts
  `DR AR / CR Revenue` to the GL + an AR subledger debit atomically (`invoice.PostInvoiceToLedger`);
  POS sales post `DR Cash / CR Revenue` post-commit (`gl.SyncCashSale`).
- **Double-invoice guard** (`invoice.ExistsInvoiceForOrder`) on fulfil + delivery-completion.
- **GL fixes**: `CreateJournalEntry` joins the caller's tx (no orphaned postings); accounts
  resolved by stable code (1010/1020/4010), never nil, errors propagated not swallowed.
- **Credit gate** computes balance **live from open invoices** (`invoice.OpenInvoiceStatuses`);
  AR balance filter aligned across portal/dashboard/reporting.
- **Inventory**: negative-stock floor; `Allocate` spans locations; `MoveStock` won't move
  reserved stock; reorder cron dedups `(po_id, product_id)`.
- **Security**: idempotency cache key namespaced by authenticated principal; confidential
  pricing reads guarded.
- **Frontend money**: PortalInvoices/ProjectDashboard stop dividing portal dollars by 100;
  dashboard recent-orders query adds the missing `*100`; credit-memo sends `amount_cents`.
- **Tail**: `account.GetBalance` errors on missing customer; cents rounding; invoice-email
  goroutine `recover()`; integration quote→order is atomic + reports confirm failures;
  POS/fulfil audit logging; matching auto-approve uses a stable system actor ID.

### Follow-up fixes (#10 / #11) — found by smoke-testing the demo
- **`ON_HOLD` order status** (migrations `074` community / `071` master): the credit gate sets
  `ON_HOLD`, but `orders_status_check` (migration 004) omitted it → confirm 500'd. The old
  stale-`balance_due` read hid it; the live-balance gate made it reachable. Constraint
  re-created to include `ON_HOLD`.
- **Seed idempotency** (`resetTransactionalData()`): transactional tables were inserted with
  random UUIDs and accumulated every deploy (1,216 invoices vs ~50 seeded), pushing every
  customer over its limit → every order parked `ON_HOLD`. Now TRUNCATEd (existence-filtered)
  at the start of each seed run.

## Verified on the live demo (demo.gablelbm.com, AUTH_MODE=dev)
- Deploy ACTIVE; seed reset cleared 26 transactional tables → 45 invoices (was 1,216).
- Order → **confirm (HTTP 204, no 500)** → fulfil → `FULFILLED`.
- Exactly **one** invoice; a balanced `INVOICE`-source GL entry (`total_debit=total_credit=5033`);
  customer `balance_due = 5033` = invoice total (AR subledger posting).

## Open follow-ups (not done)
1. **Tax rate**: `invoice.DefaultTaxRate = 0.0825` is applied to app-fulfilled invoices, but the
   BC demo uses 12% everywhere else. Source the rate from `locations.default_tax_rate`.
   *(Real correctness bug, pre-existing, low blast radius.)*
2. **Release path out of `ON_HOLD`**: an over-limit order is parked `ON_HOLD` with no
   endpoint to release/override it (pre-existing backlog). Lower urgency now that realistic
   demo balances rarely trigger it.
3. **Seed demo fidelity**: the seed sets one customer over-limit via `balance_due`, which the
   live-balance credit gate no longer reads — demonstrating credit-hold now needs real
   invoices. Cosmetic.
4. **Reporting scheduler** remains unwired/stubbed (backlog #10A) — needs a real SMTP
   `EmailSender` before it does anything.

## Conventions touched (see CLAUDE.md → Notes & Gotchas)
- AR balance: read live from invoices; `balance_due` is a secondary subledger figure.
- Seed: transactional tables reset each run; reference data upserts by natural key.
