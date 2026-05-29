import { LitElement, html, nothing } from 'lit';
import { customElement, state } from 'lit/decorators.js';
import { icon } from '../../lib/icons.ts';
import { ToastService } from '../../lib/toast-service.ts';
import { APService } from '../../services/APService.ts';
import { VendorService } from '../../services/VendorService.ts';
import { fetchAccounts } from '../../services/GLService.ts';
import type { VendorInvoice, APPayment, APAgingSummary } from '../../types/ap';
import type { Vendor } from '../../types/vendor';
import type { GLAccount } from '../../types/gl';
import {
    CheckCircle2, PlusCircle, Trash2, Receipt, Info
} from 'lucide';

@customElement('gable-accounts-payable')
export class AccountsPayable extends LitElement {
    createRenderRoot() { return this; }

    @state() private invoices: VendorInvoice[] = [];
    @state() private payments: APPayment[] = [];
    @state() private agingSummary: APAgingSummary[] = [];
    @state() private vendors: Vendor[] = [];
    @state() private glAccounts: GLAccount[] = [];
    @state() private loading = true;
    @state() private activeTab: 'invoices' | 'payments' | 'aging' = 'invoices';

    // Modals
    @state() private showLogBillModal = false;
    @state() private showPayVendorModal = false;
    @state() private showDetailInvoiceModal = false;
    @state() private selectedInvoice: VendorInvoice | null = null;

    // Log Bill Form State
    @state() private billVendorId = '';
    @state() private billInvoiceNumber = '';
    @state() private billInvoiceDate = new Date().toISOString().split('T')[0];
    @state() private billDueDate = (() => {
        const d = new Date();
        d.setDate(d.getDate() + 30);
        return d.toISOString().split('T')[0];
    })();
    @state() private billTaxAmount = 0.00;
    @state() private billNotes = '';
    @state() private billLines: { description: string; quantity: number; unit_price: number; gl_account_id: string }[] = [
        { description: '', quantity: 1, unit_price: 0.00, gl_account_id: '' }
    ];

    // Pay Vendor Form State
    @state() private payVendorId = '';
    @state() private payAmount = 0.00;
    @state() private payMethod: 'CHECK' | 'ACH' | 'WIRE' = 'CHECK';
    @state() private payCheckNumber = '';
    @state() private payReference = '';
    @state() private payDate = new Date().toISOString().split('T')[0];
    @state() private paySelectedInvoiceIds: string[] = [];
    @state() private vendorOutstandingInvoices: VendorInvoice[] = [];

    connectedCallback() {
        super.connectedCallback();
        this._loadAllData();
    }

    private async _loadAllData() {
        this.loading = true;
        try {
            const [inv, pmts, aging, vends, accounts] = await Promise.all([
                APService.listVendorInvoices(),
                APService.listPayments(),
                APService.getAgingSummary(),
                VendorService.listVendors(),
                fetchAccounts()
            ]);

            this.invoices = inv;
            this.payments = pmts;
            this.agingSummary = aging;
            this.vendors = vends;
            this.glAccounts = accounts.filter(a => a.is_active);
        } catch (err) {
            console.error('Failed to load accounts payable details:', err);
            ToastService.show('Failed to load Accounts Payable data', 'error');
        } finally {
            this.loading = false;
        }
    }

    private _formatCents(cents: number): string {
        return `$${(cents / 100).toLocaleString('en-US', { minimumFractionDigits: 2 })}`;
    }

    private _statusBadgeClass(status: string): string {
        switch (status) {
            case 'PENDING':
                return 'bg-amber-500/10 text-amber-400 border border-amber-500/20';
            case 'APPROVED':
                return 'bg-blue-500/10 text-blue-400 border border-blue-500/20';
            case 'PARTIAL':
                return 'bg-purple-500/10 text-purple-400 border border-purple-500/20';
            case 'PAID':
                return 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20';
            case 'VOIDED':
                return 'bg-zinc-800 text-zinc-500 border border-zinc-700';
            default:
                return 'bg-zinc-800 text-zinc-400';
        }
    }

    // Modal Control & Submissions
    private _openLogBillModal() {
        this.billVendorId = this.vendors[0]?.id || '';
        this.billInvoiceNumber = '';
        this.billInvoiceDate = new Date().toISOString().split('T')[0];
        const d = new Date();
        d.setDate(d.getDate() + 30);
        this.billDueDate = d.toISOString().split('T')[0];
        this.billTaxAmount = 0.00;
        this.billNotes = '';
        this.billLines = [{ description: '', quantity: 1, unit_price: 0.00, gl_account_id: this.glAccounts[0]?.id || '' }];
        this.showLogBillModal = true;
    }

    private _addBillLine() {
        this.billLines = [
            ...this.billLines,
            { description: '', quantity: 1, unit_price: 0.00, gl_account_id: this.glAccounts[0]?.id || '' }
        ];
    }

    private _removeBillLine(index: number) {
        if (this.billLines.length > 1) {
            this.billLines = this.billLines.filter((_, i) => i !== index);
        }
    }

    private async _handleLogBillSubmit(e: Event) {
        e.preventDefault();
        if (!this.billVendorId || !this.billInvoiceNumber.trim()) {
            ToastService.show('Please fill in required fields', 'error');
            return;
        }

        // Validate lines
        for (const line of this.billLines) {
            if (!line.description.trim()) {
                ToastService.show('Please enter a description for all line items', 'error');
                return;
            }
            if (line.quantity <= 0 || line.unit_price < 0) {
                ToastService.show('Quantity and unit price must be positive values', 'error');
                return;
            }
        }

        try {
            const req = {
                vendor_id: this.billVendorId,
                invoice_number: this.billInvoiceNumber.trim(),
                invoice_date: this.billInvoiceDate,
                due_date: this.billDueDate,
                tax_amount: Number(this.billTaxAmount),
                notes: this.billNotes.trim(),
                lines: this.billLines.map(l => ({
                    description: l.description.trim(),
                    quantity: Number(l.quantity),
                    unit_price: Number(l.unit_price),
                    gl_account_id: l.gl_account_id || undefined
                }))
            };

            await APService.createVendorInvoice(req);
            ToastService.show('Vendor invoice logged successfully', 'success');
            this.showLogBillModal = false;
            await this._loadAllData();
        } catch (err: any) {
            console.error('Failed to log vendor bill:', err);
            ToastService.show(err.message || 'Failed to create vendor invoice', 'error');
        }
    }

    private _openPayVendorModal() {
        this.payVendorId = this.vendors[0]?.id || '';
        this.payAmount = 0.00;
        this.payMethod = 'CHECK';
        this.payCheckNumber = '';
        this.payReference = '';
        this.payDate = new Date().toISOString().split('T')[0];
        this.paySelectedInvoiceIds = [];
        this._updateVendorOutstandingInvoices();
        this.showPayVendorModal = true;
    }

    private _updateVendorOutstandingInvoices() {
        if (!this.payVendorId) {
            this.vendorOutstandingInvoices = [];
            return;
        }
        // Invoices that are APPROVED or PARTIAL are outstanding
        this.vendorOutstandingInvoices = this.invoices.filter(
            inv => inv.vendor_id === this.payVendorId && (inv.status === 'APPROVED' || inv.status === 'PARTIAL')
        );
    }

    private _handlePayInvoiceCheckbox(invoiceId: string) {
        if (this.paySelectedInvoiceIds.includes(invoiceId)) {
            this.paySelectedInvoiceIds = this.paySelectedInvoiceIds.filter(id => id !== invoiceId);
        } else {
            this.paySelectedInvoiceIds = [...this.paySelectedInvoiceIds, invoiceId];
        }
        
        // Auto calculate sum of selected invoices
        let sum = 0;
        for (const invId of this.paySelectedInvoiceIds) {
            const inv = this.invoices.find(i => i.id === invId);
            if (inv) {
                sum += (inv.total - inv.amount_paid);
            }
        }
        this.payAmount = Number((sum / 100).toFixed(2));
    }

    private async _handlePayVendorSubmit(e: Event) {
        e.preventDefault();
        if (!this.payVendorId || this.payAmount <= 0) {
            ToastService.show('Please select a vendor and enter a positive payment amount', 'error');
            return;
        }

        if (this.paySelectedInvoiceIds.length === 0) {
            ToastService.show('Please select at least one outstanding invoice to apply payment', 'error');
            return;
        }

        try {
            const req = {
                vendor_id: this.payVendorId,
                amount: Number(this.payAmount),
                method: this.payMethod,
                check_number: this.payMethod === 'CHECK' ? this.payCheckNumber.trim() : undefined,
                reference: this.payReference.trim() || undefined,
                payment_date: this.payDate,
                invoice_ids: this.paySelectedInvoiceIds
            };

            await APService.payVendor(req);
            ToastService.show('Vendor payment recorded successfully', 'success');
            this.showPayVendorModal = false;
            await this._loadAllData();
        } catch (err: any) {
            console.error('Failed to pay vendor:', err);
            ToastService.show(err.message || 'Failed to process vendor payment', 'error');
        }
    }

    private async _handleApproveInvoice(invoiceId: string) {
        try {
            await APService.approveVendorInvoice(invoiceId);
            ToastService.show('Vendor invoice approved and posted to General Ledger', 'success');
            if (this.selectedInvoice && this.selectedInvoice.id === invoiceId) {
                this.selectedInvoice = await APService.getVendorInvoice(invoiceId);
            }
            await this._loadAllData();
        } catch (err: any) {
            console.error('Failed to approve invoice:', err);
            ToastService.show(err.message || 'Failed to approve invoice', 'error');
        }
    }

    private async _viewInvoiceDetails(invoiceId: string) {
        try {
            this.selectedInvoice = await APService.getVendorInvoice(invoiceId);
            this.showDetailInvoiceModal = true;
        } catch (err) {
            ToastService.show('Failed to fetch invoice details', 'error');
        }
    }

    render() {
        if (this.loading) {
            return html`
                <div class="p-8 text-center text-zinc-400">
                    <div class="animate-pulse flex flex-col items-center justify-center space-y-4">
                        <div class="h-8 w-48 bg-zinc-800 rounded"></div>
                        <div class="h-64 w-full bg-zinc-900/50 rounded border border-zinc-800"></div>
                    </div>
                </div>
            `;
        }

        // Summary Statistics
        const totalOutstanding = this.invoices
            .filter(i => i.status === 'APPROVED' || i.status === 'PARTIAL')
            .reduce((sum, i) => sum + (i.total - i.amount_paid), 0);

        const pendingApproval = this.invoices
            .filter(i => i.status === 'PENDING')
            .reduce((sum, i) => sum + i.total, 0);

        const pendingApprovalCount = this.invoices.filter(i => i.status === 'PENDING').length;

        // Paid Month-To-Date
        const currentMonth = new Date().getMonth();
        const currentYear = new Date().getFullYear();
        const paidMTD = this.payments
            .filter(p => {
                const d = new Date(p.payment_date);
                return d.getMonth() === currentMonth && d.getFullYear() === currentYear && p.status === 'COMPLETE';
            })
            .reduce((sum, p) => sum + p.amount, 0);

        // Aging report buckets totals
        const agingBuckets = { current: 0, past30: 0, past60: 0, past90: 0, total: 0 };
        for (const vendor of this.agingSummary) {
            agingBuckets.current += vendor.current;
            agingBuckets.past30 += vendor.past_30;
            agingBuckets.past60 += vendor.past_60;
            agingBuckets.past90 += vendor.past_90;
            agingBuckets.total += vendor.total;
        }

        return html`
            <div class="p-6 max-w-[1240px] mx-auto space-y-6 animate-in fade-in duration-500">
                <!-- Header -->
                <div class="flex justify-between items-center">
                    <div>
                        <h1 class="text-2xl font-bold bg-gradient-to-r from-white to-zinc-400 bg-clip-text text-transparent">
                            Accounts Payable
                        </h1>
                        <p class="text-zinc-400 mt-1">
                            Manage vendor invoices, aging schedules, payouts, and GL synchronization
                        </p>
                    </div>
                    <div class="flex items-center gap-3">
                        <button
                            @click=${this._openLogBillModal}
                            class="flex items-center gap-2 px-4 py-2 bg-zinc-800 hover:bg-zinc-700 text-white border border-zinc-700 rounded-lg text-sm font-semibold transition-colors"
                        >
                            ${icon(PlusCircle, 16)} Log Vendor Bill
                        </button>
                        <button
                            @click=${this._openPayVendorModal}
                            class="flex items-center gap-2 px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg text-sm font-semibold transition-colors"
                        >
                            ${icon(CheckCircle2, 16)} Record Payment
                        </button>
                    </div>
                </div>

                <!-- KPI Summary Cards -->
                <div class="grid grid-cols-3 gap-4">
                    <div class="backdrop-blur-md bg-white/5 border border-white/10 rounded-xl p-5">
                        <p class="text-xs text-zinc-500 uppercase tracking-wider mb-1">Total Outstanding AP</p>
                        <p class="text-2xl font-bold font-mono text-white">
                            ${this._formatCents(totalOutstanding)}
                        </p>
                        <div class="flex justify-between items-center text-xs text-zinc-400 mt-2">
                            <span>Approved & Partial</span>
                            <span class="text-rose-400 font-medium">To Be Settled</span>
                        </div>
                    </div>
                    <div class="backdrop-blur-md bg-white/5 border border-white/10 rounded-xl p-5">
                        <p class="text-xs text-zinc-500 uppercase tracking-wider mb-1">Pending Approval</p>
                        <p class="text-2xl font-bold font-mono text-amber-400">
                            ${this._formatCents(pendingApproval)}
                        </p>
                        <div class="flex justify-between items-center text-xs text-zinc-400 mt-2">
                            <span>Requires Review</span>
                            <span class="bg-amber-500/20 px-2 py-0.5 rounded font-mono text-amber-300 font-semibold">${pendingApprovalCount} bills</span>
                        </div>
                    </div>
                    <div class="backdrop-blur-md bg-white/5 border border-white/10 rounded-xl p-5">
                        <p class="text-xs text-zinc-500 uppercase tracking-wider mb-1">Paid Month-To-Date</p>
                        <p class="text-2xl font-bold font-mono text-emerald-400">
                            ${this._formatCents(paidMTD)}
                        </p>
                        <div class="flex justify-between items-center text-xs text-zinc-400 mt-2">
                            <span>Current Calendar Month</span>
                            <span class="text-emerald-400">Complete Payouts</span>
                        </div>
                    </div>
                </div>

                <!-- Aging timeline timeline horizontal summary -->
                <div class="backdrop-blur-md bg-zinc-900/40 border border-white/5 rounded-xl p-5 space-y-3">
                    <div class="flex justify-between items-center">
                        <h2 class="text-sm font-semibold text-white uppercase tracking-wider">AP Aging Timeline</h2>
                        <span class="text-xs font-mono text-zinc-500">Aging buckets in real-time</span>
                    </div>
                    <div class="grid grid-cols-5 gap-2 text-center">
                        <div class="bg-white/[0.02] border border-white/5 rounded-lg py-3">
                            <span class="text-[10px] text-zinc-500 uppercase font-semibold">Current (0-30 days)</span>
                            <p class="text-lg font-bold font-mono text-zinc-300 mt-1">${this._formatCents(agingBuckets.current)}</p>
                        </div>
                        <div class="bg-white/[0.02] border border-white/5 rounded-lg py-3">
                            <span class="text-[10px] text-zinc-500 uppercase font-semibold">31 - 60 Days</span>
                            <p class="text-lg font-bold font-mono text-yellow-400 mt-1">${this._formatCents(agingBuckets.past30)}</p>
                        </div>
                        <div class="bg-white/[0.02] border border-white/5 rounded-lg py-3">
                            <span class="text-[10px] text-zinc-500 uppercase font-semibold">61 - 90 Days</span>
                            <p class="text-lg font-bold font-mono text-orange-400 mt-1">${this._formatCents(agingBuckets.past60)}</p>
                        </div>
                        <div class="bg-white/[0.02] border border-white/5 rounded-lg py-3">
                            <span class="text-[10px] text-zinc-500 uppercase font-semibold">90+ Days</span>
                            <p class="text-lg font-bold font-mono text-rose-500 mt-1">${this._formatCents(agingBuckets.past90)}</p>
                        </div>
                        <div class="bg-white/[0.03] border border-emerald-500/20 rounded-lg py-3">
                            <span class="text-[10px] text-emerald-400 uppercase font-bold">Total Aging AP</span>
                            <p class="text-lg font-bold font-mono text-emerald-400 mt-1">${this._formatCents(agingBuckets.total)}</p>
                        </div>
                    </div>
                </div>

                <!-- Tabs & Content -->
                <div class="space-y-4">
                    <!-- Tab buttons -->
                    <div class="flex border-b border-white/5">
                        <button
                            @click=${() => { this.activeTab = 'invoices'; }}
                            class="px-5 py-2.5 font-medium text-sm transition-colors border-b-2 -mb-[2px] ${this.activeTab === 'invoices' ? 'border-emerald-500 text-white' : 'border-transparent text-zinc-400 hover:text-white'}"
                        >
                            Vendor Invoices
                        </button>
                        <button
                            @click=${() => { this.activeTab = 'payments'; }}
                            class="px-5 py-2.5 font-medium text-sm transition-colors border-b-2 -mb-[2px] ${this.activeTab === 'payments' ? 'border-emerald-500 text-white' : 'border-transparent text-zinc-400 hover:text-white'}"
                        >
                            Outgoing Payments
                        </button>
                        <button
                            @click=${() => { this.activeTab = 'aging'; }}
                            class="px-5 py-2.5 font-medium text-sm transition-colors border-b-2 -mb-[2px] ${this.activeTab === 'aging' ? 'border-emerald-500 text-white' : 'border-transparent text-zinc-400 hover:text-white'}"
                        >
                            Aging Schedule Detail
                        </button>
                    </div>

                    <!-- Invoices Tab -->
                    ${this.activeTab === 'invoices' ? html`
                        <div class="backdrop-blur-md bg-white/5 border border-white/10 rounded-xl overflow-hidden">
                            <table class="w-full text-sm">
                                <thead>
                                    <tr class="border-b border-white/10 text-zinc-400 text-xs font-semibold uppercase tracking-wider">
                                        <th class="text-left px-4 py-3">Invoice Number</th>
                                        <th class="text-left px-4 py-3">Vendor</th>
                                        <th class="text-left px-4 py-3">Date</th>
                                        <th class="text-left px-4 py-3">Due Date</th>
                                        <th class="text-right px-4 py-3">Total Amount</th>
                                        <th class="text-right px-4 py-3">Paid</th>
                                        <th class="text-center px-4 py-3">Status</th>
                                        <th class="text-right px-4 py-3">Actions</th>
                                    </tr>
                                </thead>
                                <tbody class="divide-y divide-white/5">
                                    ${this.invoices.length === 0 ? html`
                                        <tr>
                                            <td colspan="8" class="px-4 py-8 text-center text-zinc-500 italic">No vendor bills recorded.</td>
                                        </tr>
                                    ` : this.invoices.map(inv => html`
                                        <tr class="hover:bg-white/[0.02] transition-colors">
                                            <td class="px-4 py-3 font-semibold text-white">
                                                <button @click=${() => this._viewInvoiceDetails(inv.id)} class="hover:underline hover:text-emerald-400 text-left font-mono">
                                                    ${inv.invoice_number}
                                                </button>
                                            </td>
                                            <td class="px-4 py-3 text-white">${inv.vendor_name || 'Seeded Vendor'}</td>
                                            <td class="px-4 py-3 text-zinc-400 text-xs">${new Date(inv.invoice_date).toLocaleDateString('en-US', { timeZone: 'UTC' })}</td>
                                            <td class="px-4 py-3 text-zinc-400 text-xs">${new Date(inv.due_date).toLocaleDateString('en-US', { timeZone: 'UTC' })}</td>
                                            <td class="px-4 py-3 text-right font-mono text-zinc-200">${this._formatCents(inv.total)}</td>
                                            <td class="px-4 py-3 text-right font-mono text-zinc-400">${this._formatCents(inv.amount_paid)}</td>
                                            <td class="px-4 py-3 text-center">
                                                <span class="px-2.5 py-0.5 rounded text-[10px] font-semibold tracking-wider ${this._statusBadgeClass(inv.status)}">
                                                    ${inv.status}
                                                </span>
                                            </td>
                                            <td class="px-4 py-3 text-right space-x-1">
                                                ${inv.status === 'PENDING' ? html`
                                                    <button
                                                        @click=${() => this._handleApproveInvoice(inv.id)}
                                                        class="px-2.5 py-1 bg-emerald-500/10 text-emerald-400 border border-emerald-500/30 hover:bg-emerald-500/20 rounded text-xs transition-colors"
                                                    >
                                                        Approve
                                                    </button>
                                                ` : nothing}
                                                <button
                                                    @click=${() => this._viewInvoiceDetails(inv.id)}
                                                    class="px-2.5 py-1 bg-zinc-800 text-zinc-200 border border-zinc-700 hover:bg-zinc-700 rounded text-xs transition-colors"
                                                >
                                                    Details
                                                </button>
                                            </td>
                                        </tr>
                                    `)}
                                </tbody>
                            </table>
                        </div>
                    ` : nothing}

                    <!-- Payments Tab -->
                    ${this.activeTab === 'payments' ? html`
                        <div class="backdrop-blur-md bg-white/5 border border-white/10 rounded-xl overflow-hidden">
                            <table class="w-full text-sm">
                                <thead>
                                    <tr class="border-b border-white/10 text-zinc-400 text-xs font-semibold uppercase tracking-wider">
                                        <th class="text-left px-4 py-3">Reference/Check</th>
                                        <th class="text-left px-4 py-3">Vendor</th>
                                        <th class="text-left px-4 py-3">Date</th>
                                        <th class="text-left px-4 py-3">Payment Method</th>
                                        <th class="text-right px-4 py-3">Amount</th>
                                        <th class="text-center px-4 py-3">Status</th>
                                    </tr>
                                </thead>
                                <tbody class="divide-y divide-white/5">
                                    ${this.payments.length === 0 ? html`
                                        <tr>
                                            <td colspan="6" class="px-4 py-8 text-center text-zinc-500 italic">No vendor payments recorded.</td>
                                        </tr>
                                    ` : this.payments.map(pmt => html`
                                        <tr class="hover:bg-white/[0.02] transition-colors">
                                            <td class="px-4 py-3 font-semibold text-white font-mono">
                                                ${pmt.check_number || pmt.reference || `PMT-${pmt.id.substring(0, 8)}`}
                                            </td>
                                            <td class="px-4 py-3 text-white">${pmt.vendor_name || 'Vendor'}</td>
                                            <td class="px-4 py-3 text-zinc-400 text-xs">${new Date(pmt.payment_date).toLocaleDateString('en-US', { timeZone: 'UTC' })}</td>
                                            <td class="px-4 py-3 text-zinc-300 font-medium font-mono text-xs">${pmt.method}</td>
                                            <td class="px-4 py-3 text-right font-mono text-emerald-400">${this._formatCents(pmt.amount)}</td>
                                            <td class="px-4 py-3 text-center">
                                                <span class="px-2 py-0.5 rounded text-[10px] font-semibold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                                                    ${pmt.status}
                                                </span>
                                            </td>
                                        </tr>
                                    `)}
                                </tbody>
                            </table>
                        </div>
                    ` : nothing}

                    <!-- Aging Tab -->
                    ${this.activeTab === 'aging' ? html`
                        <div class="backdrop-blur-md bg-white/5 border border-white/10 rounded-xl overflow-hidden">
                            <table class="w-full text-sm">
                                <thead>
                                    <tr class="border-b border-white/10 text-zinc-400 text-xs font-semibold uppercase tracking-wider">
                                        <th class="text-left px-4 py-3">Vendor Name</th>
                                        <th class="text-right px-4 py-3">Current (0-30)</th>
                                        <th class="text-right px-4 py-3">Past 30 Days</th>
                                        <th class="text-right px-4 py-3">Past 60 Days</th>
                                        <th class="text-right px-4 py-3">Past 90 Days</th>
                                        <th class="text-right px-4 py-3">Total Outstanding</th>
                                    </tr>
                                </thead>
                                <tbody class="divide-y divide-white/5">
                                    ${this.agingSummary.length === 0 ? html`
                                        <tr>
                                            <td colspan="6" class="px-4 py-8 text-center text-zinc-500 italic">No aging AP balance.</td>
                                        </tr>
                                    ` : this.agingSummary.map(a => html`
                                        <tr class="hover:bg-white/[0.02] transition-colors">
                                            <td class="px-4 py-3 font-semibold text-white">${a.vendor_name}</td>
                                            <td class="px-4 py-3 text-right font-mono text-zinc-300">${this._formatCents(a.current)}</td>
                                            <td class="px-4 py-3 text-right font-mono text-yellow-400">${this._formatCents(a.past_30)}</td>
                                            <td class="px-4 py-3 text-right font-mono text-orange-400">${this._formatCents(a.past_60)}</td>
                                            <td class="px-4 py-3 text-right font-mono text-rose-500">${this._formatCents(a.past_90)}</td>
                                            <td class="px-4 py-3 text-right font-mono text-emerald-400 font-bold">${this._formatCents(a.total)}</td>
                                        </tr>
                                    `)}
                                </tbody>
                            </table>
                        </div>
                    ` : nothing}
                </div>

                <!-- 1. Log Bill Modal -->
                ${this.showLogBillModal ? html`
                    <div class="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
                        <div class="bg-zinc-900 border border-zinc-800 rounded-xl max-w-3xl w-full max-h-[85vh] overflow-y-auto shadow-2xl animate-in zoom-in-95 duration-200">
                            <div class="flex justify-between items-center p-4 border-b border-white/5 bg-zinc-950/40">
                                <h3 class="text-base font-semibold text-white flex items-center gap-2">
                                    ${icon(Receipt, 18, 'text-emerald-400')} Log Vendor Bill
                                </h3>
                                <button
                                    @click=${() => { this.showLogBillModal = false; }}
                                    class="text-zinc-500 hover:text-white transition-colors"
                                >
                                    ✕
                                </button>
                            </div>
                            <form @submit=${this._handleLogBillSubmit} class="p-6 space-y-6">
                                <div class="grid grid-cols-2 gap-4">
                                    <div>
                                        <label class="block text-xs font-semibold text-zinc-400 uppercase tracking-wider mb-2">Vendor Name *</label>
                                        <select
                                            .value=${this.billVendorId}
                                            @change=${(e: Event) => { this.billVendorId = (e.target as HTMLSelectElement).value; }}
                                            class="w-full bg-zinc-800 border border-zinc-700 text-white text-sm rounded-lg px-3 py-2 outline-none focus:border-emerald-500"
                                            required
                                        >
                                            ${this.vendors.map(v => html`<option value=${v.id}>${v.name}</option>`)}
                                        </select>
                                    </div>
                                    <div>
                                        <label class="block text-xs font-semibold text-zinc-400 uppercase tracking-wider mb-2">Invoice Number *</label>
                                        <input
                                            type="text"
                                            placeholder="e.g. INV-1002"
                                            .value=${this.billInvoiceNumber}
                                            @input=${(e: Event) => { this.billInvoiceNumber = (e.target as HTMLInputElement).value; }}
                                            class="w-full bg-zinc-800 border border-zinc-700 text-white text-sm rounded-lg px-3 py-2 outline-none focus:border-emerald-500 font-mono"
                                            required
                                        />
                                    </div>
                                    <div>
                                        <label class="block text-xs font-semibold text-zinc-400 uppercase tracking-wider mb-2">Invoice Date *</label>
                                        <input
                                            type="date"
                                            .value=${this.billInvoiceDate}
                                            @change=${(e: Event) => { this.billInvoiceDate = (e.target as HTMLInputElement).value; }}
                                            class="w-full bg-zinc-800 border border-zinc-700 text-white text-sm rounded-lg px-3 py-2 outline-none focus:border-emerald-500"
                                            required
                                        />
                                    </div>
                                    <div>
                                        <label class="block text-xs font-semibold text-zinc-400 uppercase tracking-wider mb-2">Due Date *</label>
                                        <input
                                            type="date"
                                            .value=${this.billDueDate}
                                            @change=${(e: Event) => { this.billDueDate = (e.target as HTMLInputElement).value; }}
                                            class="w-full bg-zinc-800 border border-zinc-700 text-white text-sm rounded-lg px-3 py-2 outline-none focus:border-emerald-500"
                                            required
                                        />
                                    </div>
                                    <div class="col-span-2">
                                        <label class="block text-xs font-semibold text-zinc-400 uppercase tracking-wider mb-2">Invoice Notes</label>
                                        <textarea
                                            placeholder="Enter bill description/reference/terms details..."
                                            .value=${this.billNotes}
                                            @input=${(e: Event) => { this.billNotes = (e.target as HTMLTextAreaElement).value; }}
                                            class="w-full bg-zinc-800 border border-zinc-700 text-white text-sm rounded-lg px-3 py-2 outline-none focus:border-emerald-500 h-16"
                                        ></textarea>
                                    </div>
                                </div>

                                <!-- Line Items Section -->
                                <div class="border-t border-white/5 pt-4 space-y-3">
                                    <div class="flex justify-between items-center">
                                        <h4 class="text-sm font-semibold text-white uppercase tracking-wider">Line Items</h4>
                                        <button
                                            type="button"
                                            @click=${this._addBillLine}
                                            class="flex items-center gap-1.5 px-3 py-1 bg-zinc-800 hover:bg-zinc-700 border border-zinc-700 text-xs font-semibold text-white rounded transition-colors"
                                        >
                                            ${icon(PlusCircle, 14)} Add Item
                                        </button>
                                    </div>

                                    <div class="space-y-3">
                                        ${this.billLines.map((line, idx) => html`
                                            <div class="grid grid-cols-12 gap-2 items-center bg-white/[0.01] p-2.5 rounded-lg border border-white/5">
                                                <div class="col-span-4">
                                                    <label class="text-[10px] text-zinc-500 block mb-1">Description *</label>
                                                    <input
                                                        type="text"
                                                        placeholder="Item details..."
                                                        .value=${line.description}
                                                        @input=${(e: Event) => {
                                                            this.billLines[idx].description = (e.target as HTMLInputElement).value;
                                                            this.requestUpdate();
                                                        }}
                                                        class="w-full bg-zinc-800 border border-zinc-700 text-white text-xs rounded px-2 py-1.5 outline-none focus:border-emerald-500"
                                                        required
                                                    />
                                                </div>
                                                <div class="col-span-2">
                                                    <label class="text-[10px] text-zinc-500 block mb-1">Qty *</label>
                                                    <input
                                                        type="number"
                                                        step="0.01"
                                                        .value=${String(line.quantity)}
                                                        @input=${(e: Event) => {
                                                            this.billLines[idx].quantity = Number((e.target as HTMLInputElement).value);
                                                            this.requestUpdate();
                                                        }}
                                                        class="w-full bg-zinc-800 border border-zinc-700 text-white text-xs rounded px-2 py-1.5 outline-none focus:border-emerald-500 font-mono"
                                                        required
                                                    />
                                                </div>
                                                <div class="col-span-2">
                                                    <label class="text-[10px] text-zinc-500 block mb-1">Unit Price ($) *</label>
                                                    <input
                                                        type="number"
                                                        step="0.01"
                                                        .value=${String(line.unit_price)}
                                                        @input=${(e: Event) => {
                                                            this.billLines[idx].unit_price = Number((e.target as HTMLInputElement).value);
                                                            this.requestUpdate();
                                                        }}
                                                        class="w-full bg-zinc-800 border border-zinc-700 text-white text-xs rounded px-2 py-1.5 outline-none focus:border-emerald-500 font-mono"
                                                        required
                                                    />
                                                </div>
                                                <div class="col-span-3">
                                                    <label class="text-[10px] text-zinc-500 block mb-1">GL Account *</label>
                                                    <select
                                                        .value=${line.gl_account_id}
                                                        @change=${(e: Event) => {
                                                            this.billLines[idx].gl_account_id = (e.target as HTMLSelectElement).value;
                                                            this.requestUpdate();
                                                        }}
                                                        class="w-full bg-zinc-800 border border-zinc-700 text-white text-xs rounded px-2 py-1.5 outline-none focus:border-emerald-500"
                                                        required
                                                    >
                                                        ${this.glAccounts.map(a => html`<option value=${a.id}>[${a.code}] ${a.name}</option>`)}
                                                    </select>
                                                </div>
                                                <div class="col-span-1 text-center mt-4">
                                                    <button
                                                        type="button"
                                                        @click=${() => this._removeBillLine(idx)}
                                                        class="text-zinc-500 hover:text-rose-400 transition-colors p-1"
                                                        ?disabled=${this.billLines.length === 1}
                                                    >
                                                        ${icon(Trash2, 14)}
                                                    </button>
                                                </div>
                                            </div>
                                        `)}
                                    </div>
                                </div>

                                <!-- Tax & Total Summary -->
                                <div class="border-t border-white/5 pt-4 flex justify-between items-center">
                                    <div class="flex items-center gap-2">
                                        <label class="text-xs font-semibold text-zinc-400 uppercase tracking-wider">Tax Amount ($)</label>
                                        <input
                                            type="number"
                                            step="0.01"
                                            .value=${String(this.billTaxAmount)}
                                            @input=${(e: Event) => { this.billTaxAmount = Number((e.target as HTMLInputElement).value); }}
                                            class="w-24 bg-zinc-800 border border-zinc-700 text-white text-xs rounded px-2 py-1 outline-none focus:border-emerald-500 font-mono"
                                        />
                                    </div>
                                    <div class="text-right">
                                        <span class="text-xs text-zinc-500 uppercase tracking-wider block">Estimated Total</span>
                                        <span class="text-xl font-bold font-mono text-emerald-400">
                                            $${(
                                                this.billLines.reduce((sum, l) => sum + (l.quantity * l.unit_price), 0) + Number(this.billTaxAmount)
                                            ).toLocaleString('en-US', { minimumFractionDigits: 2 })}
                                        </span>
                                    </div>
                                </div>

                                <!-- Form Footer -->
                                <div class="flex justify-end gap-3 border-t border-white/5 pt-4">
                                    <button
                                        type="button"
                                        @click=${() => { this.showLogBillModal = false; }}
                                        class="px-4 py-2 bg-zinc-800 hover:bg-zinc-700 text-zinc-200 border border-zinc-700 rounded-lg text-sm font-semibold transition-colors"
                                    >
                                        Cancel
                                    </button>
                                    <button
                                        type="submit"
                                        class="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg text-sm font-semibold transition-colors shadow-lg shadow-emerald-900/20"
                                    >
                                        Log Bill
                                    </button>
                                </div>
                            </form>
                        </div>
                    </div>
                ` : nothing}

                <!-- 2. Record Payment Modal -->
                ${this.showPayVendorModal ? html`
                    <div class="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
                        <div class="bg-zinc-900 border border-zinc-800 rounded-xl max-w-2xl w-full shadow-2xl animate-in zoom-in-95 duration-200">
                            <div class="flex justify-between items-center p-4 border-b border-white/5 bg-zinc-950/40">
                                <h3 class="text-base font-semibold text-white flex items-center gap-2">
                                    ${icon(CheckCircle2, 18, 'text-emerald-400')} Record Vendor Payment
                                </h3>
                                <button
                                    @click=${() => { this.showPayVendorModal = false; }}
                                    class="text-zinc-500 hover:text-white transition-colors"
                                >
                                    ✕
                                </button>
                            </div>
                            <form @submit=${this._handlePayVendorSubmit} class="p-6 space-y-6">
                                <div class="grid grid-cols-2 gap-4">
                                    <div>
                                        <label class="block text-xs font-semibold text-zinc-400 uppercase tracking-wider mb-2">Vendor Name *</label>
                                        <select
                                            .value=${this.payVendorId}
                                            @change=${(e: Event) => {
                                                this.payVendorId = (e.target as HTMLSelectElement).value;
                                                this.paySelectedInvoiceIds = [];
                                                this.payAmount = 0.00;
                                                this._updateVendorOutstandingInvoices();
                                            }}
                                            class="w-full bg-zinc-800 border border-zinc-700 text-white text-sm rounded-lg px-3 py-2 outline-none focus:border-emerald-500"
                                            required
                                        >
                                            ${this.vendors.map(v => html`<option value=${v.id}>${v.name}</option>`)}
                                        </select>
                                    </div>
                                    <div>
                                        <label class="block text-xs font-semibold text-zinc-400 uppercase tracking-wider mb-2">Payment Amount ($) *</label>
                                        <input
                                            type="number"
                                            step="0.01"
                                            .value=${String(this.payAmount)}
                                            @input=${(e: Event) => { this.payAmount = Number((e.target as HTMLInputElement).value); }}
                                            class="w-full bg-zinc-800 border border-zinc-700 text-white text-sm rounded-lg px-3 py-2 outline-none focus:border-emerald-500 font-mono"
                                            required
                                        />
                                    </div>
                                    <div>
                                        <label class="block text-xs font-semibold text-zinc-400 uppercase tracking-wider mb-2">Payment Method *</label>
                                        <select
                                            .value=${this.payMethod}
                                            @change=${(e: Event) => { this.payMethod = (e.target as HTMLSelectElement).value as any; }}
                                            class="w-full bg-zinc-800 border border-zinc-700 text-white text-sm rounded-lg px-3 py-2 outline-none focus:border-emerald-500"
                                            required
                                        >
                                            <option value="CHECK">CHECK</option>
                                            <option value="ACH">ACH</option>
                                            <option value="WIRE">WIRE</option>
                                        </select>
                                    </div>
                                    <div>
                                        <label class="block text-xs font-semibold text-zinc-400 uppercase tracking-wider mb-2">Payment Date *</label>
                                        <input
                                            type="date"
                                            .value=${this.payDate}
                                            @change=${(e: Event) => { this.payDate = (e.target as HTMLInputElement).value; }}
                                            class="w-full bg-zinc-800 border border-zinc-700 text-white text-sm rounded-lg px-3 py-2 outline-none focus:border-emerald-500"
                                            required
                                        />
                                    </div>
                                    ${this.payMethod === 'CHECK' ? html`
                                        <div>
                                            <label class="block text-xs font-semibold text-zinc-400 uppercase tracking-wider mb-2">Check Number *</label>
                                            <input
                                                type="text"
                                                placeholder="e.g. CHK-5541"
                                                .value=${this.payCheckNumber}
                                                @input=${(e: Event) => { this.payCheckNumber = (e.target as HTMLInputElement).value; }}
                                                class="w-full bg-zinc-800 border border-zinc-700 text-white text-sm rounded-lg px-3 py-2 outline-none focus:border-emerald-500 font-mono"
                                                required
                                            />
                                        </div>
                                    ` : nothing}
                                    <div class="${this.payMethod === 'CHECK' ? '' : 'col-span-2'}">
                                        <label class="block text-xs font-semibold text-zinc-400 uppercase tracking-wider mb-2">Reference Memo</label>
                                        <input
                                            type="text"
                                            placeholder="e.g. Wire transfer ID/Reference details"
                                            .value=${this.payReference}
                                            @input=${(e: Event) => { this.payReference = (e.target as HTMLInputElement).value; }}
                                            class="w-full bg-zinc-800 border border-zinc-700 text-white text-sm rounded-lg px-3 py-2 outline-none focus:border-emerald-500"
                                        />
                                    </div>
                                </div>

                                <!-- Invoices selector checklist -->
                                <div class="border-t border-white/5 pt-4 space-y-3">
                                    <h4 class="text-xs font-semibold text-zinc-400 uppercase tracking-wider">
                                        Apply Payout to Invoices (${this.paySelectedInvoiceIds.length} Selected)
                                    </h4>

                                    <div class="max-h-48 overflow-y-auto space-y-2 border border-zinc-800 p-2 rounded bg-zinc-950/20">
                                        ${this.vendorOutstandingInvoices.length === 0 ? html`
                                            <p class="text-xs text-zinc-500 italic p-4 text-center">No outstanding approved bills for this vendor.</p>
                                        ` : this.vendorOutstandingInvoices.map(inv => html`
                                            <div
                                                @click=${() => this._handlePayInvoiceCheckbox(inv.id)}
                                                class="flex items-center justify-between p-2.5 rounded hover:bg-white/[0.02] cursor-pointer border ${this.paySelectedInvoiceIds.includes(inv.id) ? 'border-emerald-500/40 bg-emerald-500/[0.02]' : 'border-transparent'}"
                                            >
                                                <div class="flex items-center gap-3">
                                                    <input
                                                        type="checkbox"
                                                        .checked=${this.paySelectedInvoiceIds.includes(inv.id)}
                                                        class="rounded border-zinc-700 bg-zinc-800 text-emerald-500 focus:ring-emerald-500"
                                                        @click=${(e: Event) => {
                                                            e.stopPropagation();
                                                            this._handlePayInvoiceCheckbox(inv.id);
                                                        }}
                                                    />
                                                    <div>
                                                        <span class="text-sm font-semibold text-white font-mono">${inv.invoice_number}</span>
                                                        <span class="text-[10px] text-zinc-500 ml-2">Due ${new Date(inv.due_date).toLocaleDateString('en-US', { timeZone: 'UTC' })}</span>
                                                    </div>
                                                </div>
                                                <div class="text-right">
                                                    <span class="text-xs font-mono text-zinc-400 block">Balance: ${this._formatCents(inv.total - inv.amount_paid)}</span>
                                                    <span class="text-[10px] text-zinc-500 font-mono block">Total bill: ${this._formatCents(inv.total)}</span>
                                                </div>
                                            </div>
                                        `)}
                                    </div>
                                </div>

                                <!-- Form Footer -->
                                <div class="flex justify-end gap-3 border-t border-white/5 pt-4">
                                    <button
                                        type="button"
                                        @click=${() => { this.showPayVendorModal = false; }}
                                        class="px-4 py-2 bg-zinc-800 hover:bg-zinc-700 text-zinc-200 border border-zinc-700 rounded-lg text-sm font-semibold transition-colors"
                                    >
                                        Cancel
                                    </button>
                                    <button
                                        type="submit"
                                        class="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg text-sm font-semibold transition-colors shadow-lg shadow-emerald-900/20"
                                    >
                                        Record Payment
                                    </button>
                                </div>
                            </form>
                        </div>
                    </div>
                ` : nothing}

                <!-- 3. View Invoice Details Modal -->
                ${this.showDetailInvoiceModal && this.selectedInvoice ? html`
                    <div class="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
                        <div class="bg-zinc-900 border border-zinc-800 rounded-xl max-w-2xl w-full shadow-2xl animate-in zoom-in-95 duration-200">
                            <div class="flex justify-between items-center p-4 border-b border-white/5 bg-zinc-950/40">
                                <h3 class="text-base font-semibold text-white flex items-center gap-2">
                                    ${icon(Info, 18, 'text-emerald-400')} Invoice Details: ${this.selectedInvoice.invoice_number}
                                </h3>
                                <button
                                    @click=${() => { this.showDetailInvoiceModal = false; }}
                                    class="text-zinc-500 hover:text-white transition-colors"
                                >
                                    ✕
                                </button>
                            </div>
                            <div class="p-6 space-y-6">
                                <!-- Meta Grid -->
                                <div class="grid grid-cols-2 gap-4 text-sm bg-white/[0.01] border border-white/5 p-4 rounded-lg">
                                    <div>
                                        <span class="text-xs text-zinc-500 block">Vendor Name</span>
                                        <span class="text-white font-medium">${this.selectedInvoice.vendor_name || 'Seeded Vendor'}</span>
                                    </div>
                                    <div>
                                        <span class="text-xs text-zinc-500 block">Status</span>
                                        <span class="inline-block mt-0.5 px-2 py-0.5 rounded text-[10px] font-semibold ${this._statusBadgeClass(this.selectedInvoice.status)}">
                                            ${this.selectedInvoice.status}
                                        </span>
                                    </div>
                                    <div>
                                        <span class="text-xs text-zinc-500 block">Invoice Date</span>
                                        <span class="text-zinc-300 font-mono text-xs">${new Date(this.selectedInvoice.invoice_date).toLocaleDateString('en-US', { timeZone: 'UTC' })}</span>
                                    </div>
                                    <div>
                                        <span class="text-xs text-zinc-500 block">Due Date</span>
                                        <span class="text-zinc-300 font-mono text-xs">${new Date(this.selectedInvoice.due_date).toLocaleDateString('en-US', { timeZone: 'UTC' })}</span>
                                    </div>
                                    <div>
                                        <span class="text-xs text-zinc-500 block">Subtotal</span>
                                        <span class="text-zinc-300 font-mono">${this._formatCents(this.selectedInvoice.subtotal)}</span>
                                    </div>
                                    <div>
                                        <span class="text-xs text-zinc-500 block">Tax Amount</span>
                                        <span class="text-zinc-300 font-mono">${this._formatCents(this.selectedInvoice.tax_amount)}</span>
                                    </div>
                                    <div>
                                        <span class="text-xs text-zinc-500 block">Total Amount</span>
                                        <span class="text-white font-bold font-mono">${this._formatCents(this.selectedInvoice.total)}</span>
                                    </div>
                                    <div>
                                        <span class="text-xs text-zinc-500 block">Amount Paid</span>
                                        <span class="text-emerald-400 font-bold font-mono">${this._formatCents(this.selectedInvoice.amount_paid)}</span>
                                    </div>
                                    ${this.selectedInvoice.approved_at ? html`
                                        <div class="col-span-2 border-t border-white/5 pt-2 mt-2">
                                            <span class="text-xs text-zinc-500 block">Approval Info</span>
                                            <span class="text-zinc-400 text-xs">
                                                Approved on ${new Date(this.selectedInvoice.approved_at).toLocaleString()} by ${this.selectedInvoice.approved_by || 'Finance System'}
                                            </span>
                                        </div>
                                    ` : nothing}
                                    ${this.selectedInvoice.notes ? html`
                                        <div class="col-span-2 mt-2">
                                            <span class="text-xs text-zinc-500 block">Notes</span>
                                            <span class="text-zinc-400 text-xs italic">"${this.selectedInvoice.notes}"</span>
                                        </div>
                                    ` : nothing}
                                </div>

                                <!-- Line Items List -->
                                <div class="space-y-2">
                                    <h4 class="text-xs font-semibold text-zinc-400 uppercase tracking-wider">Line Items Details</h4>
                                    <div class="backdrop-blur-md bg-white/5 border border-white/10 rounded-xl overflow-hidden">
                                        <table class="w-full text-xs">
                                            <thead>
                                                <tr class="border-b border-white/10 text-zinc-400 font-semibold uppercase bg-zinc-950/20">
                                                    <th class="text-left px-3 py-2">Description</th>
                                                    <th class="text-right px-3 py-2 w-16">Qty</th>
                                                    <th class="text-right px-3 py-2 w-28">Unit Price</th>
                                                    <th class="text-right px-3 py-2 w-28">Total Price</th>
                                                </tr>
                                            </thead>
                                            <tbody class="divide-y divide-white/5">
                                                ${!this.selectedInvoice.lines || this.selectedInvoice.lines.length === 0 ? html`
                                                    <tr>
                                                        <td colspan="4" class="px-3 py-4 text-center text-zinc-500 italic">No line items.</td>
                                                    </tr>
                                                ` : this.selectedInvoice.lines.map(line => html`
                                                    <tr class="hover:bg-white/[0.02] transition-colors text-zinc-300">
                                                        <td class="px-3 py-2 font-medium">${line.description}</td>
                                                        <td class="px-3 py-2 text-right font-mono">${line.quantity}</td>
                                                        <td class="px-3 py-2 text-right font-mono">${this._formatCents(line.unit_price)}</td>
                                                        <td class="px-3 py-2 text-right font-mono text-zinc-100">${this._formatCents(line.line_total)}</td>
                                                    </tr>
                                                `)}
                                            </tbody>
                                        </table>
                                    </div>
                                </div>

                                <!-- Actions Footer -->
                                <div class="flex justify-end gap-3 border-t border-white/5 pt-4">
                                    ${this.selectedInvoice.status === 'PENDING' ? html`
                                        <button
                                            @click=${() => this._handleApproveInvoice(this.selectedInvoice!.id)}
                                            class="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg text-sm font-semibold transition-colors"
                                        >
                                            Approve & Post to GL
                                        </button>
                                    ` : nothing}
                                    <button
                                        type="button"
                                        @click=${() => { this.showDetailInvoiceModal = false; }}
                                        class="px-4 py-2 bg-zinc-800 hover:bg-zinc-700 text-zinc-200 border border-zinc-700 rounded-lg text-sm font-semibold transition-colors"
                                    >
                                        Close
                                    </button>
                                </div>
                            </div>
                        </div>
                    </div>
                ` : nothing}
            </div>
        `;
    }
}

export default AccountsPayable;
