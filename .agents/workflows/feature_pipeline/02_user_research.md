---
stage: "02"
description: Map the specific LBM personas who need this feature, their jobs-to-be-done, and the detailed workflow they need to execute.
inputs: VISION_BRIEF.md, DOMAIN_RESEARCH.md
outputs: PERSONAS.md, USER_JOURNEYS.md
browser_usage: MODERATE (5-10 searches — forums, reviews, dealer communities)
---

# Stage 02: User Research

Define exactly who uses this feature, what outcome they're trying to achieve, and the step-by-step workflow they need to execute. GableLBM's personas are well-defined LBM industry roles — ground your analysis in how real dealers work.

---

## Step 1: Read Prior Artifacts

Read `VISION_BRIEF.md` and `DOMAIN_RESEARCH.md`. Note the identified personas and the current state of the workflow.

---

## Step 2: Research Real User Sentiment

Search for firsthand dealer perspectives on this workflow:

1. Search LBM dealer forums, Reddit (r/smallbusiness, r/lumberyard), Facebook groups
2. Search for job descriptions: `[LBM role] job description` — to understand what their job actually entails day-to-day
3. Search for industry conference presentations: `NLBMDA [feature area]` or `LBM dealer summit [feature area]`
4. Read G2/Capterra reviews of competitor ERPs — filter for reviews mentioning this feature

**Extract:** Exact quotes from real users when possible. "I have to manually..." or "Our biggest pain is..." are gold.

---

## Step 3: Define Primary Persona(s)

For each persona who interacts with this feature, write a profile grounded in the DOMAIN_RESEARCH:

```markdown
## [Role Name] — Primary / Secondary

**Day in the life:** [2-3 sentences — what do they do all day?]

**Context when using this feature:**
- When: [Time of day, trigger event]
- Where: [Counter, office, yard, truck cab, job site]
- Device: [Desktop, tablet, mobile]
- Emotional state: [Busy and pressured? Deliberate and careful?]

**Jobs-to-be-done (in priority order):**
1. [JTBD statement: "When I [situation], I want to [motivation], so I can [outcome]."]
2. [...]

**Current workaround:** [How do they do this today without the feature?]

**Pain with current approach:** [What goes wrong? What takes too long?]

**Success looks like:** [One sentence — what does "job done well" feel like for this persona?]
```

---

## Step 4: Map the User Journey

For the primary persona, map the complete workflow step-by-step:

```markdown
## User Journey: [Journey Name]
**Persona:** [Role]
**Trigger:** [What initiates this workflow?]
**Goal:** [What does done look like?]

| Step | Action | GableLBM Screen/Module | Data Needed | Decision Made | Pain Point Today |
|------|--------|----------------------|-------------|---------------|-----------------|
| 1 | [What the user does] | [Which screen] | [What they need to see] | [Decision/action] | [What's painful today] |
[...]

**Happy path duration today:** [How long does this take now?]
**Target duration with feature:** [How long should it take?]
**Error states:** [What can go wrong in this workflow?]
```

---

## Step 5: Define Opportunity Scores

For each Job-to-be-Done, score the opportunity:

| JTBD | Importance (1-10) | Satisfaction Today (1-10) | Opportunity Score |
|------|------------------|--------------------------|-------------------|
[Opportunity Score = Importance + max(Importance - Satisfaction, 0)]

Scores above 10 are high-opportunity gaps. These are the must-haves.

---

## Step 6: Write Artifacts

Write `PERSONAS.md` and `USER_JOURNEYS.md` to `.agents/handoff/` using the templates above. Include all personas (primary and secondary) and at least one detailed journey map.

---

## Step 7: Update Pipeline State

```
- [x] 02 User Research
Artifacts: PERSONAS.md, USER_JOURNEYS.md
Primary persona: [Role name]
Top JTBD: [Most important job statement]
```

Proceed immediately to Stage 03.
