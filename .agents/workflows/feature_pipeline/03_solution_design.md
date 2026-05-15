---
stage: "03"
description: Design how the feature should work within GableLBM's existing architecture. Identify build vs. buy decisions, integration points, and the solution approach.
inputs: VISION_BRIEF.md, DOMAIN_RESEARCH.md, USER_JOURNEYS.md, COMPETITIVE_ANALYSIS.md
outputs: SOLUTION_DESIGN.md, BUILD_VS_BUY.md
browser_usage: MODERATE (5-10 searches — library docs, technical feasibility)
---

# Stage 03: Solution Design

Design how this feature fits into GableLBM's existing modular monolith. Be opinionated — present one solution with clear rationale, not a menu of options.

---

## Step 1: Read Prior Artifacts + Existing Code

1. Read all prior artifacts
2. Read the relevant GableLBM module(s) in `backend/internal/` — especially `model.go`, `service.go`, and `handler.go` for affected modules
3. Check the existing migrations in `backend/migrations/` for the current schema
4. Run `grep -r "[key concept]" backend/internal/` to find any existing partial implementations

This is critical: understand what already exists before designing anything new.

---

## Step 2: Design the Solution

Address each layer of the stack:

### Data Layer
- What new tables/columns are needed? (Reference existing schema patterns)
- What indexes support the key queries?
- What FK relationships are needed?
- Any schema changes to existing tables? (These require careful migration planning)

### Service Layer (Go)
- Which existing `Service` structs are extended vs. which new services are created?
- What business logic rules need to be enforced?
- What NATS events are published/consumed? (Reference existing event patterns)

### API Layer (Go/Chi)
- What new REST endpoints are needed?
- What existing endpoints need modification?
- What request/response shapes are needed?

### Frontend Layer (Lit 3)
- Which existing `gable-*` components can be reused?
- What new components are needed?
- Which layout shell (`gable-app-shell`, `gable-portal-layout`, etc.) does this live in?
- What route path? (`/erp/[module]/[feature]`)

---

## Step 3: Research Build vs. Buy

For each significant technical component:

1. Search Go package registry (`pkg.go.dev`) for relevant libraries
2. Search npm for relevant frontend libraries
3. Check what GableLBM already depends on (`backend/go.mod`, `app/package.json`)
4. Evaluate: build from scratch / use existing library / use SaaS/external API

**Decision criteria:**
- Is there an active, well-maintained library that does exactly this?
- Does the library align with GableLBM's stack (pgx, Chi, Lit 3)?
- Is the data sensitive enough to keep in-house?

---

## Step 4: Identify Integration Points

Map how this feature integrates with existing GableLBM modules:

| Integration | Direction | Mechanism | Data Passed |
|------------|----------|-----------|------------|
| [e.g., GL] | Feature → GL | NATS event `[module].[event]` | [data] |
| [e.g., Inventory] | Inventory → Feature | Direct Go interface call | [data] |

---

## Step 5: Write Artifacts

### SOLUTION_DESIGN.md
```markdown
# Solution Design

## Chosen Approach
[One paragraph: what are we building and why this approach over alternatives?]

## Data Design
### New Tables
[Table name, purpose, key columns, relationships]

### Schema Changes to Existing Tables
[Table name, changes, migration approach — flag these carefully]

### Key Queries
[The 3-5 most important queries this feature needs to execute]

## Service Design
### New / Modified Services
[For each: which Go file, what methods are added/changed, business rules enforced]

### Event Flows
[NATS events published and consumed — subject names, payload]

## API Design (Summary)
[Endpoint list — detailed spec goes in Stage 07]
| Method | Path | Purpose |
|--------|------|---------|

## Frontend Design (Summary)
[Component list and which screen they appear on — detailed spec goes in Stage 05]

## Out of Scope (This Iteration)
[Explicit list of things this design deliberately excludes]
```

### BUILD_VS_BUY.md
```markdown
# Build vs. Buy Decisions

| Component | Decision | Library/SaaS (if buy) | Rationale |
|-----------|---------|----------------------|-----------|
[One row per significant component]
```

---

## Step 6: Update Pipeline State

```
- [x] 03 Solution Design
Artifacts: SOLUTION_DESIGN.md, BUILD_VS_BUY.md
Approach: [One sentence summary]
Key risk: [Most significant technical uncertainty]
```

Proceed immediately to Stage 04.
