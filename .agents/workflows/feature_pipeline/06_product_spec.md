---
stage: "06"
description: Write the full Product Requirements Document — user stories with Gherkin acceptance criteria, NFRs, and data requirements. Every requirement traces to research evidence.
inputs: All Stage 00-05 artifacts
outputs: PRD.md
browser_usage: LIGHT (verify NFR benchmarks if needed)
---

# Stage 06: Product Spec (PRD)

This is the synthesis stage. Every decision traces back to evidence from upstream research. The PRD is the single source of truth for WHAT to build.

---

## Step 1: Read All Prior Artifacts

Read every artifact in `.agents/handoff/` before writing a single line. The PRD must:
- Reference only capabilities from `SCOPE_DEFINITION.md` Must Haves
- Trace every user story to a JTBD from `PERSONAS.md`
- Reference the screen from `DESIGN_SPEC.md`
- Apply only data models from `SOLUTION_DESIGN.md`

---

## Step 2: Write the PRD

Write `.agents/handoff/PRD.md` with this structure:

```markdown
# Product Requirements Document
# Feature: [Feature Name]
# Version: 1.0 — [Date]

---

## 1. Overview

### 1.1 Problem Statement
[From VISION_BRIEF.md — one sentence problem statement]
Evidence: [DOMAIN_RESEARCH.md finding + URL]

### 1.2 Target User
[Primary persona from PERSONAS.md — name, role, day-in-the-life sentence]

### 1.3 Success Metrics
[From METRICS_FRAMEWORK.md — north star + top 2 input metrics]

### 1.4 Scope
**In scope (MVP):** [From SCOPE_DEFINITION.md Must Haves]
**Out of scope:** [From SCOPE_DEFINITION.md Won't Haves]

---

## 2. User Stories

[Organize by journey phase from USER_JOURNEYS.md]

### 2.1 [Journey Phase Name]

#### US-001: [Story Title]
**As a** [persona],
**I want to** [capability],
**so that** [outcome].

**Evidence:** Addresses JTBD: "[JTBD statement]" (opportunity score: [X]).
Competitive gap: [finding from COMPETITIVE_ANALYSIS.md with source URL].

**Acceptance Criteria:**

```gherkin
Scenario: [Happy path name]
  Given [precondition — specific GableLBM state]
  When [user action — specific screen + action]
  Then [expected result — specific data change or UI state]
  And [any additional assertions]

Scenario: [Edge case name]
  Given [edge condition]
  When [action]
  Then [specific handling]

Scenario: [Error case name]
  Given [error condition]
  When [action that triggers error]
  Then [error message/behavior — reference DESIGN_SPEC.md error state]
```

**UI Reference:** [Screen name from DESIGN_SPEC.md]
**Priority:** Must Have
**Dependencies:** [US-XXX if applicable]

---
[Repeat US-XXX for every Must Have capability from SCOPE_DEFINITION.md]
```

---

## Step 3: Non-Functional Requirements

```markdown
## 3. Non-Functional Requirements

### 3.1 Performance
| Metric | Target | Notes |
|--------|--------|-------|
| API list endpoints (p95) | < 200ms | With pagination up to 250 rows |
| API create/update endpoints (p95) | < 100ms | Single record operations |
| Page load (LCP) | < 2s | On standard dealer hardware |
| Background jobs | < 30s | Async processing (NATS) |

### 3.2 Data Integrity
[LBM-specific: quantities must balance, UOMs must match, financial totals must reconcile]

### 3.3 Concurrency
[What happens if two users act on the same record simultaneously? Define behavior.]

### 3.4 Compatibility
- **Browser:** Chrome 120+, Firefox 120+, Safari 17+ (dealer workstations)
- **Mobile:** [If applicable — Chrome on Android, Safari on iOS]
- **Screen size:** Minimum 1280px wide for ERP desktop; responsive for driver/yard apps

### 3.5 Accessibility
- Keyboard navigation: All interactive elements reachable via Tab
- Color contrast: WCAG AA (note: GableLBM's dark theme meets this)
- Screen reader: ARIA labels on all icon-only buttons
```

---

## Step 4: Data Requirements

```markdown
## 4. Data Requirements

### 4.1 Data Objects
| Object | Key Attributes | Lifecycle | Notes |
|--------|---------------|-----------|-------|

### 4.2 Validation Rules
| Field | Type | Required | Constraints | Error Message |
|-------|------|----------|-------------|---------------|

### 4.3 Audit Trail
[Which actions should be logged to the audit log? Who changed what, when?]
```

---

## Step 5: Cross-Reference Audit

Before finalizing, verify:
- [ ] Every Must Have from `SCOPE_DEFINITION.md` has at least one user story
- [ ] Every user story traces to a JTBD in `PERSONAS.md`
- [ ] Every user story has happy path, edge case, and error scenario in Gherkin
- [ ] Every user story references a screen from `DESIGN_SPEC.md`
- [ ] No capability snuck in that isn't in Must Haves

---

## Step 6: Update Pipeline State

```
- [x] 06 Product Spec
Artifacts: PRD.md
User stories: [N]
All traced to JTBD: ✅
All have Gherkin scenarios: ✅
```

Proceed immediately to Stage 07.
