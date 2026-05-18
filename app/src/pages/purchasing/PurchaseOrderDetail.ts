import { LitElement, html, nothing } from 'lit';
import { customElement, state, property, query } from 'lit/decorators.js';
import { icon } from '../../lib/icons.ts';
import { router } from '../../lib/router.ts';
import { ToastService } from '../../lib/toast-service.ts';
import { PurchaseOrderService } from '../../services/PurchaseOrderService';
import { LocationService } from '../../services/LocationService';
import type { PurchaseOrder, PurchaseOrderLine, FreightCharge, FreightUploadResponse } from '../../types/purchaseOrder';
import type { Location } from '../../types/location';
import { ArrowLeft, Send, PackageCheck, Upload, Truck, CheckCircle, ChevronDown, ChevronUp } from 'lucide';

@customElement('gable-purchase-order-detail')
export class PurchaseOrderDetail extends LitElement {
    createRenderRoot() { return this; }

    @property({ attribute: 'route-id' }) routeId = '';

    @state() private po: PurchaseOrder | null = null;
    @state() private locations: Location[] = [];
    @state() private receiving = false;
    @state() private receiveData: Record<string, { qty: number; locationId: string }> = {};
    @state() private isSubmitting = false;

    @state() private freightCharges: FreightCharge[] = [];
    @state() private freightUploading = false;
    @state() private freightPreview: FreightUploadResponse | null = null;
    @state() private applyingFreight = false;
    @state() private expandedFreight: string | null = null;

    @query('#freight-file-input') private freightFileInput!: HTMLInputElement;

    connectedCallback() {
        super.connectedCallback();
        if (this.routeId) {
            this._loadPO(this.routeId);
            this._loadFreightCharges(this.routeId);
            LocationService.listLocations().then(l => this.locations = l).catch(() => this.locations = []);
        }
    }

    private async _loadPO(poId: string) {
        try {
            const data = await PurchaseOrderService.getPO(poId);
            this.po = data;
            const initial: Record<string, { qty: number; locationId: string }> = {};
            (data.lines || []).forEach((line: PurchaseOrderLine) => {
                initial[line.id] = { qty: line.quantity - line.qty_received, locationId: '' };
            });
            this.receiveData = initial;
        } catch (err) {
            console.error(err);
            ToastService.show('Failed to load purchase order', 'error');
        }
    }

    private async _loadFreightCharges(poId: string) {
        try {
            const charges = await PurchaseOrderService.getFreightCharges(poId);
            this.freightCharges = charges;
        } catch {
            // Freight charges may not exist yet
        }
    }

    private async _handleSubmitPO() {
        if (!this.po) return;
        this.isSubmitting = true;
        try {
            await PurchaseOrderService.submitPO(this.po.id);
            ToastService.show('Purchase order submitted to vendor', 'success');
            this._loadPO(this.po.id);
        } catch (err) {
            console.error(err);
            ToastService.show('Failed to submit PO', 'error');
        } finally {
            this.isSubmitting = false;
        }
    }

    private async _handleReceive() {
        if (!this.po) return;
        this.isSubmitting = true;
        try {
            const lines = Object.entries(this.receiveData)
                .filter(([, v]) => v.qty > 0 && v.locationId)
                .map(([lineId, v]) => ({
                    line_id: lineId,
                    qty_received: v.qty,
                    location_id: v.locationId,
                }));

            if (lines.length === 0) {
                ToastService.show('Enter quantities and select locations to receive', 'error');
                this.isSubmitting = false;
                return;
            }

            await PurchaseOrderService.receivePO(this.po.id, { lines });
            ToastService.show('Items received into inventory', 'success');
            this.receiving = false;
            this._loadPO(this.po.id);
        } catch (err) {
            console.error(err);
            ToastService.show('Failed to receive items', 'error');
        } finally {
            this.isSubmitting = false;
        }
    }

    private async _handleFreightUpload(e: Event) {
        const input = e.target as HTMLInputElement;
        const file = input.files?.[0];
        if (!file || !this.po) return;

        this.freightUploading = true;
        try {
            const result = await PurchaseOrderService.uploadFreightInvoice(this.po.id, file);
            this.freightPreview = result;
            ToastService.show('Freight invoice processed', 'success');
        } catch (err) {
            console.error(err);
            ToastService.show(err instanceof Error ? err.message : 'Failed to process freight invoice', 'error');
        } finally {
            this.freightUploading = false;
            if (this.freightFileInput) this.freightFileInput.value = '';
        }
    }

    private async _handleApplyFreight() {
        if (!this.po || !this.freightPreview) return;
        this.applyingFreight = true;
        try {
            await PurchaseOrderService.applyFreight(this.po.id, this.freightPreview.freight_charge.id);
            ToastService.show('Freight costs applied to inventory', 'success');
            this.freightPreview = null;
            this._loadFreightCharges(this.po.id);
        } catch (err) {
            console.error(err);
            ToastService.show('Failed to apply freight charge', 'error');
        } finally {
            this.applyingFreight = false;
        }
    }

    private _updateReceiveQty(lineId: string, qty: number) {
        this.receiveData = {
            ...this.receiveData,
            [lineId]: { ...this.receiveData[lineId], qty },
        };
    }

    private _updateReceiveLocation(lineId: string, locationId: string) {
        this.receiveData = {
            ...this.receiveData,
            [lineId]: { ...this.receiveData[lineId], locationId },
        };
    }

    private _formatCents(cents: number) {
        return `$${(cents / 100).toFixed(2)}`;
    }

    render() {
        if (!this.po) {
            return html`
                <div class="p-12 flex justify-center">
                    <div class="animate-spin rounded-full h-8 w-8 border-b-2 border-gable-green"></div>
                </div>
            `;
        }

        const canSubmit = this.po.status === 'DRAFT';
        const canReceive = this.po.status === 'SENT' || this.po.status === 'PARTIAL';
        const canUploadFreight = this.po.status === 'RECEIVED' || this.po.status === 'PARTIAL';

        return html`
            <div class="flex items-center gap-4 mb-6">
                <button @click=${() => router.navigate('/purchasing')} class="p-2 rounded-full bg-white/5 hover:bg-white/10 text-zinc-400 transition-colors">
                    ${icon(ArrowLeft, 20, 'w-5 h-5')}
                </button>
                <div class="flex-1">
                    <h1 class="text-2xl font-bold text-white">PO #${this.po.id.slice(0, 8)}</h1>
                    <p class="text-sm text-zinc-400 flex items-center gap-2">
                        <span>Status: <span class="font-bold uppercase">${this.po.status}</span></span>
                        <span class="px-2 py-0.5 rounded text-xs font-bold uppercase border border-white/10 bg-white/5">
                            ${this.po.source || 'MANUAL'}
                        </span>
                    </p>
                </div>
                <div class="flex gap-3">
                    ${canSubmit ? html`
                        <button
                            @click=${this._handleSubmitPO}
                            ?disabled=${this.isSubmitting}
                            class="inline-flex items-center gap-2 bg-[#00FFA3] text-black font-semibold px-4 py-2 rounded hover:shadow-[0_0_10px_rgba(0,255,163,0.3)] transition-all disabled:opacity-50"
                        >
                            ${icon(Send, 16, 'w-4 h-4')}
                            Submit to Vendor
                        </button>
                    ` : nothing}
                    ${canReceive && !this.receiving ? html`
                        <button
                            @click=${() => this.receiving = true}
                            class="inline-flex items-center gap-2 bg-[#00FFA3] text-black font-semibold px-4 py-2 rounded hover:shadow-[0_0_10px_rgba(0,255,163,0.3)] transition-all"
                        >
                            ${icon(PackageCheck, 16, 'w-4 h-4')}
                            Receive Items
                        </button>
                    ` : nothing}
                </div>
            </div>

            <div class="backdrop-blur-md bg-white/5 border border-white/10 rounded-xl">
                <div class="p-0">
                    <table class="w-full text-sm text-left">
                        <thead class="bg-white/5 text-zinc-400 uppercase tracking-wider text-xs font-semibold">
                            <tr>
                                <th class="px-6 py-4">Description</th>
                                <th class="px-6 py-4 text-right">Ordered</th>
                                <th class="px-6 py-4 text-right">Received</th>
                                <th class="px-6 py-4 text-right">Unit Cost</th>
                                <th class="px-6 py-4 text-right">Line Total</th>
                                ${this.receiving ? html`<th class="px-6 py-4 text-right">Receive Qty</th>` : nothing}
                                ${this.receiving ? html`<th class="px-6 py-4">Location</th>` : nothing}
                            </tr>
                        </thead>
                        <tbody class="divide-y divide-white/5">
                            ${(this.po.lines || []).map((line) => {
                                const remaining = line.quantity - line.qty_received;
                                return html`
                                    <tr class="hover:bg-white/5 transition-colors">
                                        <td class="px-6 py-4">
                                            <span class="text-white">${line.description}</span>
                                            ${line.product_id ? html`
                                                <span class="text-zinc-500 text-xs ml-2">(${line.product_id.slice(0, 8)})</span>
                                            ` : nothing}
                                        </td>
                                        <td class="px-6 py-4 text-right font-mono text-zinc-300">${line.quantity}</td>
                                        <td class="px-6 py-4 text-right font-mono">
                                            <span class="${line.qty_received >= line.quantity ? 'text-emerald-400' : 'text-amber-400'}">
                                                ${line.qty_received}
                                            </span>
                                        </td>
                                        <td class="px-6 py-4 text-right font-mono text-zinc-300">$${line.cost.toFixed(2)}</td>
                                        <td class="px-6 py-4 text-right font-mono text-emerald-400 font-bold">
                                            $${(line.quantity * line.cost).toFixed(2)}
                                        </td>
                                        ${this.receiving ? html`
                                            <td class="px-6 py-4 text-right">
                                                <input
                                                    type="number"
                                                    min="0"
                                                    max="${remaining}"
                                                    step="any"
                                                    .value=${String(this.receiveData[line.id]?.qty || 0)}
                                                    @input=${(e: Event) => this._updateReceiveQty(line.id, Number((e.target as HTMLInputElement).value))}
                                                    class="w-24 bg-black/20 border border-white/10 rounded px-2 py-1 text-white font-mono text-right focus:border-[#00FFA3] outline-none"
                                                    ?disabled=${remaining <= 0}
                                                />
                                            </td>
                                        ` : nothing}
                                        ${this.receiving ? html`
                                            <td class="px-6 py-4">
                                                <select
                                                    .value=${this.receiveData[line.id]?.locationId || ''}
                                                    @change=${(e: Event) => this._updateReceiveLocation(line.id, (e.target as HTMLSelectElement).value)}
                                                    class="w-40 bg-black/20 border border-white/10 rounded px-2 py-1 text-white focus:border-[#00FFA3] outline-none"
                                                    ?disabled=${remaining <= 0}
                                                >
                                                    <option value="">Select...</option>
                                                    ${this.locations.map(loc => html`
                                                        <option value="${loc.id}">${loc.path || loc.code}</option>
                                                    `)}
                                                </select>
                                            </td>
                                        ` : nothing}
                                    </tr>
                                `;
                            })}
                        </tbody>
                    </table>
                </div>
            </div>

            ${this.receiving ? html`
                <div class="flex justify-end gap-3 mt-4">
                    <button
                        @click=${() => this.receiving = false}
                        class="px-4 py-2 text-gray-400 hover:text-white transition-colors"
                    >
                        Cancel
                    </button>
                    <button
                        @click=${this._handleReceive}
                        ?disabled=${this.isSubmitting}
                        class="inline-flex items-center gap-2 bg-[#00FFA3] text-black font-semibold px-4 py-2 rounded shadow-glow hover:shadow-[0_0_10px_rgba(0,255,163,0.3)] transition-all disabled:opacity-50"
                    >
                        ${icon(PackageCheck, 16, 'w-4 h-4')}
                        Confirm Receipt
                    </button>
                </div>
            ` : nothing}

            ${canUploadFreight ? html`
                <div class="mt-6 space-y-4">
                    <h2 class="text-lg font-semibold text-white flex items-center gap-2">
                        ${icon(Truck, 20, 'w-5 h-5 text-zinc-400')}
                        Freight Invoices
                    </h2>

                    ${this.freightCharges.filter(fc => fc.status === 'APPLIED').map(fc => html`
                        <div class="backdrop-blur-md bg-white/5 border border-white/10 rounded-xl">
                            <div class="p-4">
                                <div class="flex items-center justify-between">
                                    <div class="flex items-center gap-3">
                                        ${icon(CheckCircle, 20, 'w-5 h-5 text-emerald-400')}
                                        <div>
                                            <span class="text-emerald-400 font-semibold">
                                                Freight Applied -- ${this._formatCents(fc.total_amount_cents)}
                                            </span>
                                            ${fc.carrier_name ? html`
                                                <span class="text-zinc-400 ml-2">from ${fc.carrier_name}</span>
                                            ` : nothing}
                                            ${fc.invoice_number ? html`
                                                <span class="text-zinc-500 text-xs ml-2">(#${fc.invoice_number})</span>
                                            ` : nothing}
                                        </div>
                                    </div>
                                    <button
                                        @click=${() => this.expandedFreight = this.expandedFreight === fc.id ? null : fc.id}
                                        class="text-zinc-400 hover:text-white transition-colors"
                                    >
                                        ${this.expandedFreight === fc.id ? icon(ChevronUp, 16, 'w-4 h-4') : icon(ChevronDown, 16, 'w-4 h-4')}
                                    </button>
                                </div>
                                ${this.expandedFreight === fc.id && fc.allocations && fc.allocations.length > 0 ? html`
                                    <table class="w-full text-sm mt-3">
                                        <thead class="text-zinc-500 text-xs uppercase">
                                            <tr>
                                                <th class="text-left py-2">Line Item</th>
                                                <th class="text-right py-2">Allocated</th>
                                                <th class="text-right py-2">Per Unit</th>
                                            </tr>
                                        </thead>
                                        <tbody class="divide-y divide-white/5">
                                            ${fc.allocations.map(a => html`
                                                <tr>
                                                    <td class="py-2 text-zinc-300">${a.description || a.po_line_id.slice(0, 8)}</td>
                                                    <td class="py-2 text-right font-mono text-zinc-300">${this._formatCents(a.allocated_cents)}</td>
                                                    <td class="py-2 text-right font-mono text-zinc-300">${this._formatCents(a.per_unit_cents)}</td>
                                                </tr>
                                            `)}
                                        </tbody>
                                    </table>
                                ` : nothing}
                            </div>
                        </div>
                    `)}

                    ${this.freightPreview ? html`
                        <div class="backdrop-blur-md bg-white/5 border border-white/10 rounded-xl">
                            <div class="p-4 space-y-4">
                                <div class="flex items-center gap-3">
                                    ${icon(Truck, 20, 'w-5 h-5 text-amber-400')}
                                    <div>
                                        <span class="text-white font-semibold">Freight Invoice Preview</span>
                                        <span class="text-zinc-400 text-sm ml-2">-- Review before applying</span>
                                    </div>
                                </div>

                                <div class="grid grid-cols-3 gap-4">
                                    <div>
                                        <p class="text-xs text-zinc-500 uppercase">Carrier</p>
                                        <p class="text-white font-medium">${this.freightPreview.freight_charge.carrier_name || '--'}</p>
                                    </div>
                                    <div>
                                        <p class="text-xs text-zinc-500 uppercase">Invoice #</p>
                                        <p class="text-white font-medium">${this.freightPreview.freight_charge.invoice_number || '--'}</p>
                                    </div>
                                    <div>
                                        <p class="text-xs text-zinc-500 uppercase">Total Freight</p>
                                        <p class="text-emerald-400 font-bold text-lg">${this._formatCents(this.freightPreview.freight_charge.total_amount_cents)}</p>
                                    </div>
                                </div>

                                ${this.freightPreview.allocations.length > 0 ? html`
                                    <table class="w-full text-sm">
                                        <thead class="text-zinc-500 text-xs uppercase bg-white/5">
                                            <tr>
                                                <th class="text-left px-4 py-2">Description</th>
                                                <th class="text-right px-4 py-2">Allocated Freight</th>
                                                <th class="text-right px-4 py-2">Per Unit Freight</th>
                                            </tr>
                                        </thead>
                                        <tbody class="divide-y divide-white/5">
                                            ${this.freightPreview.allocations.map(a => html`
                                                <tr>
                                                    <td class="px-4 py-2 text-zinc-300">${a.description || a.po_line_id.slice(0, 8)}</td>
                                                    <td class="px-4 py-2 text-right font-mono text-amber-400">${this._formatCents(a.allocated_cents)}</td>
                                                    <td class="px-4 py-2 text-right font-mono text-zinc-300">${this._formatCents(a.per_unit_cents)}</td>
                                                </tr>
                                            `)}
                                        </tbody>
                                    </table>
                                ` : nothing}

                                <div class="flex justify-end gap-3 pt-2">
                                    <button
                                        @click=${() => this.freightPreview = null}
                                        class="px-4 py-2 text-gray-400 hover:text-white transition-colors"
                                    >
                                        Cancel
                                    </button>
                                    <button
                                        @click=${this._handleApplyFreight}
                                        ?disabled=${this.applyingFreight}
                                        class="inline-flex items-center gap-2 bg-[#00FFA3] text-black font-semibold px-4 py-2 rounded shadow-glow hover:shadow-[0_0_10px_rgba(0,255,163,0.3)] transition-all disabled:opacity-50"
                                    >
                                        ${icon(CheckCircle, 16, 'w-4 h-4')}
                                        Apply to Inventory Costs
                                    </button>
                                </div>
                            </div>
                        </div>
                    ` : nothing}

                    ${!this.freightPreview ? html`
                        <div class="backdrop-blur-md bg-white/5 border border-white/10 rounded-xl">
                            <div class="p-4">
                                <input
                                    id="freight-file-input"
                                    type="file"
                                    accept=".pdf,.png,.jpg,.jpeg,.webp"
                                    @change=${this._handleFreightUpload}
                                    class="hidden"
                                />
                                <button
                                    @click=${() => this.freightFileInput?.click()}
                                    ?disabled=${this.freightUploading}
                                    class="w-full flex items-center justify-center gap-2 py-4 border-2 border-dashed border-white/10 rounded-lg text-zinc-400 hover:text-white hover:border-white/20 transition-colors disabled:opacity-50"
                                >
                                    ${this.freightUploading ? html`
                                        <div class="animate-spin rounded-full h-4 w-4 border-b-2 border-gable-green"></div>
                                        Processing freight invoice...
                                    ` : html`
                                        ${icon(Upload, 16, 'w-4 h-4')}
                                        Upload Freight Invoice
                                        <span class="text-xs text-zinc-500">(PDF, PNG, JPG)</span>
                                    `}
                                </button>
                            </div>
                        </div>
                    ` : nothing}
                </div>
            ` : nothing}
        `;
    }
}
