import { LitElement, html, nothing } from 'lit';
import { customElement, property, state } from 'lit/decorators.js';
import { icon } from '../../lib/icons.ts';
import { router } from '../../lib/router.ts';
import { ToastService } from '../../lib/toast-service.ts';
import { ArrowLeft, CheckCircle, Circle, Package, Loader2 } from 'lucide';
import { OrderService } from '../../services/OrderService';
import type { Order, OrderLine } from '../../types/order';

@customElement('gable-pick-detail')
export class PickDetail extends LitElement {
    createRenderRoot() { return this; }

    @property({ attribute: 'route-id' }) routeId = '';

    @state() private order: Order | null = null;
    @state() private loading = true;
    @state() private pickedItems: Set<string> = new Set();
    @state() private fulfilling = false;

    connectedCallback() {
        super.connectedCallback();
        if (this.routeId) {
            OrderService.getOrder(this.routeId)
                .then(data => { this.order = data; })
                .catch(() => { this.order = null; ToastService.show('Failed to load order details', 'error'); })
                .finally(() => { this.loading = false; });
        }
    }

    private _togglePicked(lineId: string) {
        const next = new Set(this.pickedItems);
        if (next.has(lineId)) {
            next.delete(lineId);
        } else {
            next.add(lineId);
        }
        this.pickedItems = next;
    }

    private async _handleFulfill() {
        if (!this.routeId || !this._allPicked) return;
        this.fulfilling = true;
        try {
            await OrderService.fulfillOrder(this.routeId);
            router.replace('/yard');
        } catch {
            ToastService.show('Failed to fulfill order', 'error');
            this.fulfilling = false;
        }
    }

    private get _lines(): OrderLine[] { return this.order?.lines || []; }
    private get _progress() { return this._lines.length > 0 ? (this.pickedItems.size / this._lines.length) * 100 : 0; }
    private get _allPicked() { return this._lines.length > 0 && this.pickedItems.size === this._lines.length; }

    render() {
        if (this.loading) {
            return html`
                <div class="flex justify-center items-center h-64">
                    <div class="animate-spin rounded-full h-10 w-10 border-b-2 border-amber-400"></div>
                </div>
            `;
        }

        if (!this.order) {
            return html`
                <div class="p-4 text-center text-zinc-400">
                    <p>Order not found.</p>
                    <button @click=${() => router.navigate('/yard')} class="text-amber-400 mt-4 underline">Back to Queue</button>
                </div>
            `;
        }

        return html`
            <div class="flex flex-col space-y-4 p-4 max-w-md mx-auto min-h-screen">
                <!-- Header -->
                <div class="flex items-center gap-3 mb-1">
                    <button
                        @click=${() => router.navigate('/yard')}
                        class="p-2 rounded-full bg-white/5 hover:bg-white/10 text-zinc-400 transition-colors"
                        aria-label="Go back"
                    >
                        ${icon(ArrowLeft, 20)}
                    </button>
                    <div class="flex-1">
                        <div class="font-bold text-lg text-white">${this.order.customer_name || 'Order'}</div>
                        <div class="text-xs text-zinc-500 font-mono">
                            #${this.order.id.slice(-6).toUpperCase()} · ${this.pickedItems.size}/${this._lines.length} picked
                        </div>
                    </div>
                </div>

                <!-- Progress Bar -->
                <div class="h-1.5 bg-white/10 rounded-full overflow-hidden">
                    <div
                        class="h-full transition-all duration-500 ease-out rounded-full ${this._allPicked ? 'bg-emerald-400' : 'bg-amber-400'}"
                        style="width: ${this._progress}%"
                    ></div>
                </div>

                <!-- Pick List -->
                <div class="space-y-2">
                    ${this._lines.map(line => {
                        const isPicked = this.pickedItems.has(line.id);
                        return html`
                            <div
                                class="rounded-2xl border border-white/[0.06] bg-[#161821]/80 backdrop-blur-xl active:scale-[0.98] transition-all cursor-pointer ${isPicked
                                    ? 'border-emerald-500/30 bg-emerald-500/5 opacity-70'
                                    : 'border-white/5 hover:border-amber-400/30'
                                }"
                                @click=${() => this._togglePicked(line.id)}
                            >
                                <div class="p-4 flex items-center gap-4">
                                    <!-- Check Circle -->
                                    <div class="shrink-0">
                                        ${isPicked
                                            ? icon(CheckCircle, 24, 'text-emerald-400')
                                            : icon(Circle, 24, 'text-zinc-600')
                                        }
                                    </div>

                                    <!-- Item Info -->
                                    <div class="flex-1 min-w-0">
                                        <div class="font-medium text-sm ${isPicked ? 'text-zinc-400 line-through' : 'text-white'}">
                                            ${line.product_name || 'Product'}
                                        </div>
                                        <div class="text-xs text-zinc-500 font-mono mt-0.5">
                                            ${line.product_sku || '-'}
                                        </div>
                                    </div>

                                    <!-- Quantity Badge -->
                                    <div class="shrink-0 text-right px-3 py-1.5 rounded-lg font-mono text-sm font-bold ${isPicked
                                        ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                                        : 'bg-amber-400/10 text-amber-400 border border-amber-400/20'
                                    }">
                                        x${line.quantity}
                                    </div>
                                </div>
                            </div>
                        `;
                    })}
                </div>

                <!-- Complete Button -->
                ${this._lines.length > 0 ? html`
                    <div class="sticky bottom-20 pt-4">
                        <button
                            @click=${() => this._handleFulfill()}
                            ?disabled=${!this._allPicked || this.fulfilling}
                            class="w-full py-4 rounded-xl font-bold text-lg font-mono uppercase tracking-wider transition-all ${this._allPicked
                                ? 'bg-emerald-500 text-black hover:bg-emerald-400 active:scale-[0.98] shadow-lg shadow-emerald-500/20'
                                : 'bg-white/5 text-zinc-600 border border-white/10 cursor-not-allowed'
                            }"
                        >
                            ${this.fulfilling ? html`
                                <span class="flex items-center justify-center gap-2">
                                    ${icon(Loader2, 20, 'animate-spin')} Completing...
                                </span>
                            ` : this._allPicked ? html`
                                <span class="flex items-center justify-center gap-2">
                                    ${icon(CheckCircle, 20)} Complete Pick
                                </span>
                            ` : html`
                                <span class="flex items-center justify-center gap-2">
                                    ${icon(Package, 20)} Pick All Items First
                                </span>
                            `}
                        </button>
                    </div>
                ` : nothing}
            </div>
        `;
    }
}
