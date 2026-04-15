import { LitElement, html } from 'lit';
import { customElement, state } from 'lit/decorators.js';
import { icon } from '../../lib/icons.ts';
import { DollarSign, CreditCard, AlertTriangle, ShoppingCart, ArrowRight, RefreshCw } from 'lucide';
import { PortalService } from '../../services/PortalService';
import type { PortalDashboard as DashboardData } from '../../types/portal';

const formatCurrency = (val: number): string =>
    new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(val);

const STATUS_COLORS: Record<string, string> = {
    DRAFT: 'bg-zinc-500/10 text-zinc-400 border-zinc-500/20',
    CONFIRMED: 'bg-blue-500/10 text-blue-400 border-blue-500/20',
    FULFILLED: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20',
    CANCELLED: 'bg-red-500/10 text-red-400 border-red-500/20',
    ON_HOLD: 'bg-amber-500/10 text-amber-400 border-amber-500/20',
};

@customElement('gable-portal-dashboard')
export class PortalDashboard extends LitElement {
    createRenderRoot() { return this; }

    @state() private data: DashboardData | null = null;
    @state() private loading = true;
    @state() private error = '';

    connectedCallback() {
        super.connectedCallback();
        this._fetchData();
    }

    private _fetchData() {
        this.loading = true;
        this.error = '';
        PortalService.getDashboard()
            .then(d => { this.data = d; })
            .catch(err => { this.error = err instanceof Error ? err.message : 'Failed to load dashboard'; })
            .finally(() => { this.loading = false; });
    }

    private get _userName(): string {
        try {
            const stored = localStorage.getItem('portal_user');
            if (stored) {
                const u = JSON.parse(stored) as { name: string };
                return u.name?.split(' ')[0] || 'Contractor';
            }
        } catch { /* ignore */ }
        return 'Contractor';
    }

    render() {
        if (this.loading) {
            return html`
                <div class="space-y-6">
                    <div class="h-10 w-72 bg-white/5 rounded-lg animate-pulse"></div>
                    <div class="grid grid-cols-1 md:grid-cols-3 gap-6">
                        ${[1, 2, 3].map(() => html`<div class="h-32 bg-white/5 rounded-2xl animate-pulse"></div>`)}
                    </div>
                    <div class="h-64 bg-white/5 rounded-2xl animate-pulse"></div>
                </div>
            `;
        }

        if (this.error) {
            return html`
                <div class="flex flex-col items-center justify-center h-64 text-center">
                    ${icon(AlertTriangle, 48, 'text-amber-500 mb-4')}
                    <p class="text-zinc-400 mb-4">${this.error}</p>
                    <button
                        @click=${() => this._fetchData()}
                        class="flex items-center gap-2 px-4 py-2 rounded-lg bg-white/5 border border-white/10 text-white hover:bg-white/10 transition-colors"
                    >
                        ${icon(RefreshCw, 16)} Retry
                    </button>
                </div>
            `;
        }

        const stats = [
            { title: 'Current Balance', value: formatCurrency(this.data?.balance_due || 0), iconData: DollarSign, color: '#00FFA3' },
            { title: 'Credit Limit', value: formatCurrency(this.data?.credit_limit || 0), iconData: CreditCard, color: '#38BDF8' },
            { title: 'Past Due', value: formatCurrency(this.data?.past_due || 0), iconData: AlertTriangle, color: this.data?.past_due && this.data.past_due > 0 ? '#F43F5E' : '#00FFA3' },
        ];

        return html`
            <div>
                <div class="mb-8 flex justify-between items-start">
                    <div>
                        <h1 class="text-display-large text-white">Welcome back, ${this._userName}</h1>
                        <p class="text-zinc-400 mt-2 text-lg">Here's your account overview.</p>
                    </div>
                    <a
                        href="/portal/account"
                        class="flex items-center gap-2 px-4 py-2 bg-white/5 hover:bg-white/10 border border-white/10 rounded-lg text-white transition-colors"
                    >
                        My Account ${icon(ArrowRight, 16)}
                    </a>
                </div>

                <!-- Stats Row -->
                <div class="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
                    ${stats.map(stat => html`
                        <div class="group hover:-translate-y-1 transition-transform duration-300 rounded-2xl border border-white/[0.06] bg-[#161821]/80 backdrop-blur-xl">
                            <div class="p-6">
                                <div class="flex justify-between items-start mb-4">
                                    <div
                                        class="p-3 rounded-lg border"
                                        style="background-color: ${stat.color}10; border-color: ${stat.color}20"
                                    >
                                        ${icon(stat.iconData, 24, `w-6 h-6`)}
                                    </div>
                                </div>
                                <p class="text-zinc-400 text-sm font-medium mb-1">${stat.title}</p>
                                <h3 class="text-3xl font-bold text-white font-mono tracking-tight">${stat.value}</h3>
                            </div>
                        </div>
                    `)}
                </div>

                <!-- Recent Orders -->
                <div class="rounded-2xl border border-white/[0.06] bg-[#161821]/80 backdrop-blur-xl">
                    <div class="flex flex-row items-center justify-between pb-2 p-6">
                        <h3 class="text-lg font-semibold text-white">Recent Orders</h3>
                        <a
                            href="/portal/orders"
                            class="text-sm text-gable-green hover:underline flex items-center gap-1"
                        >
                            View All ${icon(ArrowRight, 16)}
                        </a>
                    </div>
                    <div class="px-6 pb-6">
                        ${this.data?.recent_orders && this.data.recent_orders.length > 0
                            ? html`
                                <div class="space-y-3">
                                    ${this.data.recent_orders.map(order => html`
                                        <div
                                            class="flex justify-between items-center p-3 rounded-lg hover:bg-white/5 transition-colors border border-transparent hover:border-white/5"
                                        >
                                            <div>
                                                <div class="font-medium text-white font-mono text-sm">
                                                    ${order.id.substring(0, 8).toUpperCase()}
                                                </div>
                                                <div class="text-xs text-zinc-500 mt-0.5">
                                                    ${new Date(order.created_at).toLocaleDateString()} · ${order.lines.length} item${order.lines.length !== 1 ? 's' : ''}
                                                </div>
                                            </div>
                                            <div class="text-right flex items-center gap-3">
                                                <div>
                                                    <div class="font-mono text-zinc-300 text-sm">${formatCurrency(order.total_amount)}</div>
                                                    <span class="inline-block px-2 py-0.5 rounded text-[10px] uppercase tracking-wider font-semibold border ${STATUS_COLORS[order.status] || STATUS_COLORS.DRAFT}">
                                                        ${order.status.replace('_', ' ')}
                                                    </span>
                                                </div>
                                                <a
                                                    href="/portal/orders"
                                                    class="p-1.5 rounded-lg hover:bg-white/5 text-zinc-500 hover:text-white transition-colors"
                                                >
                                                    ${icon(ShoppingCart, 14)}
                                                </a>
                                            </div>
                                        </div>
                                    `)}
                                </div>
                            `
                            : html`<p class="text-zinc-500 text-sm py-4">No orders yet.</p>`
                        }
                    </div>
                </div>
            </div>
        `;
    }
}
