import { LitElement, html } from 'lit';
import { customElement, state } from 'lit/decorators.js';
import { icon } from '../../lib/icons.ts';
import { router } from '../../lib/router.ts';
import { ToastService } from '../../lib/toast-service.ts';
import { PurchaseOrderService } from '../../services/PurchaseOrderService';
import { ProductService } from '../../services/product.service';
import type { Product } from '../../types/product';
import type { CreatePOLine } from '../../types/purchaseOrder';
import { ArrowLeft, Plus, Trash2, Save } from 'lucide';

interface LineWithKey extends CreatePOLine {
    key: number;
}

@customElement('gable-new-purchase-order')
export class NewPurchaseOrder extends LitElement {
    createRenderRoot() { return this; }

    @state() private vendorId = '';
    @state() private lines: LineWithKey[] = [];
    @state() private products: Product[] = [];
    @state() private loading = false;

    connectedCallback() {
        super.connectedCallback();
        ProductService.getProducts()
            .then(p => this.products = p)
            .catch(() => ToastService.show('Failed to load products', 'error'));

        // Pre-fill from URL search params
        const params = new URLSearchParams(window.location.search);
        const isFromRecommendation = params.get('from') === 'recommendation';
        if (isFromRecommendation) {
            const vendorName = params.get('vendor_name') || '';
            if (vendorName) this.vendorId = vendorName;

            const productId = params.get('product_id') || '';
            const description = params.get('description') || '';
            const qty = Number(params.get('qty') || 1);
            const cost = Number(params.get('cost') || 0);

            if (productId || description) {
                this.lines = [{
                    key: Date.now(),
                    product_id: productId,
                    description,
                    quantity: qty,
                    cost: Math.round(cost * 100) / 100,
                }];
            }
        }
    }

    private _addLine() {
        this.lines = [...this.lines, { key: Date.now(), product_id: '', description: '', quantity: 1, cost: 0 }];
    }

    private _updateLine(key: number, field: string, value: string | number) {
        this.lines = this.lines.map(l => {
            if (l.key !== key) return l;
            const updated = { ...l, [field]: value };
            if (field === 'product_id') {
                const product = this.products.find(p => p.id === value);
                if (product) {
                    updated.description = `${product.sku} - ${product.description}`;
                    if (updated.cost === 0) updated.cost = product.base_price * 0.6;
                }
            }
            return updated;
        });
    }

    private _removeLine(key: number) {
        this.lines = this.lines.filter(l => l.key !== key);
    }

    private async _handleSave() {
        if (!this.vendorId.trim()) {
            ToastService.show('Enter a vendor ID', 'error');
            return;
        }
        if (this.lines.length === 0) {
            ToastService.show('Add at least one line item', 'error');
            return;
        }

        this.loading = true;
        try {
            const po = await PurchaseOrderService.createPO({
                vendor_id: this.vendorId,
                lines: this.lines.map(({ product_id, description, quantity, cost }) => ({
                    product_id,
                    description,
                    quantity,
                    cost,
                })),
            });
            ToastService.show('Purchase order created', 'success');
            router.navigate(`/purchasing/${po.id}`);
        } catch (err) {
            console.error(err);
            ToastService.show('Failed to create purchase order', 'error');
        } finally {
            this.loading = false;
        }
    }

    private get _total() {
        return this.lines.reduce((sum, l) => sum + l.quantity * l.cost, 0);
    }

    render() {
        return html`
            <div class="flex items-center gap-4 mb-6">
                <button @click=${() => router.navigate('/purchasing')} class="p-2 rounded-full bg-white/5 hover:bg-white/10 text-zinc-400 transition-colors">
                    ${icon(ArrowLeft, 20, 'w-5 h-5')}
                </button>
                <div class="flex-1">
                    <h1 class="text-2xl font-bold text-white">New Purchase Order</h1>
                    <p class="text-sm text-zinc-400">Create a PO for vendor replenishment</p>
                </div>
                <button
                    @click=${this._handleSave}
                    ?disabled=${this.loading}
                    class="inline-flex items-center gap-2 bg-[#00FFA3] text-black font-semibold px-4 py-2 rounded shadow-glow hover:shadow-[0_0_10px_rgba(0,255,163,0.3)] transition-all disabled:opacity-50"
                >
                    ${icon(Save, 16, 'w-4 h-4')}
                    Create PO
                </button>
            </div>

            <div class="grid grid-cols-1 lg:grid-cols-12 gap-6">
                <div class="lg:col-span-4">
                    <div class="backdrop-blur-md bg-white/5 border border-white/10 rounded-xl">
                        <div class="p-6">
                            <h2 class="text-lg font-medium text-white mb-4">Vendor</h2>
                            <input
                                type="text"
                                placeholder="Vendor UUID"
                                .value=${this.vendorId}
                                @input=${(e: Event) => this.vendorId = (e.target as HTMLInputElement).value}
                                class="w-full bg-black/20 border border-white/10 rounded px-3 py-2 text-white focus:border-[#00FFA3] outline-none font-mono"
                            />
                            <div class="mt-6 flex justify-between items-baseline">
                                <span class="text-zinc-400">Total Cost</span>
                                <span class="text-2xl font-mono font-bold text-white">$${this._total.toFixed(2)}</span>
                            </div>
                        </div>
                    </div>
                </div>

                <div class="lg:col-span-8">
                    <div class="backdrop-blur-md bg-white/5 border border-white/10 rounded-xl">
                        <div class="p-6">
                            <div class="flex justify-between items-center mb-4">
                                <h2 class="text-lg font-medium text-white">Line Items</h2>
                                <button
                                    @click=${this._addLine}
                                    class="flex items-center gap-1 text-sm text-[#00FFA3] hover:text-white transition-colors"
                                >
                                    ${icon(Plus, 16, 'w-4 h-4')}
                                    Add Line
                                </button>
                            </div>

                            ${this.lines.length === 0 ? html`
                                <div class="text-center text-zinc-500 py-12 italic">
                                    No items added yet. Click "Add Line" to start.
                                </div>
                            ` : html`
                                <div class="space-y-4">
                                    ${this.lines.map((line) => html`
                                        <div class="bg-black/20 rounded-lg p-4 border border-white/5 space-y-3">
                                            <div class="flex gap-3">
                                                <div class="flex-1">
                                                    <label class="text-xs text-zinc-500">Product</label>
                                                    <select
                                                        .value=${line.product_id}
                                                        @change=${(e: Event) => this._updateLine(line.key, 'product_id', (e.target as HTMLSelectElement).value)}
                                                        class="w-full bg-[#0A0B10] border border-white/10 rounded px-3 py-2 text-white focus:border-[#00FFA3] outline-none mt-1"
                                                    >
                                                        <option value="">Select product...</option>
                                                        ${this.products.map(p => html`
                                                            <option value="${p.id}">${p.sku} - ${p.description}</option>
                                                        `)}
                                                    </select>
                                                </div>
                                                <button @click=${() => this._removeLine(line.key)} class="text-rose-400 hover:text-rose-300 self-end pb-2">
                                                    ${icon(Trash2, 16, 'w-4 h-4')}
                                                </button>
                                            </div>
                                            <div>
                                                <label class="text-xs text-zinc-500">Description</label>
                                                <input
                                                    type="text"
                                                    .value=${line.description}
                                                    @input=${(e: Event) => this._updateLine(line.key, 'description', (e.target as HTMLInputElement).value)}
                                                    class="w-full bg-[#0A0B10] border border-white/10 rounded px-3 py-2 text-white focus:border-[#00FFA3] outline-none mt-1"
                                                />
                                            </div>
                                            <div class="grid grid-cols-2 gap-3">
                                                <div>
                                                    <label class="text-xs text-zinc-500">Quantity</label>
                                                    <input
                                                        type="number"
                                                        min="0.001"
                                                        step="any"
                                                        .value=${String(line.quantity)}
                                                        @input=${(e: Event) => this._updateLine(line.key, 'quantity', Number((e.target as HTMLInputElement).value))}
                                                        class="w-full bg-[#0A0B10] border border-white/10 rounded px-3 py-2 text-white font-mono focus:border-[#00FFA3] outline-none mt-1"
                                                    />
                                                </div>
                                                <div>
                                                    <label class="text-xs text-zinc-500">Unit Cost</label>
                                                    <input
                                                        type="number"
                                                        min="0"
                                                        step="0.01"
                                                        .value=${String(line.cost)}
                                                        @input=${(e: Event) => this._updateLine(line.key, 'cost', Number((e.target as HTMLInputElement).value))}
                                                        class="w-full bg-[#0A0B10] border border-white/10 rounded px-3 py-2 text-white font-mono focus:border-[#00FFA3] outline-none mt-1"
                                                    />
                                                </div>
                                            </div>
                                        </div>
                                    `)}
                                </div>
                            `}
                        </div>
                    </div>
                </div>
            </div>
        `;
    }
}
