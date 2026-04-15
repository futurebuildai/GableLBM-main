import { LitElement, html } from 'lit';
import { customElement, state } from 'lit/decorators.js';
import { icon } from '../../lib/icons.ts';
import { ToastService } from '../../lib/toast-service.ts';
import { ShoppingCart, Trash2, Minus, Plus, ArrowLeft, ArrowRight, RefreshCw } from 'lucide';
import { PortalService } from '../../services/PortalService';
import type { Cart } from '../../types/portal';

const formatCurrency = (val: number): string =>
    new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(val);

@customElement('gable-portal-cart')
export class PortalCart extends LitElement {
    createRenderRoot() { return this; }

    @state() private cart: Cart | null = null;
    @state() private loading = true;
    @state() private error = '';

    connectedCallback() {
        super.connectedCallback();
        this._fetchCart();
    }

    private _fetchCart() {
        this.loading = true;
        this.error = '';
        PortalService.getCart()
            .then(data => { this.cart = data; })
            .catch(err => { this.error = err instanceof Error ? err.message : 'Failed to load cart'; })
            .finally(() => { this.loading = false; });
    }

    private async _handleUpdateQty(itemId: string, qty: number) {
        try {
            if (qty <= 0) {
                const updated = await PortalService.removeCartItem(itemId);
                this.cart = updated;
            } else {
                const updated = await PortalService.updateCartItem(itemId, qty);
                this.cart = updated;
            }
        } catch (err) {
            console.error('Update cart failed:', err);
            ToastService.show('Failed to update cart quantity', 'error');
        }
    }

    private async _handleRemove(itemId: string) {
        try {
            const updated = await PortalService.removeCartItem(itemId);
            this.cart = updated;
        } catch (err) {
            console.error('Remove item failed:', err);
            ToastService.show('Failed to remove item from cart', 'error');
        }
    }

    render() {
        if (this.loading) {
            return html`
                <div class="space-y-4">
                    <div class="h-10 w-48 bg-white/5 rounded-lg animate-pulse"></div>
                    ${[1, 2, 3].map(() => html`<div class="h-24 bg-white/5 rounded-2xl animate-pulse"></div>`)}
                </div>
            `;
        }

        if (this.error) {
            return html`
                <div class="flex flex-col items-center justify-center py-16 text-center">
                    <p class="text-zinc-400 mb-4">${this.error}</p>
                    <button @click=${() => this._fetchCart()} class="flex items-center gap-2 px-4 py-2 rounded-lg bg-white/5 border border-white/10 text-white hover:bg-white/10 transition-colors">
                        ${icon(RefreshCw, 16)} Retry
                    </button>
                </div>
            `;
        }

        return html`
            <div>
                <!-- Header -->
                <div class="flex items-center justify-between mb-8">
                    <div>
                        <h1 class="text-display-large text-white">Shopping Cart</h1>
                        <p class="text-zinc-400 mt-2">
                            ${this.cart?.item_count || 0} item${(this.cart?.item_count || 0) !== 1 ? 's' : ''} in your cart
                        </p>
                    </div>
                    <a
                        href="/portal/catalog"
                        class="flex items-center gap-1.5 text-sm text-zinc-400 hover:text-white transition-colors"
                    >
                        ${icon(ArrowLeft, 16)} Continue Shopping
                    </a>
                </div>

                ${!this.cart || this.cart.items.length === 0 ? html`
                    <div class="flex flex-col items-center justify-center py-16 text-center">
                        ${icon(ShoppingCart, 64, 'text-zinc-600 mb-4')}
                        <h3 class="text-xl font-semibold text-white mb-2">Your cart is empty</h3>
                        <p class="text-zinc-500 mb-6">Add products from the catalog to get started.</p>
                        <a
                            href="/portal/catalog"
                            class="px-6 py-3 rounded-xl bg-gable-green text-black font-semibold hover:bg-gable-green/90 transition-colors"
                        >
                            Browse Catalog
                        </a>
                    </div>
                ` : html`
                    <div class="grid grid-cols-1 lg:grid-cols-3 gap-6">
                        <!-- Cart Items -->
                        <div class="lg:col-span-2 space-y-3">
                            ${this.cart.items.map(item => html`
                                <div class="rounded-2xl border border-white/[0.06] bg-[#161821]/80 backdrop-blur-xl">
                                    <div class="p-4">
                                        <div class="flex items-start gap-4">
                                            <a
                                                href="/portal/catalog/${item.product_id}"
                                                class="flex-1 min-w-0"
                                            >
                                                <h3 class="text-sm font-semibold text-white hover:text-gable-green transition-colors">
                                                    ${item.product_name}
                                                </h3>
                                                <p class="text-xs text-zinc-500 font-mono mt-0.5">${item.product_sku}</p>
                                                <p class="text-sm text-zinc-400 mt-1 font-mono">
                                                    ${formatCurrency(item.unit_price)} each
                                                </p>
                                            </a>

                                            <!-- Quantity Controls -->
                                            <div class="flex items-center border border-white/10 rounded-lg overflow-hidden">
                                                <button
                                                    @click=${() => this._handleUpdateQty(item.id, item.quantity - 1)}
                                                    class="px-2.5 py-1.5 hover:bg-white/5 text-zinc-400 hover:text-white transition-colors"
                                                >
                                                    ${icon(Minus, 14)}
                                                </button>
                                                <span class="px-3 py-1.5 text-sm text-white font-mono border-x border-white/10 min-w-[40px] text-center">
                                                    ${item.quantity}
                                                </span>
                                                <button
                                                    @click=${() => this._handleUpdateQty(item.id, item.quantity + 1)}
                                                    class="px-2.5 py-1.5 hover:bg-white/5 text-zinc-400 hover:text-white transition-colors"
                                                >
                                                    ${icon(Plus, 14)}
                                                </button>
                                            </div>

                                            <!-- Line Total + Remove -->
                                            <div class="text-right">
                                                <p class="text-sm font-bold text-white font-mono">
                                                    ${formatCurrency(item.line_total)}
                                                </p>
                                                <button
                                                    @click=${() => this._handleRemove(item.id)}
                                                    class="mt-1 flex items-center gap-1 text-xs text-zinc-500 hover:text-red-400 transition-colors"
                                                >
                                                    ${icon(Trash2, 12)} Remove
                                                </button>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            `)}
                        </div>

                        <!-- Order Summary -->
                        <div>
                            <div class="rounded-2xl border border-white/[0.06] bg-[#161821]/80 backdrop-blur-xl sticky top-6">
                                <div class="p-5 space-y-4">
                                    <h3 class="text-lg font-semibold text-white">Order Summary</h3>

                                    <div class="space-y-2 text-sm">
                                        <div class="flex justify-between text-zinc-400">
                                            <span>Subtotal (${this.cart.item_count} items)</span>
                                            <span class="font-mono text-white">${formatCurrency(this.cart.subtotal)}</span>
                                        </div>
                                        <div class="flex justify-between text-zinc-500">
                                            <span>Tax</span>
                                            <span class="font-mono">Calculated at checkout</span>
                                        </div>
                                        <div class="flex justify-between text-zinc-500">
                                            <span>Delivery</span>
                                            <span class="font-mono">TBD</span>
                                        </div>
                                    </div>

                                    <div class="border-t border-white/10 pt-4 flex justify-between items-center">
                                        <span class="text-sm font-medium text-zinc-400">Estimated Total</span>
                                        <span class="text-2xl font-bold text-white font-mono">
                                            ${formatCurrency(this.cart.subtotal)}
                                        </span>
                                    </div>

                                    <a
                                        href="/portal/checkout"
                                        class="flex items-center justify-center gap-2 w-full py-3 rounded-xl text-sm font-semibold bg-gable-green text-black hover:bg-gable-green/90 transition-colors"
                                    >
                                        Proceed to Checkout ${icon(ArrowRight, 16)}
                                    </a>
                                </div>
                            </div>
                        </div>
                    </div>
                `}
            </div>
        `;
    }
}
