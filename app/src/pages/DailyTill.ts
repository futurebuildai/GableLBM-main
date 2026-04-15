import { LitElement, html } from 'lit';
import { customElement, state } from 'lit/decorators.js';
import { icon } from '../lib/icons.ts';
import { ToastService } from '../lib/toast-service.ts';
import { ReportingService } from '../services/ReportingService.ts';
import type { DailyTillReport, SalesSummaryReport } from '../types/reporting.ts';
import { DollarSign, CreditCard, BarChart2 } from 'lucide';

@customElement('gable-daily-till')
export class GableDailyTill extends LitElement {
    createRenderRoot() { return this; }

    @state() private till: DailyTillReport | null = null;
    @state() private summary: SalesSummaryReport | null = null;
    @state() private loading = true;

    connectedCallback() {
        super.connectedCallback();
        this.loadData();
    }

    private async loadData() {
        try {
            const [tillData, summaryData] = await Promise.all([
                ReportingService.getDailyTill(),
                ReportingService.getSalesSummary()
            ]);
            this.till = tillData;
            this.summary = summaryData;
        } catch (error) {
            console.error(error);
            ToastService.show('Failed to load daily till data', 'error');
        } finally {
            this.loading = false;
        }
    }

    render() {
        if (this.loading || !this.till || !this.summary) {
            return html`<div class="text-white p-8">Crunching numbers...</div>`;
        }

        const till = this.till;
        const summary = this.summary;
        const collectionRate = summary.total_invoiced ? (summary.total_collected / summary.total_invoiced) * 100 : 0;

        return html`
            <div class="space-y-8 max-w-6xl mx-auto p-8 pb-20">
                <div>
                    <h1 class="text-3xl font-bold font-mono text-white mb-2">Financial Dashboard</h1>
                    <p class="text-zinc-400">Daily Till & Sales Summary</p>
                </div>

                <!-- Daily Till Section -->
                <div class="grid grid-cols-1 lg:grid-cols-2 gap-8">
                    <!-- Till Card -->
                    <div class="bg-zinc-900 border border-zinc-800 rounded-lg p-6">
                        <div class="flex items-center justify-between mb-6">
                            <h2 class="text-xl font-bold text-emerald-400 flex items-center gap-2">
                                ${icon(DollarSign, 24)} Daily Till (${till.date})
                            </h2>
                            <span class="text-3xl font-mono font-bold text-white">
                                $${till.total_collected.toFixed(2)}
                            </span>
                        </div>

                        <div class="space-y-4">
                            ${Object.entries(till.by_method).map(([method, amount]) => html`
                                <div class="flex items-center justify-between p-4 bg-black/20 rounded border border-white/5">
                                    <div class="flex items-center gap-3">
                                        <div class="p-2 bg-zinc-800 rounded text-zinc-400">
                                            ${icon(CreditCard, 18)}
                                        </div>
                                        <span class="font-bold text-zinc-200">${method}</span>
                                    </div>
                                    <span class="font-mono text-xl text-white">$${(amount as number).toFixed(2)}</span>
                                </div>
                            `)}
                        </div>

                        <div class="mt-6 pt-6 border-t border-zinc-800 text-center text-zinc-500 text-sm">
                            ${till.transaction_count} Transactions Today
                        </div>
                    </div>

                    <!-- Sales Summary Card (30 Days) -->
                    <div class="bg-zinc-900 border border-zinc-800 rounded-lg p-6">
                        <div class="flex items-center justify-between mb-6">
                            <h2 class="text-xl font-bold text-blue-400 flex items-center gap-2">
                                ${icon(BarChart2, 24)} Sales Performance (30 Days)
                            </h2>
                        </div>

                        <div class="grid grid-cols-2 gap-4">
                            <div class="p-4 bg-black/20 rounded border border-white/5">
                                <span class="block text-zinc-400 text-sm uppercase font-bold mb-1">Total Invoiced</span>
                                <span class="block text-2xl font-mono text-white">$${summary.total_invoiced.toFixed(2)}</span>
                            </div>
                            <div class="p-4 bg-black/20 rounded border border-white/5">
                                <span class="block text-zinc-400 text-sm uppercase font-bold mb-1">Total Collected</span>
                                <span class="block text-2xl font-mono text-emerald-400">$${summary.total_collected.toFixed(2)}</span>
                            </div>
                            <div class="p-4 bg-black/20 rounded border border-white/5 col-span-2">
                                <div class="flex justify-between items-center">
                                    <span class="block text-zinc-400 text-sm uppercase font-bold">Outstanding AR (Period)</span>
                                    <span class="block text-2xl font-mono text-amber-500">$${summary.outstanding_ar.toFixed(2)}</span>
                                </div>
                                <div class="w-full bg-zinc-800 h-2 mt-3 rounded-full overflow-hidden">
                                    <div
                                        class="h-full bg-emerald-500 transition-all duration-500"
                                        style="width: ${collectionRate}%"
                                    ></div>
                                </div>
                                <div class="flex justify-between mt-1 text-xs text-zinc-500">
                                    <span>Collection Rate</span>
                                    <span>${collectionRate.toFixed(1)}%</span>
                                </div>
                            </div>
                        </div>

                        <div class="mt-6 pt-6 border-t border-zinc-800 text-center text-zinc-500 text-sm">
                            ${summary.invoice_count} Invoices Generated
                        </div>
                    </div>
                </div>
            </div>
        `;
    }
}
