import { LitElement, html, nothing } from 'lit';
import { customElement, property, state } from 'lit/decorators.js';
import { icon } from '../../lib/icons';
import { X } from 'lucide';
import { InventoryService } from '../../services/InventoryService';
import { LocationService } from '../../services/LocationService';
import type { Product, Inventory } from '../../types/product';
import type { Location } from '../../types/location';
import { ToastService } from '../../lib/toast-service';

@customElement('gable-inventory-transfer-modal')
export class GableInventoryTransferModal extends LitElement {
  createRenderRoot() { return this; }

  @property({ type: Boolean, attribute: 'is-open' }) isOpen = false;
  @property({ type: Object }) product: Product | null = null;

  @state() private _fromLoc = '';
  @state() private _toLoc = '';
  @state() private _quantity = '';
  @state() private _reason = '';
  @state() private _isSubmitting = false;
  @state() private _inventory: Inventory[] = [];
  @state() private _locations: Location[] = [];

  updated(changed: Map<string, unknown>) {
    if ((changed.has('isOpen') || changed.has('product')) && this.isOpen && this.product) {
      this._loadData();
      this._quantity = '';
      this._reason = '';
      this._toLoc = '';
    }
  }

  private async _loadData() {
    if (!this.product) return;

    try {
      const data = await InventoryService.getInventoryByProduct(this.product.id);
      this._inventory = data;
      if (data.length > 0) {
        this._fromLoc = data[0].location_id || data[0].location || '';
      }
    } catch {
      ToastService.show('Failed to load data', 'error');
    }

    try {
      const locs = await LocationService.listLocations();
      this._locations = locs;
    } catch {
      ToastService.show('Failed to load data', 'error');
    }
  }

  private async _handleSubmit(e: Event) {
    e.preventDefault();
    if (!this.product || !this._fromLoc || !this._toLoc || !this._quantity) return;

    this._isSubmitting = true;
    try {
      await InventoryService.transferStock({
        product_id: this.product.id,
        from_location_id: this._fromLoc,
        to_location_id: this._toLoc,
        quantity: Number(this._quantity),
        reason: this._reason || 'Manual Transfer',
      });
      this.dispatchEvent(new CustomEvent('success', { bubbles: true, composed: true }));
      this._close();
    } catch {
      ToastService.show('Transfer failed', 'error');
    } finally {
      this._isSubmitting = false;
    }
  }

  private _close() {
    this.dispatchEvent(new CustomEvent('close', { bubbles: true, composed: true }));
  }

  private get _maxQty(): number {
    const sourceItem = this._inventory.find(i => (i.location_id || i.location) === this._fromLoc);
    return sourceItem ? sourceItem.quantity : 0;
  }

  render() {
    if (!this.isOpen || !this.product) return nothing;

    return html`
      <div class="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4" role="dialog" aria-modal="true" aria-labelledby="transfer-stock-modal-title">
        <div class="bg-[#161821] w-full max-w-lg rounded-xl border border-white/10 shadow-2xl">
          <div class="flex justify-between items-center p-6 border-b border-white/10">
            <h2 id="transfer-stock-modal-title" class="text-xl font-bold">Transfer Stock</h2>
            <button @click=${this._close} class="text-gray-400 hover:text-white" aria-label="Close transfer dialog">
              ${icon(X, 24)}
            </button>
          </div>

          <form @submit=${this._handleSubmit} class="p-6 space-y-6">
            <div class="text-sm text-gray-400 mb-4">
              Moving <span class="text-white font-bold">${this.product.sku}</span> - ${this.product.description}
            </div>

            <div class="grid grid-cols-2 gap-4">
              <div>
                <label class="block text-sm text-gray-400 mb-2">From Location</label>
                <select
                  .value=${this._fromLoc}
                  @change=${(e: Event) => this._fromLoc = (e.target as HTMLSelectElement).value}
                  class="w-full bg-[#0A0B10] border border-white/20 rounded p-3 text-white"
                  required
                >
                  <option value="">Select Source...</option>
                  ${this._inventory.map(i => html`
                    <option value=${i.location_id || i.location}>
                      ${i.location_name || i.location} (${i.quantity})
                    </option>
                  `)}
                </select>
              </div>

              <div>
                <label class="block text-sm text-gray-400 mb-2">To Location</label>
                <select
                  .value=${this._toLoc}
                  @change=${(e: Event) => this._toLoc = (e.target as HTMLSelectElement).value}
                  class="w-full bg-[#0A0B10] border border-white/20 rounded p-3 text-white"
                  required
                >
                  <option value="">Select Dest...</option>
                  ${this._locations
                    .filter(l => l.id !== this._fromLoc)
                    .map(l => html`
                      <option value=${l.id}>${l.path || l.code}</option>
                    `)}
                </select>
              </div>
            </div>

            <div>
              <label class="block text-sm text-gray-400 mb-2">Quantity (Max: ${this._maxQty})</label>
              <input
                type="number"
                min="0.001"
                step="0.001"
                max=${this._maxQty}
                .value=${this._quantity}
                @input=${(e: InputEvent) => this._quantity = (e.target as HTMLInputElement).value}
                class="w-full bg-[#0A0B10] border border-white/20 rounded p-3 text-white font-mono"
                required
              />
            </div>

            <div>
              <label class="block text-sm text-gray-400 mb-2">Reason</label>
              <input
                type="text"
                .value=${this._reason}
                @input=${(e: InputEvent) => this._reason = (e.target as HTMLInputElement).value}
                placeholder="Why move?"
                class="w-full bg-[#0A0B10] border border-white/20 rounded p-3 text-white"
              />
            </div>

            <div class="flex gap-4 pt-4">
              <button
                type="button"
                @click=${this._close}
                class="flex-1 py-3 border border-white/10 rounded font-bold hover:bg-white/5"
              >
                CANCEL
              </button>
              <button
                type="submit"
                ?disabled=${this._isSubmitting || Number(this._quantity) > this._maxQty}
                class="flex-1 py-3 bg-[#00FFA3] text-black rounded font-bold hover:bg-[#00FFA3]/90 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                ${this._isSubmitting ? 'MOVING...' : 'CONFIRM TRANSFER'}
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
    'gable-inventory-transfer-modal': GableInventoryTransferModal;
  }
}
