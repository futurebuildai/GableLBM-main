import { LitElement, html, nothing } from 'lit';
import { customElement, state } from 'lit/decorators.js';
import { icon } from '../../lib/icons.ts';
import { ArrowLeft, MapPin, Truck, Store, CreditCard, Building2, CheckCircle } from 'lucide';
import { PortalService } from '../../services/PortalService';
import type { Cart, CheckoutRequest } from '../../types/portal';

const formatCurrency = (val: number): string =>
    new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(val);

@customElement('gable-portal-checkout')
export class PortalCheckout extends LitElement {
    createRenderRoot() { return this; }

    @state() private cart: Cart | null = null;
    @state() private loading = true;
    @state() private submitting = false;
    @state() private error = '';
    @state() private success: string | null = null;

    // Form state
    @state() private deliveryMethod: 'DELIVERY' | 'PICKUP' = 'DELIVERY';
    @state() private deliveryAddress = '';
    @state() private paymentMethod: 'ACCOUNT' | 'CARD' = 'ACCOUNT';
    @state() private notes = '';

    connectedCallback() {
        super.connectedCallback();
        this._fetchCart();
    }

    private _fetchCart() {
        this.loading = true;
        PortalService.getCart()
            .then(data => { this.cart = data; })
            .catch(err => { this.error = err instanceof Error ? err.message : 'Failed to load cart'; })
            .finally(() => { this.loading = false; });
    }

    private async _handleSubmit(e: Event) {
        e.preventDefault();
        if (!this.cart || this.cart.items.length === 0) return;

        if (this.deliveryMethod === 'DELIVERY' && !this.deliveryAddress.trim()) {
            this.error = 'Delivery address is required';
            return;
        }

        this.submitting = true;
        this.error = '';

        const req: CheckoutRequest = {
            delivery_method: this.deliveryMethod,
            delivery_address: this.deliveryAddress,
            payment_method: this.paymentMethod,
            notes: this.notes,
        };

        try {
            const resp = await PortalService.checkout(req);
            this.success = resp.order_id;
        } catch (err) {
            this.error = err instanceof Error ? err.message : 'Checkout failed';
        } finally {
            this.submitting = false;
        }
    }

    render() {
        if (this.loading) {
            return html`
                <div class="space-y-4 max-w-3xl mx-auto">
                    <div class="h-10 w-48 bg-white/5 rounded-lg animate-pulse"></div>
                    <div class="h-64 bg-white/5 rounded-2xl animate-pulse"></div>
                    <div class="h-48 bg-white/5 rounded-2xl animate-pulse"></div>
                </div>
            `;
        }

        if (this.success) {
            return html`
                <div class="flex flex-col items-center justify-center py-20 text-center max-w-lg mx-auto">
                    <div class="w-20 h-20 rounded-full bg-emerald-500/10 flex items-center justify-center mb-6">
                        ${icon(CheckCircle, 40, 'text-emerald-400')}
                    </div>
                    <h2 class="text-2xl font-bold text-white mb-2">Order Placed!</h2>
                    <p class="text-zinc-400 mb-2">Your order has been submitted successfully.</p>
                    <p class="text-sm font-mono text-zinc-500 mb-8">
                        Order ID: ${this.success.substring(0, 8).toUpperCase()}
                    </p>
                    <div class="flex gap-3">
                        <a
                            href="/portal/orders"
                            class="px-6 py-3 rounded-xl bg-gable-green text-black font-semibold hover:bg-gable-green/90 transition-colors"
                        >
                            View Orders
                        </a>
                        <a
                            href="/portal/catalog"
                            class="px-6 py-3 rounded-xl bg-white/5 border border-white/10 text-white font-semibold hover:bg-white/10 transition-colors"
                        >
                            Continue Shopping
                        </a>
                    </div>
                </div>
            `;
        }

        if (!this.cart || this.cart.items.length === 0) {
            return html`
                <div class="text-center py-16">
                    <p class="text-zinc-400">Your cart is empty.</p>
                    <a href="/portal/catalog" class="text-gable-green hover:underline mt-2 inline-block">
                        Browse Catalog
                    </a>
                </div>
            `;
        }

        return html`
            <div class="max-w-3xl mx-auto">
                <!-- Header -->
                <a
                    href="/portal/cart"
                    class="inline-flex items-center gap-1.5 text-sm text-zinc-400 hover:text-white transition-colors mb-6"
                >
                    ${icon(ArrowLeft, 16)} Back to Cart
                </a>

                <h1 class="text-display-large text-white mb-8">Checkout</h1>

                <form @submit=${(e: Event) => this._handleSubmit(e)} class="space-y-6">
                    <!-- Order Summary -->
                    <div class="rounded-2xl border border-white/[0.06] bg-[#161821]/80 backdrop-blur-xl">
                        <div class="p-5">
                            <h3 class="text-sm font-semibold text-white uppercase tracking-wider mb-3">Order Summary</h3>
                            <div class="space-y-2 text-sm">
                                ${this.cart.items.map(item => html`
                                    <div class="flex justify-between text-zinc-400">
                                        <span class="truncate mr-4">
                                            ${item.product_name} x${item.quantity}
                                        </span>
                                        <span class="font-mono text-white shrink-0">${formatCurrency(item.line_total)}</span>
                                    </div>
                                `)}
                            </div>
                            <div class="border-t border-white/10 mt-3 pt-3 flex justify-between">
                                <span class="font-medium text-white">Total</span>
                                <span class="text-xl font-bold text-white font-mono">${formatCurrency(this.cart.subtotal)}</span>
                            </div>
                        </div>
                    </div>

                    <!-- Delivery Method -->
                    <div class="rounded-2xl border border-white/[0.06] bg-[#161821]/80 backdrop-blur-xl">
                        <div class="p-5">
                            <h3 class="text-sm font-semibold text-white uppercase tracking-wider mb-4">Delivery Method</h3>
                            <div class="grid grid-cols-2 gap-3">
                                <button
                                    type="button"
                                    @click=${() => { this.deliveryMethod = 'DELIVERY'; }}
                                    class="flex flex-col items-center gap-2 p-4 rounded-xl border transition-all ${this.deliveryMethod === 'DELIVERY'
                                        ? 'border-gable-green bg-gable-green/5 text-gable-green'
                                        : 'border-white/10 text-zinc-400 hover:border-white/20'
                                    }"
                                >
                                    ${icon(Truck, 24)} <span class="text-sm font-semibold">Delivery</span>
                                </button>
                                <button
                                    type="button"
                                    @click=${() => { this.deliveryMethod = 'PICKUP'; }}
                                    class="flex flex-col items-center gap-2 p-4 rounded-xl border transition-all ${this.deliveryMethod === 'PICKUP'
                                        ? 'border-gable-green bg-gable-green/5 text-gable-green'
                                        : 'border-white/10 text-zinc-400 hover:border-white/20'
                                    }"
                                >
                                    ${icon(Store, 24)} <span class="text-sm font-semibold">Will Call</span>
                                </button>
                            </div>

                            ${this.deliveryMethod === 'DELIVERY' ? html`
                                <div class="mt-4">
                                    <label class="flex items-center gap-1.5 text-sm text-zinc-400 mb-2">
                                        ${icon(MapPin, 16)} Delivery Address
                                    </label>
                                    <textarea
                                        .value=${this.deliveryAddress}
                                        @input=${(e: InputEvent) => { this.deliveryAddress = (e.target as HTMLTextAreaElement).value; }}
                                        placeholder="Enter delivery address..."
                                        rows="3"
                                        class="w-full px-4 py-3 rounded-xl bg-white/5 border border-white/10 text-white placeholder-zinc-500 focus:outline-none focus:border-gable-green/50 transition-colors text-sm resize-none"
                                    ></textarea>
                                </div>
                            ` : nothing}
                        </div>
                    </div>

                    <!-- Payment Method -->
                    <div class="rounded-2xl border border-white/[0.06] bg-[#161821]/80 backdrop-blur-xl">
                        <div class="p-5">
                            <h3 class="text-sm font-semibold text-white uppercase tracking-wider mb-4">Payment Method</h3>
                            <div class="grid grid-cols-2 gap-3">
                                <button
                                    type="button"
                                    @click=${() => { this.paymentMethod = 'ACCOUNT'; }}
                                    class="flex flex-col items-center gap-2 p-4 rounded-xl border transition-all ${this.paymentMethod === 'ACCOUNT'
                                        ? 'border-gable-green bg-gable-green/5 text-gable-green'
                                        : 'border-white/10 text-zinc-400 hover:border-white/20'
                                    }"
                                >
                                    ${icon(Building2, 24)} <span class="text-sm font-semibold">Charge to Account</span>
                                </button>
                                <button
                                    type="button"
                                    @click=${() => { this.paymentMethod = 'CARD'; }}
                                    class="flex flex-col items-center gap-2 p-4 rounded-xl border transition-all ${this.paymentMethod === 'CARD'
                                        ? 'border-gable-green bg-gable-green/5 text-gable-green'
                                        : 'border-white/10 text-zinc-400 hover:border-white/20'
                                    }"
                                >
                                    ${icon(CreditCard, 24)} <span class="text-sm font-semibold">Pay by Card</span>
                                </button>
                            </div>
                        </div>
                    </div>

                    <!-- Order Notes -->
                    <div class="rounded-2xl border border-white/[0.06] bg-[#161821]/80 backdrop-blur-xl">
                        <div class="p-5">
                            <h3 class="text-sm font-semibold text-white uppercase tracking-wider mb-3">Order Notes</h3>
                            <textarea
                                .value=${this.notes}
                                @input=${(e: InputEvent) => { this.notes = (e.target as HTMLTextAreaElement).value; }}
                                placeholder="Special instructions, PO number, job reference..."
                                rows="3"
                                class="w-full px-4 py-3 rounded-xl bg-white/5 border border-white/10 text-white placeholder-zinc-500 focus:outline-none focus:border-gable-green/50 transition-colors text-sm resize-none"
                            ></textarea>
                        </div>
                    </div>

                    <!-- Error -->
                    ${this.error ? html`
                        <div class="px-4 py-3 rounded-xl bg-red-500/10 border border-red-500/20 text-red-400 text-sm">
                            ${this.error}
                        </div>
                    ` : nothing}

                    <!-- Submit -->
                    <button
                        type="submit"
                        ?disabled=${this.submitting}
                        class="w-full py-4 rounded-xl text-lg font-bold bg-gable-green text-black hover:bg-gable-green/90 transition-all disabled:opacity-50 disabled:cursor-not-allowed active:scale-[0.99]"
                    >
                        ${this.submitting ? 'Placing Order...' : `Place Order - ${formatCurrency(this.cart.subtotal)}`}
                    </button>
                </form>
            </div>
        `;
    }
}
