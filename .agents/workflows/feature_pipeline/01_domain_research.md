---
stage: "01"
description: Research how the LBM industry and existing ERPs handle this workflow today. Ground every design decision in real-world evidence.
inputs: VISION_BRIEF.md, RESEARCH_AGENDA.md
outputs: DOMAIN_RESEARCH.md, COMPETITIVE_ANALYSIS.md
browser_usage: HEAVY (15-30 searches)
---

# Stage 01: Domain Research

This is the core research stage. Everything downstream depends on how well you understand the LBM industry's actual practices. Use browser tools heavily — do not rely on training data alone.

---

## Step 1: Read Prior Artifacts

Read `VISION_BRIEF.md` and `RESEARCH_AGENDA.md`. Extract every Industry & Competitive question from the Research Agenda.

---

## Step 2: Research Existing ERP Implementations

For each major LBM ERP, research how they handle this feature:

**Target systems to research:**
- **ECI Spruce** (formerly BisTrack-based) — search `site:ecisolutions.com spruce [feature area]` and ECI help center
- **Epicor BisTrack** — search `epicor bistrack [feature area]` and Epicor community forums
- **DMSi Agility** — search `dmsi agility [feature area]`
- **Do a broad search:** `LBM dealer ERP [feature area]` to catch any other systems

**For each system, document:**
- Does this feature exist? What's it called?
- How is the workflow structured (step-by-step)?
- What data does it capture?
- What do users complain about? (search Reddit, forums, G2/Capterra reviews)
- What screen layout/UX patterns do they use?

**Minimum: 10 searches across these systems.**

---

## Step 3: Research Industry Practices

Research how LBM dealers actually do this TODAY — with or without ERP support:

1. Search LBM industry publications: `[feature area] lumberyards site:fordaq.com OR site:lumber.com OR site:nlbmda.org`
2. Search dealer forums and communities: `[feature area] lumber dealer forum`
3. Search for industry associations and standards: NLBMDA, LBM Journal, ProSales
4. Look for case studies or whitepapers: `[feature area] building materials dealer best practices`

**Document:** Current workarounds (spreadsheets, whiteboards, phone calls), pain points, and what "good" looks like in the industry.

---

## Step 4: Research Technical Landscape

For any technical questions from the Research Agenda:

1. Search for relevant Go libraries: `golang [technical need]`, check pkg.go.dev
2. Search for PostgreSQL patterns: `postgresql [data pattern] best practice`
3. Research any relevant industry standards: EDI transactions, measurement standards, etc.
4. Check if any GableLBM dependencies already support this (read `backend/go.mod`)

---

## Step 5: Validate Assumptions

For each HIGH-risk assumption in `ASSUMPTIONS_REGISTER.md`, search specifically to validate or invalidate it. Update the register with your findings.

---

## Step 6: Write Artifacts

### DOMAIN_RESEARCH.md
```markdown
# Domain Research

## Industry Context
[2-3 paragraphs: How is this workflow done in LBM today? What's the status quo?]
Sources: [URLs]

## Pain Points in Current Solutions
[Bulleted list of specific complaints from dealers/users about existing tools]
Sources: [URLs — G2 reviews, forums, etc.]

## Industry Best Practices
[What "good" looks like — industry standards, common patterns among successful dealers]
Sources: [URLs]

## Key Insights for GableLBM
[3-5 specific insights that should shape our design, derived from research]
```

### COMPETITIVE_ANALYSIS.md
```markdown
# Competitive Analysis

## [ERP Name 1]: [Feature Area]
- **Feature name in their system:** [Name]
- **Workflow:** [Step-by-step]
- **Data captured:** [Fields]
- **User complaints:** [From reviews/forums]
- **What GableLBM can do better:** [Specific opportunity]
- **Source:** [URL]

[Repeat for each ERP researched]

## Competitive Gap Summary
| Capability | BisTrack | Spruce | DMSi | GableLBM Target |
|-----------|---------|--------|------|-----------------|
[One row per key capability — show where GableLBM can lead]

## GableLBM Differentiation Opportunity
[What can GableLBM do that legacy systems can't? Be specific.]
```

---

## Step 7: Update Pipeline State

Add to `PIPELINE_STATE.md`:
```
- [x] 01 Domain Research
Artifacts: DOMAIN_RESEARCH.md, COMPETITIVE_ANALYSIS.md
Key finding: [One sentence summary of the most important research finding]
```

Proceed immediately to Stage 02.
