import { LitElement, html } from 'lit';
import { customElement, property } from 'lit/decorators.js';
import type { RecentOrder } from '../../types/dashboard.ts';

function getStatusColor(status: string): string {
    switch (status.toLowerCase()) {
        case 'submitted': return 'bg-amber-500/10 text-amber-500 border-amber-500/20';
        case 'confirmed': return 'bg-blue-500/10 text-blue-500 border-blue-500/20';
        case 'processing': return 'bg-indigo-500/10 text-indigo-500 border-indigo-500/20';
        case 'ready': return 'bg-emerald-500/10 text-emerald-500 border-emerald-500/20';
        case 'completed': return 'bg-gable-green/10 text-gable-green border-gable-green/20';
        case 'cancelled': return 'bg-rose-500/10 text-rose-500 border-rose-500/20';
        default: return 'bg-zinc-500/10 text-zinc-500 border-zinc-500/20';
    }
}

@customElement('gable-recent-orders-feed')
export class GableRecentOrdersFeed extends LitElement {
    createRenderRoot() { return this; }

    @property({ attribute: false }) orders: RecentOrder[] = [];
    @property({ type: Boolean }) loading = false;

    render() {
        if (this.loading) {
            return html`
                <div class="rounded-xl border border-white/10 bg-slate-steel/30 backdrop-blur-sm h-full">
                    <div class="p-4 border-b border-white/5">
                        <div class="h-6 w-32 bg-white/10 rounded animate-pulse"></div>
                    </div>
                    <div class="p-4">
                        <div class="space-y-4">
                            ${[1, 2, 3, 4, 5].map(() => html`
                                <div class="flex justify-between items-center">
                                    <div class="space-y-2">
                                        <div class="h-4 w-24 bg-white/10 rounded animate-pulse"></div>
                                        <div class="h-3 w-16 bg-white/10 rounded animate-pulse"></div>
                                    </div>
                                    <div class="h-6 w-20 bg-white/10 rounded animate-pulse"></div>
                                </div>
                            `)}
                        </div>
                    </div>
                </div>
            `;
        }

        return html`
            <div class="rounded-xl border border-white/10 bg-slate-steel/30 backdrop-blur-sm h-full">
                <div class="p-4 border-b border-white/5">
                    <h3 class="text-base font-semibold text-white">Recent Activity</h3>
                </div>
                <div class="p-0">
                    <div class="divide-y divide-white/5">
                        ${this.orders.length === 0
                            ? html`<div class="p-6 text-center text-zinc-500">No recent orders</div>`
                            : this.orders.map((order) => html`
                                <div class="p-4 hover:bg-white/5 transition-colors group">
                                    <div class="flex justify-between items-start mb-1">
                                        <div class="font-medium text-white group-hover:text-gable-green transition-colors">
                                            ${order.customer_name}
                                        </div>
                                        <span class="text-[10px] px-2 py-0.5 rounded-full border uppercase tracking-wider font-semibold ${getStatusColor(order.status)}">
                                            ${order.status}
                                        </span>
                                    </div>
                                    <div class="flex justify-between items-center text-xs text-zinc-500">
                                        <div class="font-mono">${order.order_id.substring(0, 8)}...</div>
                                        <div class="font-mono text-zinc-400">
                                            $${(order.total_amount / 100).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                                        </div>
                                    </div>
                                </div>
                            `)
                        }
                    </div>
                </div>
            </div>
        `;
    }
}
