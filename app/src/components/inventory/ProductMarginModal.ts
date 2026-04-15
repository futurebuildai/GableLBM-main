import { LitElement, html, nothing } from 'lit';
import { customElement, property, state } from 'lit/decorators.js';
import { icon } from '../../lib/icons';
import { X, Percent } from 'lucide';
import type { Product } from '../../types/product';
import { fetchWithAuth } from '../../services/fetchClient';

const API_URL = import.meta.env.VITE_API_URL || '';

@customElement('gable-product-margin-modal')
export class GableProductMarginModal extends LitElement {
  createRenderRoot() { return this; }

  @property({ type: Boolean, attribute: 'is-open' }) isOpen = false;
  @property({ type: Object }) product: Product | null = null;

  @state() private _targetMargin = 0;
  @state() private _commissionRate = 0;
  @state() private _isSaving = false;
  @state() private _error = '';

  updated(changed: Map<string, unknown>) {
    if (changed.has('product') && this.product) {
      this._targetMargin = this.product.target_margin || 0;
      this._commissionRate = this.product.commission_rate || 0;
    }
  }

  private get _projectedPrice(): number {
    if (!this.product) return 0;
    return this.product.average_unit_cost > 0 && this._targetMargin > 0
      ? this.product.average_unit_cost / (1 - (this._targetMargin / 100))
      : this.product.base_price;
  }

  private get _projectedCommission(): number {
    return this._projectedPrice * (this._commissionRate / 100);
  }

  private async _handleSave() {
    if (!this.product) return;
    this._isSaving = true;
    this._error = '';
    try {
      const res = await fetchWithAuth(`${API_URL}/api/v1/products/${this.product.id}/margins`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          target_margin: this._targetMargin,
          commission_rate: this._commissionRate,
        }),
      });

      if (!res.ok) {
        const text = await res.text();
        throw new Error(text || 'Failed to update margins');
      }

      this.dispatchEvent(new CustomEvent('success', { bubbles: true, composed: true }));
      this._close();
    } catch (err: unknown) {
      this._error = err instanceof Error ? err.message : 'An error occurred while saving.';
    } finally {
      this._isSaving = false;
    }
  }

  private _close() {
    this.dispatchEvent(new CustomEvent('close', { bubbles: true, composed: true }));
  }

  render() {
    if (!this.isOpen || !this.product) return nothing;

    return html`
      <div class="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm" role="dialog" aria-modal="true" aria-labelledby="pricing-controls-modal-title">
        <div class="bg-[#0A0B10] border border-white/10 rounded-xl shadow-2xl w-full max-w-md overflow-hidden relative">
          <div class="flex items-center justify-between p-6 border-b border-white/10">
            <div>
              <h2 id="pricing-controls-modal-title" class="text-xl font-bold text-white">Pricing Controls</h2>
              <p class="text-sm text-zinc-400 mt-1">${this.product.sku}</p>
            </div>
            <button @click=${this._close} class="p-2 text-zinc-400 hover:text-white hover:bg-white/10 rounded-full transition-colors" aria-label="Close pricing controls">
              ${icon(X, 20)}
            </button>
          </div>

          <div class="p-6 space-y-6 flex-1 overflow-y-auto">
            ${this._error ? html`
              <div class="p-3 bg-rose-500/10 border border-rose-500/20 rounded-lg text-rose-400 text-sm">
                ${this._error}
              </div>
            ` : nothing}

            <div class="bg-black/20 rounded-lg p-4 border border-white/5 space-y-2">
              <div class="flex justify-between text-sm">
                <span class="text-zinc-400">Current Cost (Weighted Avg)</span>
                <span class="text-white font-mono font-medium">$${(this.product.average_unit_cost || 0).toFixed(2)}</span>
              </div>
              <div class="flex justify-between text-sm">
                <span class="text-zinc-400">Current Base Price</span>
                <span class="text-white font-mono font-medium">$${(this.product.base_price || 0).toFixed(2)}</span>
              </div>
            </div>

            <div class="space-y-4">
              <div>
                <label class="block text-sm font-medium text-zinc-300 mb-1.5 flex justify-between">
                  Target Margin
                  <span class="text-zinc-500 text-xs font-mono">${this._targetMargin.toFixed(1)}%</span>
                </label>
                <div class="relative">
                  <span class="absolute left-3 top-1/2 -translate-y-1/2">${icon(Percent, 16, 'text-zinc-500')}</span>
                  <input
                    type="number"
                    min="0"
                    max="99"
                    step="0.1"
                    .value=${String(this._targetMargin)}
                    @input=${(e: InputEvent) => this._targetMargin = Number((e.target as HTMLInputElement).value)}
                    class="w-full bg-black/40 border border-white/10 rounded-lg pl-10 pr-4 py-2 text-white font-mono focus:border-gable-green/50 focus:outline-none transition-colors"
                  />
                </div>
                <p class="text-xs text-zinc-500 mt-1">Suggested Price: <span class="text-emerald-400 font-mono">$${this._projectedPrice.toFixed(2)}</span></p>
              </div>

              <div>
                <label class="block text-sm font-medium text-zinc-300 mb-1.5 flex justify-between">
                  Sales Commission Rate
                  <span class="text-zinc-500 text-xs font-mono">${this._commissionRate.toFixed(1)}%</span>
                </label>
                <div class="relative">
                  <span class="absolute left-3 top-1/2 -translate-y-1/2">${icon(Percent, 16, 'text-zinc-500')}</span>
                  <input
                    type="number"
                    min="0"
                    max="100"
                    step="0.1"
                    .value=${String(this._commissionRate)}
                    @input=${(e: InputEvent) => this._commissionRate = Number((e.target as HTMLInputElement).value)}
                    class="w-full bg-black/40 border border-white/10 rounded-lg pl-10 pr-4 py-2 text-white font-mono focus:border-gable-green/50 focus:outline-none transition-colors"
                  />
                </div>
                <p class="text-xs text-zinc-500 mt-1">Projected Commission: <span class="text-emerald-400 font-mono">$${this._projectedCommission.toFixed(2)}</span></p>
              </div>
            </div>
          </div>

          <div class="p-6 border-t border-white/10 bg-black/20 flex justify-end gap-3">
            <button @click=${this._close} class="hover:bg-white/5 text-zinc-400 hover:text-white inline-flex items-center justify-center rounded-lg text-sm font-medium transition-all duration-300 h-10 py-2 px-4">
              Cancel
            </button>
            <button @click=${this._handleSave} ?disabled=${this._isSaving} class="bg-gable-green text-deep-space hover:shadow-glow hover:-translate-y-0.5 font-bold tracking-wide inline-flex items-center justify-center rounded-lg text-sm transition-all duration-300 h-10 py-2 px-4 shadow-glow disabled:opacity-50">
              ${this._isSaving ? 'Saving...' : 'Save Controls'}
            </button>
          </div>
        </div>
      </div>
    `;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'gable-product-margin-modal': GableProductMarginModal;
  }
}
