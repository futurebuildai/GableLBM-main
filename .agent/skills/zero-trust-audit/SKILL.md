---
name: Zero-Trust L8 Audit
description: Post-implementation production readiness audit. Zero-trust means VERIFY EVERYTHING — assume nothing works until proven by evidence. Run this after any feature implementation to validate correctness, security, and production readiness before merge.
---

# Zero-Trust L8 Production Readiness Audit

## Philosophy

**Zero Trust = Verify Everything.** Do not trust developer assertions, comments, or "it works." Every claim must be backed by compiler output, test results, or direct code inspection. This is a Level 8 (highest rigor) audit — every phase must produce evidence.

## When to Run This Skill

Run `/zero-trust-audit` after implementation work has been completed in a conversation thread — before committing, pushing, or merging. The audit reviews **all changes made in the current thread** against production-readiness criteria.

---

## Phase 1: Scope Discovery

**Goal:** Identify every file touched in the current thread.

1. Run `git diff --name-only HEAD` to get all modified/added files
2. Run `git diff --stat HEAD` to understand change volume
3. Categorize changes:
   - `MIGRATION` — SQL files in `backend/migrations/`
   - `BACKEND` — Go files in `backend/`
   - `FRONTEND` — TypeScript/React files in `app/`
   - `CONFIG` — Environment, Docker, CI/CD files
   - `DOCS` — Documentation files
4. List every new **public API endpoint** introduced (grep for `HandleFunc`, `mux.Handle`, route registrations)
5. List every new **database table or column** (parse migration SQL)

> **OUTPUT:** Populate the "Scope" section of the audit artifact.

---

## Phase 2: Compilation & Build Verification

**Goal:** Prove the code compiles with zero errors.

// turbo
1. Run `cd backend && go build ./...` — capture full output
// turbo
2. Run `cd backend && go vet ./...` — capture full output
// turbo
3. Run `cd app && node_modules/.bin/tsc --noEmit --skipLibCheck 2>&1 || npx tsc --noEmit --skipLibCheck 2>&1` — capture output (if node_modules exists)
4. For each error found:
   - Record the file, line, and error message
   - Classify as `BLOCKER` (prevents build) or `WARNING` (vet/lint advisory)
   - Determine if error is **pre-existing** or **introduced by this thread**

> **VERDICT:** `PASS` (zero new errors), `CONDITIONAL` (only pre-existing errors), or `FAIL` (new errors introduced)

---

## Phase 3: Migration Safety

**Goal:** Validate that SQL migrations are safe, reversible, and follow conventions.

For each migration file:

1. **Schema compliance:**
   - Primary keys are `UUID DEFAULT gen_random_uuid()` — never serial/integer
   - Money columns use `DECIMAL(19,4)` or stored as integer cents
   - Quantities use `DECIMAL(19,4)` — never float/real/double
   - Timestamps use `TIMESTAMPTZ` with `DEFAULT NOW()`
   - All foreign keys have explicit `ON DELETE` behavior
   - Table and column names are `snake_case`

2. **Safety checks:**
   - No `DROP TABLE` without explicit justification
   - No `ALTER TABLE ... DROP COLUMN` without data migration plan
   - `NOT NULL` columns have `DEFAULT` values OR are populated in the same migration
   - No raw `TRUNCATE` or `DELETE FROM` without `WHERE`
   - Indexes exist on foreign key columns
   - Unique constraints exist where business logic requires them

3. **Idempotency:**
   - Uses `IF NOT EXISTS` for `CREATE TABLE`
   - Uses `IF NOT EXISTS` for `ADD COLUMN` or wraps in `DO $$ ... $$` block

> **VERDICT:** `PASS`, `CONDITIONAL` (minor issues), or `FAIL` (data safety risks)

---

## Phase 4: Interface & Contract Verification

**Goal:** Every interface is fully implemented, every handler is wired, every model is consistent.

1. **Go interface compliance:**
   - For every modified `Repository` interface, verify the concrete `PostgresRepository` implements ALL methods
   - Run `go build ./...` output for "does not implement" errors
   - Grep for `// TODO` or `panic("not implemented")` in new code

2. **API route ↔ handler mapping:**
   - For every `mux.HandleFunc(...)` registration, verify the handler method EXISTS on the struct
   - For every handler method, verify it calls a real service method
   - For every service method, verify it calls a real repository method

3. **Frontend ↔ Backend contract:**
   - For every new API endpoint, verify a corresponding frontend service method exists (or document that it's admin/internal-only)
   - TypeScript interfaces match the Go struct JSON tags (field names, types, optionality)

4. **Model consistency across layers:**
   - Migration columns → Go struct fields → JSON tags → TypeScript interface
   - Verify no field name mismatches between layers

> **VERDICT:** `PASS` or `FAIL`

---

## Phase 5: Security Review

**Goal:** No injection vectors, leaked secrets, or unprotected endpoints.

1. **SQL Injection:**
   - Grep for string concatenation in SQL queries: `fmt.Sprintf` with `%s` near SQL keywords
   - All user input MUST use parameterized queries (`$1, $2, ...`)
   - No `Exec(ctx, "... " + userInput)` patterns

2. **Input Validation:**
   - All handler functions validate required fields before processing
   - UUID parsing uses `uuid.Parse()` with error handling
   - File uploads have size limits (`r.ParseMultipartForm(...)`)
   - No unbounded `io.ReadAll` without `io.LimitReader`

3. **Authentication & Authorization:**
   - New endpoints are registered through middleware-protected routes (or documented as intentionally public)
   - No hardcoded API keys, passwords, or secrets in source code
   - Grep for: `password`, `secret`, `api_key`, `token` in non-config files

4. **Data Exposure:**
   - JSON responses don't leak internal fields (database IDs used as primary identifiers are OK; internal error messages are NOT)
   - No `log.Fatal` or `panic` in request handlers (these crash the server)
   - Error messages returned to clients are generic — internal details logged server-side only

> **VERDICT:** `PASS`, `ADVISORY` (minor hardening recommended), or `FAIL` (active vulnerability)

---

## Phase 6: Error Handling & Resilience

**Goal:** The system degrades gracefully — no silent failures, no crashes, no data corruption.

1. **Error propagation:**
   - Every `err != nil` is handled — not silently swallowed
   - Repository errors propagate up through service → handler → HTTP response
   - `context.Context` is passed through the entire call chain

2. **Nil safety:**
   - No dereferencing of pointers without nil checks
   - Slice results initialized to empty (not nil) before JSON encoding: `if x == nil { x = []T{} }`
   - Optional fields properly use pointer types (`*string`, `*uuid.UUID`)

3. **Transaction safety:**
   - Operations that modify multiple tables use `RunInTx` or equivalent
   - No partial writes that could leave data in an inconsistent state

4. **Graceful degradation:**
   - External service failures are logged but don't crash the request
   - Optional integrations (Maps, SMS, AI) have nil checks: `if s.client != nil`
   - Fire-and-forget side effects don't block the primary operation

> **VERDICT:** `PASS` or `FAIL`

---

## Phase 7: Code Quality & Conventions

**Goal:** Code follows project conventions and is maintainable.

1. **Project conventions (from CLAUDE.md):**
   - API routes under `/api/v1/*`
   - Migrations in `backend/migrations/` with sequential numbering
   - Frontend routes match layout shells (`/erp/*`, `/portal/*`, `/driver/*`, `/pos/*`)
   - Design tokens from `tailwind.config.ts` — no hardcoded hex colors
   - JetBrains Mono for numerical data in UI

2. **Go conventions:**
   - Public functions have doc comments
   - Error messages are lowercase without punctuation (Go convention)
   - No unused imports or variables
   - Consistent naming with existing codebase patterns

3. **TypeScript conventions:**
   - Interfaces match backend JSON contract
   - No `any` types without justification
   - React hooks follow Rules of Hooks
   - No inline styles — use Tailwind classes or design tokens

4. **Antipatterns to flag:**
   - God functions (>100 lines without decomposition)
   - Deep nesting (>4 levels)
   - Magic numbers without named constants
   - Copy-pasted code blocks that should be extracted

> **VERDICT:** `PASS`, `ADVISORY` (style nits), or `FAIL` (convention violations)

---

## Phase 8: Production Readiness Checklist

**Goal:** Final go/no-go assessment.

| # | Check | How to Verify |
|---|-------|---------------|
| 1 | Backend compiles | `go build ./...` exits 0 |
| 2 | No `go vet` errors | `go vet ./...` exits 0 |
| 3 | Frontend compiles | `tsc --noEmit` exits 0 (or Vite build succeeds) |
| 4 | Migrations are safe | Phase 3 passed |
| 5 | All interfaces implemented | Phase 4 passed — no "does not implement" errors |
| 6 | No SQL injection vectors | Phase 5 passed — all queries parameterized |
| 7 | No leaked secrets | `grep -r` for secrets returns clean |
| 8 | Errors properly handled | Phase 6 passed — no swallowed errors |
| 9 | API endpoints documented | New endpoints listed in audit artifact |
| 10 | Wire-up complete | All new services/handlers registered in `main.go` |
| 11 | No `panic` in handlers | `grep -rn 'panic(' backend/internal/` in handler/service files |
| 12 | Pre-existing issues documented | Known issues listed, not introduced by this thread |

---

## Audit Artifact Template

After completing all phases, produce an artifact at the conversation's artifact directory named `audit_report.md` with this structure:

```markdown
# Zero-Trust L8 Audit Report

**Date:** [ISO timestamp]
**Thread:** [conversation topic]
**Auditor:** Antigravity L8

## Executive Summary

| Phase | Verdict | Notes |
|-------|---------|-------|
| 1. Scope | — | [N files, N endpoints, N migrations] |
| 2. Compilation | PASS/FAIL | |
| 3. Migrations | PASS/FAIL | |
| 4. Contracts | PASS/FAIL | |
| 5. Security | PASS/FAIL | |
| 6. Error Handling | PASS/FAIL | |
| 7. Conventions | PASS/FAIL | |
| 8. Prod Readiness | PASS/FAIL | |

**Overall Verdict:** `APPROVED FOR MERGE` / `CONDITIONAL — FIXES REQUIRED` / `BLOCKED`

## Scope

### Files Changed
[list from git diff]

### New API Endpoints
[table: Method, Path, Handler, Auth Required]

### New Database Objects
[table: Migration, Object, Type, Notes]

## Findings

### 🔴 Blockers (must fix before merge)
[numbered list, or "None"]

### 🟡 Advisories (should fix, not blocking)
[numbered list, or "None"]

### 🟢 Observations (informational)
[numbered list, or "None"]

### Pre-Existing Issues (not introduced by this thread)
[list known issues that were already present]

## Evidence

### Compilation Output
[paste `go build` and `go vet` output]

### Security Scan
[paste grep results for secrets, SQL concat, panics]

## Sign-Off

- [ ] All BLOCKERs resolved
- [ ] Audit artifact committed to thread
- [ ] Changes ready for merge
```

---

## Invocation

The user can trigger this audit with:
- `/zero-trust-audit` — full L8 audit of all changes in the current thread
- "run the zero trust audit" — natural language trigger
- "audit this" / "production readiness check" — shorthand triggers

When invoked, start from Phase 1 and run every phase sequentially. Do NOT skip phases. Produce the full audit artifact at the end.

---

## Handoff: L8 Revisions Manifest

After producing the `audit_report.md`, ALSO generate a machine-readable handoff file at:

```
.agent/last_audit/findings.md
```

This file is consumed by the **L8 Revisions** skill in a new thread. Format:

```markdown
---
audit_date: [ISO timestamp]
audit_thread: [conversation topic]
repo_root: [absolute path to repo]
overall_verdict: APPROVED | CONDITIONAL | BLOCKED
blocker_count: [N]
advisory_count: [N]
---

# L8 Audit Findings — Revision Queue

## BLOCKERS

### B1: [short title]
- **Severity:** BLOCKER
- **Phase:** [audit phase number]
- **Files:** [comma-separated list of affected files]
- **Description:** [what's wrong]
- **Evidence:** [command output or code reference proving it]
- **Fix Guidance:** [specific instructions on how to resolve]
- **Verification:** [exact command or check to prove it's fixed]

## ADVISORIES

### A1: [short title]
- **Severity:** ADVISORY
- **Phase:** [audit phase number]
- **Files:** [comma-separated list of affected files]
- **Description:** [what's wrong]
- **Evidence:** [command output or code reference]
- **Fix Guidance:** [specific instructions]
- **Verification:** [exact check to prove it's fixed]
```

**Rules for the manifest:**
1. Each finding MUST have a unique ID (`B1`, `B2`, `A1`, `A2`, ...)
2. `Files` must be absolute paths
3. `Fix Guidance` must be actionable — not vague. Include specific method names, struct fields, file locations
4. `Verification` must be a runnable command or a grep pattern that proves the fix was applied
5. Observations (🟢) are NOT included — only blockers and advisories that require code changes
