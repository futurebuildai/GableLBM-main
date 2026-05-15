---
stage: "07"
description: Specify exactly HOW to build this in GableLBM — Go packages, API contracts, DB migration, and frontend component specs. Second approval gate.
inputs: PRD.md, SOLUTION_DESIGN.md, DESIGN_SPEC.md
outputs: ARCHITECTURE.md, API_CONTRACT.md
browser_usage: MODERATE (library docs, Go/PostgreSQL patterns)
approval_gate: true
---

# Stage 07: Architecture Spec

Define exactly how this feature is implemented in GableLBM's codebase. Reference specific files. Leave zero ambiguity for the implementer.

---

## Step 1: Deep Codebase Read

Read the specific files that will be modified:

1. `backend/internal/[affected_module]/model.go` — existing types
2. `backend/internal/[affected_module]/repository.go` — existing DB queries
3. `backend/internal/[affected_module]/service.go` — existing business logic
4. `backend/internal/[affected_module]/handler.go` — existing HTTP handlers
5. `backend/cmd/server/main.go` — how modules are wired together
6. The most recent migration (`backend/migrations/053_*.sql`) — current schema
7. `app/src/routes.ts` — existing frontend routes

Then check: is there any new module needed, or does this extend an existing one?

---

## Step 2: Write the Architecture Spec

Write `.agents/handoff/ARCHITECTURE.md`:

```markdown
# Architecture Specification
# Feature: [Feature Name]

---

## 1. Module Design

### 1.1 Affected Modules
| Module | Location | Change Type | What Changes |
|--------|---------|------------|-------------|
| [name] | `backend/internal/[name]/` | New / Extended | [Description] |

### 1.2 New Module (if applicable)
**Package:** `github.com/gablelbm/gable/internal/[name]`
**File structure:**
```
backend/internal/[name]/
├── model.go        # Types, enums, constants
├── repository.go   # pgx queries (no business logic)
├── service.go      # Business logic (calls repository)
└── handler.go      # HTTP handlers (calls service, no business logic)
```

### 1.3 Go Interfaces

**Service interface** (define for dependency injection):
```go
type [Name]Service interface {
    [MethodName](ctx context.Context, [params]) ([returns], error)
    // ... one entry per user story
}
```

**Repository interface:**
```go
type [Name]Repository interface {
    [MethodName](ctx context.Context, [params]) ([returns], error)
    // ... one entry per query needed
}
```

---

## 2. Database Migration

### 2.1 New Migration File
**File:** `backend/migrations/054_[feature_slug].sql`

```sql
-- Migration: 054_[feature_slug]
-- [Feature description]

-- [New table or column changes]
CREATE TABLE IF NOT EXISTS [table_name] (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    -- [columns — use DECIMAL(19,4) for quantities/money, TEXT not VARCHAR, TIMESTAMPTZ for times]
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- [Indexes for every FK and every column in a WHERE clause]
CREATE INDEX idx_[table]_[column] ON [table_name]([column]);
```

### 2.2 Schema Decisions
[Explain every non-obvious decision: why this type, why this relationship, why this index]

---

## 3. API Contract

See `API_CONTRACT.md` for full endpoint specs.

### 3.1 Route Registration
In `backend/cmd/server/main.go`, add after the [nearest related module]:
```go
[moduleName]Repo := [module].NewRepository(pool)
[moduleName]Svc := [module].NewService([moduleName]Repo)
[moduleName]Handler := [module].NewHandler([moduleName]Svc)
[moduleName]Handler.RegisterRoutes(r)
```

---

## 4. Frontend Architecture

### 4.1 New Components

For each new `gable-*` component:

**File:** `app/src/components/[name]/gable-[name].ts`

```typescript
// Pattern to follow exactly:
@customElement('gable-[name]')
export class Gable[Name] extends LitElement {
  createRenderRoot() { return this; } // Light DOM for Tailwind

  @state() private [stateVar]: [Type] = [default];
  @property({ attribute: '[attr-name]' }) [propVar]: [Type] = [default];

  // ... implementation
}
```

### 4.2 New Routes

Add to `app/src/routes.ts`:
```typescript
{ path: '/erp/[module]/[feature]', component: 'gable-[feature]-page' },
```

### 4.3 Navigation

Add to the sidebar/nav in `app/src/components/shell/gable-app-shell.ts`:
```typescript
// Add to navItems array:
{ path: '/erp/[module]/[feature]', label: '[Label]', icon: [LucideIcon] }
```

---

## 5. Event Flows (NATS)

[Only if this feature publishes or consumes NATS events]

| Direction | Subject | Publisher | Consumer | Payload |
|-----------|---------|-----------|----------|---------|
| Publish | `[module].[event]` | `[module].Service` | `[other].Service` | `{field: type, ...}` |

---

## 6. Error Handling

All handlers must return structured JSON errors:
```go
// Use the existing error response pattern from other handlers
w.Header().Set("Content-Type", "application/json")
w.WriteHeader(http.StatusBadRequest)
json.NewEncoder(w).Encode(map[string]string{"error": err.Error()})
```

Map error types to HTTP status codes:
| Condition | Status Code | Error Message |
|-----------|------------|---------------|
| [condition] | [4xx/5xx] | "[message]" |
```

---

## Step 3: Write the API Contract

Write `.agents/handoff/API_CONTRACT.md`:

```markdown
# API Contract
# Feature: [Feature Name]

## [METHOD] /api/v1/[resource]
**Purpose:** [One sentence]
**Auth:** Required (JWT Bearer)

### Request
```
[METHOD] /api/v1/[resource]
Authorization: Bearer {token}
Content-Type: application/json

{
  "field": "value"  // type, required/optional, constraints
}
```

### Response 200
```json
{
  "id": "uuid",
  "field": "value"
}
```

### Response 400
```json
{ "error": "human-readable validation message" }
```

### Response 404
```json
{ "error": "resource not found" }
```

[Repeat for every endpoint in SOLUTION_DESIGN.md API Summary]
```

---

## ⏸ APPROVAL GATE — Stage 07 Complete

Present to the user:

```
## Stage 07 Complete: Architecture Spec

### What Will Be Built
- **New module(s):** [list]
- **New migration:** `054_[slug].sql` — [N] new tables, [N] columns on existing tables
- **New API endpoints:** [N] endpoints at `/api/v1/[resource]`
- **New frontend components:** [N] components, [N] new routes

### Key Technical Decisions
1. [Decision + rationale]
2. [Decision + rationale]

### Risks
[Any architectural risks or open questions]

### What You're Approving
Approving this means: the contributor who runs `/execute` will build EXACTLY this spec — same Go interfaces, same API routes, same DB schema. Any changes after this require rerunning stages 07-10.

Ready to continue to Stage 08 (Testing Strategy)?
```

**Wait for user confirmation before proceeding.**

---

## Step 4: Update Pipeline State

```
- [x] 07 Architecture Spec ✅ (Approval gate passed)
Artifacts: ARCHITECTURE.md, API_CONTRACT.md
New tables: [N]
New API endpoints: [N]
New frontend components: [N]
```
