---
stage: "04"
description: Define the MVP scope — what's in, what's deferred, and what success looks like. First approval gate.
inputs: All Stage 00-03 artifacts
outputs: SCOPE_DEFINITION.md, METRICS_FRAMEWORK.md
approval_gate: true
---

# Stage 04: Scope & Priority

Define the MVP precisely and ruthlessly. A shipped MVP beats a perfect spec. Apply the "cupcake, not layer cake" principle — deliver complete value at small scope.

---

## Step 1: Read All Prior Artifacts

Read everything: VISION_BRIEF.md, DOMAIN_RESEARCH.md, COMPETITIVE_ANALYSIS.md, PERSONAS.md, USER_JOURNEYS.md, SOLUTION_DESIGN.md, BUILD_VS_BUY.md.

Identify every implied capability from the feature idea and research. List them all.

---

## Step 2: MoSCoW Prioritization

Sort every capability into:

**Must Have (MVP blocker — ship only if this exists)**
- Capabilities where the feature has zero value without them
- Corresponds to JTBD opportunity scores > 12

**Should Have (MVP+ — strong value, implement if time allows)**
- Capabilities that significantly improve the core workflow
- JTBD opportunity scores 8-12

**Could Have (Future iteration)**
- Nice-to-have improvements, polish, edge cases
- JTBD opportunity scores < 8

**Won't Have (Explicitly excluded)**
- Capabilities that are out of scope for this feature entirely
- Or capabilities that belong in a different module

**Rule:** Be aggressive about moving things to Should Have and Could Have. If in doubt, defer.

---

## Step 3: Define Success Metrics

For the MVP, define:

**North Star Metric:** The single number that tells you if this feature is working for dealers. (Example: "% of delivery routes dispatched via GableLBM dispatch board vs. manual methods")

**Input Metrics (leading indicators):**
- What behaviors predict the north star improving?
- Measurable by GableLBM's existing reporting module or new instrumentation

**Guardrail Metrics (don't break these):**
- Performance: p95 API response < 200ms
- Reliability: No new errors introduced in adjacent modules
- Data integrity: All transactions balanced (for financial features)

---

## Step 4: Write Artifacts

### SCOPE_DEFINITION.md
```markdown
# Scope Definition

## Feature: [Name]

## Must Have (MVP)
[Numbered list — each item is a specific capability, not a vague category]

## Should Have (MVP+)
[Numbered list]

## Could Have (Future)
[Numbered list]

## Won't Have (Explicitly Out of Scope)
[Numbered list — with one-line rationale for each]

## MVP Success Criteria
The MVP is complete when a [primary persona] can [specific action] without [current workaround].

## Deferred to Next Iteration
[What's the likely next feature iteration after this MVP? One paragraph.]
```

### METRICS_FRAMEWORK.md
```markdown
# Metrics Framework

## North Star Metric
[Metric name]: [Definition and how it's measured]

## Input Metrics
| Metric | Definition | Measurement Method | Target |
|--------|-----------|-------------------|--------|

## Guardrail Metrics
| Metric | Threshold | Why It Matters |
|--------|----------|----------------|
```

---

## ⏸ APPROVAL GATE — Stage 04 Complete

Present a summary to the user:

```
## Stage 04 Complete: Scope & Priority

### Research Summary
- Domain research covered: [BisTrack, Spruce, DMSi findings — 1 sentence each]
- Primary persona: [Role] — Top JTBD: [statement]
- Competitive opportunity: [Where GableLBM can lead]

### MVP Scope
**Must Have:**
[Bulleted list]

**Explicitly Out of Scope:**
[Bulleted list]

**Success Metric:** [North star]

### Next Stages (if approved)
Stage 05-07 will produce:
- Screen designs using GableLBM's Industrial Dark design system
- Full PRD with Given/When/Then acceptance criteria
- Architecture spec with exact Go packages, API routes, and DB migration

Ready to continue to Stage 05 (Design Spec)?
```

**Wait for user confirmation before proceeding.**

---

## Step 5: Update Pipeline State

```
- [x] 04 Scope & Priority ✅ (Approval gate passed)
Artifacts: SCOPE_DEFINITION.md, METRICS_FRAMEWORK.md
Must Have count: [N]
North star: [metric name]
```
