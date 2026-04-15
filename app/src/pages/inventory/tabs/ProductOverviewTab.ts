import { LitElement, html, nothing } from 'lit';
import { customElement, property } from 'lit/decorators.js';
import { icon } from '../../../lib/icons.ts';
import { Package, Weight, BarChart3, DollarSign, Layers, Tag, Pencil } from 'lucide';
import type { ProductDetail, PIMMedia } from '../../../types/pim.ts';

@customElement('gable-product-overview-tab')
export class GableProductOverviewTab extends LitElement {
    createRenderRoot() { return this; }

    @property({ attribute: false }) product!: ProductDetail;

    private get available(): number {
        return (this.product.total_quantity || 0) - (this.product.total_allocated || 0);
    }

    private get primaryImage(): PIMMedia | undefined {
        return this.product.media?.find((m: PIMMedia) => m.is_primary) || this.product.media?.[0];
    }

    private get visiblePrice(): number {
        return this.product.base_price || 0;
    }

    private get margin(): number {
        return this.product.target_margin || 0;
    }

    private _getAccentClass(accent?: string): string {
        if (accent === 'emerald') return 'text-emerald-400';
        if (accent === 'green') return 'text-gable-green';
        return 'text-white';
    }

    private _getStockColorClass(color: string): string {
        switch (color) {
            case 'emerald': return 'text-emerald-400';
            case 'amber': return 'text-amber-400';
            case 'rose': return 'text-rose-500';
            default: return 'text-white';
        }
    }

    private _renderInfoCard(iconData: Parameters<typeof icon>[0], label: string, value: string, accent?: string) {
        return html`
            <div class="bg-zinc-900 border border-white/10 rounded-lg p-3">
                <div class="flex items-center gap-1.5 text-zinc-500 text-xs mb-1">
                    ${icon(iconData, 16, 'w-4 h-4')}
                    ${label}
                </div>
                <div class="font-mono text-sm font-medium ${this._getAccentClass(accent)}">
                    ${value}
                </div>
            </div>
        `;
    }

    private _renderStockCard(label: string, value: number, color = 'white') {
        return html`
            <div class="bg-zinc-900 border border-white/10 rounded-lg p-4 text-center">
                <div class="text-xs text-zinc-500 mb-1">${label}</div>
                <div class="text-2xl font-mono font-bold ${this._getStockColorClass(color)}">
                    ${value.toLocaleString()}
                </div>
            </div>
        `;
    }

    private _openMarginModal() {
        this.dispatchEvent(new CustomEvent('open-margin-modal', { bubbles: true, composed: true }));
    }

    render() {
        return html`
            <div class="grid grid-cols-1 lg:grid-cols-3 gap-6">
                <!-- Primary Image -->
                <div class="lg:col-span-1">
                    <div class="bg-zinc-900 border border-white/10 rounded-xl overflow-hidden aspect-square flex items-center justify-center">
                        ${this.primaryImage
                            ? html`<img src="${this.primaryImage.url}" alt="${this.primaryImage.alt_text || this.product.description}" class="w-full h-full object-cover" />`
                            : html`
                                <div class="flex flex-col items-center gap-3 text-zinc-500">
                                    ${icon(Package, 64, 'w-16 h-16')}
                                    <span class="text-sm">No image</span>
                                </div>
                            `
                        }
                    </div>
                </div>

                <!-- Product Info -->
                <div class="lg:col-span-2 space-y-6">
                    <!-- Info Grid -->
                    <div class="grid grid-cols-2 sm:grid-cols-3 gap-4">
                        ${this._renderInfoCard(Tag, 'SKU', this.product.sku)}
                        ${this._renderInfoCard(Layers, 'UOM', this.product.uom_primary)}
                        ${this._renderInfoCard(Package, 'Vendor', this.product.vendor || 'N/A')}
                        ${this._renderInfoCard(Weight, 'Weight', `${(this.product.weight_lbs || 0).toFixed(1)} lbs`)}
                        ${this._renderInfoCard(DollarSign, 'Avg Cost', `$${(this.product.average_unit_cost || 0).toFixed(2)}`, 'emerald')}
                        ${this._renderInfoCard(DollarSign, 'Base Price', `$${this.visiblePrice.toFixed(2)}`, 'green')}

                        <!-- Margin / Commission card -->
                        <div class="bg-zinc-900 border border-white/10 rounded-lg p-3 col-span-2 sm:col-span-1">
                            <div class="flex items-center justify-between mb-1">
                                <div class="flex items-center gap-1.5 text-zinc-500 text-xs">
                                    ${icon(BarChart3, 16, 'w-4 h-4')}
                                    Margin / Commission
                                </div>
                                <button
                                    @click=${() => this._openMarginModal()}
                                    class="p-1 rounded hover:bg-white/10 text-zinc-500 hover:text-gable-green transition-colors"
                                    title="Edit pricing controls"
                                >
                                    ${icon(Pencil, 14, 'w-3.5 h-3.5')}
                                </button>
                            </div>
                            <div class="flex items-center gap-3 font-mono text-sm font-medium text-white">
                                <span>${this.margin.toFixed(1)}%</span>
                                <span class="text-zinc-600">/</span>
                                <span>${(this.product.commission_rate || 0).toFixed(1)}%</span>
                            </div>
                        </div>

                        ${this.product.upc ? this._renderInfoCard(Tag, 'UPC', this.product.upc) : nothing}
                    </div>

                    <!-- Stock Summary -->
                    <div>
                        <h3 class="text-sm font-medium text-zinc-400 uppercase tracking-wider mb-3">Stock Summary</h3>
                        <div class="grid grid-cols-3 gap-4">
                            ${this._renderStockCard('On Hand', this.product.total_quantity || 0)}
                            ${this._renderStockCard('Allocated', this.product.total_allocated || 0, 'amber')}
                            ${this._renderStockCard('Available', this.available, this.available < 100 ? 'rose' : 'emerald')}
                        </div>
                    </div>

                    <!-- Reorder Info -->
                    ${(this.product.reorder_point || 0) > 0 ? html`
                        <div class="bg-zinc-900 border border-white/10 rounded-xl p-4">
                            <h3 class="text-sm font-medium text-zinc-400 uppercase tracking-wider mb-2">Reorder Settings</h3>
                            <div class="flex gap-6 text-sm">
                                <div>
                                    <span class="text-zinc-500">Reorder Point: </span>
                                    <span class="text-white font-mono">${(this.product.reorder_point || 0).toLocaleString()}</span>
                                </div>
                                <div>
                                    <span class="text-zinc-500">Reorder Qty: </span>
                                    <span class="text-white font-mono">${(this.product.reorder_qty || 0).toLocaleString()}</span>
                                </div>
                            </div>
                        </div>
                    ` : nothing}

                    <!-- PIM Content Preview -->
                    ${this.product.content?.short_description ? html`
                        <div class="bg-zinc-900 border border-white/10 rounded-xl p-4">
                            <h3 class="text-sm font-medium text-zinc-400 uppercase tracking-wider mb-2">Description</h3>
                            <p class="text-zinc-300 text-sm">${this.product.content.short_description}</p>
                        </div>
                    ` : nothing}
                </div>
            </div>
        `;
    }
}
