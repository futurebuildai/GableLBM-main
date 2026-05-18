import { LitElement, html, nothing } from 'lit';
import { customElement, state } from 'lit/decorators.js';
import { icon } from '../lib/icons.ts';
import { RefreshCw, DollarSign, ShoppingCart, Truck, CreditCard, Calendar, AlertCircle } from 'lucide';
import { DashboardService } from '../services/DashboardService.ts';
import { ToastService } from '../lib/toast-service.ts';
import { onBranchChanged } from '../lib/branch-listener.ts';
import type {
    DashboardSummary,
    InventoryAlert,
    TopCustomer,
    OrderActivity,
    RevenueTrendPoint,
} from '../types/dashboard.ts';

// Side-effect imports: register child custom elements
import '../components/dashboard/KPICard.ts';
import '../components/dashboard/RevenueTrendChart.ts';
import '../components/dashboard/OrderStatusChart.ts';
import '../components/dashboard/TopCustomersTable.ts';
import '../components/dashboard/InventoryAlertsWidget.ts';
import '../components/dashboard/RecentOrdersFeed.ts';

const REFRESH_INTERVAL = 60000; // 60 seconds

@customElement('gable-dashboard')
export class GableDashboard extends LitElement {
    createRenderRoot() { return this; }

    @state() private summary: DashboardSummary | null = null;
    @state() private inventoryAlerts: InventoryAlert[] = [];
    @state() private topCustomers: TopCustomer[] = [];
    @state() private orderActivity: OrderActivity | null = null;
    @state() private revenueTrend: RevenueTrendPoint[] = [];
    @state() private loading = true;
    @state() private error: string | null = null;
    @state() private lastRefresh: Date = new Date();
    @state() private refreshing = false;

    private _interval: ReturnType<typeof setInterval> | null = null;
    private _unsubBranch: (() => void) | null = null;

    connectedCallback() {
        super.connectedCallback();
        this.fetchDashboardData();
        this._interval = setInterval(() => this.fetchDashboardData(), REFRESH_INTERVAL);
        this._unsubBranch = onBranchChanged(() => {
            this.loading = true;
            this.fetchDashboardData();
        });
    }

    disconnectedCallback() {
        super.disconnectedCallback();
        if (this._interval) {
            clearInterval(this._interval);
            this._interval = null;
        }
        if (this._unsubBranch) {
            this._unsubBranch();
            this._unsubBranch = null;
        }
    }

    private async fetchDashboardData(showSpinner = false) {
        if (showSpinner) this.refreshing = true;
        try {
            const [summaryData, alertsData, customersData, activityData, trendData] = await Promise.all([
                DashboardService.getSummary(),
                DashboardService.getInventoryAlerts(),
                DashboardService.getTopCustomers(),
                DashboardService.getOrderActivity(),
                DashboardService.getRevenueTrend(),
            ]);
            this.summary = summaryData;
            this.inventoryAlerts = alertsData;
            this.topCustomers = customersData;
            this.orderActivity = activityData;
            this.revenueTrend = trendData;
            this.lastRefresh = new Date();
            this.error = null;
        } catch (err) {
            const message = err instanceof Error ? err.message : 'An unexpected error occurred';
            console.error('Failed to fetch dashboard data:', err);
            this.error = message;
            if (showSpinner) {
                ToastService.show('Failed to refresh dashboard data', 'error');
            }
        } finally {
            this.loading = false;
            this.refreshing = false;
        }
    }

    private formatCurrency(cents: number) {
        return `$${(cents / 100).toLocaleString(undefined, { minimumFractionDigits: 2 })}`;
    }

    render() {
        const currentDate = new Date().toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });

        const hour = new Date().getHours();
        const timeGreeting = hour < 12 ? 'Good Morning' : hour < 17 ? 'Good Afternoon' : 'Good Evening';
        const userRaw = localStorage.getItem('user');
        const userName = userRaw ? (() => { try { const u = JSON.parse(userRaw); return u.name || u.firstName || ''; } catch { return ''; } })() : '';
        const greeting = userName ? `${timeGreeting}, ${userName}` : timeGreeting;

        return html`
            <div class="space-y-8">
                <!-- Header & Hero -->
                <div class="flex flex-col md:flex-row md:items-center justify-between gap-4">
                    <div>
                        <div class="flex items-center gap-2 text-zinc-400 text-sm font-medium mb-1">
                            ${icon(Calendar, 16, 'w-4 h-4')}
                            ${currentDate}
                        </div>
                        <h1 class="text-display-large text-white bg-clip-text text-transparent bg-gradient-to-r from-white to-zinc-400">
                            ${greeting}
                        </h1>
                        <p class="text-zinc-500 mt-1">
                            Here's what's happening at the yard today.
                        </p>
                    </div>

                    <div class="flex items-center gap-3">
                        <div class="text-right text-xs text-zinc-500 hidden md:block">
                            <div class="font-mono">Last updated: ${this.lastRefresh.toLocaleTimeString()}</div>
                            <div class="flex items-center gap-1 justify-end mt-1">
                                <span class="w-2 h-2 rounded-full ${this.error ? 'bg-rose-500' : 'bg-gable-green'} animate-pulse"></span>
                                ${this.error ? 'Error' : 'Live'}
                            </div>
                        </div>
                        <button
                            @click=${() => this.fetchDashboardData(true)}
                            ?disabled=${this.refreshing}
                            class="inline-flex items-center justify-center rounded-lg text-sm font-medium transition-colors bg-white/10 text-white hover:bg-white/20 border border-white/10 px-3 py-1.5 disabled:opacity-50"
                        >
                            ${icon(RefreshCw, 16, `w-4 h-4 mr-2 ${this.refreshing ? 'animate-spin' : ''}`)}
                            Refresh
                        </button>
                    </div>
                </div>

                <!-- Error Banner -->
                ${this.error && !this.loading ? html`
                    <div class="flex items-center gap-3 px-4 py-3 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-400">
                        ${icon(AlertCircle, 20, 'w-5 h-5 shrink-0')}
                        <div class="flex-1">
                            <p class="text-sm font-medium">Unable to load dashboard data</p>
                            <p class="text-xs text-rose-400/70 mt-0.5">
                                ${this.error}. Data shown may be stale.
                            </p>
                        </div>
                        <button
                            @click=${() => this.fetchDashboardData(true)}
                            ?disabled=${this.refreshing}
                            class="inline-flex items-center justify-center rounded-lg text-sm font-medium transition-colors bg-white/10 text-white hover:bg-white/20 border border-white/10 px-3 py-1.5 disabled:opacity-50"
                        >
                            Retry
                        </button>
                    </div>
                ` : nothing}

                <!-- KPI Cards -->
                <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                    <gable-kpi-card
                        card-title="Today's Revenue"
                        .value=${this.summary ? this.formatCurrency(this.summary.today_revenue) : '$0.00'}
                        .trend=${this.summary?.today_revenue_change ?? undefined}
                        .iconHtml=${icon(DollarSign, 20, 'w-5 h-5')}
                        ?loading=${this.loading}
                        valueColor="text-gable-green"
                    ></gable-kpi-card>
                    <gable-kpi-card
                        card-title="Active Orders"
                        .value=${this.summary?.active_orders ?? 0}
                        .iconHtml=${icon(ShoppingCart, 20, 'w-5 h-5')}
                        ?loading=${this.loading}
                    ></gable-kpi-card>
                    <gable-kpi-card
                        card-title="Pending Dispatch"
                        .value=${this.summary?.pending_dispatch ?? 0}
                        .iconHtml=${icon(Truck, 20, 'w-5 h-5')}
                        ?loading=${this.loading}
                        valueColor="text-blueprint-blue"
                    ></gable-kpi-card>
                    <gable-kpi-card
                        card-title="Outstanding AR"
                        .value=${this.summary ? this.formatCurrency(this.summary.outstanding_ar) : '$0.00'}
                        .subValue=${this.summary ? `${this.summary.outstanding_ar_count} invoices` : undefined}
                        .iconHtml=${icon(CreditCard, 20, 'w-5 h-5')}
                        ?loading=${this.loading}
                        valueColor="text-amber-400"
                    ></gable-kpi-card>
                </div>

                <!-- Charts Row -->
                <div class="grid grid-cols-1 lg:grid-cols-3 gap-6">
                    <div class="lg:col-span-2">
                        <gable-revenue-trend-chart .data=${this.revenueTrend} ?loading=${this.loading}></gable-revenue-trend-chart>
                    </div>
                    <div>
                        <gable-order-status-chart
                            .statusBreakdown=${this.orderActivity?.status_breakdown ?? {}}
                            ?loading=${this.loading}
                        ></gable-order-status-chart>
                    </div>
                </div>

                <!-- Widgets Row -->
                <div class="grid grid-cols-1 lg:grid-cols-3 gap-6">
                    <gable-top-customers-table .customers=${this.topCustomers} ?loading=${this.loading}></gable-top-customers-table>
                    <gable-inventory-alerts-widget .alerts=${this.inventoryAlerts} ?loading=${this.loading}></gable-inventory-alerts-widget>
                    <gable-recent-orders-feed .orders=${this.orderActivity?.recent_orders ?? []} ?loading=${this.loading}></gable-recent-orders-feed>
                </div>
            </div>
        `;
    }
}
