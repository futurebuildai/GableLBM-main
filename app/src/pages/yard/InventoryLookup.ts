import { LitElement, html, nothing } from 'lit';
import { customElement, state } from 'lit/decorators.js';
import { icon } from '../../lib/icons.ts';
import { ToastService } from '../../lib/toast-service.ts';
import { Search, Package, MapPin, Minus, Plus, ArrowRightLeft, X, Loader2, ScanLine } from 'lucide';
import type { Product, Inventory } from '../../types/product';
import { InventoryService } from '../../services/InventoryService';
import { fetchWithAuth } from '../../services/fetchClient';
import '../../components/BarcodeScanner.ts';

const API_URL = import.meta.env.VITE_API_URL || '';

@customElement('gable-yard-inventory-lookup')
export class YardInventoryLookup extends LitElement {
    createRenderRoot() { return this; }

    @state() private query = '';
    @state() private isScanning = false;
    @state() private products: Product[] = [];
    @state() private loading = false;
    @state() private expanded: string | null = null;
    @state() private inventory: Inventory[] = [];
    @state() private adjustQty = 0;
    @state() private adjusting = false;

    private _debounceTimer: ReturnType<typeof setTimeout> | null = null;

    disconnectedCallback() {
        super.disconnectedCallback();
        if (this._debounceTimer) clearTimeout(this._debounceTimer);
    }

    private _scheduleSearch() {
        if (this._debounceTimer) clearTimeout(this._debounceTimer);
        this._debounceTimer = setTimeout(() => this._search(), 300);
    }

    private async _search() {
        if (!this.query.trim()) {
            this.products = [];
            return;
        }
        this.loading = true;
        try {
            const res = await fetchWithAuth(`${API_URL}/api/v1/products?q=${encodeURIComponent(this.query)}`);
            if (res.ok) {
                const data = await res.json();
                this.products = Array.isArray(data) ? data : [];
            }
        } catch {
            this.products = [];
            ToastService.show('Failed to search products', 'error');
        } finally {
            this.loading = false;
        }
    }

    private async _expandProduct(productId: string) {
        if (this.expanded === productId) {
            this.expanded = null;
            return;
        }
        this.expanded = productId;
        this.adjustQty = 0;
        try {
            const inv = await InventoryService.getInventoryByProduct(productId);
            this.inventory = inv;
        } catch {
            this.inventory = [];
            ToastService.show('Failed to load inventory details', 'error');
        }
    }

    private async _handleAdjust(productId: string, delta: number) {
        if (delta === 0) return;
        this.adjusting = true;
        try {
            await InventoryService.adjustStock({
                product_id: productId,
                quantity: delta,
                reason: 'Yard mobile adjustment',
                is_delta: true,
            });
            const inv = await InventoryService.getInventoryByProduct(productId);
            this.inventory = inv;
            this.adjustQty = 0;
        } catch (err) {
            console.error('Failed to adjust inventory:', err);
            ToastService.show('Failed to adjust inventory', 'error');
        }
        this.adjusting = false;
    }

    private _onScan(barcode: string) {
        this.isScanning = false;
        this.query = barcode;
        this._scheduleSearch();
    }

    render() {
        return html`
            <div class="flex flex-col space-y-4 p-4 max-w-md mx-auto">
                <h1 class="text-xl font-bold text-white tracking-tight flex items-center gap-2">
                    ${icon(Package, 20, 'text-amber-400')}
                    Inventory
                </h1>

                <!-- Search -->
                <div class="flex gap-2">
                    <div class="relative flex-1">
                        ${icon(Search, 16, 'absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500')}
                        <input
                            type="text"
                            .value=${this.query}
                            @input=${(e: InputEvent) => { this.query = (e.target as HTMLInputElement).value; this._scheduleSearch(); }}
                            placeholder="Search SKU or description..."
                            class="w-full bg-white/5 border border-white/10 text-white rounded-xl pl-10 pr-10 py-3 text-sm focus:outline-none focus:border-amber-400/50 transition-colors placeholder:text-zinc-600"
                        />
                        ${this.query ? html`
                            <button @click=${() => { this.query = ''; this.products = []; }} class="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-500 hover:text-zinc-300" aria-label="Clear search">
                                ${icon(X, 16)}
                            </button>
                        ` : nothing}
                    </div>
                    <button
                        @click=${() => { this.isScanning = true; }}
                        class="bg-zinc-800 hover:bg-zinc-700 text-amber-400 p-3 rounded-xl border border-white/10 transition-colors flex items-center justify-center isolate"
                        title="Scan Barcode"
                        aria-label="Scan barcode"
                    >
                        ${icon(ScanLine, 20)}
                    </button>
                </div>

                ${this.isScanning ? html`
                    <gable-barcode-scanner
                        @scan=${(e: CustomEvent) => this._onScan(e.detail)}
                        @close=${() => { this.isScanning = false; }}
                    ></gable-barcode-scanner>
                ` : nothing}

                ${this.loading ? html`
                    <div class="flex justify-center py-8">
                        <div class="animate-spin rounded-full h-8 w-8 border-b-2 border-amber-400"></div>
                    </div>
                ` : nothing}

                <!-- Results -->
                <div class="space-y-2">
                    ${this.products.map(p => html`
                        <div>
                            <div
                                class="rounded-2xl border border-white/[0.06] bg-[#161821]/80 backdrop-blur-xl active:scale-[0.98] transition-all cursor-pointer ${this.expanded === p.id ? 'border-amber-400/30' : 'border-white/5'}"
                                @click=${() => this._expandProduct(p.id)}
                            >
                                <div class="p-4">
                                    <div class="flex justify-between items-start">
                                        <div class="min-w-0 flex-1">
                                            <div class="font-medium text-white text-sm truncate">${p.description}</div>
                                            <div class="text-xs text-zinc-500 font-mono mt-0.5">${p.sku}</div>
                                        </div>
                                        <div class="text-right shrink-0 ml-3">
                                            <div class="font-mono text-amber-400 font-bold text-sm">
                                                ${p.total_quantity ?? '-'}
                                            </div>
                                            <div class="text-[10px] text-zinc-500 font-mono">${p.uom_primary}</div>
                                        </div>
                                    </div>
                                    ${p.total_allocated && p.total_allocated > 0 ? html`
                                        <div class="mt-2 flex items-center gap-2 text-[10px] text-zinc-500">
                                            ${icon(ArrowRightLeft, 12)}
                                            ${p.total_allocated} allocated
                                        </div>
                                    ` : nothing}
                                </div>
                            </div>

                            <!-- Expanded: inventory detail + adjust -->
                            ${this.expanded === p.id ? html`
                                <div class="mt-1 ml-4 space-y-2 animate-in slide-in-from-top-2 duration-200">
                                    ${this.inventory.map(inv => html`
                                        <div class="flex items-center gap-3 p-3 rounded-lg bg-white/[0.02] border border-white/5">
                                            ${icon(MapPin, 14, 'text-zinc-600 shrink-0')}
                                            <div class="flex-1 text-xs">
                                                <span class="text-zinc-300">${inv.location_name || inv.location}</span>
                                            </div>
                                            <span class="font-mono text-xs text-zinc-300">${inv.quantity}</span>
                                        </div>
                                    `)}

                                    <!-- Quick Adjust -->
                                    <div class="flex items-center gap-2 p-3 rounded-lg bg-white/[0.02] border border-white/5">
                                        <span class="text-xs text-zinc-400 flex-1">Quick Adjust</span>
                                        <button
                                            @click=${(e: Event) => { e.stopPropagation(); this.adjustQty = this.adjustQty - 1; }}
                                            class="w-8 h-8 rounded-lg bg-white/5 flex items-center justify-center text-zinc-400 hover:bg-white/10 active:scale-90 transition-all"
                                            aria-label="Decrease adjustment quantity"
                                        >
                                            ${icon(Minus, 16)}
                                        </button>
                                        <span class="font-mono text-sm w-12 text-center font-bold ${this.adjustQty > 0 ? 'text-emerald-400' : this.adjustQty < 0 ? 'text-rose-400' : 'text-zinc-400'}">
                                            ${this.adjustQty > 0 ? `+${this.adjustQty}` : this.adjustQty}
                                        </span>
                                        <button
                                            @click=${(e: Event) => { e.stopPropagation(); this.adjustQty = this.adjustQty + 1; }}
                                            class="w-8 h-8 rounded-lg bg-white/5 flex items-center justify-center text-zinc-400 hover:bg-white/10 active:scale-90 transition-all"
                                            aria-label="Increase adjustment quantity"
                                        >
                                            ${icon(Plus, 16)}
                                        </button>
                                        <button
                                            @click=${(e: Event) => { e.stopPropagation(); this._handleAdjust(p.id, this.adjustQty); }}
                                            ?disabled=${this.adjustQty === 0 || this.adjusting}
                                            class="px-3 py-1.5 rounded-lg text-xs font-mono font-bold transition-all ${this.adjustQty !== 0
                                                ? 'bg-amber-400 text-black hover:bg-amber-300 active:scale-95'
                                                : 'bg-white/5 text-zinc-600 cursor-not-allowed'
                                            }"
                                        >
                                            ${this.adjusting ? icon(Loader2, 12, 'animate-spin') : 'Apply'}
                                        </button>
                                    </div>
                                </div>
                            ` : nothing}
                        </div>
                    `)}
                </div>

                ${!this.loading && this.query && this.products.length === 0 ? html`
                    <div class="text-center py-12 opacity-50">
                        ${icon(Search, 40, 'text-zinc-600 mx-auto mb-3')}
                        <p class="text-zinc-400">No products match "${this.query}"</p>
                    </div>
                ` : nothing}

                ${!this.query ? html`
                    <div class="text-center py-16 opacity-40">
                        ${icon(Search, 48, 'text-zinc-600 mx-auto mb-3')}
                        <p class="text-zinc-500">Search by SKU or product name</p>
                    </div>
                ` : nothing}
            </div>
        `;
    }
}
