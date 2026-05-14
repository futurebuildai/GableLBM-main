import { LitElement, html, nothing } from 'lit';
import { customElement, property, state } from 'lit/decorators.js';
import type { Product, UOM } from '../../types/product';
import type { Vendor } from '../../types/vendor';
import { fetchWithAuth } from '../../services/fetchClient';

const UOM_OPTIONS: UOM[] = [
  'PCS', 'EA', 'LF', 'SF', 'BF', 'MBF', 'SQ',
  'BOX', 'CTN', 'RL', 'GAL', 'LBS',
  'BAG', 'BUNDLE', 'PAIR', 'SET'
];

const NEW_VENDOR_SENTINEL = '__new__';

@customElement('gable-add-product-modal')
export class GableAddProductModal extends LitElement {
  createRenderRoot() { return this; }

  @property({ type: Boolean, attribute: 'is-open' }) isOpen = false;

  @state() private _sku = '';
  @state() private _description = '';
  @state() private _uom: UOM = 'PCS';
  @state() private _basePrice = 0;
  @state() private _vendorId = '';
  @state() private _newVendorName = '';
  @state() private _upc = '';
  @state() private _isSubmitting = false;
  @state() private _error = '';
  @state() private _vendors: Vendor[] = [];
  @state() private _vendorsLoaded = false;

  connectedCallback() {
    super.connectedCallback();
    void this._loadVendors();
  }

  updated(changed: Map<string, unknown>) {
    if (changed.has('isOpen') && this.isOpen && !this._vendorsLoaded) {
      void this._loadVendors();
    }
  }

  private async _loadVendors() {
    try {
      const res = await fetchWithAuth('/api/v1/vendors');
      if (res.ok) {
        const list = (await res.json()) as Vendor[] | null;
        this._vendors = Array.isArray(list) ? list : [];
        this._vendorsLoaded = true;
      }
    } catch {
      // Non-fatal — user can still type a new vendor name
    }
  }

  private async _resolveVendor(): Promise<{ vendor_id?: string; vendor?: string }> {
    if (!this._vendorId) {
      return {};
    }
    if (this._vendorId === NEW_VENDOR_SENTINEL) {
      const name = this._newVendorName.trim();
      if (!name) {
        throw new Error('Enter a name for the new vendor');
      }
      const res = await fetchWithAuth('/api/v1/vendors', {
        method: 'POST',
        body: JSON.stringify({ name }),
      });
      if (!res.ok) {
        // 500 from a unique-violation likely means the vendor already exists;
        // refresh the list and try to match by name.
        await this._loadVendors();
        const match = this._vendors.find((v) => v.name === name);
        if (match) {
          return { vendor_id: match.id, vendor: match.name };
        }
        throw new Error(`Failed to create vendor (HTTP ${res.status})`);
      }
      const created = (await res.json()) as Vendor;
      this._vendors = [...this._vendors, created];
      return { vendor_id: created.id, vendor: created.name };
    }
    const existing = this._vendors.find((v) => v.id === this._vendorId);
    return existing
      ? { vendor_id: existing.id, vendor: existing.name }
      : { vendor_id: this._vendorId };
  }

  private async _handleSubmit(e: Event) {
    e.preventDefault();
    this._isSubmitting = true;
    this._error = '';

    try {
      const vendorFields = await this._resolveVendor();
      const productData: Omit<Product, 'id' | 'created_at' | 'updated_at'> = {
        sku: this._sku,
        description: this._description,
        uom_primary: this._uom,
        base_price: this._basePrice,
        upc: this._upc,
        average_unit_cost: 0,
        target_margin: 0.30,
        commission_rate: 0.05,
        ...vendorFields,
      } as Omit<Product, 'id' | 'created_at' | 'updated_at'>;

      this.dispatchEvent(new CustomEvent('save', { detail: productData, bubbles: true, composed: true }));

      // Reset form
      this._sku = '';
      this._description = '';
      this._uom = 'PCS';
      this._basePrice = 0;
      this._vendorId = '';
      this._newVendorName = '';
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
                <select
                  .value=${this._vendorId}
                  @change=${(e: Event) => this._vendorId = (e.target as HTMLSelectElement).value}
                  class="w-full bg-zinc-950 border border-zinc-700 rounded px-3 py-2 text-zinc-100 focus:outline-none focus:ring-2 focus:ring-amber-600 focus:border-transparent"
                >
                  <option value="">— Select vendor —</option>
                  ${this._vendors.map((v) => html`<option value=${v.id}>${v.name}</option>`)}
                  <option value=${NEW_VENDOR_SENTINEL}>+ New vendor…</option>
                </select>
              </div>
            </div>

            ${this._vendorId === NEW_VENDOR_SENTINEL ? html`
              <div>
                <label class="block text-sm font-medium text-zinc-400 mb-1">New vendor name</label>
                <input
                  type="text"
                  required
                  .value=${this._newVendorName}
                  @input=${(e: InputEvent) => this._newVendorName = (e.target as HTMLInputElement).value}
                  class="w-full bg-zinc-950 border border-zinc-700 rounded px-3 py-2 text-zinc-100 focus:outline-none focus:ring-2 focus:ring-amber-600 focus:border-transparent"
                  placeholder="e.g. Weyerhaeuser"
                />
              </div>
            ` : nothing}

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
