import { LitElement, html, nothing } from 'lit';
import { customElement, property, state } from 'lit/decorators.js';
import { icon } from '../../lib/icons';
import { Plus } from 'lucide';
import type { Product } from '../../types/product';
import { PricingService } from '../../services/pricing.service';
import type { CalculatedPrice } from '../../types/pricing';
import { ToastService } from '../../lib/toast-service';

@customElement('gable-line-item-editor')
export class GableLineItemEditor extends LitElement {
  createRenderRoot() { return this; }

  @property({ type: Array }) products: Product[] = [];
  @property({ type: String, attribute: 'customer-id' }) customerId?: string;

  @state() private _searchTerm = '';
  @state() private _selectedProduct: Product | null = null;
  @state() private _quantity = 1;
  @state() private _price = 0;
  @state() private _isSearchOpen = false;
  @state() private _priceDetails: CalculatedPrice | null = null;

  private get _filteredProducts(): Product[] {
    return this.products.filter(p =>
      p.sku.toLowerCase().includes(this._searchTerm.toLowerCase()) ||
      p.description.toLowerCase().includes(this._searchTerm.toLowerCase())
    );
  }

  private async _handleSelectProduct(p: Product) {
    this._selectedProduct = p;
    this._searchTerm = p.sku;
    this._isSearchOpen = false;

    if (this.customerId) {
      try {
        const pricing = await PricingService.calculatePrice(this.customerId, p.id);
        this._price = pricing.final_price;
        this._priceDetails = pricing;
      } catch (err) {
        console.error('Failed to fetch price', err);
        ToastService.show('Resolved price failed, using fallback base price', 'error');
        this._price = p.base_price || 0;
        this._priceDetails = null;
      }
    } else {
      this._price = p.base_price || 0;
      this._priceDetails = null;
    }
  }

  private _handleAdd() {
    if (this._selectedProduct && this._quantity > 0) {
      this.dispatchEvent(new CustomEvent('add-line', {
        detail: { product: this._selectedProduct, quantity: this._quantity, unitPrice: this._price },
        bubbles: true,
        composed: true,
      }));
      this._selectedProduct = null;
      this._searchTerm = '';
      this._quantity = 1;
      this._price = 0;
      this._priceDetails = null;
    }
  }

  render() {
    return html`
      <div class="bg-[#161821] border border-white/10 p-4 rounded-lg mb-4">
        <h3 class="text-sm font-medium text-gray-400 mb-3 uppercase tracking-wider">Add Line Item</h3>
        <div class="grid grid-cols-12 gap-4 items-end">
          <!-- Product Search -->
          <div class="col-span-6 relative">
            <label class="block text-xs font-medium text-gray-500 mb-1">Product</label>
            <div class="relative">
              <input
                type="text"
                class="w-full bg-[#0A0B10] border border-white/10 rounded px-3 py-2 text-white focus:border-[#00FFA3] outline-none"
                placeholder="Search SKU or Desc..."
                .value=${this._searchTerm}
                @input=${(e: InputEvent) => {
                  this._searchTerm = (e.target as HTMLInputElement).value;
                  this._isSearchOpen = true;
                  this._selectedProduct = null;
                }}
                @focus=${() => this._isSearchOpen = true}
              />
              ${this._isSearchOpen && this._searchTerm ? html`
                <div class="absolute z-50 w-full mt-1 bg-[#0A0B10] border border-white/10 rounded shadow-xl max-h-48 overflow-auto">
                  ${this._filteredProducts.map(p => html`
                    <div
                      class="px-3 py-2 hover:bg-[#00FFA3]/10 cursor-pointer text-sm"
                      @click=${() => this._handleSelectProduct(p)}
                    >
                      <div class="flex justify-between">
                        <span class="text-white font-mono">${p.sku}</span>
                        <span class="text-gray-500 text-xs">${p.uom_primary}</span>
                      </div>
                      <div class="text-gray-400 text-xs truncate">${p.description}</div>
                    </div>
                  `)}
                </div>
              ` : nothing}
              ${this._isSearchOpen ? html`<div class="fixed inset-0 z-40" @click=${() => this._isSearchOpen = false}></div>` : nothing}
            </div>
          </div>

          <!-- Quantity -->
          <div class="col-span-2">
            <label class="block text-xs font-medium text-gray-500 mb-1">Qty</label>
            <input
              type="number"
              class="w-full bg-[#0A0B10] border border-white/10 rounded px-3 py-2 text-white text-right font-mono focus:border-[#00FFA3] outline-none"
              .value=${String(this._quantity)}
              @input=${(e: InputEvent) => this._quantity = Number((e.target as HTMLInputElement).value)}
              min="1"
            />
          </div>

          <!-- Price -->
          <div class="col-span-2">
            <label class="block text-xs font-medium text-gray-500 mb-1">Price</label>
            <input
              type="number"
              class="w-full bg-[#0A0B10] border border-white/10 rounded px-3 py-2 text-white text-right font-mono focus:border-[#00FFA3] outline-none"
              .value=${String(this._price)}
              @input=${(e: InputEvent) => this._price = Number((e.target as HTMLInputElement).value)}
              step="0.01"
            />
            ${this._priceDetails && this._priceDetails.source !== 'RETAIL' ? html`
              <div class="text-[10px] text-[#00FFA3] whitespace-nowrap mt-1">${this._priceDetails.details}</div>
            ` : nothing}
          </div>

          <!-- Add Button -->
          <div class="col-span-2">
            <button
              @click=${this._handleAdd}
              ?disabled=${!this._selectedProduct || this._quantity <= 0}
              class="w-full flex items-center justify-center bg-[#00FFA3] text-black font-medium py-2 rounded hover:bg-[#00FFA3]/80 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              ${icon(Plus, 16, 'mr-1')} Add
            </button>
          </div>
        </div>
      </div>
    `;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'gable-line-item-editor': GableLineItemEditor;
  }
}
