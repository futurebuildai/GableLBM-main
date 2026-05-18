import { LitElement, html, nothing } from 'lit';
import { customElement, property, state } from 'lit/decorators.js';
import { icon } from '../../../lib/icons.ts';
import { MapPin, Plus, Minus, ArrowRightLeft, Loader2, Warehouse } from 'lucide';
import { InventoryService } from '../../../services/InventoryService.ts';
import { ToastService } from '../../../lib/toast-service.ts';
import type { Inventory } from '../../../types/product.ts';

@customElement('gable-product-stock-tab')
export class GableProductStockTab extends LitElement {
    createRenderRoot() { return this; }

    @property({ type: String }) productId = '';
    @property({ type: String }) productDescription = '';

    @state() private inventory: Inventory[] = [];
    @state() private loading = true;
    @state() private adjustModal: { locationId: string; locationName: string } | null = null;
    @state() private adjustQty = '';
    @state() private adjustReason = '';
    @state() private adjusting = false;

    connectedCallback() {
        super.connectedCallback();
        this._loadInventory();
    }

    private async _loadInventory() {
        try {
            const data = await InventoryService.getInventoryByProduct(this.productId);
            this.inventory = data || [];
        } catch (err) {
            console.error('Failed to load inventory:', err);
            ToastService.show('Failed to load inventory data', 'error');
        } finally {
            this.loading = false;
        }
    }

    private async _handleAdjust(delta: number) {
        if (!this.adjustModal || !this.adjustQty) return;
        this.adjusting = true;
        try {
            await InventoryService.adjustStock({
                product_id: this.productId,
                location_id: this.adjustModal.locationId,
                quantity: delta * Number(this.adjustQty),
                reason: this.adjustReason || 'Manual adjustment',
                is_delta: true,
            });
            this.adjustModal = null;
            this.adjustQty = '';
            this.adjustReason = '';
            this._loadInventory();
        } catch (err) {
            console.error('Adjust failed:', err);
            ToastService.show('Failed to adjust stock', 'error');
        } finally {
            this.adjusting = false;
        }
    }

    private get totalQty(): number {
        return this.inventory.reduce((sum, i) => sum + (i.quantity || 0), 0);
    }

    private get totalAlloc(): number {
        return this.inventory.reduce((sum, i) => sum + (i.allocated || 0), 0);
    }

    private _getStockColorClass(color: string): string {
        switch (color) {
            case 'emerald': return 'text-emerald-400';
            case 'amber': return 'text-amber-400';
            case 'rose': return 'text-rose-500';
            default: return 'text-white';
        }
    }

    private _renderSummaryCard(label: string, value: number, color = 'white') {
        return html`
            <div class="bg-zinc-900 border border-white/10 rounded-xl p-4 text-center">
                <div class="text-xs text-zinc-500 mb-1">${label}</div>
                <div class="text-2xl font-mono font-bold ${this._getStockColorClass(color)}">
                    ${value.toLocaleString()}
                </div>
            </div>
        `;
    }

    private _openAdjustModal(locationId: string, locationName: string) {
        this.adjustModal = { locationId, locationName };
    }

    private _closeAdjustModal() {
        this.adjustModal = null;
        this.adjustQty = '';
        this.adjustReason = '';
    }

    render() {
        if (this.loading) {
            return html`
                <div class="flex items-center justify-center py-12">
                    ${icon(Loader2, 24, 'w-6 h-6 text-zinc-500 animate-spin')}
                </div>
            `;
        }

        const totalAvail = this.totalQty - this.totalAlloc;

        return html`
            <div class="space-y-6">
                <!-- Summary -->
                <div class="grid grid-cols-3 gap-4">
                    ${this._renderSummaryCard('Total On Hand', this.totalQty)}
                    ${this._renderSummaryCard('Total Allocated', this.totalAlloc, 'amber')}
                    ${this._renderSummaryCard('Total Available', totalAvail, totalAvail < 100 ? 'rose' : 'emerald')}
                </div>

                <!-- Location Table -->
                ${this.inventory.length === 0
                    ? html`
                        <div class="bg-zinc-900 border border-white/10 rounded-xl p-12 text-center">
                            ${icon(Warehouse, 48, 'w-12 h-12 text-zinc-600 mx-auto mb-3')}
                            <p class="text-zinc-500 text-sm">No inventory records for this product.</p>
                        </div>
                    `
                    : html`
                        <div class="bg-zinc-900 border border-white/10 rounded-xl overflow-hidden">
                            <table class="w-full text-left text-sm">
                                <thead>
                                    <tr class="border-b border-white/5 text-zinc-400 text-xs uppercase tracking-wider">
                                        <th class="px-5 py-3">Location</th>
                                        <th class="px-5 py-3 text-right">Quantity</th>
                                        <th class="px-5 py-3 text-right">Allocated</th>
                                        <th class="px-5 py-3 text-right">Available</th>
                                        <th class="px-5 py-3 text-right">Actions</th>
                                    </tr>
                                </thead>
                                <tbody class="divide-y divide-white/5">
                                    ${this.inventory.map(inv => {
                                        const avail = (inv.quantity || 0) - (inv.allocated || 0);
                                        return html`
                                            <tr class="hover:bg-white/5 transition-colors">
                                                <td class="px-5 py-3">
                                                    <div class="flex items-center gap-2">
                                                        ${icon(MapPin, 16, 'w-4 h-4 text-zinc-500')}
                                                        <span class="text-white">${inv.location_name || inv.location || 'Unknown'}</span>
                                                    </div>
                                                </td>
                                                <td class="px-5 py-3 text-right font-mono text-white">${inv.quantity.toLocaleString()}</td>
                                                <td class="px-5 py-3 text-right font-mono text-amber-400">${(inv.allocated || 0).toLocaleString()}</td>
                                                <td class="px-5 py-3 text-right font-mono font-bold ${avail < 0 ? 'text-rose-500' : 'text-emerald-400'}">
                                                    ${avail.toLocaleString()}
                                                </td>
                                                <td class="px-5 py-3 text-right">
                                                    <div class="flex items-center justify-end gap-1">
                                                        <button
                                                            @click=${() => this._openAdjustModal(inv.location_id || inv.id, inv.location_name || inv.location)}
                                                            class="p-1.5 rounded-md hover:bg-white/10 text-zinc-400 hover:text-white transition-colors"
                                                            title="Adjust Stock"
                                                        >
                                                            ${icon(ArrowRightLeft, 16, 'w-4 h-4')}
                                                        </button>
                                                    </div>
                                                </td>
                                            </tr>
                                        `;
                                    })}
                                </tbody>
                            </table>
                        </div>
                    `
                }

                <!-- Adjust Modal -->
                ${this.adjustModal ? html`
                    <div class="fixed inset-0 bg-black/60 flex items-center justify-center z-50" @click=${() => this._closeAdjustModal()}>
                        <div class="bg-zinc-900 border border-white/10 rounded-xl p-6 w-full max-w-sm" @click=${(e: Event) => e.stopPropagation()}>
                            <h3 class="text-white font-medium mb-1">Adjust Stock</h3>
                            <p class="text-zinc-500 text-sm mb-4">${this.productDescription} @ ${this.adjustModal.locationName}</p>
                            <div class="space-y-3">
                                <div>
                                    <label class="block text-xs text-zinc-500 mb-1">Quantity</label>
                                    <input
                                        type="number"
                                        .value=${this.adjustQty}
                                        @input=${(e: InputEvent) => this.adjustQty = (e.target as HTMLInputElement).value}
                                        class="w-full bg-zinc-800 border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-gable-green/50"
                                        min="1"
                                        placeholder="Enter quantity..."
                                    />
                                </div>
                                <div>
                                    <label class="block text-xs text-zinc-500 mb-1">Reason</label>
                                    <input
                                        type="text"
                                        .value=${this.adjustReason}
                                        @input=${(e: InputEvent) => this.adjustReason = (e.target as HTMLInputElement).value}
                                        class="w-full bg-zinc-800 border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-gable-green/50"
                                        placeholder="Reason for adjustment..."
                                    />
                                </div>
                                <div class="flex gap-2 pt-2">
                                    <button
                                        @click=${() => this._handleAdjust(1)}
                                        ?disabled=${this.adjusting || !this.adjustQty}
                                        class="flex-1 flex items-center justify-center gap-2 px-4 py-2 bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 rounded-lg hover:bg-emerald-500/30 disabled:opacity-50"
                                    >
                                        ${this.adjusting ? icon(Loader2, 16, 'w-4 h-4 animate-spin') : icon(Plus, 16, 'w-4 h-4')}
                                        Add
                                    </button>
                                    <button
                                        @click=${() => this._handleAdjust(-1)}
                                        ?disabled=${this.adjusting || !this.adjustQty}
                                        class="flex-1 flex items-center justify-center gap-2 px-4 py-2 bg-rose-500/20 text-rose-400 border border-rose-500/30 rounded-lg hover:bg-rose-500/30 disabled:opacity-50"
                                    >
                                        ${this.adjusting ? icon(Loader2, 16, 'w-4 h-4 animate-spin') : icon(Minus, 16, 'w-4 h-4')}
                                        Remove
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
