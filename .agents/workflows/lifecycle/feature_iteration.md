---
description: Produce a delta spec for adding to or enhancing a feature that was previously implemented. Reads existing state and produces only what's new.
inputs: PROJECT_STATE.md, existing handoff artifacts, feature request
outputs: FEATURE_DELTA.md, updated artifacts as needed
---

# Feature Iteration Workflow

Use this when a contributor wants to enhance or extend a feature that already exists in GableLBM.

---

## Step 1: Read Existing State

1. Read `.agents/handoff/PROJECT_STATE.md` — understand what was built and when
2. Read `.agents/handoff/PRD.md` — understand the original requirements
3. Read `.agents/handoff/ARCHITECTURE.md` — understand the current design
4. Read the actual implementation in `backend/internal/[module]/`

---

## Step 2: Define the Delta

Document only what's changing:
- What new capability is being added?
- What existing behavior is being modified?
- What data model changes are needed (new migration)?
- What API changes are needed (new endpoints or modified)?
- What UI changes are needed?

---

## Step 3: Write FEATURE_DELTA.md

```markdown
# Feature Delta
# Original Feature: [Feature Name]
# Enhancement: [Enhancement Name]
# Date: [Date]

## What's Changing
[Brief description — max 2 paragraphs]

## New Capabilities
[User stories for the new capabilities — same Gherkin format as PRD.md]

## Modified Behaviors
| Original Behavior | New Behavior | User Story | Rationale |
|-------------------|-------------|-----------|-----------|

## Schema Changes
**New migration file:** `backend/migrations/[NNN]_[slug].sql`
[SQL for new tables/columns]

## API Changes
| Endpoint | Change Type | What Changed |
|---------|------------|-------------|

## Frontend Changes
| Component | Change Type | What Changed |
|-----------|------------|-------------|

## No-Change Guarantee
[Explicit list of things that are NOT changing — helps the implementer know what to leave alone]

## Execution Delta
[Ordered steps — same format as EXECUTION_PLAN.md, but only the new steps]
```

---

## Step 4: Update PROJECT_STATE.md

Add the enhancement to the feature history.
