import { LitElement, html, nothing } from 'lit';
import { customElement, property, state } from 'lit/decorators.js';
import { icon } from '../../lib/icons';
import { Search } from 'lucide';
import type { Product } from '../../types/product';
import { ProductService } from '../../services/product.service';
import { ToastService } from '../../lib/toast-service';

@customElement('gable-product-select')
export class GableProductSelect extends LitElement {
  createRenderRoot() { return this; }

  @property({ type: String, attribute: 'selected-product-id' }) selectedProductId?: string;

  @state() private _products: Product[] = [];
  @state() private _loading = true;
  @state() private _searchTerm = '';
  @state() private _isOpen = false;

  connectedCallback() {
    super.connectedCallback();
    this._fetchProducts();
  }

  private async _fetchProducts() {
    try {
      const data = await ProductService.getProducts();
      this._products = data;
    } catch (error) {
      console.error('Failed to load products', error);
      ToastService.show('Failed to load products', 'error');
    } finally {
      this._loading = false;
    }
  }

  private get _filteredProducts(): Product[] {
    return this._products.filter(p =>
      p.sku.toLowerCase().includes(this._searchTerm.toLowerCase()) ||
      p.description.toLowerCase().includes(this._searchTerm.toLowerCase())
    );
  }

  private get _selectedProduct(): Product | undefined {
    return this._products.find(p => p.id === this.selectedProductId);
  }

  private _selectProduct(product: Product) {
    this.dispatchEvent(new CustomEvent('product-select', { detail: product, bubbles: true, composed: true }));
    this._searchTerm = '';
    this._isOpen = false;
  }

  render() {
    return html`
      <div class="relative w-full">
        <label class="block text-sm font-medium text-gray-400 mb-1">Product</label>

        <div class="relative">
          <div
            @click=${() => this._isOpen = !this._isOpen}
            class="flex items-center w-full px-4 py-2 bg-[#161821] border border-white/10 rounded-md cursor-pointer hover:border-[#00FFA3] transition-colors"
          >
            ${icon(Search, 16, 'text-gray-400 mr-2')}
            <input
              type="text"
              class="bg-transparent border-none outline-none text-white w-full placeholder-gray-600 cursor-pointer"
              placeholder="Search by SKU or description..."
              .value=${this._isOpen ? this._searchTerm : (this._selectedProduct ? `${this._selectedProduct.sku} -- ${this._selectedProduct.description}` : '')}
              @input=${(e: InputEvent) => {
                this._searchTerm = (e.target as HTMLInputElement).value;
                this._isOpen = true;
              }}
              @focus=${() => this._isOpen = true}
            />
          </div>

          ${this._isOpen ? html`
            <div class="absolute z-50 w-full mt-1 bg-[#161821] border border-white/10 rounded-md shadow-xl max-h-60 overflow-auto">
              ${this._loading ? html`
                <div class="p-4 text-center text-gray-500 text-sm">Loading...</div>
              ` : nothing}

              ${!this._loading && this._filteredProducts.length === 0 ? html`
                <div class="p-4 text-center text-gray-500 text-sm">No products found</div>
              ` : nothing}

              ${!this._loading ? this._filteredProducts.slice(0, 50).map(product => html`
                <div
                  class="px-4 py-2 hover:bg-[#00FFA3]/10 cursor-pointer flex justify-between items-center group"
                  @click=${() => this._selectProduct(product)}
                >
                  <div>
                    <div class="text-white font-mono text-sm group-hover:text-[#00FFA3] transition-colors">${product.sku}</div>
                    <div class="text-xs text-gray-500 truncate max-w-[300px]">${product.description}</div>
                  </div>
                  <div class="text-xs text-right text-gray-500 font-mono">$${product.base_price.toFixed(2)}</div>
                </div>
              `) : nothing}
            </div>
          ` : nothing}
        </div>

        ${this._isOpen ? html`<div class="fixed inset-0 z-40" @click=${() => this._isOpen = false}></div>` : nothing}
      </div>
    `;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'gable-product-select': GableProductSelect;
  }
}
