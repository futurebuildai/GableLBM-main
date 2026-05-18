import { LitElement, html, nothing } from 'lit';
import { customElement, state } from 'lit/decorators.js';
import { icon } from '../../lib/icons.ts';
import { router } from '../../lib/router.ts';
import { ToastService } from '../../lib/toast-service.ts';
import { ClipboardList, ChevronRight, Package, Clock, User } from 'lucide';
import { OrderService } from '../../services/OrderService';
import type { Order } from '../../types/order';

@customElement('gable-pick-queue')
export class PickQueue extends LitElement {
    createRenderRoot() { return this; }

    @state() private orders: Order[] = [];
    @state() private loading = true;

    connectedCallback() {
        super.connectedCallback();
        OrderService.listOrders()
            .then(data => {
                const confirmed = data.filter((o: Order) => o.status === 'CONFIRMED');
                confirmed.sort((a: Order, b: Order) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());
                this.orders = confirmed;
            })
            .catch(() => { this.orders = []; ToastService.show('Failed to load pick queue', 'error'); })
            .finally(() => { this.loading = false; });
    }

    render() {
        if (this.loading) {
            return html`
                <div class="flex justify-center items-center h-64">
                    <div class="animate-spin rounded-full h-10 w-10 border-b-2 border-amber-400"></div>
                </div>
            `;
        }

        return html`
            <div class="flex flex-col space-y-4 p-4 max-w-md mx-auto">
                <div class="flex items-center justify-between mb-2">
                    <h1 class="text-xl font-bold text-white tracking-tight flex items-center gap-2">
                        ${icon(ClipboardList, 20, 'text-amber-400')}
                        Pick Queue
                    </h1>
                    <span class="text-xs font-mono px-2 py-1 rounded bg-amber-400/10 text-amber-400 border border-amber-400/20">
                        ${this.orders.length} Orders
                    </span>
                </div>

                ${this.orders.length === 0 ? html`
                    <div class="text-center py-16 flex flex-col items-center gap-4 opacity-50">
                        ${icon(Package, 56, 'text-zinc-600')}
                        <p class="text-zinc-400 text-lg">All caught up!</p>
                        <p class="text-zinc-500 text-sm">No orders waiting to be picked.</p>
                    </div>
                ` : nothing}

                <div class="space-y-3">
                    ${this.orders.map((order, idx) => html`
                        <div
                            class="rounded-2xl border border-white/[0.06] bg-[#161821]/80 backdrop-blur-xl active:scale-[0.98] transition-all cursor-pointer border-white/5 hover:border-amber-400/30"
                            @click=${() => router.navigate(`/yard/pick/${order.id}`)}
                        >
                            <div class="p-4">
                                <div class="flex justify-between items-start mb-3">
                                    <div class="flex items-center gap-2">
                                        ${idx === 0 ? html`
                                            <span class="text-[10px] font-mono px-2 py-0.5 rounded bg-amber-400 text-black uppercase tracking-wide font-bold">
                                                Next
                                            </span>
                                        ` : nothing}
                                        <span class="text-xs font-mono text-zinc-500">
                                            #${order.id.slice(-6).toUpperCase()}
                                        </span>
                                    </div>
                                    ${icon(ChevronRight, 16, 'text-zinc-600')}
                                </div>

                                <div class="mb-3">
                                    <h3 class="text-lg font-bold text-white flex items-center gap-2">
                                        ${icon(User, 16, 'text-zinc-500')}
                                        ${order.customer_name || 'Walk-in'}
                                    </h3>
                                </div>

                                <div class="flex items-center justify-between pt-3 border-t border-white/5">
                                    <div class="flex items-center gap-3">
                                        <div class="flex items-center gap-1.5 text-xs text-zinc-300 font-mono bg-white/5 px-2 py-1 rounded">
                                            ${icon(Package, 12, 'text-amber-400')}
                                            ${order.lines?.length || '?'} items
                                        </div>
                                        <div class="text-xs font-mono text-zinc-400">
                                            $${order.total_amount.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                                        </div>
                                    </div>
                                    <div class="flex items-center gap-1 text-[10px] text-zinc-500">
                                        ${icon(Clock, 12)}
                                        ${new Date(order.created_at).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
                                    </div>
                                </div>
                            </div>
                        </div>
                    `)}
                </div>
            </div>
        `;
    }
}
