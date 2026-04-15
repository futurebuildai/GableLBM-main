import { LitElement, html, nothing } from 'lit';
import { customElement, property, state } from 'lit/decorators.js';
import type { Product } from '../../types/product';
import type { Location } from '../../types/location';
import { LocationService } from '../../services/LocationService';
import { InventoryService } from '../../services/InventoryService';
import { ToastService } from '../../lib/toast-service';

@customElement('gable-stock-adjustment-modal')
export class GableStockAdjustmentModal extends LitElement {
  createRenderRoot() { return this; }

  @property({ type: Boolean, attribute: 'is-open' }) isOpen = false;
  @property({ type: Object }) product: Product | null = null;

  @state() private _locations: Location[] = [];
  @state() private _selectedLocationId = '';
  @state() private _quantity = 0;
  @state() private _reason = 'Receipt';
  @state() private _isSubmitting = false;

  updated(changed: Map<string, unknown>) {
    if (changed.has('isOpen') && this.isOpen) {
      this._loadLocations();
      this._quantity = 0;
      this._reason = 'Receipt';
    }
  }

  private async _loadLocations() {
    try {
      const data = await LocationService.listLocations();
      this._locations = data;
      if (data.length > 0) this._selectedLocationId = data[0].id;
    } catch (error) {
      console.error('Failed to load locations', error);
      ToastService.show('Failed to load locations', 'error');
    }
  }

  private async _handleSubmit(e: Event) {
    e.preventDefault();
    if (!this.product || !this._selectedLocationId) return;

    this._isSubmitting = true;
    try {
      await InventoryService.adjustStock({
        product_id: this.product.id,
        location_id: this._selectedLocationId,
        quantity: Number(this._quantity),
        reason: this._reason,
        is_delta: true,
      });
      this.dispatchEvent(new CustomEvent('success', { bubbles: true, composed: true }));
      this._close();
    } catch (error) {
      ToastService.show('Failed to adjust stock', 'error');
      console.error(error);
    } finally {
      this._isSubmitting = false;
    }
  }

  private _close() {
    this.dispatchEvent(new CustomEvent('close', { bubbles: true, composed: true }));
  }

  render() {
    if (!this.isOpen || !this.product) return nothing;

    return html`
      <div class="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm" role="dialog" aria-modal="true" aria-labelledby="stock-adjustment-modal-title">
        <div class="bg-[#161821] w-full max-w-md rounded-lg shadow-2xl border border-white/10 p-6">
          <h2 id="stock-adjustment-modal-title" class="text-xl font-bold text-white mb-1">Adjust Stock</h2>
          <p class="text-sm text-gray-400 mb-6">${this.product.sku} - ${this.product.description}</p>

          <form @submit=${this._handleSubmit} class="space-y-4">
            <div>
              <label class="block text-xs uppercase tracking-wider text-gray-500 mb-1">Location</label>
              <select
                class="w-full bg-black/20 border border-white/10 rounded px-3 py-2 text-white focus:border-[#00FFA3] outline-none"
                .value=${this._selectedLocationId}
                @change=${(e: Event) => this._selectedLocationId = (e.target as HTMLSelectElement).value}
              >
                ${this._locations.map(loc => html`
                  <option value=${loc.id}>
                    ${loc.path || loc.code} (${loc.type})
                  </option>
                `)}
              </select>
            </div>

            <div>
              <label class="block text-xs uppercase tracking-wider text-gray-500 mb-1">Quantity (${this.product.uom_primary})</label>
              <input
                type="number"
                step="any"
                class="w-full bg-black/20 border border-white/10 rounded px-3 py-2 text-white focus:border-[#00FFA3] outline-none font-mono"
                .value=${String(this._quantity)}
                @input=${(e: InputEvent) => this._quantity = Number((e.target as HTMLInputElement).value)}
              />
              <p class="text-xs text-gray-500 mt-1">Positive to add, negative to remove.</p>
            </div>

            <div>
              <label class="block text-xs uppercase tracking-wider text-gray-500 mb-1">Reason Code</label>
              <select
                class="w-full bg-black/20 border border-white/10 rounded px-3 py-2 text-white focus:border-[#00FFA3] outline-none"
                .value=${this._reason}
                @change=${(e: Event) => this._reason = (e.target as HTMLSelectElement).value}
              >
                <option>Receipt</option>
                <option>Cycle Count</option>
                <option>Damaged</option>
                <option>Return</option>
                <option>Found</option>
              </select>
            </div>

            <div class="flex justify-end gap-3 mt-8">
              <button
                type="button"
                @click=${this._close}
                class="px-4 py-2 text-gray-400 hover:text-white transition-colors"
              >
                Cancel
              </button>
              <button
                type="submit"
                ?disabled=${this._isSubmitting}
                class="bg-[#00FFA3] text-black font-semibold px-4 py-2 rounded hover:shadow-[0_0_10px_rgba(0,255,163,0.3)] transition-all disabled:opacity-50"
              >
                ${this._isSubmitting ? 'Saving...' : 'Confirm Adjustment'}
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
    'gable-stock-adjustment-modal': GableStockAdjustmentModal;
  }
}
