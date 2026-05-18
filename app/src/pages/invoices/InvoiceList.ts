import { LitElement, html } from 'lit';
import { customElement, state } from 'lit/decorators.js';
import { router } from '../../lib/router.ts';
import { InvoiceService } from '../../services/InvoiceService.ts';
import type { Invoice } from '../../types/invoice.ts';
import { onBranchChanged } from '../../lib/branch-listener.ts';

@customElement('gable-invoice-list')
export class GableInvoiceList extends LitElement {
    createRenderRoot() { return this; }

    @state() private invoices: Invoice[] = [];
    @state() private loading = true;
    @state() private error: string | null = null;
    private _unsubBranch: (() => void) | null = null;

    connectedCallback() {
        super.connectedCallback();
        this.loadInvoices();
        this._unsubBranch = onBranchChanged(() => this.loadInvoices());
    }

    disconnectedCallback() {
        super.disconnectedCallback();
        if (this._unsubBranch) {
            this._unsubBranch();
            this._unsubBranch = null;
        }
    }

    private async loadInvoices() {
        try {
            this.error = null;
            this.loading = true;
            const data = await InvoiceService.listInvoices();
            this.invoices = data;
        } catch (err) {
            console.error('Failed to load invoices:', err);
            this.error = err instanceof Error ? err.message : 'Failed to load invoices';
        } finally {
            this.loading = false;
        }
    }

    private getStatusClass(status: string): string {
        if (status === 'UNPAID') return 'bg-amber-500/10 text-amber-500 border-amber-500/20';
        if (status === 'PAID') return 'bg-emerald-500/10 text-emerald-500 border-emerald-500/20';
        if (status === 'OVERDUE') return 'bg-red-500/10 text-red-500 border-red-500/20';
        return '';
    }

    render() {
        if (this.loading) {
            return html`<div class="text-white">Loading financials...</div>`;
        }

        if (this.error) {
            return html`
                <div class="flex flex-col items-center justify-center min-h-[400px] p-8">
                    <p class="text-rose-400 text-lg font-semibold mb-2">Failed to load</p>
                    <p class="text-gray-400 text-sm mb-4">${this.error}</p>
                    <button
                        @click=${() => { this.error = null; this.loadInvoices(); }}
                        class="px-4 py-2 bg-[#00FFA3] text-[#0A0B10] rounded font-medium hover:opacity-90"
                    >
                        Retry
                    </button>
                </div>
            `;
        }

        return html`
            <div class="space-y-6">
                <div class="flex items-center justify-between pb-6 border-b border-white/10">
                    <h1 class="text-3xl font-bold tracking-tight text-white">Invoices</h1>
                </div>

                <div class="w-full overflow-hidden border border-zinc-800 rounded-lg bg-zinc-900 text-sm">
                    <div class="overflow-x-auto">
                        <table class="w-full text-left text-zinc-400" aria-label="Invoices list">
                            <thead class="bg-zinc-950 text-zinc-200 uppercase tracking-wider text-xs font-semibold">
                                <tr>
                                    <th class="px-6 py-3 border-b border-zinc-800">Invoice ID</th>
                                    <th class="px-6 py-3 border-b border-zinc-800">Order ID</th>
                                    <th class="px-6 py-3 border-b border-zinc-800">Customer</th>
                                    <th class="px-6 py-3 border-b border-zinc-800 text-right">Amount</th>
                                    <th class="px-6 py-3 border-b border-zinc-800">Status</th>
                                    <th class="px-6 py-3 border-b border-zinc-800">Date</th>
                                </tr>
                            </thead>
                            <tbody class="divide-y divide-zinc-800">
                                ${this.invoices.length === 0 ? html`
                                    <tr><td colspan="6" class="px-6 py-8 text-center text-zinc-600">No invoices generated yet.</td></tr>
                                ` : this.invoices.map(inv => html`
                                    <tr
                                        @click=${() => router.navigate(`/invoices/${inv.id}`)}
                                        class="hover:bg-zinc-800/50 transition-colors cursor-pointer"
                                    >
                                        <td class="px-6 py-3 font-mono text-zinc-100">${inv.id.slice(0, 8)}</td>
                                        <td class="px-6 py-3 font-mono text-zinc-400">${inv.order_id.slice(0, 8)}</td>
                                        <td class="px-6 py-3 text-zinc-300">${inv.customer_name || inv.customer_id.slice(0, 8)}</td>
                                        <td class="px-6 py-3 text-right font-mono text-emerald-400 font-medium">
                                            $${inv.total_amount.toFixed(2)}
                                        </td>
                                        <td class="px-6 py-3">
                                            <span class="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium border ${this.getStatusClass(inv.status)}">
                                                ${inv.status}
                                            </span>
                                        </td>
                                        <td class="px-6 py-3 text-zinc-500">
                                            ${new Date(inv.created_at).toLocaleDateString()}
                                        </td>
                                    </tr>
                                `)}
                            </tbody>
                        </table>
                    </div>
                </div>
            </div>
        `;
    }
}
