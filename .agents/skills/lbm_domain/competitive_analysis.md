---
description: Deep-dive competitive analysis of a specific feature area across BisTrack, ECI Spruce, and DMSi Agility.
skill: competitive_analysis
invoke_with: "Apply competitive analysis to [feature area]"
---

# LBM ERP Competitive Analysis Skill

Use this skill when Stage 01 requires a thorough competitive teardown of a specific feature.

## Research Protocol

### BisTrack (Epicor BisTrack)
- Search: `epicor bistrack [feature] documentation`
- Search: `bistrack [feature] how to`
- Check: Epicor community forums (`community.epicor.com`)
- Check: G2 reviews filtered to BisTrack mentioning [feature]

### ECI Spruce
- Search: `ECI Spruce [feature] help`
- Search: `ecisolutions.com spruce [feature]`
- Check: ECI support portal and knowledge base

### DMSi Agility
- Search: `dmsi agility [feature]`
- Search: `dmsi software [feature] lumber dealer`

### Broad Industry Search
- Search: `[feature] lumberyard ERP software`
- Search: `[feature] building materials dealer software`
- Check: LBM Journal (`lbmjournal.com`), ProSales (`probuilder.com/prosales`)

## Output Format

```markdown
## [ERP Name]: [Feature Name]

**Does this feature exist?** Yes / No / Partial
**Feature name in their system:** [What they call it]
**Workflow summary:** [3-5 bullet points describing the UX/workflow]
**Data captured:** [Key fields and data points]
**Strengths:** [What they do well]
**Weaknesses / User Complaints:** [From reviews and forums]
**GableLBM opportunity:** [Specific gap we can close]
**Source URLs:** [Cite every claim]
```

## Synthesis Template

```markdown
## Competitive Gap Summary

| Capability | BisTrack | Spruce | DMSi | GableLBM Opportunity |
|-----------|---------|--------|------|---------------------|
| [cap 1]   | ✅/⚠️/❌ | ✅/⚠️/❌ | ✅/⚠️/❌ | [how we win] |

Legend: ✅ Fully supported | ⚠️ Partial/clunky | ❌ Missing

## GableLBM Differentiation
[Paragraph: where can GableLBM genuinely lead the industry? What do all legacy systems do poorly?]
```
