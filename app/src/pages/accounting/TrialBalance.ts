import { LitElement, html, nothing } from 'lit';
import { customElement, state } from 'lit/decorators.js';
import { icon } from '../../lib/icons.ts';
import { ToastService } from '../../lib/toast-service.ts';
import { fetchTrialBalance } from '../../services/GLService';
import type { TrialBalanceRow } from '../../types/gl';
import { BarChart3 } from 'lucide';

const TYPE_ORDER = ['ASSET', 'LIABILITY', 'EQUITY', 'REVENUE', 'EXPENSE'];
const TYPE_LABELS: Record<string, string> = {
    ASSET: 'Assets',
    LIABILITY: 'Liabilities',
    EQUITY: 'Equity',
    REVENUE: 'Revenue',
    EXPENSE: 'Expenses',
};
const TYPE_COLORS: Record<string, string> = {
    ASSET: 'text-blue-400',
    LIABILITY: 'text-red-400',
    EQUITY: 'text-purple-400',
    REVENUE: 'text-emerald-400',
    EXPENSE: 'text-amber-400',
};

@customElement('gable-trial-balance')
export class TrialBalance extends LitElement {
    createRenderRoot() { return this; }

    @state() private rows: TrialBalanceRow[] = [];
    @state() private loading = true;
    @state() private asOfDate = new Date().toISOString().split('T')[0];

    connectedCallback() {
        super.connectedCallback();
        this._load();
    }

    private async _load() {
        this.loading = true;
        try {
            const data = await fetchTrialBalance(this.asOfDate);
            this.rows = data || [];
        } catch (err) {
            console.error(err);
            ToastService.show('Failed to load trial balance', 'error');
        } finally {
            this.loading = false;
        }
    }

    private _formatCents(cents: number) {
        if (cents === 0) return '--';
        return `$${(cents / 100).toLocaleString('en-US', { minimumFractionDigits: 2 })}`;
    }

    private get _totalDebit() {
        return this.rows.reduce((sum, r) => sum + r.debit, 0);
    }

    private get _totalCredit() {
        return this.rows.reduce((sum, r) => sum + r.credit, 0);
    }

    private get _isBalanced() {
        return this._totalDebit === this._totalCredit;
    }

    render() {
        const groupedRows = TYPE_ORDER.reduce((acc, type) => {
            acc[type] = this.rows.filter(r => r.account_type === type);
            return acc;
        }, {} as Record<string, TrialBalanceRow[]>);

        return html`
            <div class="p-6 max-w-[1200px] mx-auto space-y-6 animate-in fade-in duration-500">
                <div class="flex justify-between items-center">
                    <div>
                        <h1 class="text-2xl font-bold bg-gradient-to-r from-white to-zinc-400 bg-clip-text text-transparent">
                            Trial Balance
                        </h1>
                        <p class="text-zinc-400 mt-1">
                            Summary of all posted GL account balances
                        </p>
                    </div>
                    <div class="flex items-center gap-3">
                        <label class="text-sm text-zinc-400">As of:</label>
                        <input
                            type="date"
                            class="bg-zinc-800 border border-zinc-700 rounded px-3 py-2 text-white text-sm focus:border-emerald-500 outline-none"
                            .value=${this.asOfDate}
                            @change=${(e: Event) => { this.asOfDate = (e.target as HTMLInputElement).value; this._load(); }}
                        />
                    </div>
                </div>

                <!-- Balance Summary Cards -->
                <div class="grid grid-cols-3 gap-4">
                    <div class="backdrop-blur-md bg-white/5 border border-white/10 rounded-xl text-center">
                        <div class="py-4">
                            <p class="text-xs text-zinc-500 uppercase tracking-wider mb-1">Total Debits</p>
                            <p class="text-2xl font-bold font-mono text-blue-400">${this._formatCents(this._totalDebit)}</p>
                        </div>
                    </div>
                    <div class="backdrop-blur-md bg-white/5 border border-white/10 rounded-xl text-center">
                        <div class="py-4">
                            <p class="text-xs text-zinc-500 uppercase tracking-wider mb-1">Total Credits</p>
                            <p class="text-2xl font-bold font-mono text-rose-400">${this._formatCents(this._totalCredit)}</p>
                        </div>
                    </div>
                    <div class="backdrop-blur-md bg-white/5 border ${this._isBalanced ? 'border-emerald-500/30' : 'border-red-500/30'} rounded-xl text-center">
                        <div class="py-4">
                            <p class="text-xs text-zinc-500 uppercase tracking-wider mb-1">Status</p>
                            <p class="text-2xl font-bold ${this._isBalanced ? 'text-emerald-400' : 'text-red-400'}">
                                ${this._isBalanced ? 'Balanced' : 'Out of Balance'}
                            </p>
                            ${!this._isBalanced ? html`
                                <p class="text-xs text-red-400/70 mt-1 font-mono">
                                    Diff: ${this._formatCents(Math.abs(this._totalDebit - this._totalCredit))}
                                </p>
                            ` : nothing}
                        </div>
                    </div>
                </div>

                <!-- Trial Balance Table -->
                ${this.loading ? html`
                    <div class="p-8 text-center text-zinc-400">Loading trial balance...</div>
                ` : this.rows.length === 0 ? html`
                    <div class="text-center py-20 bg-zinc-900/50 rounded-lg border border-zinc-800 border-dashed">
                        ${icon(BarChart3, 48, 'w-12 h-12 text-zinc-600 mx-auto mb-4')}
                        <h3 class="text-lg font-medium text-white">No Journal Activity</h3>
                        <p class="text-zinc-400 mt-2 max-w-sm mx-auto">
                            Post journal entries to see balances in the trial balance report.
                        </p>
                    </div>
                ` : html`
                    <div class="backdrop-blur-md bg-white/5 border border-white/10 rounded-xl overflow-hidden">
                        <div class="p-0">
                            <table class="w-full text-sm">
                                <thead>
                                    <tr class="border-b border-white/10 text-zinc-400">
                                        <th class="text-left px-4 py-3 font-medium w-24">Code</th>
                                        <th class="text-left px-4 py-3 font-medium">Account</th>
                                        <th class="text-right px-4 py-3 font-medium w-40">Debit</th>
                                        <th class="text-right px-4 py-3 font-medium w-40">Credit</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    ${TYPE_ORDER.map(type => {
                                        const typeRows = groupedRows[type];
                                        if (!typeRows || typeRows.length === 0) return nothing;
                                        const typeDebit = typeRows.reduce((s, r) => s + r.debit, 0);
                                        const typeCredit = typeRows.reduce((s, r) => s + r.credit, 0);
                                        return html`
                                            <tr class="bg-white/[0.02]">
                                                <td colspan="4" class="px-4 py-2 font-bold text-xs uppercase tracking-wider ${TYPE_COLORS[type]}">
                                                    ${TYPE_LABELS[type]}
                                                </td>
                                            </tr>
                                            ${typeRows.map(row => html`
                                                <tr class="border-b border-white/5 hover:bg-white/[0.02] transition-colors">
                                                    <td class="px-4 py-2.5 font-mono text-emerald-400 pl-8">${row.account_code}</td>
                                                    <td class="px-4 py-2.5 text-white">${row.account_name}</td>
                                                    <td class="px-4 py-2.5 text-right font-mono text-zinc-200">${row.debit > 0 ? this._formatCents(row.debit) : '--'}</td>
                                                    <td class="px-4 py-2.5 text-right font-mono text-zinc-200">${row.credit > 0 ? this._formatCents(row.credit) : '--'}</td>
                                                </tr>
                                            `)}
                                            <tr class="border-b border-white/10">
                                                <td colspan="2" class="px-4 py-1.5 text-xs text-zinc-500 text-right">
                                                    Subtotal ${TYPE_LABELS[type]}:
                                                </td>
                                                <td class="px-4 py-1.5 text-right font-mono text-xs text-zinc-400 border-t border-white/5">
                                                    ${typeDebit > 0 ? this._formatCents(typeDebit) : '--'}
                                                </td>
                                                <td class="px-4 py-1.5 text-right font-mono text-xs text-zinc-400 border-t border-white/5">
                                                    ${typeCredit > 0 ? this._formatCents(typeCredit) : '--'}
                                                </td>
                                            </tr>
                                        `;
                                    })}
                                    <!-- Grand Total -->
                                    <tr class="font-bold ${this._isBalanced ? 'bg-emerald-500/5' : 'bg-red-500/5'}">
                                        <td colspan="2" class="px-4 py-3 text-right text-white uppercase text-xs tracking-wider">
                                            Total
                                        </td>
                                        <td class="px-4 py-3 text-right font-mono text-lg ${this._isBalanced ? 'text-emerald-400' : 'text-red-400'}">
                                            ${this._formatCents(this._totalDebit)}
                                        </td>
                                        <td class="px-4 py-3 text-right font-mono text-lg ${this._isBalanced ? 'text-emerald-400' : 'text-red-400'}">
                                            ${this._formatCents(this._totalCredit)}
                                        </td>
                                    </tr>
                                </tbody>
                            </table>
                        </div>
                    </div>
                `}
            </div>
        `;
    }
}

export default TrialBalance;
