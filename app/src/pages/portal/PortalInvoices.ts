import { LitElement, html } from 'lit';
import { customElement, state } from 'lit/decorators.js';
import { icon } from '../../lib/icons.ts';
import { FileText, Download, RefreshCw, AlertTriangle } from 'lucide';
import { PortalService } from '../../services/PortalService';
import type { PortalInvoice } from '../../types/portal';

const formatCurrency = (cents: number): string =>
    new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(cents / 100);

const statusConfig = (status: string): { color: string; bgColor: string } => {
    const map: Record<string, { color: string; bgColor: string }> = {
        PAID: { color: '#00FFA3', bgColor: 'rgba(0,255,163,0.1)' },
        UNPAID: { color: '#F59E0B', bgColor: 'rgba(245,158,11,0.1)' },
        OVERDUE: { color: '#F43F5E', bgColor: 'rgba(244,63,94,0.1)' },
        PARTIAL: { color: '#38BDF8', bgColor: 'rgba(56,189,248,0.1)' },
        VOID: { color: '#71717A', bgColor: 'rgba(113,113,122,0.1)' },
    };
    return map[status] || map.UNPAID;
};

const INVOICE_STATUS_COLORS: Record<string, string> = {
    PAID: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20',
    UNPAID: 'bg-amber-500/10 text-amber-400 border-amber-500/20',
    OVERDUE: 'bg-red-500/10 text-red-400 border-red-500/20',
    PARTIAL: 'bg-blue-500/10 text-blue-400 border-blue-500/20',
    VOID: 'bg-zinc-500/10 text-zinc-400 border-zinc-500/20',
};

@customElement('gable-portal-invoices')
export class PortalInvoices extends LitElement {
    createRenderRoot() { return this; }

    @state() private invoices: PortalInvoice[] = [];
    @state() private loading = true;
    @state() private error = '';

    connectedCallback() {
        super.connectedCallback();
        this._fetchInvoices();
    }

    private _fetchInvoices() {
        this.loading = true;
        this.error = '';
        PortalService.getInvoices()
            .then(data => { this.invoices = data; })
            .catch(err => { this.error = err instanceof Error ? err.message : 'Failed to load invoices'; })
            .finally(() => { this.loading = false; });
    }

    private _handleDownloadPDF(invoice: PortalInvoice) {
        const content = [
            `INVOICE ${invoice.id.substring(0, 8).toUpperCase()}`,
            `Date: ${new Date(invoice.created_at).toLocaleDateString()}`,
            `Status: ${invoice.status}`,
            `Payment Terms: ${invoice.payment_terms}`,
            invoice.due_date ? `Due Date: ${new Date(invoice.due_date).toLocaleDateString()}` : '',
            '',
            `Subtotal: ${formatCurrency(invoice.subtotal)}`,
            `Tax: ${formatCurrency(invoice.tax_amount)}`,
            `Total: ${formatCurrency(invoice.total_amount)}`,
        ].filter(Boolean).join('\n');

        const blob = new Blob([content], { type: 'text/plain' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `invoice-${invoice.id.substring(0, 8)}.txt`;
        a.click();
        URL.revokeObjectURL(url);
    }

    render() {
        if (this.loading) {
            return html`
                <div class="space-y-4">
                    ${[1, 2, 3].map(() => html`<div class="h-20 bg-white/5 rounded-2xl animate-pulse"></div>`)}
                </div>
            `;
        }

        if (this.error) {
            return html`
                <div class="flex flex-col items-center justify-center h-64 text-center">
                    ${icon(AlertTriangle, 48, 'text-amber-500 mb-4')}
                    <p class="text-zinc-400 mb-4">${this.error}</p>
                    <button
                        @click=${() => this._fetchInvoices()}
                        class="flex items-center gap-2 px-4 py-2 rounded-lg bg-white/5 border border-white/10 text-white hover:bg-white/10 transition-colors"
                    >
                        ${icon(RefreshCw, 16)} Retry
                    </button>
                </div>
            `;
        }

        return html`
            <div>
                <div class="mb-6">
                    <h1 class="text-2xl font-bold text-white">Invoices</h1>
                    <p class="text-zinc-400 text-sm mt-1">${this.invoices.length} invoice${this.invoices.length !== 1 ? 's' : ''} found</p>
                </div>

                ${this.invoices.length === 0
                    ? html`
                        <div class="rounded-2xl border border-white/[0.06] bg-[#161821]/80 backdrop-blur-xl">
                            <div class="p-12 text-center">
                                ${icon(FileText, 48, 'text-zinc-600 mx-auto mb-4')}
                                <p class="text-zinc-400">No invoices yet.</p>
                            </div>
                        </div>
                    `
                    : html`
                        <div class="space-y-3">
                            ${this.invoices.map(inv => html`
                                <div class="rounded-2xl border border-white/[0.06] bg-[#161821]/80 backdrop-blur-xl overflow-hidden">
                                    <div class="flex items-center justify-between p-4 hover:bg-white/5 transition-colors">
                                        <div class="flex items-center gap-4">
                                            <div
                                                class="w-10 h-10 rounded-lg flex items-center justify-center"
                                                style="background-color: ${statusConfig(inv.status).bgColor}"
                                            >
                                                ${icon(FileText, 18)}
                                            </div>
                                            <div>
                                                <div class="font-mono text-sm font-medium text-white">
                                                    INV-${inv.id.substring(0, 8).toUpperCase()}
                                                </div>
                                                <div class="text-xs text-zinc-500 mt-0.5">
                                                    ${new Date(inv.created_at).toLocaleDateString()}${inv.due_date ? html` · Due ${new Date(inv.due_date).toLocaleDateString()}` : ''}
                                                </div>
                                            </div>
                                        </div>
                                        <div class="flex items-center gap-4">
                                            <div class="text-right">
                                                <div class="font-mono text-sm text-white">${formatCurrency(inv.total_amount)}</div>
                                                <span class="inline-block px-2 py-0.5 rounded text-[10px] uppercase tracking-wider font-semibold border ${INVOICE_STATUS_COLORS[inv.status] || INVOICE_STATUS_COLORS.UNPAID}">
                                                    ${inv.status}
                                                </span>
                                            </div>
                                            <button
                                                @click=${() => this._handleDownloadPDF(inv)}
                                                class="p-2 rounded-lg hover:bg-white/10 text-zinc-400 hover:text-white transition-colors"
                                                title="Download Invoice"
                                            >
                                                ${icon(Download, 16)}
                                            </button>
                                        </div>
                                    </div>
                                </div>
                            `)}
                        </div>
                    `
                }
            </div>
        `;
    }
}
