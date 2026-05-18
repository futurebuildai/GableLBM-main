import { LitElement, html, nothing } from 'lit';
import { customElement, state } from 'lit/decorators.js';
import { icon } from '../../lib/icons.ts';
import { ToastService } from '../../lib/toast-service.ts';
import { ShoppingCart, RefreshCw, AlertTriangle, ChevronDown, ChevronUp } from 'lucide';
import { PortalService } from '../../services/PortalService';
import type { PortalOrder } from '../../types/portal';

const formatCurrency = (val: number): string =>
    new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(val);

const STATUS_COLORS: Record<string, string> = {
    DRAFT: 'bg-zinc-500/10 text-zinc-400 border-zinc-500/20',
    CONFIRMED: 'bg-blue-500/10 text-blue-400 border-blue-500/20',
    FULFILLED: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20',
    CANCELLED: 'bg-red-500/10 text-red-400 border-red-500/20',
    ON_HOLD: 'bg-amber-500/10 text-amber-400 border-amber-500/20',
};

@customElement('gable-portal-orders')
export class PortalOrders extends LitElement {
    createRenderRoot() { return this; }

    @state() private orders: PortalOrder[] = [];
    @state() private loading = true;
    @state() private error = '';
    @state() private expandedId: string | null = null;
    @state() private reorderingId: string | null = null;

    connectedCallback() {
        super.connectedCallback();
        this._fetchOrders();
    }

    private _fetchOrders() {
        this.loading = true;
        this.error = '';
        PortalService.getOrders()
            .then(data => { this.orders = data; })
            .catch(err => { this.error = err instanceof Error ? err.message : 'Failed to load orders'; })
            .finally(() => { this.loading = false; });
    }

    private async _handleReorder(orderId: string, e: Event) {
        e.stopPropagation();
        this.reorderingId = orderId;
        try {
            const resp = await PortalService.reorder(orderId);
            ToastService.show(
                `Reorder created! New draft: ${resp.order_id.substring(0, 8).toUpperCase()}`,
                'success',
            );
            this._fetchOrders();
        } catch (err) {
            ToastService.show(
                err instanceof Error ? err.message : 'Failed to create reorder',
                'error',
            );
        } finally {
            this.reorderingId = null;
        }
    }

    private _toggleExpand(orderId: string) {
        this.expandedId = this.expandedId === orderId ? null : orderId;
    }

    render() {
        if (this.loading) {
            return html`
                <div class="space-y-4">
                    ${[1, 2, 3, 4].map(() => html`<div class="h-20 bg-white/5 rounded-2xl animate-pulse"></div>`)}
                </div>
            `;
        }

        if (this.error) {
            return html`
                <div class="flex flex-col items-center justify-center h-64 text-center">
                    ${icon(AlertTriangle, 48, 'text-amber-500 mb-4')}
                    <p class="text-zinc-400 mb-4">${this.error}</p>
                    <button
                        @click=${() => this._fetchOrders()}
                        class="flex items-center gap-2 px-4 py-2 rounded-lg bg-white/5 border border-white/10 text-white hover:bg-white/10 transition-colors"
                    >
                        ${icon(RefreshCw, 16)} Retry
                    </button>
                </div>
            `;
        }

        return html`
            <div>
                <div class="mb-6 flex items-center justify-between">
                    <div>
                        <h1 class="text-2xl font-bold text-white">Order History</h1>
                        <p class="text-zinc-400 text-sm mt-1">${this.orders.length} order${this.orders.length !== 1 ? 's' : ''} found</p>
                    </div>
                </div>

                ${this.orders.length === 0
                    ? html`
                        <div class="rounded-2xl border border-white/[0.06] bg-[#161821]/80 backdrop-blur-xl">
                            <div class="p-12 text-center">
                                ${icon(ShoppingCart, 48, 'text-zinc-600 mx-auto mb-4')}
                                <p class="text-zinc-400">No orders yet.</p>
                            </div>
                        </div>
                    `
                    : html`
                        <div class="space-y-3">
                            ${this.orders.map(order => html`
                                <div class="rounded-2xl border border-white/[0.06] bg-[#161821]/80 backdrop-blur-xl overflow-hidden">
                                    <!-- Order Row -->
                                    <div
                                        class="flex items-center justify-between p-4 cursor-pointer hover:bg-white/5 transition-colors"
                                        @click=${() => this._toggleExpand(order.id)}
                                    >
                                        <div class="flex items-center gap-4">
                                            <div
                                                class="w-10 h-10 rounded-lg flex items-center justify-center"
                                                style="background-color: rgba(56,189,248,0.1)"
                                            >
                                                ${icon(ShoppingCart, 18, 'text-blue-400')}
                                            </div>
                                            <div>
                                                <div class="font-mono text-sm font-medium text-white">
                                                    ${order.id.substring(0, 8).toUpperCase()}
                                                </div>
                                                <div class="text-xs text-zinc-500 mt-0.5">
                                                    ${new Date(order.created_at).toLocaleDateString()} · ${order.lines.length} item${order.lines.length !== 1 ? 's' : ''}
                                                </div>
                                            </div>
                                        </div>
                                        <div class="flex items-center gap-4">
                                            <div class="text-right">
                                                <div class="font-mono text-sm text-white">${formatCurrency(order.total_amount)}</div>
                                                <span class="inline-block px-2 py-0.5 rounded text-[10px] uppercase tracking-wider font-semibold border ${STATUS_COLORS[order.status] || STATUS_COLORS.DRAFT}">
                                                    ${order.status.replace('_', ' ')}
                                                </span>
                                            </div>
                                            <button
                                                @click=${(e: Event) => this._handleReorder(order.id, e)}
                                                ?disabled=${this.reorderingId === order.id}
                                                class="px-3 py-1.5 rounded-lg text-xs font-semibold bg-gable-green text-black hover:bg-emerald-400 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-1.5"
                                            >
                                                ${this.reorderingId === order.id
                                                    ? icon(RefreshCw, 12, 'animate-spin')
                                                    : icon(ShoppingCart, 12)
                                                }
                                                Buy Again
                                            </button>
                                            ${this.expandedId === order.id
                                                ? icon(ChevronUp, 16, 'text-zinc-500')
                                                : icon(ChevronDown, 16, 'text-zinc-500')
                                            }
                                        </div>
                                    </div>

                                    <!-- Expanded Lines -->
                                    ${this.expandedId === order.id && order.lines.length > 0
                                        ? html`
                                            <div class="border-t border-white/5 px-4 py-3 bg-white/[0.02]">
                                                <table class="w-full text-sm">
                                                    <thead>
                                                        <tr class="text-zinc-500 text-xs uppercase tracking-wider">
                                                            <th class="text-left py-2 font-medium">Product</th>
                                                            <th class="text-left py-2 font-medium">SKU</th>
                                                            <th class="text-right py-2 font-medium">Qty</th>
                                                            <th class="text-right py-2 font-medium">Price</th>
                                                            <th class="text-right py-2 font-medium">Total</th>
                                                        </tr>
                                                    </thead>
                                                    <tbody>
                                                        ${order.lines.map(line => html`
                                                            <tr class="border-t border-white/5">
                                                                <td class="py-2 text-white">${line.product_name}</td>
                                                                <td class="py-2 font-mono text-zinc-400 text-xs">${line.product_sku}</td>
                                                                <td class="py-2 text-right font-mono text-zinc-300">${line.quantity}</td>
                                                                <td class="py-2 text-right font-mono text-zinc-300">${formatCurrency(line.price_each)}</td>
                                                                <td class="py-2 text-right font-mono text-white">${formatCurrency(line.quantity * line.price_each)}</td>
                                                            </tr>
                                                        `)}
                                                    </tbody>
                                                </table>
                                            </div>
                                        `
                                        : nothing
                                    }
                                </div>
                            `)}
                        </div>
                    `
                }
            </div>
        `;
    }
}
