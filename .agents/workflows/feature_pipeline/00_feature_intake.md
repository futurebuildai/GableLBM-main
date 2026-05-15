---
stage: "00"
description: Parse a contributor's LBM feature idea into a structured brief, research agenda, and assumptions register.
inputs: Feature idea (raw text from /start)
outputs: VISION_BRIEF.md, RESEARCH_AGENDA.md, ASSUMPTIONS_REGISTER.md, PIPELINE_STATE.md
---

# Stage 00: Feature Intake

Transform the contributor's raw feature idea into structured artifacts that drive all downstream research and specification.

---

## Step 1: Read Existing Codebase Context

Before analyzing the feature, orient yourself:

1. Identify which GableLBM modules likely touch this feature (cross-reference `TECH_STACK.md` module list)
2. Run `find backend/internal -name "*.go" | head -100` to see what exists
3. If the feature mentions a specific area (e.g., "deliveries", "pricing", "quotes"), read the relevant `backend/internal/[module]/` files to understand what already exists

Note: You are adding to an existing system. What already exists does NOT need to be specified.

---

## Step 2: Parse the Feature Idea

Extract and document:

1. **Core Problem Statement** — What operational problem does this solve for an LBM dealer? Format: *"For [LBM persona], the problem of [what] in [context] results in [consequence]."*
2. **Target Personas** — Which of the LBM personas are primarily affected? (Salesperson, Inside Sales, Yard Manager, Dispatcher, Driver, Purchasing, Controller, Owner)
3. **Desired Outcomes** — What does the dealer/user need to be able to DO differently?
4. **Implied Capabilities** — What specific features does the idea imply?
5. **Existing GableLBM Coverage** — What does GableLBM already do in this area?
6. **Scope Boundary** — What's obviously out of scope for this idea?
7. **Constraints Mentioned** — Any explicit constraints (UOM, integration, workflow)?

---

## Step 3: Generate the Research Agenda

For each unknown that needs validation, generate specific research questions in these categories:

### Industry & Competitive
- How do BisTrack, ECI Spruce, and DMSi handle this today?
- What do LBM dealers complain about in their current solution?
- Are there industry standards or best practices for this workflow?

### User & Workflow
- What is the actual step-by-step workflow today (with or without software)?
- What data does the user need to see to make decisions?
- What are the failure modes — what goes wrong in this workflow?

### Technical
- Which existing GableLBM modules does this touch?
- What new database schema is needed (if any)?
- What integrations are implied (EDI, GL, market indices)?
- Are there relevant Go libraries or open standards to leverage?

---

## Step 4: Map Assumptions

List every assumption embedded in the feature idea. Rate each:
- **Risk:** HIGH / MEDIUM / LOW (how wrong could we be?)
- **Validation:** How will it be validated in Stage 01-02?

---

## Step 5: Write Artifacts

Write the following to `.agents/handoff/`:

### VISION_BRIEF.md
```markdown
# Vision Brief

## Problem Statement
[One sentence: "For [persona], the problem of [X] in [LBM context] results in [consequence]."]

## Target Personas (Primary → Secondary)
[List with context]

## Desired Outcomes
[Numbered list of what the user needs to do differently]

## Implied Capabilities
[Numbered list — extracted from the feature idea]

## Existing GableLBM Coverage
[What already exists in the codebase relevant to this feature]

## Out of Scope (This Iteration)
[What this feature is NOT — explicit boundary]

## Constraints
[Any explicit constraints from the feature idea]
```

### RESEARCH_AGENDA.md
```markdown
# Research Agenda

## Industry & Competitive Questions
[Numbered list of specific research questions]

## User & Workflow Questions
[Numbered list — these drive Stage 02 user research]

## Technical Questions
[Numbered list — these drive Stage 03 solution design]
```

### ASSUMPTIONS_REGISTER.md
```markdown
# Assumptions Register

| # | Assumption | Risk | Validation Approach |
|---|-----------|------|---------------------|
[One row per assumption]
```

---

## Step 6: Update Pipeline State

Write `.agents/handoff/PIPELINE_STATE.md`:

```markdown
# Pipeline State

## Feature
[Feature name — derive a short slug, e.g., "Customer Job Budget Tracking"]

## Status
Stage 00 complete ✅ — proceeding to Stage 01

## Stages
- [x] 00 Feature Intake
- [ ] 01 Domain Research
- [ ] 02 User Research
- [ ] 03 Solution Design
- [ ] 04 Scope & Priority
- [ ] 05 Design Spec
- [ ] 06 Product Spec
- [ ] 07 Architecture Spec
- [ ] 08 Testing Strategy
- [ ] 09 Execution Plan
- [ ] 10 Spec Review

## Artifacts Produced
- VISION_BRIEF.md
- RESEARCH_AGENDA.md
- ASSUMPTIONS_REGISTER.md
```

---

Proceed immediately to Stage 01.
