---
audit_date: 2026-04-06T21:55:00Z
audit_thread: "TriState Lumber — Offline POS, Vendor-Agnostic EDI, Delivery POD + Invoice"
repo_root: /home/colton/Desktop/futurebuild-ecosystem/GableLBM-main
overall_verdict: RESOLVED
resolved_date: 2026-04-06T22:12:00Z
resolved_by: Antigravity
blocker_count: 1
advisory_count: 5
---

# L8 Audit Findings — Revision Queue

## BLOCKERS

### B1: Auto-PO feature not wired in main.go
- **Severity:** BLOCKER
- **Phase:** 8 (Production Readiness)
- **Files:** `/home/colton/Desktop/futurebuild-ecosystem/GableLBM-main/backend/cmd/server/main.go`, `/home/colton/Desktop/futurebuild-ecosystem/GableLBM-main/backend/internal/quote/service.go`
- **Description:** `quote.Service` defines an `AutoPOService` interface and a `WithAutoPO(svc AutoPOService)` setter method. The `UpdateState` method calls `s.triggerAutoPO(...)` when a quote is accepted. However, `quoteSvc.WithAutoPO(...)` is NEVER called in `main.go`, so `s.poSvc` is always nil and the feature is dead code. Additionally, `purchase_order.Service` does NOT have a `CreatePOFromSpecialOrderLine(ctx, productID, vendorID, quantity, unitCost, linkedSOLineID)` method — the interface method has no implementation anywhere.
- **Evidence:** `grep -n 'WithAutoPO' backend/cmd/server/main.go` returns empty. `grep -n 'CreatePOFromSpecialOrderLine' backend/internal/purchase_order/` returns empty.
- **Fix Guidance:** Two options: **(A)** Implement `CreatePOFromSpecialOrderLine` on `purchase_order.Service` (or create an adapter in main.go like `invoiceServiceAdapter`), then call `quoteSvc.WithAutoPO(poSvcAdapter)` in main.go after line ~188 where `quoteSvc` is created. `poSvc` is created at line ~234. You'll need to reorder or forward-declare. **(B)** If deferring the feature, remove the `triggerAutoPO` call in `quote/service.go` UpdateState, remove the `AutoPOService` interface and `WithAutoPO` method, and add a `// TODO(Sprint XX): Auto-PO on quote acceptance` comment.
- **Verification:** `grep -n 'WithAutoPO' backend/cmd/server/main.go` returns a match (option A), OR `grep -n 'triggerAutoPO' backend/internal/quote/service.go` returns empty (option B). Then `go build ./...` exits 0.

## ADVISORIES

### A1: Missing ON DELETE on 2 foreign keys
- **Severity:** ADVISORY
- **Phase:** 3 (Migration Safety)
- **Files:** `/home/colton/Desktop/futurebuild-ecosystem/GableLBM-main/backend/migrations/045_edi_trading_partners.sql`, `/home/colton/Desktop/futurebuild-ecosystem/GableLBM-main/backend/migrations/047_a2a_inbound_po.sql`
- **Description:** Two FK references lack explicit `ON DELETE` behavior: (1) `edi_catalog_entries.internal_product_id REFERENCES products(id)` — if a product is deleted, catalog entries will have orphaned references causing FK constraint violations. (2) `a2a_inbound_po_log.created_po_id REFERENCES purchase_orders(id)` — same issue with PO deletion.
- **Evidence:** `grep -n 'REFERENCES.*products\|REFERENCES.*purchase_orders' backend/migrations/045_edi_trading_partners.sql backend/migrations/047_a2a_inbound_po.sql` shows lines without ON DELETE.
- **Fix Guidance:** Create a new migration `048_fk_on_delete_fix.sql` that uses `ALTER TABLE ... DROP CONSTRAINT ... ADD CONSTRAINT ... ON DELETE SET NULL` for both FKs. Do NOT modify the original migration files (they may have already been applied).
- **Verification:** `grep -n 'ON DELETE' backend/migrations/048_fk_on_delete_fix.sql` shows 2 ON DELETE SET NULL clauses.

### A2: Numeric precision inconsistency in EDI migration
- **Severity:** ADVISORY
- **Phase:** 3 (Migration Safety)
- **Files:** `/home/colton/Desktop/futurebuild-ecosystem/GableLBM-main/backend/migrations/045_edi_trading_partners.sql`
- **Description:** Uses `NUMERIC(12,4)` for `unit_cost` and `NUMERIC(10,2)` for `min_order_qty`/`pack_qty`. Project convention (per CLAUDE.md) is `DECIMAL(19,4)` for money and quantities. Functionally equivalent in PostgreSQL but inconsistent.
- **Evidence:** `grep -n 'NUMERIC' backend/migrations/045_edi_trading_partners.sql` shows (12,4) and (10,2).
- **Fix Guidance:** Add column type changes to the same `048_fk_on_delete_fix.sql` migration: `ALTER TABLE edi_catalog_entries ALTER COLUMN unit_cost TYPE DECIMAL(19,4)`, same for `min_order_qty` and `pack_qty`.
- **Verification:** `grep -n 'DECIMAL(19,4)' backend/migrations/048_fk_on_delete_fix.sql` shows 3 type changes.

### A3: POS routes missing /v1/ prefix
- **Severity:** ADVISORY
- **Phase:** 7 (Conventions)
- **Files:** `/home/colton/Desktop/futurebuild-ecosystem/GableLBM-main/backend/internal/pos/handler.go`
- **Description:** New POS endpoints use `/api/pos/sync` and `/api/pos/catalog`. Convention is `/api/v1/*`. However, ALL existing POS routes use `/api/pos/*` (pre-existing pattern from original Sprint). Changing just the new routes would create an inconsistent split.
- **Evidence:** `grep -n 'HandleFunc.*api/pos' backend/internal/pos/handler.go` — all routes use `/api/pos/`.
- **Fix Guidance:** This is a pre-existing convention deviation. The fix should be a bulk migration of ALL POS routes from `/api/pos/*` to `/api/v1/pos/*` in a single commit — NOT a partial change to only the new routes. Recommend deferring to a dedicated API versioning cleanup sprint. For now, add a comment at the top of RegisterRoutes: `// NOTE: POS routes use /api/pos/* (legacy). Migrate to /api/v1/pos/* in API versioning sprint.`
- **Verification:** `grep -n 'NOTE.*legacy\|NOTE.*versioning' backend/internal/pos/handler.go` returns a match.

### A4: EDI endpoints lack explicit auth middleware
- **Severity:** ADVISORY
- **Phase:** 5 (Security)
- **Files:** `/home/colton/Desktop/futurebuild-ecosystem/GableLBM-main/backend/internal/edi/edi_handler.go`, `/home/colton/Desktop/futurebuild-ecosystem/GableLBM-main/backend/cmd/server/main.go`
- **Description:** The 7 EDI `/api/v1/edi/partners*` routes are registered on the bare `mux` without a visible auth middleware wrapper. They MAY be protected by a global middleware chain, but this needs explicit verification.
- **Evidence:** `grep -B5 -A5 'ediHandler.RegisterRoutes' backend/cmd/server/main.go` — no middleware wrapper visible around the call.
- **Fix Guidance:** Verify the server's middleware stack. If there's a global JWT auth middleware wrapping the entire mux (check main.go for patterns like `middleware.Auth(mux)` or `r.Use(authMiddleware)`), document it with a comment above the registration: `// Auth: Protected by global JWT middleware`. If NOT protected, wrap the registration: use a sub-router or pass the mux through auth middleware before registering EDI routes.
- **Verification:** `grep -n 'Auth\|middleware\|JWT' backend/cmd/server/main.go | head -10` shows middleware chain, AND a comment exists near ediHandler.RegisterRoutes confirming coverage.

### A5: Frontend TypeScript compilation not verified
- **Severity:** ADVISORY
- **Phase:** 2 (Compilation)
- **Files:** `/home/colton/Desktop/futurebuild-ecosystem/GableLBM-main/app/`
- **Description:** `node_modules` is not installed in the development environment. TypeScript compiler (`tsc`) could not be executed, so frontend type safety is unverified.
- **Evidence:** `ls node_modules/.bin/tsc` returns "No such file or directory".
- **Fix Guidance:** Run `cd app && npm install && npx tsc --noEmit --skipLibCheck`. If errors are found, fix them. If clean, document the result.
- **Verification:** `cd app && npx tsc --noEmit --skipLibCheck` exits 0 with no errors.
