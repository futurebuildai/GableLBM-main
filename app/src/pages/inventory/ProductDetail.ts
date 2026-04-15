import { LitElement, html, nothing } from 'lit';
import { customElement, property, state } from 'lit/decorators.js';
import { icon } from '../../lib/icons.ts';
import { router } from '../../lib/router.ts';
import { ToastService } from '../../lib/toast-service.ts';
import type { ProductDetail as ProductDetailType, PIMContent } from '../../types/pim.ts';
import { PIMService } from '../../services/PIMService.ts';
import { ArrowLeft, Loader2, Package, FileText, Image, Megaphone, Search, Warehouse } from 'lucide';
import './tabs/ProductOverviewTab.ts';
import './tabs/ProductContentTab.ts';
import './tabs/ProductMediaTab.ts';
import './tabs/ProductCollateralTab.ts';
import './tabs/ProductSEOTab.ts';
import './tabs/ProductStockTab.ts';

type TabId = 'overview' | 'content' | 'media' | 'collateral' | 'seo' | 'stock';

interface TabDef {
    id: TabId;
    label: string;
    iconData: typeof Package;
}

const TABS: TabDef[] = [
    { id: 'overview', label: 'Overview', iconData: Package },
    { id: 'content', label: 'PIM / Content', iconData: FileText },
    { id: 'media', label: 'Media', iconData: Image },
    { id: 'collateral', label: 'Collateral', iconData: Megaphone },
    { id: 'seo', label: 'SEO', iconData: Search },
    { id: 'stock', label: 'Stock & Locations', iconData: Warehouse },
];

@customElement('gable-product-detail')
export class GableProductDetail extends LitElement {
    createRenderRoot() { return this; }

    @property({ attribute: 'route-id' }) routeId = '';

    @state() private product: ProductDetailType | null = null;
    @state() private loading = true;
    @state() private activeTab: TabId = 'overview';

    connectedCallback() {
        super.connectedCallback();
        this.loadProduct();
    }

    updated(changed: Map<string, unknown>) {
        if (changed.has('routeId') && changed.get('routeId') !== undefined) {
            this.loading = true;
            this.loadProduct();
        }
    }

    private async loadProduct() {
        if (!this.routeId) return;
        try {
            const data = await PIMService.getProductDetail(this.routeId);
            this.product = data;
        } catch (err) {
            console.error('Failed to load product:', err);
            ToastService.show('Failed to load product', 'error');
        } finally {
            this.loading = false;
        }
    }

    private handleContentUpdate(content: PIMContent) {
        if (this.product) {
            this.product = { ...this.product, content };
        }
    }

    private handleMediaUpdate() {
        this.loadProduct();
    }

    private handleCollateralUpdate() {
        this.loadProduct();
    }

    render() {
        if (this.loading) {
            return html`
                <div class="flex items-center justify-center h-96">
                    ${icon(Loader2, 32, 'w-8 h-8 text-zinc-500 animate-spin')}
                </div>
            `;
        }

        if (!this.product) {
            return html`
                <div class="flex flex-col items-center justify-center h-96 gap-4">
                    ${icon(Package, 64, 'w-16 h-16 text-zinc-600')}
                    <p class="text-zinc-500">Product not found</p>
                    <button @click=${() => router.navigate('/inventory')} class="text-gable-green hover:underline text-sm">
                        Back to Inventory
                    </button>
                </div>
            `;
        }

        return html`
            <div class="space-y-6">
                <!-- Header -->
                <div class="flex items-center gap-4">
                    <button
                        @click=${() => router.navigate('/inventory')}
                        class="p-2 rounded-lg hover:bg-white/5 text-zinc-400 hover:text-white transition-colors"
                        aria-label="Back to inventory"
                    >
                        ${icon(ArrowLeft, 20, 'w-5 h-5')}
                    </button>
                    <div class="flex-1 min-w-0">
                        <div class="flex items-center gap-3 mb-1">
                            <h1 class="text-xl font-bold text-white truncate">${this.product.description}</h1>
                            <span class="px-2 py-0.5 bg-white/5 border border-white/10 rounded text-xs font-mono text-zinc-400 shrink-0">
                                ${this.product.sku}
                            </span>
                        </div>
                        <div class="flex items-center gap-3 text-sm text-zinc-500">
                            ${this.product.vendor ? html`<span>${this.product.vendor}</span>` : nothing}
                            <span>${this.product.uom_primary}</span>
                            <span class="font-mono text-emerald-400">$${(this.product.base_price || 0).toFixed(2)}</span>
                        </div>
                    </div>
                </div>

                <!-- Tabs -->
                <div class="border-b border-white/10">
                    <div class="flex gap-1 overflow-x-auto">
                        ${TABS.map(tab => html`
                            <button
                                @click=${() => { this.activeTab = tab.id; }}
                                class="flex items-center gap-2 px-4 py-2.5 text-sm font-medium whitespace-nowrap border-b-2 transition-colors ${
                                    this.activeTab === tab.id
                                        ? 'border-gable-green text-gable-green'
                                        : 'border-transparent text-zinc-400 hover:text-white hover:border-white/20'
                                }"
                            >
                                ${icon(tab.iconData, 16, 'w-4 h-4')}
                                ${tab.label}
                            </button>
                        `)}
                    </div>
                </div>

                <!-- Tab Content -->
                <div>
                    ${this.activeTab === 'overview' ? html`
                        <gable-product-overview-tab
                            .product=${this.product}
                            @open-margin-modal=${() => this.loadProduct()}
                        ></gable-product-overview-tab>
                    ` : nothing}
                    ${this.activeTab === 'content' ? html`
                        <gable-product-content-tab
                            .productId=${this.product.id}
                            .content=${this.product.content}
                            @content-update=${(e: CustomEvent<PIMContent>) => this.handleContentUpdate(e.detail)}
                        ></gable-product-content-tab>
                    ` : nothing}
                    ${this.activeTab === 'media' ? html`
                        <gable-product-media-tab
                            .productId=${this.product.id}
                            .media=${this.product.media}
                            @media-update=${() => this.handleMediaUpdate()}
                        ></gable-product-media-tab>
                    ` : nothing}
                    ${this.activeTab === 'collateral' ? html`
                        <gable-product-collateral-tab
                            .productId=${this.product.id}
                            .collateral=${this.product.collateral}
                            @collateral-update=${() => this.handleCollateralUpdate()}
                        ></gable-product-collateral-tab>
                    ` : nothing}
                    ${this.activeTab === 'seo' ? html`
                        <gable-product-seo-tab
                            .productId=${this.product.id}
                            .content=${this.product.content}
                            @content-update=${(e: CustomEvent<PIMContent>) => this.handleContentUpdate(e.detail)}
                        ></gable-product-seo-tab>
                    ` : nothing}
                    ${this.activeTab === 'stock' ? html`
                        <gable-product-stock-tab
                            .productId=${this.product.id}
                            .productDescription=${this.product.description}
                        ></gable-product-stock-tab>
                    ` : nothing}
                </div>
            </div>
        `;
    }
}
