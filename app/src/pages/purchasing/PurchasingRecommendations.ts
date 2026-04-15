import { LitElement, html, nothing } from 'lit';
import { customElement, state } from 'lit/decorators.js';
import { icon } from '../../lib/icons.ts';
import { ArrowLeft, TrendingUp, AlertTriangle, ShoppingCart, RefreshCw, Package } from 'lucide';
import { PurchaseOrderService } from '../../services/PurchaseOrderService.ts';
import { ToastService } from '../../lib/toast-service.ts';
import { router } from '../../lib/router.ts';
import type { PurchaseRecommendation, RecommendationSummary, UrgencyLevel } from '../../types/purchaseOrder.ts';

const urgencyConfig: Record<UrgencyLevel, { label: string; color: string; bg: string; border: string }> = {
    CRITICAL: { label: 'Critical', color: 'text-rose-400', bg: 'bg-rose-500/10', border: 'border-rose-500/30' },
    HIGH: { label: 'High', color: 'text-amber-400', bg: 'bg-amber-500/10', border: 'border-amber-500/30' },
    MEDIUM: { label: 'Medium', color: 'text-blue-400', bg: 'bg-blue-500/10', border: 'border-blue-500/30' },
    LOW: { label: 'Low', color: 'text-emerald-400', bg: 'bg-emerald-500/10', border: 'border-emerald-500/30' },
};

@customElement('gable-purchasing-recommendations')
export class GablePurchasingRecommendations extends LitElement {
    createRenderRoot() { return this; }

    @state() private summary: RecommendationSummary | null = null;
    @state() private loading = true;
    @state() private filter: UrgencyLevel | 'ALL' = 'ALL';

    connectedCallback() {
        super.connectedCallback();
        this._fetchRecommendations();
    }

    private async _fetchRecommendations() {
        this.loading = true;
        try {
            const data = await PurchaseOrderService.getRecommendations();
            this.summary = data;
        } catch (err) {
            console.error('Failed to load recommendations:', err);
            ToastService.show('Failed to load purchasing recommendations', 'error');
        } finally {
            this.loading = false;
        }
    }

    private get filteredItems(): PurchaseRecommendation[] {
        return this.summary?.items.filter(
            (item) => this.filter === 'ALL' || item.urgency === this.filter
        ) ?? [];
    }

    private _handleCreatePO(rec: PurchaseRecommendation) {
        const params = new URLSearchParams({
            from: 'recommendation',
            product_id: rec.product_id,
            description: `${rec.product_sku} - ${rec.product_name}`,
            qty: String(rec.suggested_qty),
            cost: String(rec.estimated_cost / rec.suggested_qty),
        });
        if (rec.vendor_name) params.set('vendor_name', rec.vendor_name);
        router.navigate(`/purchasing/new?${params.toString()}`);
    }

    private _getFilterCount(level: UrgencyLevel): number {
        if (!this.summary) return 0;
        switch (level) {
            case 'CRITICAL': return this.summary.critical_count;
            case 'HIGH': return this.summary.high_count;
            case 'MEDIUM': return this.summary.medium_count;
            case 'LOW': return this.summary.low_count;
        }
    }

    render() {
        return html`
            <div>
                <div class="flex items-center gap-4 mb-6">
                    <button
                        @click=${() => router.navigate('/purchasing')}
                        class="p-2 rounded-full bg-white/5 hover:bg-white/10 text-zinc-400 transition-colors"
                    >
                        ${icon(ArrowLeft, 20, 'w-5 h-5')}
                    </button>
                    <div class="flex-1">
                        <h1 class="text-2xl font-bold text-white">Purchasing Recommendations</h1>
                        <p class="text-sm text-zinc-400">AI-driven reorder suggestions based on sales velocity and stock levels</p>
                    </div>
                    <button
                        @click=${() => this._fetchRecommendations()}
                        ?disabled=${this.loading}
                        class="flex items-center gap-2 px-4 py-2 bg-white/5 border border-white/10 text-white rounded-lg hover:bg-white/10 transition-colors"
                    >
                        ${icon(RefreshCw, 16, `w-4 h-4 ${this.loading ? 'animate-spin' : ''}`)}
                        Refresh
                    </button>
                </div>

                <!-- Summary Cards -->
                ${this.summary ? html`
                    <div class="grid grid-cols-2 md:grid-cols-5 gap-4 mb-6">
                        <div class="bg-[#161821]/60 backdrop-blur-sm border border-white/10 rounded-2xl">
                            <div class="p-4 text-center">
                                ${icon(Package, 20, 'w-5 h-5 mx-auto mb-1 text-zinc-400')}
                                <div class="text-2xl font-bold text-white font-mono">${this.summary.total_items}</div>
                                <div class="text-xs text-zinc-500">Total Items</div>
                            </div>
                        </div>
                        <div class="bg-[#161821]/60 backdrop-blur-sm border border-white/10 rounded-2xl">
                            <div class="p-4 text-center">
                                ${icon(AlertTriangle, 20, 'w-5 h-5 mx-auto mb-1 text-rose-400')}
                                <div class="text-2xl font-bold text-rose-400 font-mono">${this.summary.critical_count}</div>
                                <div class="text-xs text-zinc-500">Critical</div>
                            </div>
                        </div>
                        <div class="bg-[#161821]/60 backdrop-blur-sm border border-white/10 rounded-2xl">
                            <div class="p-4 text-center">
                                ${icon(TrendingUp, 20, 'w-5 h-5 mx-auto mb-1 text-amber-400')}
                                <div class="text-2xl font-bold text-amber-400 font-mono">${this.summary.high_count}</div>
                                <div class="text-xs text-zinc-500">High</div>
                            </div>
                        </div>
                        <div class="bg-[#161821]/60 backdrop-blur-sm border border-white/10 rounded-2xl">
                            <div class="p-4 text-center">
                                <div class="text-2xl font-bold text-blue-400 font-mono">${this.summary.medium_count}</div>
                                <div class="text-xs text-zinc-500">Medium</div>
                            </div>
                        </div>
                        <div class="bg-[#161821]/60 backdrop-blur-sm border border-white/10 rounded-2xl">
                            <div class="p-4 text-center">
                                ${icon(ShoppingCart, 20, 'w-5 h-5 mx-auto mb-1 text-[#00FFA3]')}
                                <div class="text-2xl font-bold text-[#00FFA3] font-mono">
                                    $${this.summary.total_estimated_cost.toLocaleString('en-US', { minimumFractionDigits: 0 })}
                                </div>
                                <div class="text-xs text-zinc-500">Est. Total Cost</div>
                            </div>
                        </div>
                    </div>
                ` : nothing}

                <!-- Filter Tabs -->
                <div class="flex gap-2 mb-4">
                    ${(['ALL', 'CRITICAL', 'HIGH', 'MEDIUM', 'LOW'] as const).map(level => html`
                        <button
                            @click=${() => { this.filter = level; }}
                            class="px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${this.filter === level
                                ? 'bg-[#00FFA3]/20 text-[#00FFA3] border border-[#00FFA3]/30'
                                : 'bg-white/5 text-zinc-400 hover:bg-white/10 border border-transparent'
                            }"
                        >
                            ${level === 'ALL' ? 'All' : urgencyConfig[level].label}
                            ${level !== 'ALL' && this.summary ? html`
                                <span class="ml-1 opacity-60">(${this._getFilterCount(level)})</span>
                            ` : nothing}
                        </button>
                    `)}
                </div>

                <!-- Recommendations Table -->
                <div class="bg-[#161821]/60 backdrop-blur-sm border border-white/10 rounded-2xl">
                    ${this.loading ? html`
                        <div class="text-center text-zinc-500 py-16">
                            ${icon(RefreshCw, 32, 'w-8 h-8 mx-auto mb-3 animate-spin text-zinc-600')}
                            Analyzing inventory and sales data...
                        </div>
                    ` : this.filteredItems.length === 0 ? html`
                        <div class="text-center text-zinc-500 py-16 italic">
                            No recommendations found for the selected filter.
                        </div>
                    ` : html`
                        <div class="overflow-x-auto">
                            <table class="w-full">
                                <thead>
                                    <tr class="border-b border-white/5">
                                        <th class="text-left text-xs text-zinc-500 font-medium py-3 px-4">Urgency</th>
                                        <th class="text-left text-xs text-zinc-500 font-medium py-3 px-4">Product</th>
                                        <th class="text-left text-xs text-zinc-500 font-medium py-3 px-4">Vendor</th>
                                        <th class="text-right text-xs text-zinc-500 font-medium py-3 px-4">Stock</th>
                                        <th class="text-right text-xs text-zinc-500 font-medium py-3 px-4">Reorder Pt</th>
                                        <th class="text-right text-xs text-zinc-500 font-medium py-3 px-4">Avg/Day</th>
                                        <th class="text-right text-xs text-zinc-500 font-medium py-3 px-4">Days Left</th>
                                        <th class="text-right text-xs text-zinc-500 font-medium py-3 px-4">Suggested Qty</th>
                                        <th class="text-right text-xs text-zinc-500 font-medium py-3 px-4">Est. Cost</th>
                                        <th class="text-right text-xs text-zinc-500 font-medium py-3 px-4"></th>
                                    </tr>
                                </thead>
                                <tbody>
                                    ${this.filteredItems.map(rec => {
                                        const cfg = urgencyConfig[rec.urgency];
                                        return html`
                                            <tr class="border-b border-white/5 hover:bg-white/[0.02] transition-colors">
                                                <td class="py-3 px-4">
                                                    <span class="inline-flex px-2 py-0.5 rounded text-xs font-medium ${cfg.bg} ${cfg.color} border ${cfg.border}">
                                                        ${cfg.label}
                                                    </span>
                                                </td>
                                                <td class="py-3 px-4">
                                                    <div class="text-sm text-white font-medium">${rec.product_sku}</div>
                                                    <div class="text-xs text-zinc-500 truncate max-w-[200px]">${rec.product_name}</div>
                                                </td>
                                                <td class="py-3 px-4 text-sm text-zinc-400">${rec.vendor_name || '-'}</td>
                                                <td class="py-3 px-4 text-right text-sm font-mono text-white">${rec.current_stock.toFixed(0)}</td>
                                                <td class="py-3 px-4 text-right text-sm font-mono text-zinc-400">${rec.reorder_point.toFixed(0)}</td>
                                                <td class="py-3 px-4 text-right text-sm font-mono text-zinc-400">${rec.avg_daily_sales.toFixed(1)}</td>
                                                <td class="py-3 px-4 text-right">
                                                    <span class="text-sm font-mono ${rec.days_until_out < 7 ? 'text-rose-400' : rec.days_until_out < 14 ? 'text-amber-400' : 'text-zinc-400'}">
                                                        ${rec.days_until_out >= 999 ? '999+' : rec.days_until_out.toFixed(0)}d
                                                    </span>
                                                </td>
                                                <td class="py-3 px-4 text-right text-sm font-mono font-medium text-[#00FFA3]">${rec.suggested_qty.toFixed(0)}</td>
                                                <td class="py-3 px-4 text-right text-sm font-mono text-zinc-300">$${rec.estimated_cost.toFixed(2)}</td>
                                                <td class="py-3 px-4 text-right">
                                                    <button
                                                        @click=${() => this._handleCreatePO(rec)}
                                                        class="px-3 py-1.5 bg-[#00FFA3] text-black text-xs font-semibold rounded-lg hover:bg-[#00FFA3]/90 transition-colors"
                                                    >
                                                        Create PO
                                                    </button>
                                                </td>
                                            </tr>
                                        `;
                                    })}
                                </tbody>
                            </table>
                        </div>
                    `}
                </div>
            </div>
        `;
    }
}
