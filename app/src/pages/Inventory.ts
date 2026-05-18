import { LitElement, html, nothing } from 'lit';
import { customElement, state } from 'lit/decorators.js';
import { icon } from '../lib/icons.ts';
import { Plus, Search, Package } from 'lucide';
import { ProductService } from '../services/product.service.ts';
import type { Product } from '../types/product.ts';
import { onBranchChanged } from '../lib/branch-listener.ts';

// Side-effect imports: register child custom elements
import '../components/inventory/InventoryTable.ts';
import '../components/inventory/AddProductModal.ts';
import '../components/inventory/StockAdjustmentModal.ts';
import '../components/inventory/InventoryTransferModal.ts';
import '../components/inventory/ProductMarginModal.ts';

@customElement('gable-inventory')
export class GableInventory extends LitElement {
    createRenderRoot() { return this; }

    @state() private products: Product[] = [];
    @state() private searchTerm = '';
    @state() private isLoading = true;
    @state() private isModalOpen = false;
    @state() private error = '';

    @state() private isStockModalOpen = false;
    @state() private isTransferModalOpen = false;
    @state() private isMarginModalOpen = false;
    @state() private selectedProduct: Product | null = null;
    private _unsubBranch: (() => void) | null = null;

    connectedCallback() {
        super.connectedCallback();
        this.loadProducts();
        this._unsubBranch = onBranchChanged(() => this.loadProducts());
    }

    disconnectedCallback() {
        super.disconnectedCallback();
        if (this._unsubBranch) {
            this._unsubBranch();
            this._unsubBranch = null;
        }
    }

    private async loadProducts() {
        try {
            this.isLoading = true;
            const data = await ProductService.getProducts();
            this.products = data;
            this.error = '';
        } catch (err) {
            this.error = 'Failed to load products';
            console.error(err);
        } finally {
            this.isLoading = false;
        }
    }

    private async handleSaveProduct(productData: Omit<Product, 'id' | 'created_at' | 'updated_at'>) {
        await ProductService.createProduct(productData);
        await this.loadProducts();
    }

    private handleAdjustStock(product: Product) {
        this.selectedProduct = product;
        this.isStockModalOpen = true;
    }

    private handleTransferStock(product: Product) {
        this.selectedProduct = product;
        this.isTransferModalOpen = true;
    }

    private handleEditMargins(product: Product) {
        this.selectedProduct = product;
        this.isMarginModalOpen = true;
    }

    private get filteredProducts(): Product[] {
        if (!this.searchTerm.trim()) return this.products;
        const term = this.searchTerm.toLowerCase();
        return this.products.filter(p =>
            p.sku.toLowerCase().includes(term) ||
            p.description.toLowerCase().includes(term) ||
            (p.vendor && p.vendor.toLowerCase().includes(term))
        );
    }

    private handleSearchInput(e: Event) {
        this.searchTerm = (e.target as HTMLInputElement).value;
    }

    render() {
        return html`
            <div>
                <div class="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-8">
                    <div>
                        <h1 class="text-display-large text-white flex items-center gap-3">
                            ${icon(Package, 40, 'w-10 h-10 text-gable-green')}
                            The Pile
                        </h1>
                        <p class="text-zinc-500 mt-1 max-w-2xl text-lg">
                            Master Inventory Management & SKU Control Center.
                        </p>
                    </div>
                    <button
                        @click=${() => { this.isModalOpen = true; }}
                        class="inline-flex items-center justify-center rounded-lg text-sm font-medium transition-colors bg-gable-green text-deep-space hover:bg-gable-green/90 px-4 py-2 shadow-glow"
                    >
                        ${icon(Plus, 16, 'w-4 h-4 mr-2')}
                        Add Product
                    </button>
                </div>

                <div class="bg-slate-steel/50 backdrop-blur border border-white/10 rounded-xl overflow-hidden mb-8">
                    <div class="p-4 bg-white/5 border-b border-white/5">
                        <div class="relative max-w-md w-full">
                            ${icon(Search, 16, 'absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500')}
                            <input
                                type="text"
                                placeholder="Search SKUs, products, or categories..."
                                .value=${this.searchTerm}
                                @input=${this.handleSearchInput}
                                class="w-full bg-deep-space/50 border border-white/10 rounded-lg pl-10 pr-4 py-2.5 text-sm text-white focus:outline-none focus:ring-1 focus:ring-gable-green/50 placeholder:text-zinc-600 transition-all font-mono"
                            />
                        </div>
                    </div>

                    ${this.error ? html`
                        <div class="p-4 bg-rose-500/10 border-b border-rose-500/20 text-rose-400">
                            ${this.error}
                        </div>
                    ` : nothing}

                    <div class="p-0">
                        ${this.isLoading ? html`
                            <div class="p-12 text-center text-zinc-500 animate-pulse">
                                Loading core inventory...
                            </div>
                        ` : html`
                            <gable-inventory-table
                                .products=${this.filteredProducts}
                                @adjust-stock=${(e: CustomEvent) => this.handleAdjustStock(e.detail)}
                                @transfer-stock=${(e: CustomEvent) => this.handleTransferStock(e.detail)}
                                @edit-margins=${(e: CustomEvent) => this.handleEditMargins(e.detail)}
                            ></gable-inventory-table>
                        `}
                    </div>
                </div>

                <gable-add-product-modal
                    ?is-open=${this.isModalOpen}
                    @close=${() => { this.isModalOpen = false; }}
                    @save=${(e: CustomEvent) => this.handleSaveProduct(e.detail)}
                ></gable-add-product-modal>

                <gable-stock-adjustment-modal
                    ?is-open=${this.isStockModalOpen}
                    @close=${() => { this.isStockModalOpen = false; }}
                    .product=${this.selectedProduct}
                    @success=${() => { this.loadProducts(); }}
                ></gable-stock-adjustment-modal>

                <gable-inventory-transfer-modal
                    ?is-open=${this.isTransferModalOpen}
                    @close=${() => { this.isTransferModalOpen = false; }}
                    .product=${this.selectedProduct}
                    @success=${() => { this.loadProducts(); }}
                ></gable-inventory-transfer-modal>

                <gable-product-margin-modal
                    ?is-open=${this.isMarginModalOpen}
                    @close=${() => { this.isMarginModalOpen = false; }}
                    .product=${this.selectedProduct}
                    @success=${() => { this.loadProducts(); }}
                ></gable-product-margin-modal>
            </div>
        `;
    }
}
