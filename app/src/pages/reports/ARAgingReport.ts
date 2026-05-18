import { LitElement, html, nothing } from 'lit';
import { customElement, state } from 'lit/decorators.js';
import { icon } from '../../lib/icons.ts';
import { ToastService } from '../../lib/toast-service.ts';
import { ReportingService } from '../../services/ReportingService';
import type { ARAgingReport } from '../../types/invoice';
import { DollarSign } from 'lucide';

@customElement('gable-ar-aging-report')
export class ARAgingReportPage extends LitElement {
    createRenderRoot() { return this; }

    @state() private report: ARAgingReport | null = null;
    @state() private loading = true;

    connectedCallback() {
        super.connectedCallback();
        this._loadReport();
    }

    private async _loadReport() {
        try {
            const data = await ReportingService.getARAgingReport();
            this.report = data;
        } catch (err) {
            console.error(err);
            ToastService.show('Failed to load AR aging report', 'error');
        } finally {
            this.loading = false;
        }
    }

    private _fmt(v: number) {
        return `$${v.toFixed(2)}`;
    }

    render() {
        if (this.loading) {
            return html`
                <div class="p-12 flex justify-center">
                    <div class="animate-spin rounded-full h-8 w-8 border-b-2 border-gable-green"></div>
                </div>
            `;
        }

        return html`
            <div class="mb-8">
                <h1 class="text-3xl font-bold text-white flex items-center gap-3">
                    ${icon(DollarSign, 32, 'w-8 h-8 text-gable-green')}
                    AR Aging Report
                </h1>
                <p class="text-zinc-500 mt-1">
                    Accounts receivable aging as of ${this.report?.as_of_date || 'today'}
                </p>
            </div>

            ${this.report ? html`
                <div class="grid grid-cols-2 md:grid-cols-5 gap-4 mb-6">
                    ${[
                        { label: 'Current (0-30)', value: this.report.total_current, color: 'text-emerald-400' },
                        { label: '31-60 Days', value: this.report.total_31_60, color: 'text-amber-400' },
                        { label: '61-90 Days', value: this.report.total_61_90, color: 'text-orange-400' },
                        { label: '90+ Days', value: this.report.total_over_90, color: 'text-rose-400' },
                        { label: 'Grand Total', value: this.report.grand_total, color: 'text-white' },
                    ].map((item) => html`
                        <div class="backdrop-blur-md bg-white/5 border border-white/10 rounded-xl">
                            <div class="p-4 text-center">
                                <p class="text-xs text-zinc-500 uppercase tracking-wider mb-1">${item.label}</p>
                                <p class="text-xl font-mono font-bold ${item.color}">${this._fmt(item.value)}</p>
                            </div>
                        </div>
                    `)}
                </div>
            ` : nothing}

            <div class="backdrop-blur-md bg-white/5 border border-white/10 rounded-xl">
                <div class="p-0">
                    ${!this.report || this.report.buckets.length === 0 ? html`
                        <div class="p-12 text-center text-zinc-500">No outstanding receivables</div>
                    ` : html`
                        <table class="w-full text-sm text-left">
                            <thead class="bg-white/5 text-zinc-400 uppercase tracking-wider text-xs font-semibold">
                                <tr>
                                    <th class="px-6 py-4">Customer</th>
                                    <th class="px-6 py-4 text-right">Current</th>
                                    <th class="px-6 py-4 text-right">31-60</th>
                                    <th class="px-6 py-4 text-right">61-90</th>
                                    <th class="px-6 py-4 text-right">90+</th>
                                    <th class="px-6 py-4 text-right">Total</th>
                                </tr>
                            </thead>
                            <tbody class="divide-y divide-white/5">
                                ${this.report.buckets.map((bucket) => html`
                                    <tr class="hover:bg-white/5 transition-colors">
                                        <td class="px-6 py-4 text-white font-medium">
                                            ${bucket.customer_name}
                                            <span class="text-zinc-500 text-xs ml-2">(${bucket.customer_id.slice(0, 8)})</span>
                                        </td>
                                        <td class="px-6 py-4 text-right font-mono text-emerald-400">${this._fmt(bucket.current)}</td>
                                        <td class="px-6 py-4 text-right font-mono text-amber-400">${this._fmt(bucket.days_31_60)}</td>
                                        <td class="px-6 py-4 text-right font-mono text-orange-400">${this._fmt(bucket.days_61_90)}</td>
                                        <td class="px-6 py-4 text-right font-mono text-rose-400">${this._fmt(bucket.over_90)}</td>
                                        <td class="px-6 py-4 text-right font-mono text-white font-bold">${this._fmt(bucket.total)}</td>
                                    </tr>
                                `)}
                            </tbody>
                            <tfoot class="bg-white/5 border-t border-white/10">
                                <tr class="font-bold">
                                    <td class="px-6 py-4 text-zinc-400 uppercase text-xs">Totals</td>
                                    <td class="px-6 py-4 text-right font-mono text-emerald-400">${this._fmt(this.report.total_current)}</td>
                                    <td class="px-6 py-4 text-right font-mono text-amber-400">${this._fmt(this.report.total_31_60)}</td>
                                    <td class="px-6 py-4 text-right font-mono text-orange-400">${this._fmt(this.report.total_61_90)}</td>
                                    <td class="px-6 py-4 text-right font-mono text-rose-400">${this._fmt(this.report.total_over_90)}</td>
                                    <td class="px-6 py-4 text-right font-mono text-white">${this._fmt(this.report.grand_total)}</td>
                                </tr>
                            </tfoot>
                        </table>
                    `}
                </div>
            </div>
        `;
    }
}
