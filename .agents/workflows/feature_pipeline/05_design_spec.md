---
stage: "05"
description: Design the screens and interaction flows using GableLBM's Industrial Dark design system and existing component patterns.
inputs: SCOPE_DEFINITION.md, USER_JOURNEYS.md, SOLUTION_DESIGN.md
outputs: DESIGN_SPEC.md
browser_usage: LIGHT (2-3 searches for UX patterns if needed)
---

# Stage 05: Design Spec

Design the UI/UX using GableLBM's existing design system. Do not invent new patterns — extend what exists.

---

## Step 1: Read Context

1. Read `SCOPE_DEFINITION.md` (Must Haves drive the screens)
2. Read `USER_JOURNEYS.md` (maps steps to screens)
3. Read `docs/design-system.md` for the full design system
4. Run `find app/src -name "*.ts" | head -60` to see existing components
5. Run `cat app/src/routes.ts` to understand existing routes

---

## Step 2: Apply GableLBM Design System

Every screen you design MUST use:

### Typography
- **Body/labels:** Inter 400/500/600
- **All numbers, SKUs, prices, dimensions, quantities:** JetBrains Mono — without exception

### Colors (use Tailwind tokens, never hex)
| Token | Tailwind Class | Use |
|-------|---------------|-----|
| Gable Green | `text-[#00FFA3]` / `bg-[#00FFA3]` | Primary CTAs, success, active state |
| Deep Space | `bg-[#0A0B10]` | Global background |
| Slate Steel | `bg-[#161821]` | Cards, modals, sidebar |
| Safety Red | `text-[#F43F5E]` | Errors, alerts, credit holds |
| Blueprint Blue | `text-[#38BDF8]` | Technical data, links |
| Muted text | `text-gray-400` | Labels, secondary info |

### Layout Shells
| Context | Shell Component | Route Prefix |
|---------|----------------|-------------|
| ERP desktop | `<gable-app-shell>` | `/erp/` |
| B2B portal | `<gable-portal-layout>` | `/portal/` |
| Driver mobile | `<gable-driver-layout>` | `/driver/` |
| Warehouse/yard | `<gable-yard-layout>` | `/yard/` |
| Point of sale | `<gable-pos-shell>` | `/pos` |

### Data Display Patterns
- **Data tables:** Use existing table pattern with sticky headers, sortable columns
- **Status badges:** Color-coded pill with uppercase text (ACTIVE = green, INACTIVE = gray, ERROR = red)
- **Monetary values:** Always right-aligned, JetBrains Mono, 2 decimal places
- **Quantities with UOM:** Value + UOM abbreviation in JetBrains Mono (e.g., `1,200 LF`)
- **Empty states:** Icon + title + description + primary CTA
- **Loading states:** Skeleton loaders (not spinners) for data-heavy tables

---

## Step 3: Design Each Screen

For each Must Have capability, design the screen(s) needed:

```markdown
## Screen: [Screen Name]
**Route:** `/erp/[module]/[path]`
**Shell:** `<gable-app-shell>`
**Primary persona:** [Role]
**Trigger:** [What brings the user here?]

### Layout
[Describe the layout in text — header, sidebar, main content area, action bar]

### Data Display
| Column/Field | Data Type | Format | Source |
|-------------|----------|--------|--------|
[For tables: list every column]
[For forms: list every field]

### Actions Available
| Action | Button/Control | Result |
|--------|---------------|--------|
| [Primary CTA] | `bg-[#00FFA3] text-black` button | [What happens] |
| [Secondary] | Ghost button | [What happens] |

### Empty State
[What does the user see when there's no data?]

### Error States
[What does the user see when something fails?]

### Mobile/Responsive
[Is this screen accessible on mobile/tablet? What's the responsive behavior?]
```

---

## Step 4: Design User Flows

Map the interactions between screens:

```markdown
## Flow: [Flow Name]
[Trigger] → Screen A → [action] → Screen B → [action] → [outcome]

### Decision Points
[At each fork in the flow, document the condition and both paths]
```

---

## Step 5: Component Inventory

List every component needed:

```markdown
## Components Required

### Reusing Existing Components
| Component | Location | Used For |
|-----------|---------|----------|

### New Components Needed
| Component Name | Type | Extends | Purpose |
|---------------|------|---------|---------|
| `gable-[name]` | Page / Card / Dialog / Form | (if extending existing) | [What it does] |
```

---

## Step 6: Write DESIGN_SPEC.md

Write the complete design spec to `.agents/handoff/DESIGN_SPEC.md` using the above structure. Every screen in the Must Have scope needs a full design entry.

---

## Step 7: Update Pipeline State

```
- [x] 05 Design Spec
Artifacts: DESIGN_SPEC.md
Screens designed: [N]
New components needed: [N]
Reusing existing: [N]
```

Proceed immediately to Stage 06.
