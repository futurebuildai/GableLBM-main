import { LitElement, html } from 'lit';
import { customElement, property } from 'lit/decorators.js';
import { icon } from '../../../lib/icons';
import { User, Pencil, Trash2 } from 'lucide';
import type { CategoryPricingRule } from '../../../types/category-pricing';

const formatRuleValue = (rule: CategoryPricingRule): string => {
  switch (rule.rule_type) {
    case 'MARKDOWN': return `-${rule.rule_value}%`;
    case 'MARKUP': return `+${rule.rule_value}%`;
    case 'MARGIN': return `M${rule.rule_value}%`;
    case 'FIXED': return `$${rule.rule_value.toFixed(2)}`;
    default: return `${rule.rule_value}`;
  }
};

const RULE_TYPE_COLORS: Record<string, string> = {
  MARKDOWN: 'bg-gable-green/10 text-gable-green border-gable-green/20',
  MARKUP: 'bg-blueprint-blue/10 text-blueprint-blue border-blueprint-blue/20',
  MARGIN: 'bg-amber-500/10 text-amber-400 border-amber-500/20',
  FIXED: 'bg-violet-500/10 text-violet-400 border-violet-500/20',
};

@customElement('gable-account-rules-table')
export class GableAccountRulesTable extends LitElement {
  createRenderRoot() { return this; }

  @property({ type: Array }) rules: CategoryPricingRule[] = [];

  private _handleEdit(rule: CategoryPricingRule) {
    this.dispatchEvent(new CustomEvent('edit-rule', {
      detail: rule,
      bubbles: true,
      composed: true,
    }));
  }

  private _handleDelete(id: string) {
    this.dispatchEvent(new CustomEvent('delete-rule', {
      detail: id,
      bubbles: true,
      composed: true,
    }));
  }

  render() {
    if (this.rules.length === 0) {
      return html`
        <div class="bg-slate-steel border border-white/5 rounded-lg p-12 text-center">
          ${icon(User, 32, 'w-8 h-8 text-slate-500 mx-auto mb-4')}
          <p class="text-slate-400">No account-specific rules</p>
          <p class="text-slate-500 text-sm mt-1">
            Create a rule to give a specific customer a custom price on a category.
          </p>
        </div>
      `;
    }

    return html`
      <div class="overflow-auto border border-white/5 rounded-lg">
        <table class="w-full text-sm">
          <thead>
            <tr class="bg-white/[0.03]">
              <th class="px-4 py-3 text-left text-xs font-medium text-slate-400 uppercase tracking-wider">Customer</th>
              <th class="px-4 py-3 text-left text-xs font-medium text-slate-400 uppercase tracking-wider">Category</th>
              <th class="px-4 py-3 text-center text-xs font-medium text-slate-400 uppercase tracking-wider">Rule</th>
              <th class="px-4 py-3 text-right text-xs font-medium text-slate-400 uppercase tracking-wider">Actions</th>
            </tr>
          </thead>
          <tbody class="divide-y divide-white/[0.03]">
            ${this.rules.map(rule => html`
              <tr class="group hover:bg-white/[0.02] transition-colors">
                <td class="px-4 py-3">
                  <div class="text-white font-medium">${rule.customer_name || 'Unknown'}</div>
                  <div class="text-xs text-slate-500 font-mono">${rule.customer_id}</div>
                </td>
                <td class="px-4 py-3">
                  <div class="text-slate-300">${rule.category_name}</div>
                  <div class="text-xs text-slate-500 font-mono">${rule.category_path}</div>
                </td>
                <td class="px-4 py-3 text-center">
                  <span class="inline-flex items-center px-2 py-1 rounded border text-xs font-mono font-medium ${RULE_TYPE_COLORS[rule.rule_type] || ''}">
                    ${rule.rule_type} ${formatRuleValue(rule)}
                  </span>
                </td>
                <td class="px-4 py-3 text-right">
                  <div class="flex items-center justify-end gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                    <button
                      @click=${() => this._handleEdit(rule)}
                      class="p-1.5 rounded hover:bg-white/5 text-slate-400 hover:text-white transition-colors"
                    >
                      ${icon(Pencil, 14)}
                    </button>
                    <button
                      @click=${() => this._handleDelete(rule.id)}
                      class="p-1.5 rounded hover:bg-red-500/10 text-slate-400 hover:text-red-400 transition-colors"
                    >
                      ${icon(Trash2, 14)}
                    </button>
                  </div>
                </td>
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
    'gable-account-rules-table': GableAccountRulesTable;
  }
}
