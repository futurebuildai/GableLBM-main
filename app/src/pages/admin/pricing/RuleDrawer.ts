import { LitElement, html, nothing } from 'lit';
import { customElement, property, state } from 'lit/decorators.js';
import { icon } from '../../../lib/icons';
import { X, Save, Trash2, AlertTriangle, Clock, User } from 'lucide';
import { categoryPricingService } from '../../../services/CategoryPricingService';
import type { CategoryPricingRule, CategoryRuleType, CategoryPricingAudit } from '../../../types/category-pricing';
import type { Customer } from '../../../types/customer';
import { cn } from '../../../lib/utils';
import { ToastService } from '../../../lib/toast-service';
import '../../../components/customers/CustomerSelect.ts';

const RULE_TYPES: { value: CategoryRuleType; label: string; unit: string; description: string }[] = [
  { value: 'MARKDOWN', label: 'Discount from List', unit: '%', description: 'Sell = List x (1 - X%)' },
  { value: 'MARKUP', label: 'Markup from Cost', unit: '%', description: 'Sell = Cost x (1 + X%)' },
  { value: 'MARGIN', label: 'Target Margin', unit: '%', description: 'Sell = Cost / (1 - X%)' },
  { value: 'FIXED', label: 'Fixed Price', unit: '$', description: 'Sell = $X.XX' },
];

const ACTION_COLORS: Record<string, string> = {
  CREATE: 'bg-gable-green/20 text-gable-green',
  UPDATE: 'bg-blueprint-blue/20 text-blueprint-blue',
  DELETE: 'bg-safety-red/20 text-safety-red',
};

@customElement('gable-rule-drawer')
export class GableRuleDrawer extends LitElement {
  createRenderRoot() { return this; }

  @property({ type: Object }) rule: Partial<CategoryPricingRule> | null = null;
  @property({ type: String, attribute: 'category-name' }) categoryName = '';
  @property({ type: String, attribute: 'tier-name' }) tierName = '';
  @property({ type: String, attribute: 'target-type' }) targetType?: 'TIER' | 'ACCOUNT';

  @state() private _ruleType: CategoryRuleType = 'MARKDOWN';
  @state() private _ruleValue = '';
  @state() private _marginFloor = '';
  @state() private _showDelete = false;
  @state() private _auditEntries: CategoryPricingAudit[] = [];
  @state() private _selectedCustomerId?: string;

  private get _isEditing() { return !!this.rule?.id; }
  private get _isAccountMode() { return this.targetType === 'ACCOUNT'; }

  connectedCallback() {
    super.connectedCallback();
    this._syncFromRule();
  }

  updated(changed: Map<string, unknown>) {
    if (changed.has('rule')) {
      this._syncFromRule();
    }
  }

  private _syncFromRule() {
    const rule = this.rule;
    this._ruleType = rule?.rule_type || 'MARKDOWN';
    this._ruleValue = rule?.rule_value?.toString() || '';
    this._marginFloor = rule?.margin_floor_pct?.toString() || '';
    this._showDelete = false;
    this._selectedCustomerId = rule?.customer_id;

    if (rule?.id) {
      categoryPricingService.getRuleAudit(rule.id)
        .then(data => { this._auditEntries = data; })
        .catch((err) => { console.error('Failed to load audit trail:', err); ToastService.show('Failed to load audit trail', 'error'); });
    } else {
      this._auditEntries = [];
    }
  }

  private _handleSave() {
    const value = parseFloat(this._ruleValue);
    if (isNaN(value)) return;

    this.dispatchEvent(new CustomEvent('save-rule', {
      detail: {
        ...this.rule,
        rule_type: this._ruleType,
        rule_value: value,
        margin_floor_pct: this._marginFloor ? parseFloat(this._marginFloor) : undefined,
        ...(this._isAccountMode && this._selectedCustomerId ? { customer_id: this._selectedCustomerId, target_type: 'ACCOUNT' } : {}),
      },
      bubbles: true,
      composed: true,
    }));
  }

  private _handleClose() {
    this.dispatchEvent(new CustomEvent('close-drawer', {
      bubbles: true,
      composed: true,
    }));
  }

  private _handleDelete() {
    if (this.rule?.id) {
      this.dispatchEvent(new CustomEvent('delete-rule', {
        detail: this.rule.id,
        bubbles: true,
        composed: true,
      }));
    }
  }

  private _handleCustomerSelect(e: CustomEvent) {
    const customer: Customer = e.detail;
    this._selectedCustomerId = customer.id;
  }

  private _formatTimestamp(ts: string) {
    const d = new Date(ts);
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
  }

  private _renderPreview() {
    if (!this._ruleValue) return nothing;
    const val = parseFloat(this._ruleValue || '0');

    let previewContent;
    switch (this._ruleType) {
      case 'MARKDOWN':
        previewContent = html`<p>Base $100.00 <span class="text-slate-500">&rarr;</span> <span class="text-gable-green font-mono font-semibold">$${(100 * (1 - val / 100)).toFixed(2)}</span></p>`;
        break;
      case 'MARKUP':
        previewContent = html`<p>Cost $50.00 <span class="text-slate-500">&rarr;</span> <span class="text-gable-green font-mono font-semibold">$${(50 * (1 + val / 100)).toFixed(2)}</span></p>`;
        break;
      case 'MARGIN':
        previewContent = html`<p>Cost $50.00 <span class="text-slate-500">&rarr;</span> <span class="text-gable-green font-mono font-semibold">$${(50 / (1 - val / 100)).toFixed(2)}</span></p>`;
        break;
      case 'FIXED':
        previewContent = html`<p>Fixed at <span class="text-gable-green font-mono font-semibold">$${val.toFixed(2)}</span></p>`;
        break;
    }

    return html`
      <div class="bg-deep-space border border-white/5 rounded-lg p-4 space-y-2">
        <h4 class="text-xs font-medium text-slate-400 uppercase tracking-wider">Preview</h4>
        <div class="text-sm text-slate-300">${previewContent}</div>
      </div>
    `;
  }

  render() {
    const selectedType = RULE_TYPES.find(t => t.value === this._ruleType);

    return html`
      <div class="fixed right-0 top-0 bottom-0 w-[400px] bg-slate-steel border-l border-white/10 shadow-2xl z-50 flex flex-col">
        <!-- Header -->
        <div class="flex items-center justify-between px-6 py-4 border-b border-white/10">
          <div>
            <h3 class="text-white font-semibold">${this._isEditing ? 'Edit Rule' : 'New Rule'}</h3>
            <p class="text-sm text-slate-400 mt-0.5">
              ${this._isAccountMode
                ? html`<span class="text-gable-green">Account Rule</span>`
                : html`<span class="text-gable-green">${this.tierName}</span>`
              }
              ${' / '}
              <span class="text-blueprint-blue">${this.categoryName}</span>
            </p>
          </div>
          <button @click=${this._handleClose} class="text-slate-400 hover:text-white p-1 rounded hover:bg-white/5">
            ${icon(X, 20)}
          </button>
        </div>

        <!-- Body -->
        <div class="flex-1 overflow-y-auto px-6 py-6 space-y-6">
          <!-- Customer Select (Account mode only) -->
          ${this._isAccountMode ? html`
            <div class="space-y-2">
              <gable-customer-select
                .selectedCustomerId=${this._selectedCustomerId}
                @customer-select=${this._handleCustomerSelect}
              ></gable-customer-select>
            </div>
          ` : nothing}

          <!-- Rule Type -->
          <div class="space-y-3">
            <label class="text-sm font-medium text-slate-300">Adjustment Method</label>
            <div class="space-y-2">
              ${RULE_TYPES.map(type => html`
                <button
                  @click=${() => { this._ruleType = type.value; }}
                  class=${cn(
                    'w-full text-left px-4 py-3 rounded-lg border transition-colors',
                    this._ruleType === type.value
                      ? 'border-gable-green/50 bg-gable-green/5'
                      : 'border-white/5 bg-white/[0.02] hover:border-white/10'
                  )}
                >
                  <div class="flex items-center justify-between">
                    <span class=${cn('text-sm font-medium', this._ruleType === type.value ? 'text-gable-green' : 'text-white')}>
                      ${type.label}
                    </span>
                    <span class="text-xs text-slate-500 font-mono">${type.unit}</span>
                  </div>
                  <p class="text-xs text-slate-500 mt-1 font-mono">${type.description}</p>
                </button>
              `)}
            </div>
          </div>

          <!-- Value -->
          <div class="space-y-2">
            <label class="text-sm font-medium text-slate-300">
              Value (${selectedType?.unit})
            </label>
            <div class="relative">
              <span class="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500 text-sm">
                ${this._ruleType === 'FIXED' ? '$' : ''}
              </span>
              <input
                type="number"
                step="0.01"
                .value=${this._ruleValue}
                @input=${(e: Event) => { this._ruleValue = (e.target as HTMLInputElement).value; }}
                class=${cn(
                  'w-full bg-deep-space border border-white/10 rounded px-3 py-2.5 text-white font-mono text-lg',
                  'placeholder-slate-500 focus:outline-none focus:border-gable-green transition-colors',
                  this._ruleType === 'FIXED' ? 'pl-7' : ''
                )}
                placeholder=${this._ruleType === 'FIXED' ? '0.00' : '0.00'}
              />
              ${this._ruleType !== 'FIXED' ? html`
                <span class="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 text-sm">%</span>
              ` : nothing}
            </div>
          </div>

          <!-- Margin Floor -->
          <div class="space-y-2">
            <label class="text-sm font-medium text-slate-300">Margin Floor (optional)</label>
            <div class="relative">
              <input
                type="number"
                step="0.01"
                .value=${this._marginFloor}
                @input=${(e: Event) => { this._marginFloor = (e.target as HTMLInputElement).value; }}
                class="w-full bg-deep-space border border-white/10 rounded px-3 py-2 text-white font-mono placeholder-slate-500 focus:outline-none focus:border-gable-green transition-colors"
                placeholder="Min margin %"
              />
              <span class="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 text-sm">%</span>
            </div>
            <p class="text-xs text-slate-500">Prevents price from dropping below this margin target.</p>
          </div>

          <!-- Preview -->
          ${this._renderPreview()}

          <!-- Delete -->
          ${this._isEditing ? html`
            <div class="pt-4 border-t border-white/5">
              ${!this._showDelete ? html`
                <button
                  @click=${() => { this._showDelete = true; }}
                  class="flex items-center gap-2 text-sm text-slate-500 hover:text-red-400 transition-colors"
                >
                  ${icon(Trash2, 14)}
                  Delete this rule
                </button>
              ` : html`
                <div class="bg-red-500/5 border border-red-500/20 rounded-lg p-4 space-y-3">
                  <div class="flex items-center gap-2 text-red-400 text-sm">
                    ${icon(AlertTriangle, 16)}
                    This will remove the rule. The inherited ancestor rule (if any) will apply instead.
                  </div>
                  <div class="flex gap-2">
                    <button
                      @click=${() => { this._showDelete = false; }}
                      class="flex-1 px-4 py-2 border border-white/10 text-white rounded hover:bg-white/5 text-sm"
                    >
                      Cancel
                    </button>
                    <button
                      @click=${this._handleDelete}
                      class="flex-1 px-4 py-2 bg-red-500/20 text-red-400 hover:bg-red-500/30 border border-red-500/30 rounded text-sm"
                    >
                      Confirm Delete
                    </button>
                  </div>
                </div>
              `}
            </div>
          ` : nothing}

          <!-- Audit History -->
          ${this._isEditing && this._auditEntries.length > 0 ? html`
            <div class="pt-4 border-t border-white/5 space-y-3">
              <h4 class="text-xs font-medium text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
                ${icon(Clock, 12)}
                History
              </h4>
              <div class="space-y-2">
                ${this._auditEntries.map(entry => html`
                  <div class="flex items-start gap-2 text-xs">
                    <span class=${cn('px-1.5 py-0.5 rounded font-medium shrink-0', ACTION_COLORS[entry.action] || 'bg-white/10 text-slate-400')}>
                      ${entry.action}
                    </span>
                    <div class="flex-1 min-w-0">
                      <div class="flex items-center gap-1 text-slate-400">
                        ${icon(User, 10)}
                        <span class="truncate">${entry.performed_by}</span>
                      </div>
                      <div class="text-slate-500 mt-0.5">${this._formatTimestamp(entry.performed_at)}</div>
                      ${entry.action === 'UPDATE' && entry.old_values && entry.new_values ? html`
                        <div class="mt-1 text-slate-500 font-mono">
                          ${Object.keys(entry.new_values)
                            .filter(k => entry.old_values && entry.old_values[k] !== entry.new_values![k])
                            .map(k => html`
                              <div>${k}: ${String(entry.old_values![k])} &rarr; ${String(entry.new_values![k])}</div>
                            `)}
                        </div>
                      ` : nothing}
                    </div>
                  </div>
                `)}
              </div>
            </div>
          ` : nothing}
        </div>

        <!-- Footer -->
        <div class="px-6 py-4 border-t border-white/10 flex gap-3">
          <button
            @click=${this._handleClose}
            class="flex-1 px-4 py-2 border border-white/10 text-white rounded hover:bg-white/5 text-sm"
          >
            Cancel
          </button>
          <button
            @click=${this._handleSave}
            ?disabled=${!this._ruleValue || (this._isAccountMode && !this._selectedCustomerId)}
            class="flex-1 inline-flex items-center justify-center gap-2 px-4 py-2 bg-gable-green text-black font-semibold rounded hover:shadow-glow disabled:opacity-50 transition-all text-sm"
          >
            ${icon(Save, 16)}
            ${this._isEditing ? 'Update Rule' : 'Create Rule'}
          </button>
        </div>
      </div>
    `;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'gable-rule-drawer': GableRuleDrawer;
  }
}
