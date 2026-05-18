import { LitElement, html, nothing } from 'lit';
import { customElement, property, state } from 'lit/decorators.js';
import { icon } from '../../lib/icons.ts';
import { ToastService } from '../../lib/toast-service.ts';
import { InvoiceService } from '../../services/InvoiceService.ts';
import { paymentService } from '../../services/paymentService.ts';
import { ReportingService } from '../../services/ReportingService.ts';
import type { Invoice } from '../../types/invoice.ts';
import type { Payment, CreatePaymentRequest } from '../../types/payment.ts';
import { Download, CreditCard, Mail, RotateCcw } from 'lucide';

// Side-effect imports: register child custom elements
import '../../components/invoices/PaymentModal.ts';

const API_URL = import.meta.env.VITE_API_URL || '';

@customElement('gable-invoice-detail')
export class GableInvoiceDetail extends LitElement {
    createRenderRoot() { return this; }

    @property({ attribute: 'route-id' }) routeId = '';

    @state() private invoice: Invoice | null = null;
    @state() private payments: Payment[] = [];
    @state() private loading = true;
    @state() private error = false;
    @state() private isPaymentModalOpen = false;
    @state() private creditMemoReason = '';
    @state() private creditMemoAmount = '';
    @state() private showCreditMemo = false;

    connectedCallback() {
        super.connectedCallback();
        if (this.routeId) {
            this.loadInvoice(this.routeId);
            this.loadPayments(this.routeId);
        }
    }

    updated(changed: Map<string, unknown>) {
        if (changed.has('routeId') && changed.get('routeId') !== undefined && this.routeId) {
            this.loading = true;
            this.loadInvoice(this.routeId);
            this.loadPayments(this.routeId);
        }
    }

    private async loadInvoice(id: string) {
        try {
            const data = await InvoiceService.getInvoice(id);
            this.invoice = data;
        } catch (err) {
            console.error(err);
            this.error = true;
            ToastService.show('Failed to load invoice', 'error');
        } finally {
            this.loading = false;
        }
    }

    private async loadPayments(id: string) {
        try {
            const data = await paymentService.getHistory(id);
            this.payments = data;
        } catch (error) {
            console.error('Failed to load payments', error);
        }
    }

    private async handlePayment(input: CreatePaymentRequest) {
        await paymentService.createPayment(input);
        if (this.routeId) {
            await this.loadInvoice(this.routeId);
            await this.loadPayments(this.routeId);
        }
    }

    private getStatusClass(status: string): string {
        if (status === 'UNPAID') return 'bg-amber-500/10 text-amber-500 border-amber-500/20';
        if (status === 'PARTIAL') return 'bg-blue-500/10 text-blue-500 border-blue-500/20';
        if (status === 'PAID') return 'bg-emerald-500/10 text-emerald-500 border-emerald-500/20';
        return '';
    }

    private handleCreditMemoAmountInput(e: Event) {
        this.creditMemoAmount = (e.target as HTMLInputElement).value;
    }

    private handleCreditMemoReasonInput(e: Event) {
        this.creditMemoReason = (e.target as HTMLInputElement).value;
    }

    private async handleApplyCredit() {
        if (!this.invoice) return;
        if (!this.creditMemoAmount || !this.creditMemoReason) {
            ToastService.show('Enter amount and reason', 'error');
            return;
        }
        try {
            await ReportingService.createCreditMemo(this.invoice.id, Number(this.creditMemoAmount), this.creditMemoReason);
            ToastService.show('Credit memo applied', 'success');
            this.showCreditMemo = false;
            this.creditMemoAmount = '';
            this.creditMemoReason = '';
            if (this.routeId) this.loadInvoice(this.routeId);
        } catch {
            ToastService.show('Failed to create credit memo', 'error');
        }
    }

    private async handleEmailInvoice() {
        if (!this.invoice?.id) return;
        try {
            await InvoiceService.emailInvoice(this.invoice.id);
            ToastService.show('Invoice emailed successfully', 'success');
        } catch {
            ToastService.show('Failed to email invoice', 'error');
        }
    }

    render() {
        if (this.loading) return html`<div class="text-white">Loading invoice...</div>`;
        if (this.error || !this.invoice) return html`<div class="text-white">Failed to load invoice.</div>`;

        const invoice = this.invoice;
        const totalPaid = this.payments.reduce((sum, p) => sum + p.amount, 0);
        const amountDue = invoice.total_amount - totalPaid;

        return html`
            <div class="space-y-8 max-w-4xl mx-auto pb-20">
                <div class="flex items-center justify-between pb-6 border-b border-white/10">
                    <div>
                        <h1 class="text-3xl font-bold font-mono text-white">Invoice #${invoice.id.slice(0, 8)}</h1>
                        <p class="text-muted-foreground mt-1">Order Ref: <span class="font-mono text-zinc-400">${invoice.order_id.slice(0, 8)}</span></p>
                    </div>
                    <div class="flex gap-3">
                        <button
                            @click=${() => this.handleEmailInvoice()}
                            class="bg-white/10 text-white hover:bg-white/20 px-4 py-2 rounded flex items-center gap-2 transition-colors border border-white/10"
                        >
                            ${icon(Mail, 18)} Email
                        </button>
                        <button
                            @click=${() => window.open(`${API_URL}/api/v1/documents/print/invoice/${invoice.id}`, '_blank')}
                            class="bg-white/10 text-white hover:bg-white/20 px-4 py-2 rounded flex items-center gap-2 transition-colors border border-white/10"
                        >
                            ${icon(Download, 18)} Download
                        </button>

                        ${invoice.status !== 'PAID' ? html`
                            <button
                                @click=${() => { this.isPaymentModalOpen = true; }}
                                class="bg-emerald-600 hover:bg-emerald-500 text-white px-4 py-2 rounded flex items-center gap-2 transition-colors font-medium shadow-lg shadow-emerald-900/20"
                            >
                                ${icon(CreditCard, 18)} Pay
                            </button>
                        ` : nothing}
                        <button
                            @click=${() => { this.showCreditMemo = !this.showCreditMemo; }}
                            class="bg-white/10 text-white hover:bg-white/20 px-4 py-2 rounded flex items-center gap-2 transition-colors border border-white/10"
                        >
                            ${icon(RotateCcw, 18)} Credit Memo
                        </button>
                    </div>
                </div>

                <div class="grid grid-cols-1 md:grid-cols-2 gap-8">
                    <div class="bg-zinc-900 p-6 rounded-lg border border-zinc-800">
                        <h3 class="text-zinc-500 uppercase text-xs font-bold mb-4">Bill To</h3>
                        <div class="text-zinc-300">
                            <p class="text-white font-medium text-lg mb-1">${invoice.customer_name || 'Customer'}</p>
                            <p class="font-mono text-zinc-400 text-xs">Acct: ${invoice.customer_id.slice(0, 8)}</p>
                        </div>
                    </div>
                    <div class="bg-zinc-900 p-6 rounded-lg border border-zinc-800 text-right">
                        <h3 class="text-zinc-500 uppercase text-xs font-bold mb-4">Invoice Details</h3>
                        <div class="space-y-2">
                            <div class="flex justify-between">
                                <span class="text-zinc-400">Issue Date</span>
                                <span class="text-zinc-200">${new Date(invoice.created_at).toLocaleDateString()}</span>
                            </div>
                            <div class="flex justify-between">
                                <span class="text-zinc-400">Terms</span>
                                <span class="text-zinc-200 font-mono">${invoice.payment_terms || 'NET30'}</span>
                            </div>
                            <div class="flex justify-between">
                                <span class="text-zinc-400">Due Date</span>
                                <span class="text-zinc-200">${invoice.due_date ? new Date(invoice.due_date).toLocaleDateString() : 'Net 30'}</span>
                            </div>
                            <div class="flex justify-between items-center mt-4 pt-4 border-t border-zinc-800">
                                <span class="text-zinc-400">Status</span>
                                <span class="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium border ${this.getStatusClass(invoice.status)}">
                                    ${invoice.status}
                                </span>
                            </div>
                        </div>
                    </div>
                </div>

                <div class="bg-zinc-900 rounded-lg border border-zinc-800 overflow-hidden">
                    <div class="px-6 py-4 border-b border-zinc-800">
                        <h3 class="text-zinc-100 font-bold">Line Items</h3>
                    </div>
                    <table class="w-full text-left text-sm" aria-label="Invoice line items">
                        <thead class="bg-zinc-950 text-zinc-400 uppercase text-xs">
                            <tr>
                                <th class="px-6 py-4">Item</th>
                                <th class="px-6 py-4 text-right">Qty</th>
                                <th class="px-6 py-4 text-right">Rate</th>
                                <th class="px-6 py-4 text-right">Amount</th>
                            </tr>
                        </thead>
                        <tbody class="divide-y divide-zinc-800">
                            ${invoice.lines?.map(line => html`
                                <tr>
                                    <td class="px-6 py-4 text-white font-medium">
                                        <div class="font-mono text-sm">${line.product_sku || line.product_id.slice(0, 8)}</div>
                                        ${line.product_name ? html`<div class="text-xs text-zinc-400">${line.product_name}</div>` : nothing}
                                    </td>
                                    <td class="px-6 py-4 text-right text-zinc-300 font-mono">${line.quantity}</td>
                                    <td class="px-6 py-4 text-right text-zinc-300 font-mono">$${line.price_each.toFixed(2)}</td>
                                    <td class="px-6 py-4 text-right text-white font-mono font-bold">$${(line.quantity * line.price_each).toFixed(2)}</td>
                                </tr>
                            `)}
                        </tbody>
                        <tfoot class="bg-zinc-950">
                            ${invoice.subtotal > 0 && invoice.subtotal !== invoice.total_amount ? html`
                                <tr>
                                    <td colspan="3" class="px-6 py-2 text-right text-zinc-400">Subtotal</td>
                                    <td class="px-6 py-2 text-right text-zinc-300 font-mono">$${invoice.subtotal.toFixed(2)}</td>
                                </tr>
                                <tr>
                                    <td colspan="3" class="px-6 py-2 text-right text-zinc-400">Tax (${(invoice.tax_rate * 100).toFixed(2)}%)</td>
                                    <td class="px-6 py-2 text-right text-zinc-300 font-mono">$${invoice.tax_amount.toFixed(2)}</td>
                                </tr>
                            ` : nothing}
                            <tr>
                                <td colspan="3" class="px-6 py-4 text-right text-zinc-400 font-bold uppercase">Total Due</td>
                                <td class="px-6 py-4 text-right text-emerald-500 font-bold font-mono text-xl">$${invoice.total_amount.toFixed(2)}</td>
                            </tr>
                        </tfoot>
                    </table>
                </div>

                <!-- Payment History Section -->
                ${this.payments.length > 0 ? html`
                    <div class="bg-zinc-900 rounded-lg border border-zinc-800 overflow-hidden">
                        <div class="px-6 py-4 border-b border-zinc-800 flex justify-between items-center">
                            <h3 class="text-zinc-100 font-bold">Payment History</h3>
                            <span class="text-zinc-400 text-sm">Paid: <span class="text-green-400 font-mono">$${totalPaid.toFixed(2)}</span></span>
                        </div>
                        <table class="w-full text-left text-sm" aria-label="Payment history">
                            <thead class="bg-zinc-950 text-zinc-400 uppercase text-xs">
                                <tr>
                                    <th class="px-6 py-4">Date</th>
                                    <th class="px-6 py-4">Method</th>
                                    <th class="px-6 py-4">Reference</th>
                                    <th class="px-6 py-4 text-right">Amount</th>
                                </tr>
                            </thead>
                            <tbody class="divide-y divide-zinc-800">
                                ${this.payments.map(p => html`
                                    <tr>
                                        <td class="px-6 py-4 text-zinc-300">${new Date(p.created_at).toLocaleString()}</td>
                                        <td class="px-6 py-4 text-zinc-300 font-bold">${p.method}</td>
                                        <td class="px-6 py-4 text-zinc-400 font-mono text-xs">${p.reference || '-'}</td>
                                        <td class="px-6 py-4 text-right text-white font-mono font-bold">$${p.amount.toFixed(2)}</td>
                                    </tr>
                                `)}
                            </tbody>
                        </table>
                    </div>
                ` : nothing}

                <!-- Credit Memo Form -->
                ${this.showCreditMemo ? html`
                    <div class="bg-zinc-900 rounded-lg border border-amber-500/20 p-6 space-y-4">
                        <h3 class="text-zinc-100 font-bold flex items-center gap-2">
                            ${icon(RotateCcw, 16, 'w-4 h-4 text-amber-400')}
                            Issue Credit Memo
                        </h3>
                        <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <div>
                                <label class="text-xs text-zinc-500 uppercase block mb-1">Amount ($)</label>
                                <input
                                    type="number"
                                    step="0.01"
                                    min="0"
                                    .value=${this.creditMemoAmount}
                                    @input=${this.handleCreditMemoAmountInput}
                                    class="w-full bg-black/20 border border-white/10 rounded px-3 py-2 text-white font-mono focus:border-[#00FFA3] outline-none"
                                    placeholder="0.00"
                                />
                            </div>
                            <div>
                                <label class="text-xs text-zinc-500 uppercase block mb-1">Reason</label>
                                <input
                                    type="text"
                                    .value=${this.creditMemoReason}
                                    @input=${this.handleCreditMemoReasonInput}
                                    class="w-full bg-black/20 border border-white/10 rounded px-3 py-2 text-white focus:border-[#00FFA3] outline-none"
                                    placeholder="Damaged goods, pricing error, etc."
                                />
                            </div>
                        </div>
                        <div class="flex gap-3 justify-end">
                            <button @click=${() => { this.showCreditMemo = false; }} class="px-4 py-2 text-zinc-400 hover:text-white">Cancel</button>
                            <button
                                @click=${() => this.handleApplyCredit()}
                                class="bg-amber-600 hover:bg-amber-500 text-white px-4 py-2 rounded font-medium"
                            >
                                Apply Credit
                            </button>
                        </div>
                    </div>
                ` : nothing}

                ${invoice.id ? html`
                    <gable-payment-modal
                        ?is-open=${this.isPaymentModalOpen}
                        @close=${() => { this.isPaymentModalOpen = false; }}
                        @save=${(e: CustomEvent<CreatePaymentRequest>) => this.handlePayment(e.detail)}
                        .invoiceId=${invoice.id}
                        .amountDue=${amountDue > 0 ? amountDue : 0}
                    ></gable-payment-modal>
                ` : nothing}
            </div>
        `;
    }
}
