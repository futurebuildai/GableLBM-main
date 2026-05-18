import { LitElement, html, nothing } from 'lit';
import { customElement, state } from 'lit/decorators.js';
import { icon } from '../../lib/icons.ts';
import { ToastService } from '../../lib/toast-service.ts';
import { Search, Filter, ShoppingCart, RefreshCw, Package } from 'lucide';
import { PortalService } from '../../services/PortalService';
import type { CatalogProduct } from '../../types/portal';
import '../../components/portal/CartSidebar.ts';
import '../../components/portal/ProductCard.ts';

@customElement('gable-portal-catalog')
export class PortalCatalog extends LitElement {
    createRenderRoot() { return this; }

    @state() private products: CatalogProduct[] = [];
    @state() private loading = true;
    @state() private error = '';
    @state() private search = '';
    @state() private category = '';
    @state() private species = '';
    @state() private grade = '';
    @state() private cartOpen = false;
    @state() private cartRefresh = 0;
    @state() private addingId: string | null = null;

    private _debounceTimer: ReturnType<typeof setTimeout> | null = null;

    connectedCallback() {
        super.connectedCallback();
        this._fetchCatalog();
    }

    disconnectedCallback() {
        super.disconnectedCallback();
        if (this._debounceTimer) clearTimeout(this._debounceTimer);
    }

    private _scheduleFetch() {
        if (this._debounceTimer) clearTimeout(this._debounceTimer);
        this._debounceTimer = setTimeout(() => this._fetchCatalog(), 300);
    }

    private _fetchCatalog() {
        this.loading = true;
        this.error = '';
        PortalService.getCatalog({
            q: this.search || undefined,
            category: this.category || undefined,
            species: this.species || undefined,
            grade: this.grade || undefined,
        })
            .then(data => { this.products = data; })
            .catch(err => { this.error = err instanceof Error ? err.message : 'Failed to load catalog'; })
            .finally(() => { this.loading = false; });
    }

    private async _handleAddToCart(productId: string, quantity: number) {
        this.addingId = productId;
        try {
            await PortalService.addToCart(productId, quantity);
            this.cartRefresh = this.cartRefresh + 1;
            this.cartOpen = true;
        } catch (err) {
            console.error('Add to cart failed:', err);
            ToastService.show('Failed to add item to cart', 'error');
        } finally {
            this.addingId = null;
        }
    }

    private get _categories() { return [...new Set(this.products.map(p => p.category).filter(Boolean))].sort(); }
    private get _speciesList() { return [...new Set(this.products.map(p => p.species).filter(Boolean))].sort(); }
    private get _grades() { return [...new Set(this.products.map(p => p.grade).filter(Boolean))].sort(); }

    render() {
        return html`
            <div>
                <!-- Header -->
                <div class="flex items-center justify-between mb-8">
                    <div>
                        <h1 class="text-display-large text-white">Product Catalog</h1>
                        <p class="text-zinc-400 mt-2 text-lg">
                            Browse products with your custom pricing.
                        </p>
                    </div>
                    <button
                        @click=${() => { this.cartOpen = true; }}
                        class="relative p-3 rounded-xl bg-white/5 border border-white/10 text-white hover:bg-white/10 transition-colors"
                    >
                        ${icon(ShoppingCart, 24)}
                    </button>
                </div>

                <!-- Search & Filters -->
                <div class="grid grid-cols-1 md:grid-cols-5 gap-3 mb-6">
                    <div class="md:col-span-2 relative">
                        ${icon(Search, 16, 'absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500')}
                        <input
                            type="text"
                            placeholder="Search by SKU or description..."
                            .value=${this.search}
                            @input=${(e: InputEvent) => { this.search = (e.target as HTMLInputElement).value; this._scheduleFetch(); }}
                            class="w-full pl-10 pr-4 py-2.5 rounded-xl bg-white/5 border border-white/10 text-white placeholder-zinc-500 focus:outline-none focus:border-gable-green/50 transition-colors text-sm"
                        />
                    </div>
                    <select
                        .value=${this.category}
                        @change=${(e: Event) => { this.category = (e.target as HTMLSelectElement).value; this._scheduleFetch(); }}
                        class="px-3 py-2.5 rounded-xl bg-white/5 border border-white/10 text-white text-sm focus:outline-none focus:border-gable-green/50 transition-colors appearance-none"
                    >
                        <option value="">All Categories</option>
                        ${this._categories.map(c => html`<option value="${c}">${c}</option>`)}
                    </select>
                    <select
                        .value=${this.species}
                        @change=${(e: Event) => { this.species = (e.target as HTMLSelectElement).value; this._scheduleFetch(); }}
                        class="px-3 py-2.5 rounded-xl bg-white/5 border border-white/10 text-white text-sm focus:outline-none focus:border-gable-green/50 transition-colors appearance-none"
                    >
                        <option value="">All Species</option>
                        ${this._speciesList.map(s => html`<option value="${s}">${s}</option>`)}
                    </select>
                    <select
                        .value=${this.grade}
                        @change=${(e: Event) => { this.grade = (e.target as HTMLSelectElement).value; this._scheduleFetch(); }}
                        class="px-3 py-2.5 rounded-xl bg-white/5 border border-white/10 text-white text-sm focus:outline-none focus:border-gable-green/50 transition-colors appearance-none"
                    >
                        <option value="">All Grades</option>
                        ${this._grades.map(g => html`<option value="${g}">${g}</option>`)}
                    </select>
                </div>

                <!-- Filter summary -->
                ${(this.category || this.species || this.grade) ? html`
                    <div class="flex items-center gap-2 mb-4">
                        ${icon(Filter, 16, 'text-zinc-500')}
                        <div class="flex gap-2">
                            ${[this.category, this.species, this.grade].filter(Boolean).map(f => html`
                                <span class="px-2 py-0.5 rounded-full text-xs bg-gable-green/10 text-gable-green border border-gable-green/20">
                                    ${f}
                                </span>
                            `)}
                        </div>
                        <button
                            @click=${() => { this.category = ''; this.species = ''; this.grade = ''; this._scheduleFetch(); }}
                            class="text-xs text-zinc-500 hover:text-white transition-colors ml-2"
                        >
                            Clear filters
                        </button>
                    </div>
                ` : nothing}

                <!-- Product Grid -->
                ${this.loading ? html`
                    <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                        ${Array.from({ length: 8 }).map(() => html`<div class="aspect-[3/4] bg-white/5 rounded-2xl animate-pulse"></div>`)}
                    </div>
                ` : this.error ? html`
                    <div class="flex flex-col items-center justify-center py-16 text-center">
                        ${icon(Package, 48, 'text-zinc-600 mb-4')}
                        <p class="text-zinc-400 mb-4">${this.error}</p>
                        <button
                            @click=${() => this._fetchCatalog()}
                            class="flex items-center gap-2 px-4 py-2 rounded-lg bg-white/5 border border-white/10 text-white hover:bg-white/10 transition-colors"
                        >
                            ${icon(RefreshCw, 16)} Retry
                        </button>
                    </div>
                ` : this.products.length === 0 ? html`
                    <div class="flex flex-col items-center justify-center py-16 text-center">
                        ${icon(Package, 48, 'text-zinc-600 mb-4')}
                        <p class="text-zinc-400">No products found matching your criteria.</p>
                    </div>
                ` : html`
                    <p class="text-xs text-zinc-500 mb-4">${this.products.length} product${this.products.length !== 1 ? 's' : ''}</p>
                    <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                        ${this.products.map(product => html`
                            <gable-portal-product-card
                                .product=${product}
                                .adding=${this.addingId === product.id}
                                @add-to-cart=${(e: CustomEvent) => this._handleAddToCart(e.detail.productId, e.detail.quantity)}
                            ></gable-portal-product-card>
                        `)}
                    </div>
                `}

                <!-- Cart Sidebar -->
                <gable-cart-sidebar
                    ?is-open=${this.cartOpen}
                    .refreshKey=${this.cartRefresh}
                    @close=${() => { this.cartOpen = false; }}
                ></gable-cart-sidebar>
            </div>
        `;
    }
}
