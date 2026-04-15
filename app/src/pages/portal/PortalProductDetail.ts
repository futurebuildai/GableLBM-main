import { LitElement, html, nothing } from 'lit';
import { customElement, property, state } from 'lit/decorators.js';
import { icon } from '../../lib/icons.ts';
import { ToastService } from '../../lib/toast-service.ts';
import { ArrowLeft, Package, Plus, Minus, CheckCircle, XCircle, ShoppingCart } from 'lucide';
import { PortalService } from '../../services/PortalService';
import type { CatalogDetail } from '../../types/portal';
import '../../components/portal/CartSidebar.ts';

const formatCurrency = (val: number): string =>
    new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(val);

@customElement('gable-portal-product-detail')
export class PortalProductDetail extends LitElement {
    createRenderRoot() { return this; }

    @property({ attribute: 'route-id' }) routeId = '';

    @state() private product: CatalogDetail | null = null;
    @state() private loading = true;
    @state() private error = '';
    @state() private quantity = 1;
    @state() private adding = false;
    @state() private cartOpen = false;
    @state() private cartRefresh = 0;

    connectedCallback() {
        super.connectedCallback();
        this._fetchProduct();
    }

    private _fetchProduct() {
        if (!this.routeId) return;
        this.loading = true;
        PortalService.getCatalogProduct(this.routeId)
            .then(data => { this.product = data; })
            .catch(err => { this.error = err instanceof Error ? err.message : 'Failed to load product'; })
            .finally(() => { this.loading = false; });
    }

    private async _handleAddToCart() {
        if (!this.routeId || this.quantity <= 0) return;
        this.adding = true;
        try {
            await PortalService.addToCart(this.routeId, this.quantity);
            this.cartRefresh = this.cartRefresh + 1;
            this.cartOpen = true;
        } catch (err) {
            console.error('Add to cart failed:', err);
            ToastService.show('Failed to add to cart', 'error');
        } finally {
            this.adding = false;
        }
    }

    render() {
        if (this.loading) {
            return html`
                <div class="space-y-4">
                    <div class="h-8 w-32 bg-white/5 rounded animate-pulse"></div>
                    <div class="grid grid-cols-1 lg:grid-cols-2 gap-8">
                        <div class="aspect-square bg-white/5 rounded-2xl animate-pulse"></div>
                        <div class="space-y-4">
                            <div class="h-10 w-3/4 bg-white/5 rounded animate-pulse"></div>
                            <div class="h-6 w-1/3 bg-white/5 rounded animate-pulse"></div>
                            <div class="h-48 bg-white/5 rounded-xl animate-pulse"></div>
                        </div>
                    </div>
                </div>
            `;
        }

        if (this.error || !this.product) {
            return html`
                <div class="text-center py-16">
                    <p class="text-zinc-400">${this.error || 'Product not found'}</p>
                    <a href="/portal/catalog" class="text-gable-green hover:underline mt-4 inline-block">
                        Back to Catalog
                    </a>
                </div>
            `;
        }

        const product = this.product;

        const specs = [
            { label: 'SKU', value: product.sku },
            { label: 'Category', value: product.category },
            { label: 'Species', value: product.species },
            { label: 'Grade', value: product.grade },
            { label: 'UOM', value: product.uom },
            { label: 'Weight', value: product.weight_lbs ? `${product.weight_lbs} lbs` : 'N/A' },
            { label: 'UPC', value: product.upc || 'N/A' },
            { label: 'Vendor', value: product.vendor || 'N/A' },
        ].filter(s => s.value && s.value !== 'N/A' && s.value !== '');

        return html`
            <div>
                <!-- Back Link -->
                <a
                    href="/portal/catalog"
                    class="inline-flex items-center gap-1.5 text-sm text-zinc-400 hover:text-white transition-colors mb-6"
                >
                    ${icon(ArrowLeft, 16)} Back to Catalog
                </a>

                <div class="grid grid-cols-1 lg:grid-cols-2 gap-8">
                    <!-- Image -->
                    <div class="aspect-square bg-gradient-to-br from-zinc-800/50 to-zinc-900/50 rounded-2xl flex items-center justify-center border border-white/[0.06]">
                        ${product.image_url
                            ? html`<img src="${product.image_url}" alt="${product.name}" class="w-full h-full object-contain p-8" />`
                            : icon(Package, 96, 'text-zinc-600')
                        }
                    </div>

                    <!-- Details -->
                    <div class="space-y-6">
                        ${product.category ? html`
                            <span class="inline-block px-2.5 py-1 rounded-full text-xs uppercase tracking-wider font-semibold bg-gable-green/10 text-gable-green border border-gable-green/20">
                                ${product.category}
                            </span>
                        ` : nothing}

                        <h1 class="text-3xl font-bold text-white">${product.name}</h1>
                        <p class="text-sm text-zinc-500 font-mono">${product.sku}</p>

                        <!-- Pricing -->
                        <div class="rounded-2xl border border-white/[0.06] bg-[#161821]/80 backdrop-blur-xl">
                            <div class="p-5">
                                <div class="flex items-baseline gap-3 mb-3">
                                    <span class="text-3xl font-bold text-white font-mono">
                                        ${formatCurrency(product.customer_price)}
                                    </span>
                                    ${product.customer_price < product.base_price ? html`
                                        <span class="text-lg text-zinc-500 line-through font-mono">
                                            ${formatCurrency(product.base_price)}
                                        </span>
                                    ` : nothing}
                                    <span class="text-sm text-zinc-500">/${product.uom}</span>
                                </div>
                                ${product.price_source !== 'retail' ? html`
                                    <p class="text-xs text-gable-green">
                                        Your ${product.price_source} pricing applied
                                    </p>
                                ` : nothing}
                            </div>
                        </div>

                        <!-- Availability -->
                        <div class="flex items-center gap-2">
                            ${product.in_stock ? html`
                                ${icon(CheckCircle, 20, 'text-emerald-400')}
                                <span class="text-emerald-400 font-medium">
                                    ${Math.floor(product.available)} available
                                </span>
                            ` : html`
                                ${icon(XCircle, 20, 'text-red-400')}
                                <span class="text-red-400 font-medium">Out of Stock</span>
                            `}
                        </div>

                        <!-- Quantity + Add to Cart -->
                        <div class="flex items-center gap-3">
                            <div class="flex items-center border border-white/10 rounded-xl overflow-hidden">
                                <button
                                    @click=${() => { this.quantity = Math.max(1, this.quantity - 1); }}
                                    class="px-3 py-2.5 hover:bg-white/5 text-zinc-400 hover:text-white transition-colors"
                                >
                                    ${icon(Minus, 16)}
                                </button>
                                <input
                                    type="number"
                                    min="1"
                                    .value=${String(this.quantity)}
                                    @input=${(e: InputEvent) => { this.quantity = Math.max(1, Number((e.target as HTMLInputElement).value)); }}
                                    class="w-16 text-center py-2.5 bg-transparent border-x border-white/10 text-white font-mono text-sm focus:outline-none"
                                />
                                <button
                                    @click=${() => { this.quantity = this.quantity + 1; }}
                                    class="px-3 py-2.5 hover:bg-white/5 text-zinc-400 hover:text-white transition-colors"
                                >
                                    ${icon(Plus, 16)}
                                </button>
                            </div>
                            <button
                                @click=${() => this._handleAddToCart()}
                                ?disabled=${this.adding || !product.in_stock}
                                class="flex-1 flex items-center justify-center gap-2 py-3 rounded-xl text-sm font-semibold transition-all bg-gable-green text-black hover:bg-gable-green/90 disabled:opacity-40 disabled:cursor-not-allowed active:scale-[0.98]"
                            >
                                ${icon(ShoppingCart, 16)}
                                ${this.adding ? 'Adding...' : 'Add to Cart'}
                            </button>
                        </div>

                        <!-- Specs Table -->
                        ${specs.length > 0 ? html`
                            <div class="rounded-2xl border border-white/[0.06] bg-[#161821]/80 backdrop-blur-xl overflow-hidden">
                                <table class="w-full text-sm">
                                    <tbody>
                                        ${specs.map((spec, i) => html`
                                            <tr class="${i > 0 ? 'border-t border-white/5' : ''}">
                                                <td class="px-4 py-2.5 text-zinc-500 font-medium w-1/3">${spec.label}</td>
                                                <td class="px-4 py-2.5 text-white font-mono">${spec.value}</td>
                                            </tr>
                                        `)}
                                    </tbody>
                                </table>
                            </div>
                        ` : nothing}
                    </div>
                </div>

                <gable-cart-sidebar
                    ?is-open=${this.cartOpen}
                    .refreshKey=${this.cartRefresh}
                    @close=${() => { this.cartOpen = false; }}
                ></gable-cart-sidebar>
            </div>
        `;
    }
}
