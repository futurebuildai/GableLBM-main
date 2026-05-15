# GableLBM Design System

**Theme:** Industrial Dark  
**Philosophy:** High contrast, data density, zero clutter. A tool for trade professionals — not a consumer app.

---

## 1. Color Palette

All colors are defined as custom Tailwind tokens in `tailwind.config.js`. **Never hardcode hex values** — always use the Tailwind token class.

### Core Tokens

| Name | Hex | Tailwind Class | Usage |
|------|-----|----------------|-------|
| **Gable Green** | `#00FFA3` | `text-gable-green` / `bg-gable-green` | Primary CTAs, success states, active indicators, glow effects |
| **Deep Space** | `#0A0B10` | `bg-deep-space` | Global page background |
| **Slate Steel** | `#161821` | `bg-slate-steel` | Cards, sidebar, modals, panel backgrounds |
| **Safety Red** | `#F43F5E` | `text-safety-red` / `bg-safety-red` | Errors, stockouts, credit hold alerts, destructive actions |
| **Blueprint Blue** | `#38BDF8` | `text-blueprint-blue` | Technical data, dimensions, external links |

### Supporting Colors (Tailwind defaults in use)

| Usage | Class |
|-------|-------|
| Muted labels / secondary text | `text-gray-400` |
| Dividers / subtle borders | `border-white/10` |
| Hover highlight on rows | `hover:bg-white/5` |
| Glassmorphism panel | `bg-white/5 backdrop-blur-sm` |

---

## 2. Typography

### Body Font: Inter
Used for all UI text — labels, headings, navigation, descriptions.
- **Weights in use:** 400 (regular), 500 (medium), 600 (semibold)
- **Loading:** Via Google Fonts in `app/index.html`

### Data Font: JetBrains Mono
Used for **every** number, identifier, and measurement — without exception.
- **SKUs, account numbers, invoice numbers:** JetBrains Mono
- **Prices, quantities, dimensions:** JetBrains Mono
- **Why:** Monospaced alignment makes column-scanning fast in dense data tables
- **Tailwind class:** `font-mono`

**Rule:** If a value is a number or code that a user would scan visually, it must be `font-mono`.

---

## 3. Component System

GableLBM uses **custom Lit 3 Web Components** — not a third-party UI library. All components use the `gable-` prefix.

### Component Convention (required)

```typescript
import { LitElement, html } from 'lit';
import { customElement, state, property } from 'lit/decorators.js';

@customElement('gable-my-component')
export class GableMyComponent extends LitElement {

  // Light DOM — required for Tailwind classes to work
  createRenderRoot() { return this; }

  // Internal state (triggers re-render, not exposed as attribute)
  @state() private loading = false;

  // External prop (exposed as HTML attribute, use kebab-case attribute name)
  @property({ attribute: 'customer-id' }) customerId = '';

  render() {
    return html`...`;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'gable-my-component': GableMyComponent;
  }
}
```

**Key rules:**
- `createRenderRoot() { return this; }` — always. Shadow DOM breaks Tailwind.
- `@state()` for internal state; `@property()` for external/attribute-bound props
- Attribute names must be kebab-case (`route-id`, not `routeId`)
- Declare in `HTMLElementTagNameMap` for TypeScript type checking

### Component File Locations

| Type | Location | Example |
|------|---------|---------|
| Page-level components | `app/src/pages/[module]/` | `pages/quotes/QuoteList.ts` |
| Reusable module components | `app/src/components/[module]/` | `components/quotes/LineItemEditor.ts` |
| Layout shells | `app/src/components/layout/` | `components/layout/app-shell.ts` |
| Generic UI primitives | `app/src/components/ui/` | `components/ui/Button.ts` |

---

## 4. Layout Shells

Each app context has a dedicated shell component. Never mix shells — a page renders inside exactly one shell based on its `layout` property in `routes.ts`.

| Shell | Component | Route Context |
|-------|-----------|--------------|
| ERP Desktop | `<gable-app-shell>` | Most `/erp/*` routes + `/quotes`, `/orders`, etc. |
| B2B Portal | `<gable-portal-layout>` | `/portal/*` |
| Driver Mobile | `<gable-driver-layout>` | `/driver/*` |
| Yard/Warehouse | `<gable-yard-layout>` | `/yard/*` |
| Full-screen | *(no shell)* | `/pos` |

---

## 5. Data Display Patterns

### Data Tables
- Sticky header row with `bg-slate-steel`
- Condensed row padding: `py-2 px-3`
- Hover state: `hover:bg-white/5`
- Sort indicators on sortable columns
- All numeric columns right-aligned, `font-mono`
- Status column always uses a colored badge

### Status Badges
```html
<!-- Active / Confirmed / Paid -->
<span class="px-2 py-0.5 rounded text-xs font-mono bg-gable-green/20 text-gable-green uppercase">
  CONFIRMED
</span>

<!-- Error / Overdue / Stockout -->
<span class="px-2 py-0.5 rounded text-xs font-mono bg-safety-red/20 text-safety-red uppercase">
  OVERDUE
</span>

<!-- Neutral / Draft / Pending -->
<span class="px-2 py-0.5 rounded text-xs font-mono bg-white/10 text-gray-400 uppercase">
  DRAFT
</span>
```

### Monetary Values
```html
<!-- Always right-aligned, font-mono, 2 decimal places -->
<span class="font-mono text-right">$1,234.56</span>

<!-- Negative / credit -->
<span class="font-mono text-right text-safety-red">($234.56)</span>
```

### Quantities with UOM
```html
<span class="font-mono">1,200 <span class="text-gray-400 text-xs">LF</span></span>
```

### Empty States
Every data-display component must handle empty state:
```html
<div class="flex flex-col items-center justify-center py-16 text-center">
  ${icon(PackageOpen, 48, 'text-gray-600 mb-4')}
  <p class="text-gray-400 font-medium">No [items] yet</p>
  <p class="text-gray-600 text-sm mt-1">Create your first [item] to get started</p>
  <button class="mt-4 px-4 py-2 bg-gable-green text-black font-semibold rounded">
    Add [Item]
  </button>
</div>
```

### Loading States
Use skeleton loaders — never spinners for data-heavy components:
```html
<div class="animate-pulse space-y-2">
  <div class="h-8 bg-white/5 rounded"></div>
  <div class="h-8 bg-white/5 rounded"></div>
  <div class="h-8 bg-white/5 rounded"></div>
</div>
```

---

## 6. Buttons

```html
<!-- Primary CTA -->
<button class="px-4 py-2 bg-gable-green text-black font-semibold rounded hover:opacity-90 transition">
  Save Quote
</button>

<!-- Secondary / Ghost -->
<button class="px-4 py-2 border border-white/10 text-gray-300 rounded hover:bg-white/10 transition">
  Cancel
</button>

<!-- Destructive -->
<button class="px-4 py-2 border border-safety-red/50 text-safety-red rounded hover:bg-safety-red/10 transition">
  Delete
</button>
```

---

## 7. Icons

Use the `icon()` helper from `lib/icons.ts`:

```typescript
import { icon } from '../../lib/icons.ts';
import { Package, AlertTriangle, ChevronRight } from 'lucide';

// icon(LucideIcon, size, tailwindClasses)
icon(Package, 20, 'text-gable-green')
icon(AlertTriangle, 16, 'text-safety-red')
icon(ChevronRight, 14, 'text-gray-400')
```

---

## 8. Navigation

### ERP Sidebar
The `<gable-app-shell>` renders the main sidebar. To add a new ERP section to navigation, add an entry to the `navItems` array in `components/layout/app-shell.ts`.

### Programmatic Navigation
```typescript
import { RouterService } from '../../lib/router.ts';
const router = RouterService.instance;
router.navigate('/quotes/new');
```

### Route Params
```typescript
// In page component — receives route-id as attribute
@property({ attribute: 'route-id' }) routeId = '';
```

---

## 9. Toast Notifications

```typescript
import { ToastService } from '../../lib/toast-service.ts';

ToastService.show('Quote saved successfully', 'success');   // green
ToastService.show('Failed to save quote', 'error');         // red
ToastService.show('Sending to customer...', 'info');        // blue
```

---

## 10. Micro-Animations

- **Hover lift:** `hover:-translate-y-0.5 transition-transform duration-150`
- **All transitions:** `duration-200` — nothing slower
- **State changes:** CSS classes toggled, not JS-driven animations
- **No Framer Motion, no GSAP** — CSS transitions only
