---
stage: "09"
description: Produce a concrete, ordered, dependency-aware implementation plan with exact file paths and commit checkpoints.
inputs: All prior artifacts
outputs: EXECUTION_PLAN.md
---

# Stage 09: Execution Plan

Turn the architecture spec into a step-by-step implementation plan. Every step names the exact files, the exact changes, and the verification command. A contributor can execute this plan without reading any other artifact.

---

## Step 1: Read All Artifacts

Read ARCHITECTURE.md, API_CONTRACT.md, PRD.md, DESIGN_SPEC.md, TESTING_STRATEGY.md. Understand the full scope before ordering the steps.

---

## Step 2: Order by Dependency

The correct implementation order for GableLBM features is always:

1. **Database migration** — schema must exist before any code runs
2. **Go model types** — type definitions that all other layers use
3. **Repository layer** — DB queries (no business logic)
4. **Service layer + unit tests** — business logic (tested with mock repository)
5. **HTTP handlers + API tests** — wire to Chi router
6. **Route registration in main.go** — make endpoints live
7. **Frontend components** — data-display and form components
8. **Route additions** — add to `routes.ts` and navigation
9. **Smoke test** — verify end-to-end in the running app

---

## Step 3: Write EXECUTION_PLAN.md

Write `.agents/handoff/EXECUTION_PLAN.md`:

```markdown
# Execution Plan
# Feature: [Feature Name]

---

## Prerequisites
- [ ] Docker running (`make up`)
- [ ] Database migrated (`make migrate`)
- [ ] Backend builds (`cd backend && go build ./...`)
- [ ] Frontend compiles (`cd app && npx tsc --noEmit`)

---

## Step 1: Database Migration
**File to create:** `backend/migrations/054_[feature_slug].sql`
**Content:** [Full SQL from ARCHITECTURE.md — copy verbatim]
**Verify:** Run `make migrate` — exits 0

---

## Step 2: Go Model Types
**File to create/modify:** `backend/internal/[module]/model.go`
**What to add:**
```go
// [TypeName] represents [description]
type [TypeName] struct {
    ID        uuid.UUID `db:"id"`
    // [all fields from ARCHITECTURE.md interface]
}
```
**Verify:** `cd backend && go build ./...` exits 0

---

## Step 3: Repository Layer
**File to create/modify:** `backend/internal/[module]/repository.go`
**What to implement:**
```go
func (r *repository) [MethodName](ctx context.Context, [params]) ([returns], error) {
    // pgx query — match the query pattern in adjacent repositories
}
```
**Verify:** `cd backend && go build ./...` exits 0

---

## Step 4: Service Layer
**File to create/modify:** `backend/internal/[module]/service.go`
**What to implement:**
```go
func (s *service) [MethodName](ctx context.Context, [params]) ([returns], error) {
    // Business logic — validation, calculations, event publishing
}
```
**Unit tests:**
**File to create:** `backend/internal/[module]/service_test.go`
**What to test:** [List test function names from TESTING_STRATEGY.md]
**Verify:** `cd backend && go test ./internal/[module]/... -run TestService` passes

---

## Step 5: HTTP Handlers
**File to create/modify:** `backend/internal/[module]/handler.go`
**What to implement:** [List each handler function and endpoint]
**Integration tests:**
**File to create:** `backend/internal/[module]/handler_test.go`
**What to test:** [List test function names from TESTING_STRATEGY.md]
**Verify:** `cd backend && go test ./internal/[module]/...` passes

---

## Step 6: Wire into main.go
**File to modify:** `backend/cmd/server/main.go`
**Where to add:** After line [N] where [nearest module] is wired
**What to add:** [Exact code from ARCHITECTURE.md Step 3.1]
**Verify:** `cd backend && go run ./cmd/server` starts without error; `curl localhost:8080/api/v1/[resource]` returns 200

---

## Step 7: Frontend Component(s)
For each new component from DESIGN_SPEC.md:

**File to create:** `app/src/components/[name]/gable-[name].ts`
**What to build:** [Reference DESIGN_SPEC.md for exact layout, data, and interactions]
**Design tokens to use:** [List specific Tailwind classes for colors, typography]
**Component tests:**
**File to create:** `app/src/components/[name]/gable-[name].test.ts`
**Verify:** `cd app && npx tsc --noEmit` passes; `npm run test` passes

---

## Step 8: Routes & Navigation
**File to modify:** `app/src/routes.ts`
**What to add:** [Exact route entries from ARCHITECTURE.md]

**File to modify:** `app/src/components/shell/gable-app-shell.ts` (or equivalent)
**What to add:** [Navigation entry from ARCHITECTURE.md]

**Verify:** `npm run dev` — navigate to `/erp/[module]/[feature]` — page renders

---

## Step 9: End-to-End Smoke Test
1. Run `make dev` (starts Docker + migrates + starts backend + starts frontend)
2. Navigate to the new route
3. Verify the full happy-path user story from PRD.md (US-001):
   - [Step 1 of the workflow]
   - [Step 2]
   - [Expected final state]

---

## Commit Checkpoints
| After Step | Commit Message |
|-----------|---------------|
| Step 1 | `feat([module]): add migration for [feature]` |
| Steps 2-4 | `feat([module]): add [feature] repository and service` |
| Step 5-6 | `feat([module]): add [feature] API endpoints` |
| Steps 7-8 | `feat([module]): add [feature] frontend components` |
| Step 9 | `feat([module]): [feature] — complete implementation` |
```

---

## Step 3: Update Pipeline State

```
- [x] 09 Execution Plan
Artifacts: EXECUTION_PLAN.md
Steps: [N]
Estimated contributor time: [N hours/days]
```

Proceed immediately to Stage 10.
