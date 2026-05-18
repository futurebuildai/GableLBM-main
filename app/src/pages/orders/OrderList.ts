import { LitElement, html } from 'lit';
import { customElement, state } from 'lit/decorators.js';
import { icon } from '../../lib/icons.ts';
import { router } from '../../lib/router.ts';
import { ArrowRight } from 'lucide';
import { OrderService } from '../../services/OrderService.ts';
import { type Order, getStatusColor } from '../../types/order.ts';
import type { OrderStatus } from '../../types/order.ts';
import { onBranchChanged } from '../../lib/branch-listener.ts';

@customElement('gable-order-list')
export class GableOrderList extends LitElement {
    createRenderRoot() { return this; }

    @state() private orders: Order[] = [];
    @state() private loading = true;
    @state() private error: string | null = null;
    private _unsubBranch: (() => void) | null = null;

    connectedCallback() {
        super.connectedCallback();
        this.loadOrders();
        this._unsubBranch = onBranchChanged(() => {
            this.loading = true;
            this.loadOrders();
        });
    }

    disconnectedCallback() {
        super.disconnectedCallback();
        if (this._unsubBranch) {
            this._unsubBranch();
            this._unsubBranch = null;
        }
    }

    private async loadOrders() {
        try {
            this.error = null;
            const data = await OrderService.listOrders();
            this.orders = data;
        } catch (err) {
            console.error(err);
            this.error = err instanceof Error ? err.message : 'Failed to load orders';
        } finally {
            this.loading = false;
        }
    }

    private getStatusBadgeClass(status: OrderStatus): string {
        const color = getStatusColor(status);
        let bg = 'bg-white/10 text-white';
        if (color === 'info') bg = 'bg-blue-500/20 text-blue-400 border-blue-500/50';
        if (color === 'success') bg = 'bg-gable-green/20 text-gable-green border-gable-green/50';
        if (color === 'warning') bg = 'bg-amber-500/20 text-amber-400 border-amber-500/50';
        if (color === 'error') bg = 'bg-red-500/20 text-red-400 border-red-500/50';
        return bg;
    }

    render() {
        if (this.loading) {
            return html`<div class="text-white">Loading orders...</div>`;
        }

        if (this.error) {
            return html`
                <div class="flex flex-col items-center justify-center min-h-[400px] p-8">
                    <p class="text-rose-400 text-lg font-semibold mb-2">Failed to load</p>
                    <p class="text-gray-400 text-sm mb-4">${this.error}</p>
                    <button
                        @click=${() => { this.error = null; this.loadOrders(); }}
                        class="px-4 py-2 bg-[#00FFA3] text-[#0A0B10] rounded font-medium hover:opacity-90"
                    >
                        Retry
                    </button>
                </div>
            `;
        }

        return html`
            <div class="space-y-6">
                <div class="flex items-center justify-between">
                    <div>
                        <h1 class="text-3xl font-bold tracking-tight text-white font-mono">Orders</h1>
                        <p class="text-muted-foreground mt-2">Manage customer orders and fulfillment.</p>
                    </div>
                </div>

                <div class="bg-slate-steel border border-white/10 rounded-lg overflow-hidden">
                    <table class="w-full text-left text-sm" aria-label="Orders list">
                        <thead>
                            <tr class="border-b border-white/10 bg-white/5">
                                <th class="p-4 font-medium text-muted-foreground">Order ID</th>
                                <th class="p-4 font-medium text-muted-foreground">Date</th>
                                <th class="p-4 font-medium text-muted-foreground">Customer</th>
                                <th class="p-4 font-medium text-muted-foreground">Status</th>
                                <th class="p-4 font-medium text-muted-foreground text-right">Total</th>
                                <th class="p-4 font-medium text-muted-foreground text-right">Action</th>
                            </tr>
                        </thead>
                        <tbody class="divide-y divide-white/5">
                            ${this.orders.length === 0 ? html`
                                <tr>
                                    <td colspan="6" class="p-8 text-center text-muted-foreground">
                                        No active orders found. Create a quote and convert it to start.
                                    </td>
                                </tr>
                            ` : this.orders.map(order => html`
                                <tr class="hover:bg-white/5 transition-colors">
                                    <td class="p-4 font-mono text-white/80">#${order.id.slice(0, 8)}</td>
                                    <td class="p-4 text-white/80">${new Date(order.created_at).toLocaleDateString()}</td>
                                    <td class="p-4 text-white font-medium">${order.customer_name || order.customer_id.slice(0, 8)}</td>
                                    <td class="p-4">
                                        <span class="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium border border-transparent ${this.getStatusBadgeClass(order.status)}">
                                            ${order.status}
                                        </span>
                                    </td>
                                    <td class="p-4 font-mono text-right text-gable-green">
                                        $${order.total_amount.toFixed(2)}
                                    </td>
                                    <td class="p-4 text-right">
                                        <button
                                            @click=${() => router.navigate(`/orders/${order.id}`)}
                                            aria-label="View order ${order.id.slice(0, 8)}"
                                            class="text-white/50 hover:text-white transition-colors"
                                        >
                                            ${icon(ArrowRight, 18)}
                                        </button>
                                    </td>
                                </tr>
                            `)}
                        </tbody>
                    </table>
                </div>
            </div>
        `;
    }
}
