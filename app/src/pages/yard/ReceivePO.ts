import { LitElement, html, nothing } from 'lit';
import { customElement, state } from 'lit/decorators.js';
import { icon } from '../../lib/icons.ts';
import { ToastService } from '../../lib/toast-service.ts';
import { ScanBarcode, ChevronRight, ArrowLeft, Check, Package, Loader2, ScanLine } from 'lucide';
import { PurchaseOrderService } from '../../services/PurchaseOrderService';
import type { PurchaseOrder } from '../../types/purchaseOrder';
import '../../components/BarcodeScanner.ts';

@customElement('gable-receive-po')
export class ReceivePO extends LitElement {
    createRenderRoot() { return this; }

    @state() private pos: PurchaseOrder[] = [];
    @state() private loading = true;
    @state() private selectedPO: PurchaseOrder | null = null;
    @state() private receivedQtys: Record<string, string> = {};
    @state() private submitting = false;
    @state() private submitted = false;
    @state() private isScanning = false;

    connectedCallback() {
        super.connectedCallback();
        PurchaseOrderService.listPOs()
            .then(data => {
                this.pos = data.filter(po => po.status === 'SENT' || po.status === 'PARTIAL');
            })
            .catch(() => { this.pos = []; ToastService.show('Failed to load purchase orders', 'error'); })
            .finally(() => { this.loading = false; });
    }

    private _handleScan(barcode: string) {
        if (!this.selectedPO || !this.selectedPO.lines) return;

        const lineItem = this.selectedPO.lines.find(l =>
            l.product_id === barcode ||
            (l.description && l.description.toLowerCase().includes(barcode.toLowerCase()))
        );

        if (lineItem) {
            const currentQty = parseFloat(this.receivedQtys[lineItem.id] || '0');
            const newQty = currentQty + 1;

            if (newQty > lineItem.quantity) {
                ToastService.show(`Cannot receive more than ordered for: ${lineItem.description}`, 'error');
                return;
            }

            ToastService.show(`Scanned: ${lineItem.description} (+1)`, 'success');
            this.receivedQtys = { ...this.receivedQtys, [lineItem.id]: String(newQty) };
        } else {
            ToastService.show(`Item not found on this PO: ${barcode}`, 'error');
        }
    }

    private async _selectPO(po: PurchaseOrder) {
        try {
            const detail = await PurchaseOrderService.getPO(po.id);
            this.selectedPO = detail;
            this.receivedQtys = {};
            this.submitted = false;
        } catch (err) {
            console.error('Failed to load PO:', err);
            ToastService.show('Failed to load purchase order details', 'error');
        }
    }

    private async _handleReceive() {
        if (!this.selectedPO) return;
        this.submitting = true;
        try {
            const lines = (this.selectedPO.lines || []).map(line => ({
                line_id: line.id,
                qty_received: parseFloat(this.receivedQtys[line.id] || '0'),
                location_id: '',
            })).filter(l => l.qty_received > 0);

            if (lines.length > 0) {
                await PurchaseOrderService.receivePO(this.selectedPO.id, { lines });
            }
            this.submitted = true;
        } catch (err) {
            console.error('Failed to receive PO:', err);
            ToastService.show('Failed to receive purchase order', 'error');
        }
        this.submitting = false;
    }

    private _statusConfig(status: string): string {
        switch (status) {
            case 'SENT': return 'text-blue-400 bg-blue-500/10 border-blue-500/20';
            case 'PARTIAL': return 'text-amber-400 bg-amber-500/10 border-amber-500/20';
            default: return 'text-zinc-400 bg-zinc-500/10 border-zinc-500/20';
        }
    }

    render() {
        if (this.loading) {
            return html`
                <div class="flex justify-center items-center h-64">
                    <div class="animate-spin rounded-full h-10 w-10 border-b-2 border-amber-400"></div>
                </div>
            `;
        }

        return html`
            <div class="flex flex-col space-y-4 p-4 max-w-md mx-auto">
                ${!this.selectedPO ? html`
                    <h1 class="text-xl font-bold text-white tracking-tight flex items-center gap-2">
                        ${icon(ScanBarcode, 20, 'text-amber-400')}
                        Receiving
                    </h1>
                    <p class="text-sm text-zinc-400">
                        ${this.pos.length} purchase order${this.pos.length !== 1 ? 's' : ''} awaiting receiving
                    </p>

                    ${this.pos.length === 0 ? html`
                        <div class="text-center py-16 flex flex-col items-center gap-4 opacity-50">
                            ${icon(Package, 56, 'text-zinc-600')}
                            <p class="text-zinc-400 text-lg">No POs to receive</p>
                        </div>
                    ` : nothing}

                    <div class="space-y-2">
                        ${this.pos.map(po => html`
                            <div
                                class="rounded-2xl border border-white/[0.06] bg-[#161821]/80 backdrop-blur-xl active:scale-[0.98] transition-all cursor-pointer border-white/5 hover:border-amber-400/30"
                                @click=${() => this._selectPO(po)}
                            >
                                <div class="p-4">
                                    <div class="flex justify-between items-start mb-2">
                                        <div>
                                            <div class="font-medium text-white text-sm">
                                                ${po.vendor_name || 'Vendor'}
                                            </div>
                                            <div class="text-xs text-zinc-500 font-mono mt-0.5">
                                                PO #${po.id.slice(-6).toUpperCase()}
                                            </div>
                                        </div>
                                        <div class="flex items-center gap-2">
                                            <span class="text-[10px] font-mono px-2 py-0.5 rounded border uppercase tracking-wide ${this._statusConfig(po.status)}">
                                                ${po.status}
                                            </span>
                                            ${icon(ChevronRight, 16, 'text-zinc-600')}
                                        </div>
                                    </div>
                                    <div class="text-xs text-zinc-500">
                                        ${po.lines?.length || '?'} line items &middot; ${new Date(po.created_at).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
                                    </div>
                                </div>
                            </div>
                        `)}
                    </div>
                ` : this.submitted ? html`
                    <div class="text-center py-16 flex flex-col items-center gap-4 min-h-[60vh] justify-center">
                        <div class="w-16 h-16 rounded-full bg-emerald-500/10 flex items-center justify-center">
                            ${icon(Check, 32, 'text-emerald-400')}
                        </div>
                        <p class="text-white font-medium text-lg">Receiving Complete</p>
                        <p class="text-zinc-500 text-sm">PO #${this.selectedPO.id.slice(-6).toUpperCase()} updated</p>
                        <button
                            @click=${() => { this.selectedPO = null; this.submitted = false; }}
                            class="mt-4 px-6 py-2 bg-white/5 border border-white/10 text-white rounded-lg text-sm hover:bg-white/10 transition-colors"
                        >
                            Back to List
                        </button>
                    </div>
                ` : html`
                    <!-- PO Detail -->
                    <div class="flex justify-between items-center mb-4">
                        <div class="flex items-center gap-3">
                            <button
                                @click=${() => { this.selectedPO = null; }}
                                class="p-2 rounded-full bg-white/5 hover:bg-white/10 text-zinc-400 transition-colors"
                                aria-label="Go back"
                            >
                                ${icon(ArrowLeft, 20)}
                            </button>
                            <div>
                                <div class="font-bold text-lg text-white">${this.selectedPO.vendor_name || 'Vendor'}</div>
                                <div class="text-xs text-zinc-500 font-mono">
                                    PO #${this.selectedPO.id.slice(-6).toUpperCase()}
                                </div>
                            </div>
                        </div>
                        <button
                            @click=${() => { this.isScanning = true; }}
                            class="flex items-center gap-1.5 text-xs bg-zinc-800 hover:bg-zinc-700 text-amber-400 py-1.5 px-3 rounded-lg border border-white/10 transition-colors"
                        >
                            ${icon(ScanLine, 16)}
                            Scan Line
                        </button>
                    </div>

                    ${this.isScanning ? html`
                        <gable-barcode-scanner
                            @scan=${(e: CustomEvent) => { this.isScanning = false; this._handleScan(e.detail); }}
                            @close=${() => { this.isScanning = false; }}
                        ></gable-barcode-scanner>
                    ` : nothing}

                    <div class="space-y-2">
                        ${(this.selectedPO.lines || []).map(line => {
                            const remaining = line.quantity - (line.qty_received || 0);
                            return html`
                                <div class="rounded-2xl border border-white/[0.06] bg-[#161821]/80 backdrop-blur-xl border-white/5">
                                    <div class="p-4">
                                        <div class="flex items-center gap-3">
                                            <div class="flex-1 min-w-0">
                                                <div class="font-medium text-white text-sm truncate">${line.description}</div>
                                                <div class="text-xs text-zinc-500 mt-0.5 flex gap-3">
                                                    <span class="font-mono">Ordered: ${line.quantity}</span>
                                                    ${(line.qty_received || 0) > 0 ? html`
                                                        <span class="font-mono text-emerald-400">Rcvd: ${line.qty_received}</span>
                                                    ` : nothing}
                                                </div>
                                            </div>
                                            <div class="shrink-0 flex flex-col items-end gap-1">
                                                <div class="text-[10px] text-zinc-500">Receiving</div>
                                                <input
                                                    type="number"
                                                    inputmode="numeric"
                                                    .value=${this.receivedQtys[line.id] || ''}
                                                    @input=${(e: InputEvent) => { this.receivedQtys = { ...this.receivedQtys, [line.id]: (e.target as HTMLInputElement).value }; }}
                                                    placeholder="${remaining}"
                                                    class="w-20 text-center bg-black/20 border border-white/10 rounded-lg py-2 font-mono text-sm text-white focus:outline-none focus:border-amber-400/50 transition-colors"
                                                />
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            `;
                        })}
                    </div>

                    <!-- Receive Button -->
                    <div class="sticky bottom-20 pt-4">
                        <button
                            @click=${() => this._handleReceive()}
                            ?disabled=${this.submitting}
                            class="w-full py-4 rounded-xl font-bold text-lg font-mono uppercase tracking-wider bg-amber-400 text-black hover:bg-amber-300 active:scale-[0.98] shadow-lg shadow-amber-400/20 transition-all"
                        >
                            ${this.submitting ? html`
                                <span class="flex items-center justify-center gap-2">
                                    ${icon(Loader2, 20, 'animate-spin')} Receiving...
                                </span>
                            ` : html`
                                <span class="flex items-center justify-center gap-2">
                                    ${icon(ScanBarcode, 20)} Confirm Received
                                </span>
                            `}
                        </button>
                    </div>
                `}
            </div>
        `;
    }
}
