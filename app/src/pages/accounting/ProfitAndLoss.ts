import { LitElement, html } from 'lit';
import { customElement, state } from 'lit/decorators.js';
import { icon } from '../../lib/icons.ts';
import { ToastService } from '../../lib/toast-service.ts';
import { fetchProfitAndLoss } from '../../services/GLService';
import type { ProfitAndLossReport, AccountLineItem } from '../../types/gl';
import { TrendingUp, Printer } from 'lucide';

@customElement('gable-profit-and-loss')
export class ProfitAndLoss extends LitElement {
    createRenderRoot() { return this; }

    @state() private report: ProfitAndLossReport | null = null;
    @state() private loading = true;
    @state() private startDate = (() => {
        const now = new Date();
        return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`;
    })();
    @state() private endDate = new Date().toISOString().split('T')[0];

    connectedCallback() {
        super.connectedCallback();
        this._load();
    }

    private async _load() {
        this.loading = true;
        try {
            this.report = await fetchProfitAndLoss(this.startDate, this.endDate);
        } catch (err) {
            console.error(err);
            ToastService.show('Failed to load Profit & Loss report', 'error');
        } finally {
            this.loading = false;
        }
    }

    private _formatCents(cents: number): string {
        if (cents === 0) return '$0.00';
        const abs = Math.abs(cents);
        const formatted = `$${(abs / 100).toLocaleString('en-US', { minimumFractionDigits: 2 })}`;
        return cents < 0 ? `(${formatted})` : formatted;
    }

    private _amountClasses(cents: number): string {
        if (cents < 0) return 'text-rose-400';
        if (cents > 0) return 'text-emerald-400';
        return 'text-zinc-400';
    }

    private _handlePrint() {
        window.print();
    }

    private _renderAccountLines(items: AccountLineItem[]) {
        if (!items || items.length === 0) {
            return html`
                <tr class="border-b border-white/5">
                    <td colspan="3" class="px-4 py-2 text-zinc-500 italic pl-8">No accounts</td>
                </tr>
            `;
        }
        return items.map(item => html`
            <tr class="border-b border-white/5 hover:bg-white/[0.02] transition-colors">
                <td class="px-4 py-2.5 font-mono text-emerald-400 pl-8">${item.account_code}</td>
                <td class="px-4 py-2.5 text-white">${item.account_name}</td>
                <td class="px-4 py-2.5 text-right font-mono text-zinc-200">${this._formatCents(item.amount)}</td>
            </tr>
        `);
    }

    private _renderSubtotalRow(label: string, amount: number, highlight = false) {
        return html`
            <tr class="border-b border-white/10 ${highlight ? 'bg-white/[0.03]' : ''}">
                <td colspan="2" class="px-4 py-2.5 text-right font-semibold text-sm ${highlight ? 'text-white' : 'text-zinc-400'}">
                    ${label}
                </td>
                <td class="px-4 py-2.5 text-right font-mono font-semibold ${highlight ? 'text-lg' : 'text-sm'} ${this._amountClasses(amount)} border-t border-white/10">
                    ${this._formatCents(amount)}
                </td>
            </tr>
        `;
    }

    render() {
        const report = this.report;

        return html`
            <div class="p-6 max-w-[1200px] mx-auto space-y-6 animate-in fade-in duration-500">
                <div class="flex justify-between items-center">
                    <div>
                        <h1 class="text-2xl font-bold bg-gradient-to-r from-white to-zinc-400 bg-clip-text text-transparent">
                            Profit & Loss
                        </h1>
                        <p class="text-zinc-400 mt-1">
                            Income statement for the selected period
                        </p>
                    </div>
                    <div class="flex items-center gap-3">
                        <label class="text-sm text-zinc-400">From:</label>
                        <input
                            type="date"
                            class="bg-zinc-800 border border-zinc-700 rounded px-3 py-2 text-white text-sm focus:border-emerald-500 outline-none"
                            .value=${this.startDate}
                            @change=${(e: Event) => { this.startDate = (e.target as HTMLInputElement).value; }}
                        />
                        <label class="text-sm text-zinc-400">To:</label>
                        <input
                            type="date"
                            class="bg-zinc-800 border border-zinc-700 rounded px-3 py-2 text-white text-sm focus:border-emerald-500 outline-none"
                            .value=${this.endDate}
                            @change=${(e: Event) => { this.endDate = (e.target as HTMLInputElement).value; }}
                        />
                        <button
                            @click=${() => this._load()}
                            class="px-4 py-2 bg-gable-green/10 text-gable-green border border-gable-green/30 rounded-lg text-sm font-medium hover:bg-gable-green/20 transition-colors"
                        >
                            Generate
                        </button>
                        <button
                            @click=${() => this._handlePrint()}
                            class="p-2 text-zinc-400 hover:text-white hover:bg-white/5 rounded-lg transition-colors"
                            title="Print report"
                        >
                            ${icon(Printer, 18)}
                        </button>
                    </div>
                </div>

                ${this.loading ? html`
                    <div class="p-8 text-center text-zinc-400">Loading Profit & Loss report...</div>
                ` : !report ? html`
                    <div class="text-center py-20 bg-zinc-900/50 rounded-lg border border-zinc-800 border-dashed">
                        ${icon(TrendingUp, 48, 'w-12 h-12 text-zinc-600 mx-auto mb-4')}
                        <h3 class="text-lg font-medium text-white">No Data Available</h3>
                        <p class="text-zinc-400 mt-2 max-w-sm mx-auto">
                            Select a date range and click Generate to view the income statement.
                        </p>
                    </div>
                ` : html`
                    <!-- Summary Cards -->
                    <div class="grid grid-cols-3 gap-4">
                        <div class="backdrop-blur-md bg-white/5 border border-white/10 rounded-xl text-center">
                            <div class="py-4">
                                <p class="text-xs text-zinc-500 uppercase tracking-wider mb-1">Total Revenue</p>
                                <p class="text-2xl font-bold font-mono ${this._amountClasses(report.total_revenue)}">
                                    ${this._formatCents(report.total_revenue)}
                                </p>
                            </div>
                        </div>
                        <div class="backdrop-blur-md bg-white/5 border border-white/10 rounded-xl text-center">
                            <div class="py-4">
                                <p class="text-xs text-zinc-500 uppercase tracking-wider mb-1">Gross Profit</p>
                                <p class="text-2xl font-bold font-mono ${this._amountClasses(report.gross_profit)}">
                                    ${this._formatCents(report.gross_profit)}
                                </p>
                            </div>
                        </div>
                        <div class="backdrop-blur-md bg-white/5 border ${report.net_income >= 0 ? 'border-emerald-500/30' : 'border-red-500/30'} rounded-xl text-center">
                            <div class="py-4">
                                <p class="text-xs text-zinc-500 uppercase tracking-wider mb-1">Net Income</p>
                                <p class="text-2xl font-bold font-mono ${this._amountClasses(report.net_income)}">
                                    ${this._formatCents(report.net_income)}
                                </p>
                            </div>
                        </div>
                    </div>

                    <!-- P&L Detail Table -->
                    <div class="backdrop-blur-md bg-white/5 border border-white/10 rounded-xl overflow-hidden">
                        <div class="p-0">
                            <table class="w-full text-sm">
                                <thead>
                                    <tr class="border-b border-white/10 text-zinc-400">
                                        <th class="text-left px-4 py-3 font-medium w-24">Code</th>
                                        <th class="text-left px-4 py-3 font-medium">Account</th>
                                        <th class="text-right px-4 py-3 font-medium w-48">Amount</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    <!-- Revenue Section -->
                                    <tr class="bg-white/[0.02]">
                                        <td colspan="3" class="px-4 py-2 font-bold text-xs uppercase tracking-wider text-emerald-400">
                                            Revenue
                                        </td>
                                    </tr>
                                    ${this._renderAccountLines(report.revenue)}
                                    ${this._renderSubtotalRow('Total Revenue', report.total_revenue)}

                                    <!-- COGS Section -->
                                    <tr class="bg-white/[0.02]">
                                        <td colspan="3" class="px-4 py-2 font-bold text-xs uppercase tracking-wider text-amber-400">
                                            Cost of Goods Sold
                                        </td>
                                    </tr>
                                    ${this._renderAccountLines(report.cogs)}
                                    ${this._renderSubtotalRow('Total COGS', report.total_cogs)}

                                    <!-- Gross Profit Line -->
                                    ${this._renderSubtotalRow('Gross Profit', report.gross_profit, true)}

                                    <!-- Operating Expenses Section -->
                                    <tr class="bg-white/[0.02]">
                                        <td colspan="3" class="px-4 py-2 font-bold text-xs uppercase tracking-wider text-red-400">
                                            Operating Expenses
                                        </td>
                                    </tr>
                                    ${this._renderAccountLines(report.expenses)}
                                    ${this._renderSubtotalRow('Total Operating Expenses', report.total_expenses)}

                                    <!-- Net Income Line -->
                                    <tr class="font-bold ${report.net_income >= 0 ? 'bg-emerald-500/5' : 'bg-red-500/5'}">
                                        <td colspan="2" class="px-4 py-3 text-right text-white uppercase text-xs tracking-wider">
                                            Net Income
                                        </td>
                                        <td class="px-4 py-3 text-right font-mono text-lg ${this._amountClasses(report.net_income)}">
                                            ${this._formatCents(report.net_income)}
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

export default ProfitAndLoss;
