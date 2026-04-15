import { LitElement, html, nothing } from 'lit';
import { customElement, property, state } from 'lit/decorators.js';
import type { Product, UOM } from '../../types/product';

const UOM_OPTIONS: UOM[] = [
  'PCS', 'EA', 'LF', 'SF', 'BF', 'MBF', 'SQ',
  'BOX', 'CTN', 'RL', 'GAL', 'LBS',
  'BAG', 'BUNDLE', 'PAIR', 'SET'
];

@customElement('gable-add-product-modal')
export class GableAddProductModal extends LitElement {
  createRenderRoot() { return this; }

  @property({ type: Boolean, attribute: 'is-open' }) isOpen = false;

  @state() private _sku = '';
  @state() private _description = '';
  @state() private _uom: UOM = 'PCS';
  @state() private _basePrice = 0;
  @state() private _vendor = '';
  @state() private _upc = '';
  @state() private _isSubmitting = false;
  @state() private _error = '';

  private async _handleSubmit(e: Event) {
    e.preventDefault();
    this._isSubmitting = true;
    this._error = '';

    try {
      const productData: Omit<Product, 'id' | 'created_at' | 'updated_at'> = {
        sku: this._sku,
        description: this._description,
        uom_primary: this._uom,
        base_price: this._basePrice,
        vendor: this._vendor,
        upc: this._upc,
        average_unit_cost: 0,
        target_margin: 0.30,
        commission_rate: 0.05,
      } as Omit<Product, 'id' | 'created_at' | 'updated_at'>;

      this.dispatchEvent(new CustomEvent('save', { detail: productData, bubbles: true, composed: true }));

      // Reset form
      this._sku = '';
      this._description = '';
      this._uom = 'PCS';
      this._basePrice = 0;
      this._vendor = '';
      this._upc = '';
    } catch (err) {
      this._error = err instanceof Error ? err.message : 'Failed to save product';
    } finally {
      this._isSubmitting = false;
    }
  }

  private _close() {
    this.dispatchEvent(new CustomEvent('close', { bubbles: true, composed: true }));
  }

  render() {
    if (!this.isOpen) return nothing;

    return html`
      <div class="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm" role="dialog" aria-modal="true" aria-labelledby="add-product-modal-title">
        <div class="w-full max-w-md bg-zinc-900 border border-zinc-700 rounded-lg shadow-2xl p-6">
          <div class="mb-6">
            <h2 id="add-product-modal-title" class="text-xl font-bold text-zinc-100">Add Product to Pile</h2>
            <p class="text-zinc-400 text-sm mt-1">Create a new SKU in the master catalog.</p>
          </div>

          ${this._error ? html`
            <div class="mb-4 p-3 bg-red-900/30 border border-red-800 text-red-200 rounded text-sm">
              ${this._error}
            </div>
          ` : nothing}

          <form @submit=${this._handleSubmit} class="space-y-4">
            <div>
              <label class="block text-sm font-medium text-zinc-400 mb-1">SKU</label>
              <input
                type="text"
                required
                .value=${this._sku}
                @input=${(e: InputEvent) => this._sku = (e.target as HTMLInputElement).value}
                class="w-full bg-zinc-950 border border-zinc-700 rounded px-3 py-2 text-zinc-100 focus:outline-none focus:ring-2 focus:ring-amber-600 focus:border-transparent font-mono"
                placeholder="e.g. 2x4x8-SPF"
              />
            </div>

            <div>
              <label class="block text-sm font-medium text-zinc-400 mb-1">Description</label>
              <input
                type="text"
                required
                .value=${this._description}
                @input=${(e: InputEvent) => this._description = (e.target as HTMLInputElement).value}
                class="w-full bg-zinc-950 border border-zinc-700 rounded px-3 py-2 text-zinc-100 focus:outline-none focus:ring-2 focus:ring-amber-600 focus:border-transparent"
                placeholder="e.g. 2x4x8 SPF Premium Stud"
              />
            </div>

            <div>
              <label class="block text-sm font-medium text-zinc-400 mb-1">Primary UOM</label>
              <select
                .value=${this._uom}
                @change=${(e: Event) => this._uom = (e.target as HTMLSelectElement).value as UOM}
                class="w-full bg-zinc-950 border border-zinc-700 rounded px-3 py-2 text-zinc-100 focus:outline-none focus:ring-2 focus:ring-amber-600 focus:border-transparent"
              >
                ${UOM_OPTIONS.map((opt) => html`<option value=${opt}>${opt}</option>`)}
              </select>
            </div>

            <div class="grid grid-cols-2 gap-4">
              <div>
                <label class="block text-sm font-medium text-zinc-400 mb-1">UPC Code</label>
                <input
                  type="text"
                  .value=${this._upc}
                  @input=${(e: InputEvent) => this._upc = (e.target as HTMLInputElement).value}
                  class="w-full bg-zinc-950 border border-zinc-700 rounded px-3 py-2 text-zinc-100 focus:outline-none focus:ring-2 focus:ring-amber-600 focus:border-transparent font-mono"
                  placeholder="123456789012"
                />
              </div>
              <div>
                <label class="block text-sm font-medium text-zinc-400 mb-1">Vendor / Manufacturer</label>
                <input
                  type="text"
                  .value=${this._vendor}
                  @input=${(e: InputEvent) => this._vendor = (e.target as HTMLInputElement).value}
                  class="w-full bg-zinc-950 border border-zinc-700 rounded px-3 py-2 text-zinc-100 focus:outline-none focus:ring-2 focus:ring-amber-600 focus:border-transparent"
                  placeholder="e.g. Weyerhaeuser"
                />
              </div>
            </div>

            <div>
              <label class="block text-sm font-medium text-zinc-400 mb-1">Base Price</label>
              <input
                type="number"
                min="0"
                step="0.01"
                .value=${String(this._basePrice)}
                @input=${(e: InputEvent) => this._basePrice = parseFloat((e.target as HTMLInputElement).value)}
                class="w-full bg-zinc-950 border border-zinc-700 rounded px-3 py-2 text-zinc-100 focus:outline-none focus:ring-2 focus:ring-amber-600 focus:border-transparent font-mono"
              />
            </div>

            <div class="mt-8 flex justify-end gap-3">
              <button
                type="button"
                @click=${this._close}
                class="px-4 py-2 text-sm text-zinc-300 hover:text-white transition-colors"
              >
                Cancel
              </button>
              <button
                type="submit"
                ?disabled=${this._isSubmitting}
                class="px-4 py-2 bg-amber-600 hover:bg-amber-500 text-white rounded text-sm font-medium transition-colors disabled:opacity-50"
              >
                ${this._isSubmitting ? 'Saving...' : 'Create Product'}
              </button>
            </div>
          </form>
        </div>
      </div>
    `;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'gable-add-product-modal': GableAddProductModal;
  }
}
