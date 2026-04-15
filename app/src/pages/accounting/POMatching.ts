import { LitElement, html, nothing } from 'lit';
import { customElement, state } from 'lit/decorators.js';
import { ToastService } from '../../lib/toast-service.ts';
import type { MatchResult, MatchException, MatchConfig } from '../../types/matching';
import { runMatch, listExceptions, getMatchConfig, updateMatchConfig, getMatchResult } from '../../services/MatchingService';

@customElement('gable-po-matching')
export class POMatching extends LitElement {
    createRenderRoot() { return this; }

    @state() private exceptions: MatchException[] = [];
    @state() private config: MatchConfig | null = null;
    @state() private selectedResult: MatchResult | null = null;
    @state() private loading = true;
    @state() private runPoId = '';
    @state() private message = '';

    connectedCallback() {
        super.connectedCallback();
        this._loadData();
    }

    private async _loadData() {
        try {
            this.loading = true;
            const [exc, cfg] = await Promise.all([listExceptions(), getMatchConfig()]);
            this.exceptions = exc;
            this.config = cfg;
        } catch (err) {
            console.error('Failed to load matching data:', err);
            ToastService.show('Failed to load PO matching data', 'error');
        } finally {
            this.loading = false;
        }
    }

    private async _handleRunMatch() {
        if (!this.runPoId.trim()) return;
        try {
            this.message = 'Running 3-way match...';
            const result = await runMatch(this.runPoId.trim());
            this.selectedResult = result;
            this.message = `Match complete: ${result.status}`;
            this._loadData();
        } catch (err: unknown) {
            this.message = `Error: ${err instanceof Error ? err.message : 'Unknown error'}`;
        }
    }

    private async _handleViewResult(poId: string) {
        try {
            const result = await getMatchResult(poId);
            this.selectedResult = result;
        } catch (err) {
            console.error('Failed to load result:', err);
            ToastService.show('Failed to load match result', 'error');
        }
    }

    private async _handleUpdateConfig(field: string, value: number | boolean) {
        if (!this.config) return;
        try {
            const updated = await updateMatchConfig({ [field]: value });
            this.config = updated;
            this.message = 'Config updated';
        } catch (err: unknown) {
            this.message = `Error: ${err instanceof Error ? err.message : 'Unknown error'}`;
        }
    }

    private _formatCents(cents: number) {
        return `$${(cents / 100).toFixed(2)}`;
    }

    private _formatPct(pct: number) {
        return `${pct.toFixed(2)}%`;
    }

    private _statusBadgeClass(status: string) {
        const colors: Record<string, string> = {
            MATCHED: '#22c55e',
            PARTIAL: '#eab308',
            EXCEPTION: '#ef4444',
            PENDING: '#6b7280',
        };
        return colors[status] || '#6b7280';
    }

    render() {
        if (this.loading) {
            return html`<div class="p-8 text-center text-slate-400">Loading matching data...</div>`;
        }

        return html`
            <div class="p-8 max-w-[1280px] mx-auto">
                <div class="flex justify-between items-center mb-6">
                    <h1 class="text-2xl font-bold text-slate-100">3-Way PO Matching</h1>
                </div>

                ${this.message ? html`
                    <div class="px-4 py-2.5 mb-4 rounded-lg text-sm ${this.message.startsWith('Error') ? 'bg-red-500/15 text-red-400 border border-red-500/20' : 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/20'}">
                        ${this.message}
                    </div>
                ` : nothing}

                <!-- Run Match Section -->
                <div class="bg-slate-800 rounded-xl p-5 mb-6 border border-slate-700">
                    <h2 class="text-base font-semibold text-slate-200 mb-3">Run Match</h2>
                    <div class="flex gap-3">
                        <input
                            type="text"
                            placeholder="Enter PO ID (UUID)"
                            .value=${this.runPoId}
                            @input=${(e: Event) => this.runPoId = (e.target as HTMLInputElement).value}
                            class="flex-1 px-3 py-2 rounded-lg border border-slate-600 bg-slate-900 text-slate-200 text-sm focus:border-blue-500 outline-none"
                        />
                        <button
                            @click=${this._handleRunMatch}
                            class="px-5 py-2 rounded-lg bg-blue-600 text-white font-semibold text-sm hover:bg-blue-500 transition-colors"
                        >
                            Run 3-Way Match
                        </button>
                    </div>
                </div>

                <!-- Config Section -->
                ${this.config ? html`
                    <div class="bg-slate-800 rounded-xl p-5 mb-6 border border-slate-700">
                        <h2 class="text-base font-semibold text-slate-200 mb-3">Tolerance Settings</h2>
                        <div class="grid grid-cols-4 gap-4">
                            <div>
                                <label class="text-xs text-slate-400 block mb-1">Qty Tolerance %</label>
                                <input
                                    type="number"
                                    step="0.5"
                                    .value=${String(this.config.qty_tolerance_pct)}
                                    @change=${(e: Event) => this._handleUpdateConfig('qty_tolerance_pct', parseFloat((e.target as HTMLInputElement).value))}
                                    class="w-full px-2.5 py-1.5 rounded border border-slate-600 bg-slate-900 text-slate-200 text-sm focus:border-blue-500 outline-none"
                                />
                            </div>
                            <div>
                                <label class="text-xs text-slate-400 block mb-1">Price Tolerance %</label>
                                <input
                                    type="number"
                                    step="0.5"
                                    .value=${String(this.config.price_tolerance_pct)}
                                    @change=${(e: Event) => this._handleUpdateConfig('price_tolerance_pct', parseFloat((e.target as HTMLInputElement).value))}
                                    class="w-full px-2.5 py-1.5 rounded border border-slate-600 bg-slate-900 text-slate-200 text-sm focus:border-blue-500 outline-none"
                                />
                            </div>
                            <div>
                                <label class="text-xs text-slate-400 block mb-1">Dollar Tolerance</label>
                                <input
                                    type="number"
                                    step="1"
                                    .value=${(this.config.dollar_tolerance / 100).toFixed(2)}
                                    @change=${(e: Event) => this._handleUpdateConfig('dollar_tolerance', Math.round(parseFloat((e.target as HTMLInputElement).value) * 100))}
                                    class="w-full px-2.5 py-1.5 rounded border border-slate-600 bg-slate-900 text-slate-200 text-sm focus:border-blue-500 outline-none"
                                />
                            </div>
                            <div>
                                <label class="text-xs text-slate-400 block mb-1">Auto-Approve</label>
                                <button
                                    @click=${() => this._handleUpdateConfig('auto_approve_on_match', !this.config!.auto_approve_on_match)}
                                    class="w-full px-2.5 py-1.5 rounded border border-slate-600 font-semibold text-sm transition-colors ${this.config.auto_approve_on_match ? 'bg-emerald-500/15 text-emerald-400' : 'bg-slate-900 text-slate-400'}"
                                >
                                    ${this.config.auto_approve_on_match ? 'ON' : 'OFF'}
                                </button>
                            </div>
                        </div>
                    </div>
                ` : nothing}

                <!-- Exceptions Table -->
                <div class="bg-slate-800 rounded-xl p-5 mb-6 border border-slate-700">
                    <h2 class="text-base font-semibold text-slate-200 mb-3">
                        Exceptions (${this.exceptions.length})
                    </h2>
                    ${this.exceptions.length === 0 ? html`
                        <p class="text-slate-500">No exceptions found. All matches are clean.</p>
                    ` : html`
                        <table class="w-full text-sm">
                            <thead>
                                <tr class="border-b border-slate-700 text-xs font-semibold text-slate-500 uppercase tracking-wider">
                                    <th class="text-left px-3 py-2">PO ID</th>
                                    <th class="text-left px-3 py-2">Status</th>
                                    <th class="text-left px-3 py-2">Lines</th>
                                    <th class="text-left px-3 py-2">Exceptions</th>
                                    <th class="text-left px-3 py-2">Notes</th>
                                    <th class="text-left px-3 py-2">Date</th>
                                    <th class="text-left px-3 py-2">Actions</th>
                                </tr>
                            </thead>
                            <tbody>
                                ${this.exceptions.map(e => html`
                                    <tr class="border-b border-slate-800">
                                        <td class="px-3 py-2.5">
                                            <code class="text-xs text-slate-400">${e.po_id.substring(0, 8)}...</code>
                                        </td>
                                        <td class="px-3 py-2.5">
                                            <span class="inline-block px-2.5 py-0.5 rounded-full text-xs font-semibold text-white" style="background:${this._statusBadgeClass(e.status)}">
                                                ${e.status}
                                            </span>
                                        </td>
                                        <td class="px-3 py-2.5 text-slate-300">${e.line_count}</td>
                                        <td class="px-3 py-2.5 text-red-400 font-semibold">${e.exception_count}</td>
                                        <td class="px-3 py-2.5 text-slate-400 text-xs">${e.notes}</td>
                                        <td class="px-3 py-2.5 text-slate-400 text-xs">${new Date(e.created_at).toLocaleDateString()}</td>
                                        <td class="px-3 py-2.5">
                                            <button
                                                @click=${() => this._handleViewResult(e.po_id)}
                                                class="px-3 py-1 rounded border border-slate-600 text-blue-400 text-xs hover:bg-blue-500/10 transition-colors"
                                            >
                                                View Details
                                            </button>
                                        </td>
                                    </tr>
                                `)}
                            </tbody>
                        </table>
                    `}
                </div>

                <!-- Selected Match Result Detail -->
                ${this.selectedResult ? html`
                    <div class="bg-slate-800 rounded-xl p-5 border border-slate-700">
                        <div class="flex justify-between items-center mb-4">
                            <h2 class="text-base font-semibold text-slate-200">
                                Match Detail: PO ${this.selectedResult.po_id.substring(0, 8)}...
                            </h2>
                            <span class="inline-block px-2.5 py-0.5 rounded-full text-xs font-semibold text-white" style="background:${this._statusBadgeClass(this.selectedResult.status)}">
                                ${this.selectedResult.status}
                            </span>
                        </div>
                        <p class="text-sm text-slate-400 mb-4">${this.selectedResult.notes}</p>

                        ${this.selectedResult.lines && this.selectedResult.lines.length > 0 ? html`
                            <table class="w-full text-sm">
                                <thead>
                                    <tr class="border-b border-slate-700 text-xs font-semibold text-slate-500 uppercase tracking-wider">
                                        <th class="text-left px-3 py-2">Description</th>
                                        <th class="text-left px-3 py-2">PO Qty</th>
                                        <th class="text-left px-3 py-2">Received</th>
                                        <th class="text-left px-3 py-2">Invoiced</th>
                                        <th class="text-left px-3 py-2">PO Cost</th>
                                        <th class="text-left px-3 py-2">Inv Price</th>
                                        <th class="text-left px-3 py-2">Qty Var</th>
                                        <th class="text-left px-3 py-2">Price Var</th>
                                        <th class="text-left px-3 py-2">Status</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    ${this.selectedResult.lines.map(line => html`
                                        <tr class="border-b border-slate-800 ${line.line_status === 'EXCEPTION' ? 'bg-red-500/5' : ''}">
                                            <td class="px-3 py-2.5 text-slate-300">${line.description}</td>
                                            <td class="px-3 py-2.5 text-slate-300 font-mono">${line.po_qty}</td>
                                            <td class="px-3 py-2.5 text-slate-300 font-mono">${line.received_qty}</td>
                                            <td class="px-3 py-2.5 text-slate-300 font-mono">${line.invoiced_qty}</td>
                                            <td class="px-3 py-2.5 text-slate-300 font-mono">${this._formatCents(line.po_unit_cost)}</td>
                                            <td class="px-3 py-2.5 text-slate-300 font-mono">${this._formatCents(line.invoice_unit_price)}</td>
                                            <td class="px-3 py-2.5 font-mono ${Math.abs(line.qty_variance_pct) > 0 ? 'text-yellow-400' : 'text-emerald-400'}">
                                                ${this._formatPct(line.qty_variance_pct)}
                                            </td>
                                            <td class="px-3 py-2.5 font-mono ${Math.abs(line.price_variance_pct) > 2 ? 'text-red-400' : 'text-emerald-400'}">
                                                ${this._formatPct(line.price_variance_pct)}
                                            </td>
                                            <td class="px-3 py-2.5">
                                                <span class="inline-block px-2.5 py-0.5 rounded-full text-xs font-semibold text-white" style="background:${this._statusBadgeClass(line.line_status)}">
                                                    ${line.line_status}
                                                </span>
                                            </td>
                                        </tr>
                                    `)}
                                </tbody>
                            </table>
                        ` : nothing}
                    </div>
                ` : nothing}
            </div>
        `;
    }
}

export default POMatching;
