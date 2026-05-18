import { LitElement, html, nothing } from 'lit';
import { customElement, property } from 'lit/decorators.js';
import type { MatrixCell, ProductCategory, CategoryPricingRule } from '../../../types/category-pricing';
import { cn } from '../../../lib/utils';

const TIER_COLORS: Record<string, string> = {
  RETAIL: 'text-slate-400',
  SILVER: 'text-slate-300',
  GOLD: 'text-amber-400',
  PLATINUM: 'text-violet-400',
};

const formatRuleValue = (rule: CategoryPricingRule): string => {
  switch (rule.rule_type) {
    case 'MARKDOWN': return `-${rule.rule_value}%`;
    case 'MARKUP': return `+${rule.rule_value}%`;
    case 'MARGIN': return `M${rule.rule_value}%`;
    case 'FIXED': return `$${rule.rule_value.toFixed(2)}`;
    default: return `${rule.rule_value}`;
  }
};

const flattenCategories = (categories: ProductCategory[], depth = 0): { category: ProductCategory; depth: number }[] => {
  const result: { category: ProductCategory; depth: number }[] = [];
  for (const cat of categories) {
    result.push({ category: cat, depth });
    if (cat.children && cat.children.length > 0) {
      result.push(...flattenCategories(cat.children, depth + 1));
    }
  }
  return result;
};

@customElement('gable-matrix-grid')
export class GableMatrixGrid extends LitElement {
  createRenderRoot() { return this; }

  @property({ type: Array }) categories: ProductCategory[] = [];
  @property({ type: Array }) tiers: string[] = [];
  @property({ type: Array }) cells: MatrixCell[] = [];
  @property({ type: Boolean, attribute: 'bulk-mode' }) bulkMode = false;
  @property({ type: Object }) selectedCells: Set<string> = new Set();

  private _handleCellAction(cell: MatrixCell, key: string) {
    if (this.bulkMode) {
      this.dispatchEvent(new CustomEvent('cell-toggle', {
        detail: key,
        bubbles: true,
        composed: true,
      }));
    } else {
      this.dispatchEvent(new CustomEvent('cell-click', {
        detail: cell,
        bubbles: true,
        composed: true,
      }));
    }
  }

  render() {
    const flatCats = flattenCategories(this.categories);

    // Build a lookup: categoryID:tier -> cell
    const cellMap = new Map<string, MatrixCell>();
    for (const cell of this.cells) {
      cellMap.set(`${cell.category_id}:${cell.tier}`, cell);
    }

    return html`
      <div class="overflow-auto border border-white/5 rounded-lg">
        <table class="w-full text-sm">
          <thead>
            <tr class="bg-white/[0.03]">
              <th class="sticky left-0 z-10 bg-slate-steel px-4 py-3 text-left text-xs font-medium text-slate-400 uppercase tracking-wider border-r border-white/5 min-w-[220px]">
                Category
              </th>
              ${this.tiers.map(tier => html`
                <th
                  class="px-4 py-3 text-center text-xs font-medium uppercase tracking-wider border-r border-white/5 last:border-r-0 min-w-[140px]"
                >
                  <span class=${TIER_COLORS[tier] || 'text-slate-400'}>${tier}</span>
                </th>
              `)}
            </tr>
          </thead>
          <tbody class="divide-y divide-white/[0.03]">
            ${flatCats.map(({ category, depth }) => html`
              <tr class="group hover:bg-white/[0.02] transition-colors">
                <td
                  class="sticky left-0 z-10 bg-slate-steel group-hover:bg-[#1a1c26] px-4 py-2.5 border-r border-white/5 transition-colors"
                  style="padding-left: ${16 + depth * 20}px"
                >
                  <span class=${cn('text-sm', depth === 0 ? 'text-white font-medium' : 'text-slate-300')}>
                    ${category.name}
                  </span>
                </td>
                ${this.tiers.map(tier => {
                  const key = `${category.id}:${tier}`;
                  const cell = cellMap.get(key);
                  const hasRule = cell?.rule != null;
                  const isInherited = cell?.inherited ?? false;
                  const isSelected = this.bulkMode && this.selectedCells?.has(key);

                  return html`
                    <td
                      @click=${() => cell && this._handleCellAction(cell, key)}
                      class=${cn(
                        'px-4 py-2.5 text-center border-r border-white/[0.03] last:border-r-0 cursor-pointer transition-colors relative',
                        hasRule && !isInherited && 'bg-gable-green/[0.03]',
                        hasRule && isInherited && 'bg-blueprint-blue/[0.03]',
                        isSelected && 'ring-2 ring-inset ring-gable-green/50 bg-gable-green/10',
                        'hover:bg-white/5'
                      )}
                    >
                      ${this.bulkMode ? html`
                        <div class="absolute top-1 right-1">
                          <div class=${cn(
                            'w-3.5 h-3.5 rounded border transition-colors',
                            isSelected ? 'bg-gable-green border-gable-green' : 'border-white/20'
                          )}></div>
                        </div>
                      ` : nothing}
                      ${hasRule && cell?.rule ? html`
                        <div class="flex items-center justify-center gap-1.5">
                          <span
                            class=${cn(
                              'font-mono text-sm font-medium',
                              isInherited ? 'text-blueprint-blue/70' : 'text-gable-green'
                            )}
                          >
                            ${formatRuleValue(cell.rule)}
                          </span>
                          ${!isInherited ? html`
                            <span
                              class=${cn(
                                'inline-flex items-center justify-center w-4 h-4 rounded text-[9px] font-bold',
                                cell.rule.target_type === 'ACCOUNT'
                                  ? 'bg-gable-green/20 text-gable-green'
                                  : 'bg-blueprint-blue/20 text-blueprint-blue'
                              )}
                            >
                              ${cell.rule.target_type === 'ACCOUNT' ? 'A' : 'T'}
                            </span>
                          ` : nothing}
                          ${isInherited ? html`
                            <span class="text-[9px] text-blueprint-blue/50 font-mono" title="Inherited from ${cell.source_path}">
                              inh
                            </span>
                          ` : nothing}
                        </div>
                      ` : html`
                        <span class="text-slate-600 text-xs">--</span>
                      `}
                    </td>
                  `;
                })}
              </tr>
            `)}
          </tbody>
        </table>
      </div>
    `;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'gable-matrix-grid': GableMatrixGrid;
  }
}
