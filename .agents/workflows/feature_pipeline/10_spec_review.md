---
stage: "10"
description: Self-audit the complete spec package for gaps, contradictions, ambiguity, and GableLBM convention violations. Final approval gate.
inputs: All artifacts
outputs: SPEC_REVIEW.md (updated with findings)
approval_gate: true
---

# Stage 10: Spec Review

Perform a critical self-audit of every artifact produced. A contributor should be able to pick up the execution plan and implement the feature with zero ambiguity and zero back-and-forth questions.

---

## Step 1: Read Every Artifact

Read every file in `.agents/handoff/`. Keep a running list of issues.

---

## Step 2: Run the Completeness Checklist

### PRD Checklist
- [ ] Every Must Have from `SCOPE_DEFINITION.md` has at least one user story
- [ ] Every user story has a happy path, at least one edge case, and at least one error scenario in Gherkin
- [ ] Every user story references a specific screen from `DESIGN_SPEC.md`
- [ ] Every user story traces to a JTBD from `PERSONAS.md`
- [ ] NFR targets are specific numbers, not vague ("< 200ms", not "fast")

### Architecture Checklist
- [ ] Every user story maps to at least one API endpoint in `API_CONTRACT.md`
- [ ] Every API endpoint maps to a handler method in `ARCHITECTURE.md`
- [ ] Every handler method maps to a service method
- [ ] Every service method maps to a repository method
- [ ] Every new table has a migration in `EXECUTION_PLAN.md`
- [ ] Every FK has an index
- [ ] All new columns use `DECIMAL(19,4)` for quantities/money (not float, not NUMERIC(12,2))
- [ ] All new columns use `TIMESTAMPTZ` for timestamps (not TIMESTAMP)
- [ ] All new PK columns use `gen_random_uuid()` or `uuid_generate_v4()`

### GableLBM Convention Checklist
- [ ] All API routes are `/api/v1/[resource]` (no exceptions without explicit escalation)
- [ ] All new Go modules follow `model.go / repository.go / service.go / handler.go` pattern
- [ ] All new Lit components use `gable-` prefix and `createRenderRoot() { return this; }`
- [ ] All numeric values in UI use JetBrains Mono (specified in DESIGN_SPEC.md)
- [ ] No hardcoded hex colors — all colors use Tailwind token classes
- [ ] Money values described in DECIMAL (dollars), not cents

### Design Checklist
- [ ] Every Must Have capability has a designed screen in `DESIGN_SPEC.md`
- [ ] Empty states designed for all data-display screens
- [ ] Error states designed for all form screens
- [ ] Responsive behavior specified for any mobile persona (Driver, Yard)

### Execution Plan Checklist
- [ ] Steps are ordered correctly (migration → model → repo → service → handler → frontend)
- [ ] Every step names a specific file path
- [ ] Every step has a verification command
- [ ] Commit checkpoints are defined

### Assumption Checklist
- [ ] Every HIGH-risk assumption in `ASSUMPTIONS_REGISTER.md` was validated in Stage 01-02
- [ ] No unvalidated assumptions remain in the spec

---

## Step 3: Document Findings

Write `.agents/handoff/SPEC_REVIEW.md`:

```markdown
# Spec Review
# Feature: [Feature Name]
# Review Date: [Date]

## Checklist Results

### PRD: [PASS / ISSUES FOUND]
[List any issues with US number and description]

### Architecture: [PASS / ISSUES FOUND]
[List any issues with artifact name and description]

### GableLBM Conventions: [PASS / ISSUES FOUND]
[List any violations]

### Design: [PASS / ISSUES FOUND]
[List any gaps]

### Execution Plan: [PASS / ISSUES FOUND]
[List any missing steps]

### Assumptions: [PASS / ISSUES FOUND]
[List any unvalidated assumptions]

## Issues Fixed
[List issues that were identified and fixed during this review — with what was changed]

## Remaining Issues (for user review)
[List any issues that require user judgment to resolve — these are escalations]

## Final Verdict
[READY TO IMPLEMENT / NEEDS USER INPUT]
```

If issues are found and can be fixed without user input (typos, missing indexes, wrong types), fix them immediately in the relevant artifacts and note the fixes in SPEC_REVIEW.md.

If issues require user judgment, list them explicitly and wait for input.

---

## ⏸ FINAL APPROVAL — Stage 10 Complete

Present to the user:

```
## 🎉 Feature Pipeline Complete: [Feature Name]

### What Was Produced
All artifacts are in `.agents/handoff/`:

| Artifact | Purpose |
|----------|---------|
| VISION_BRIEF.md | Problem statement and personas |
| DOMAIN_RESEARCH.md | LBM industry research and competitive analysis |
| PERSONAS.md + USER_JOURNEYS.md | Who needs this and the exact workflow |
| SCOPE_DEFINITION.md | MVP must-haves vs deferred |
| DESIGN_SPEC.md | Screen designs using GableLBM design system |
| PRD.md | [N] user stories with Gherkin acceptance criteria |
| ARCHITECTURE.md | Go packages, DB migration, API routes, frontend components |
| API_CONTRACT.md | Exact endpoint specs |
| TESTING_STRATEGY.md | [N] test cases |
| EXECUTION_PLAN.md | [N] ordered implementation steps |
| SPEC_REVIEW.md | Quality audit results |

### Spec Review Result
[PASS / ISSUES (list any remaining)]

### Next Steps

**To implement this feature:**
1. Open a new Claude Code session in this repository
2. Run `/execute`
3. Review the execution summary and approve Step 1

Alternatively, contribute directly by following `EXECUTION_PLAN.md` step-by-step.

**Implementation estimate:** [N hours/days for an experienced Go/Lit developer]

Ready to implement? Run `/execute` in a fresh session.
```

**Wait for user confirmation before ending the pipeline.**

---

## Final Pipeline State Update

```markdown
# Pipeline State

## Feature: [Name]
## Status: ✅ COMPLETE — Ready to implement

## All Stages
- [x] 00 Feature Intake
- [x] 01 Domain Research
- [x] 02 User Research
- [x] 03 Solution Design
- [x] 04 Scope & Priority ✅ (Gate 1 passed)
- [x] 05 Design Spec
- [x] 06 Product Spec
- [x] 07 Architecture Spec ✅ (Gate 2 passed)
- [x] 08 Testing Strategy
- [x] 09 Execution Plan
- [x] 10 Spec Review ✅ (Final gate passed)

## Artifact Summary
[List all artifacts with brief description]
```
