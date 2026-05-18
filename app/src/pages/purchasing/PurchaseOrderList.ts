import { LitElement, html, nothing } from 'lit';
import { customElement, state } from 'lit/decorators.js';
import { icon } from '../../lib/icons.ts';
import { router } from '../../lib/router.ts';
import { ToastService } from '../../lib/toast-service.ts';
import { PurchaseOrderService } from '../../services/PurchaseOrderService';
import type { PurchaseOrder, POSourceSummary } from '../../types/purchaseOrder';
import type { ReorderAlert } from '../../types/product';
import { Package, AlertTriangle, Plus, Truck } from 'lucide';
import { onBranchChanged } from '../../lib/branch-listener.ts';

const statusColors: Record<string, string> = {
    DRAFT: 'text-zinc-400 bg-zinc-500/10 border-zinc-500/20',
    SENT: 'text-blue-400 bg-blue-500/10 border-blue-500/20',
    PARTIAL: 'text-amber-400 bg-amber-500/10 border-amber-500/20',
    RECEIVED: 'text-emerald-400 bg-emerald-500/10 border-emerald-500/20',
    CANCELLED: 'text-rose-400 bg-rose-500/10 border-rose-500/20',
};

const sourceColors: Record<string, string> = {
    MANUAL: 'text-zinc-300 bg-zinc-500/10 border-zinc-500/20',
    REORDER: 'text-emerald-300 bg-emerald-500/10 border-emerald-500/20',
    SPECIAL_ORDER: 'text-blueprint-blue bg-sky-500/10 border-sky-500/20',
    A2A: 'text-fuchsia-300 bg-fuchsia-500/10 border-fuchsia-500/20',
};

const sourceLabels: Record<string, string> = {
    MANUAL: 'Manual',
    REORDER: 'Reorder',
    SPECIAL_ORDER: 'Special',
    A2A: 'A2A',
};

@customElement('gable-purchase-order-list')
export class PurchaseOrderList extends LitElement {
    createRenderRoot() { return this; }

    @state() private pos: PurchaseOrder[] = [];
    @state() private alerts: ReorderAlert[] = [];
    @state() private loading = true;
    @state() private sourceSummary: POSourceSummary = {};
    private _unsubBranch: (() => void) | null = null;

    connectedCallback() {
        super.connectedCallback();
        this._loadData();
        this._unsubBranch = onBranchChanged(() => {
            this.loading = true;
            this._loadData();
        });
    }

    disconnectedCallback() {
        super.disconnectedCallback();
        if (this._unsubBranch) {
            this._unsubBranch();
            this._unsubBranch = null;
        }
    }

    private async _loadData() {
        try {
            const [poData, alertData, summary] = await Promise.all([
                PurchaseOrderService.listPOs(),
                PurchaseOrderService.getReorderAlerts(),
                PurchaseOrderService.getSourceSummary().catch(() => ({} as POSourceSummary)),
            ]);
            this.pos = poData || [];
            this.alerts = alertData || [];
            this.sourceSummary = summary || {};
        } catch (err) {
            console.error(err);
            ToastService.show('Failed to load purchasing data', 'error');
        } finally {
            this.loading = false;
        }
    }

    // _automationPct returns the share of POs that were created via REORDER
    // out of MANUAL + REORDER + SPECIAL_ORDER. A2A POs are excluded because
    // they represent inbound orders from Brain, not replenishment automation.
    private get _automationPct(): number | null {
        const r = this.sourceSummary.REORDER ?? 0;
        const m = this.sourceSummary.MANUAL ?? 0;
        const so = this.sourceSummary.SPECIAL_ORDER ?? 0;
        const denom = r + m + so;
        if (denom === 0) return null;
        return Math.round((r / denom) * 100);
    }

    private async _handleGenerateReorders() {
        this.loading = true;
        try {
            const res = await PurchaseOrderService.generateReorders();
            ToastService.show(`Generated ${res.count} draft purchase orders`, 'success');
            this._loadData();
        } catch (err) {
            console.error(err);
            ToastService.show('Failed to generate reorders', 'error');
            this.loading = false;
        }
    }

    render() {
        return html`
            <div class="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-8">
                <div>
                    <h1 class="text-3xl font-bold text-white flex items-center gap-3">
                        ${icon(Truck, 32, 'w-8 h-8 text-gable-green')}
                        Purchasing
                    </h1>
                    <p class="text-zinc-500 mt-1">Purchase orders, receiving, and reorder alerts</p>
                </div>
                <button
                    @click=${() => router.navigate('/purchasing/new')}
                    class="flex items-center gap-2 bg-[#00FFA3] text-black font-semibold px-4 py-2 rounded hover:shadow-[0_0_10px_rgba(0,255,163,0.3)] transition-all"
                >
                    ${icon(Plus, 16, 'w-4 h-4')}
                    New Purchase Order
                </button>
            </div>

            ${this._automationPct !== null ? html`
                <div class="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
                    <div class="backdrop-blur-md bg-white/5 border border-emerald-500/20 rounded-xl p-4">
                        <p class="text-xs uppercase tracking-wider text-zinc-500">% Automated</p>
                        <p class="text-2xl font-bold text-emerald-300 font-mono">${this._automationPct}%</p>
                    </div>
                    <div class="backdrop-blur-md bg-white/5 border border-white/10 rounded-xl p-4">
                        <p class="text-xs uppercase tracking-wider text-zinc-500">Reorder POs</p>
                        <p class="text-2xl font-bold text-white font-mono">${this.sourceSummary.REORDER ?? 0}</p>
                    </div>
                    <div class="backdrop-blur-md bg-white/5 border border-white/10 rounded-xl p-4">
                        <p class="text-xs uppercase tracking-wider text-zinc-500">Manual POs</p>
                        <p class="text-2xl font-bold text-white font-mono">${this.sourceSummary.MANUAL ?? 0}</p>
                    </div>
                    <div class="backdrop-blur-md bg-white/5 border border-white/10 rounded-xl p-4">
                        <p class="text-xs uppercase tracking-wider text-zinc-500">Special / A2A</p>
                        <p class="text-2xl font-bold text-white font-mono">${(this.sourceSummary.SPECIAL_ORDER ?? 0) + (this.sourceSummary.A2A ?? 0)}</p>
                    </div>
                </div>
            ` : nothing}

            ${this.alerts.length > 0 ? html`
                <div class="backdrop-blur-md bg-white/5 border border-amber-500/20 rounded-xl mb-6">
                    <div class="p-4">
                        <div class="flex justify-between items-center mb-3">
                            <h2 class="text-sm font-bold text-amber-400 uppercase tracking-wider flex items-center gap-2">
                                ${icon(AlertTriangle, 16, 'w-4 h-4')}
                                Reorder Alerts (${this.alerts.length})
                            </h2>
                            <button
                                @click=${this._handleGenerateReorders}
                                class="text-xs bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 px-3 py-1.5 rounded transition-colors uppercase font-bold tracking-wide"
                            >
                                Generate Replenishment POs
                            </button>
                        </div>
                        <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                            ${this.alerts.map((alert) => html`
                                <div class="bg-amber-500/5 border border-amber-500/10 rounded-lg p-3">
                                    <div class="flex justify-between items-start">
                                        <div>
                                            <span class="font-mono text-white text-sm">${alert.sku}</span>
                                            <p class="text-xs text-zinc-400 mt-0.5">${alert.description}</p>
                                        </div>
                                        <span class="text-amber-400 font-mono text-sm font-bold">
                                            -${alert.deficit.toFixed(0)}
                                        </span>
                                    </div>
                                    <div class="flex justify-between text-xs text-zinc-500 mt-2">
                                        <span>Stock: ${alert.current_stock}</span>
                                        <span>Reorder at: ${alert.reorder_point}</span>
                                        <span>Order: ${alert.reorder_qty}</span>
                                    </div>
                                </div>
                            `)}
                        </div>
                    </div>
                </div>
            ` : nothing}

            <div class="backdrop-blur-md bg-white/5 border border-white/10 rounded-xl">
                <div class="p-0">
                    ${this.loading ? html`
                        <div class="p-12 flex justify-center">
                            <div class="animate-spin rounded-full h-8 w-8 border-b-2 border-gable-green"></div>
                        </div>
                    ` : this.pos.length === 0 ? html`
                        <div class="p-12 text-center text-zinc-500">
                            ${icon(Package, 48, 'w-12 h-12 mx-auto mb-3 opacity-30')}
                            <p>No purchase orders yet</p>
                        </div>
                    ` : html`
                        <table class="w-full text-sm text-left">
                            <thead class="bg-white/5 text-zinc-400 uppercase tracking-wider text-xs font-semibold">
                                <tr>
                                    <th class="px-6 py-4">PO #</th>
                                    <th class="px-6 py-4">Status</th>
                                    <th class="px-6 py-4">Source</th>
                                    <th class="px-6 py-4 text-right">Lines</th>
                                    <th class="px-6 py-4 text-right">Total Cost</th>
                                    <th class="px-6 py-4">Created</th>
                                </tr>
                            </thead>
                            <tbody class="divide-y divide-white/5">
                                ${this.pos.map((po) => html`
                                    <tr
                                        @click=${() => router.navigate(`/purchasing/${po.id}`)}
                                        class="hover:bg-white/5 cursor-pointer transition-colors"
                                    >
                                        <td class="px-6 py-4 font-mono text-white">
                                            ${po.id.slice(0, 8)}...
                                        </td>
                                        <td class="px-6 py-4">
                                            <span class="px-2 py-0.5 rounded text-xs font-bold uppercase border ${statusColors[po.status] || statusColors.DRAFT}">
                                                ${po.status}
                                            </span>
                                        </td>
                                        <td class="px-6 py-4">
                                            <span class="px-2 py-0.5 rounded text-xs font-bold uppercase border ${sourceColors[po.source] || sourceColors.MANUAL}">
                                                ${sourceLabels[po.source] || po.source || 'Manual'}
                                            </span>
                                        </td>
                                        <td class="px-6 py-4 text-right font-mono text-zinc-300">
                                            ${po.line_count || 0}
                                        </td>
                                        <td class="px-6 py-4 text-right font-mono text-emerald-400">
                                            $${(po.total_cost || 0).toFixed(2)}
                                        </td>
                                        <td class="px-6 py-4 text-zinc-400">
                                            ${new Date(po.created_at).toLocaleDateString()}
                                        </td>
                                    </tr>
                                `)}
                            </tbody>
                        </table>
                    `}
                </div>
            </div>
        `;
    }
}
