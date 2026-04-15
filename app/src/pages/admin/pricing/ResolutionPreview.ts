import { LitElement, html, nothing } from 'lit';
import { customElement, state } from 'lit/decorators.js';
import { icon } from '../../../lib/icons';
import { Search, ArrowRight, CheckCircle, XCircle } from 'lucide';
import { categoryPricingService } from '../../../services/CategoryPricingService';
import type { ResolvedCategoryPrice } from '../../../types/category-pricing';
import type { Product } from '../../../types/product';
import type { Customer } from '../../../types/customer';
import { cn } from '../../../lib/utils';
import '../../../components/products/ProductSelect.ts';
import '../../../components/customers/CustomerSelect.ts';

const MATCH_LABELS: Record<string, { label: string; color: string }> = {
  account_exact: { label: 'Account + Exact Category', color: 'text-gable-green' },
  account_ancestor: { label: 'Account + Ancestor Category', color: 'text-gable-green' },
  tier_exact: { label: 'Tier + Exact Category', color: 'text-blueprint-blue' },
  tier_ancestor: { label: 'Tier + Ancestor Category', color: 'text-blueprint-blue' },
  none: { label: 'No Match (Base Price)', color: 'text-slate-400' },
};

@customElement('gable-resolution-preview')
export class GableResolutionPreview extends LitElement {
  createRenderRoot() { return this; }

  @state() private _selectedProduct: Product | null = null;
  @state() private _selectedCustomer: Customer | null = null;
  @state() private _result: ResolvedCategoryPrice | null = null;
  @state() private _loading = false;
  @state() private _error: string | null = null;

  private _handleProductSelect(e: CustomEvent) {
    this._selectedProduct = e.detail;
  }

  private _handleCustomerSelect(e: CustomEvent) {
    this._selectedCustomer = e.detail;
  }

  private async _handleResolve() {
    if (!this._selectedProduct) return;
    this._loading = true;
    this._error = null;
    try {
      const tier = this._selectedCustomer?.price_level?.name;
      const res = await categoryPricingService.resolvePreview(
        this._selectedProduct.id,
        this._selectedCustomer?.id,
        tier || undefined
      );
      this._result = res;
    } catch (err) {
      this._error = err instanceof Error ? err.message : 'Resolution failed';
    } finally {
      this._loading = false;
    }
  }

  render() {
    const matchInfo = this._result ? MATCH_LABELS[this._result.match_type] || MATCH_LABELS.none : null;

    return html`
      <div class="bg-slate-steel border border-white/5 rounded-lg p-6 space-y-4">
        <h3 class="text-white font-semibold flex items-center gap-2">
          ${icon(Search, 18, 'text-blueprint-blue')}
          Resolution Preview
        </h3>
        <p class="text-xs text-slate-500">Test which pricing rule resolves for a given product and customer/tier.</p>

        <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
          <gable-product-select
            .selectedProductId=${this._selectedProduct?.id}
            @product-select=${this._handleProductSelect}
          ></gable-product-select>
          <gable-customer-select
            .selectedCustomerId=${this._selectedCustomer?.id}
            @customer-select=${this._handleCustomerSelect}
          ></gable-customer-select>
        </div>

        ${this._selectedCustomer ? html`
          <div class="text-xs text-slate-500">
            Auto-detected tier:${' '}
            <span class="text-gable-green font-mono font-medium">
              ${this._selectedCustomer.price_level?.name || 'RETAIL'}
            </span>
          </div>
        ` : nothing}

        <button
          @click=${this._handleResolve}
          ?disabled=${!this._selectedProduct || this._loading}
          class="inline-flex items-center gap-2 px-4 py-2 bg-gable-green text-black font-semibold rounded hover:shadow-glow disabled:opacity-50 transition-all"
        >
          ${icon(Search, 14)}
          ${this._loading ? 'Resolving...' : 'Resolve'}
        </button>

        ${this._error ? html`
          <div class="bg-red-500/10 border border-red-500/20 rounded-lg p-3 text-sm text-red-400">${this._error}</div>
        ` : nothing}

        ${this._result ? html`
          <div class="bg-deep-space border border-white/5 rounded-lg p-4 space-y-3">
            <div class="flex items-center gap-3">
              ${this._result.rule
                ? icon(CheckCircle, 20, 'text-gable-green')
                : icon(XCircle, 20, 'text-slate-500')
              }
              <span class=${cn('text-sm font-medium', matchInfo?.color)}>
                ${matchInfo?.label}
              </span>
            </div>

            ${this._result.category_path ? html`
              <div class="text-xs text-slate-500">
                Category path: <span class="text-slate-300 font-mono">${this._result.category_path}</span>
              </div>
            ` : nothing}

            ${this._result.rule ? html`
              <div class="flex items-center gap-2 text-sm">
                <span class="text-slate-400">Rule:</span>
                <span class="text-white font-mono font-medium">
                  ${this._result.rule.rule_type} ${this._result.rule.rule_value}${this._result.rule.rule_type !== 'FIXED' ? '%' : ''}
                </span>
                ${icon(ArrowRight, 14, 'text-slate-500')}
                <span class="text-slate-400">on</span>
                <span class="text-blueprint-blue font-mono">${this._result.rule.category_name}</span>
              </div>
            ` : nothing}
          </div>
        ` : nothing}
      </div>
    `;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'gable-resolution-preview': GableResolutionPreview;
  }
}
