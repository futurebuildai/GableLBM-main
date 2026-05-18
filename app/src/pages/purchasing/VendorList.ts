import { LitElement, html, nothing } from 'lit';
import { customElement, state } from 'lit/decorators.js';
import { icon } from '../../lib/icons.ts';
import { router } from '../../lib/router.ts';
import { ToastService } from '../../lib/toast-service.ts';
import { VendorService } from '../../services/VendorService';
import type { Vendor } from '../../types/vendor';
import { Warehouse, Clock, DollarSign } from 'lucide';

@customElement('gable-vendor-list')
export class VendorList extends LitElement {
    createRenderRoot() { return this; }

    @state() private vendors: Vendor[] = [];
    @state() private loading = true;

    connectedCallback() {
        super.connectedCallback();
        this._loadVendors();
    }

    private async _loadVendors() {
        try {
            const data = await VendorService.listVendors();
            this.vendors = data;
        } catch (error) {
            console.error(error);
            ToastService.show('Failed to load vendors', 'error');
        } finally {
            this.loading = false;
        }
    }

    render() {
        if (this.loading) {
            return html`<div class="p-8 text-center text-zinc-400">Loading vendors...</div>`;
        }

        return html`
            <div class="p-6 max-w-[1600px] mx-auto space-y-6 animate-in fade-in duration-500">
                <div class="flex justify-between items-center">
                    <div>
                        <h1 class="text-2xl font-bold bg-gradient-to-r from-white to-zinc-400 bg-clip-text text-transparent">
                            Vendor Management
                        </h1>
                        <p class="text-zinc-400 mt-1">
                            Track performance, lead times, and spend across ${this.vendors.length} vendor partners.
                        </p>
                    </div>
                    <button class="inline-flex items-center gap-2 bg-emerald-600 hover:bg-emerald-500 text-white font-semibold px-4 py-2 rounded transition-colors">
                        ${icon(Warehouse, 16, 'w-4 h-4')}
                        New Vendor
                    </button>
                </div>

                <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                    ${this.vendors.map((vendor) => html`
                        <div class="backdrop-blur-md bg-white/5 border border-white/10 rounded-xl hover:border-emerald-500/30 transition-all duration-300 group">
                            <div class="p-4 pb-2">
                                <div class="flex justify-between items-start">
                                    <h3 class="text-lg text-white group-hover:text-emerald-400 transition-colors truncate font-semibold">
                                        ${vendor.name}
                                    </h3>
                                    <div class="px-2 py-0.5 rounded text-xs font-bold ${vendor.fill_rate >= 95 ? 'bg-emerald-500/20 text-emerald-300' :
                                        vendor.fill_rate >= 80 ? 'bg-amber-500/20 text-amber-300' :
                                            'bg-red-500/20 text-red-300'
                                    }">
                                        ${vendor.fill_rate.toFixed(0)}% Fill Rate
                                    </div>
                                </div>
                            </div>
                            <div class="p-4 space-y-4">
                                <div class="grid grid-cols-2 gap-4 text-sm">
                                    <div>
                                        <p class="text-zinc-500 text-xs flex items-center mb-1">
                                            ${icon(Clock, 12, 'w-3 h-3 mr-1')}
                                            Lead Time
                                        </p>
                                        <p class="text-zinc-200 font-mono">
                                            ${vendor.average_lead_time_days.toFixed(1)} days
                                        </p>
                                    </div>
                                    <div>
                                        <p class="text-zinc-500 text-xs flex items-center mb-1">
                                            ${icon(DollarSign, 12, 'w-3 h-3 mr-1')}
                                            Spend YTD
                                        </p>
                                        <p class="text-zinc-200 font-mono">
                                            $${vendor.total_spend_ytd.toLocaleString()}
                                        </p>
                                    </div>
                                </div>

                                <div class="pt-3 border-t border-white/5 flex justify-between items-center">
                                    <span class="text-xs text-zinc-500">${vendor.payment_terms}</span>
                                    <button
                                        @click=${() => router.navigate(`/purchasing/vendors/${vendor.id}`)}
                                        class="h-7 text-xs hover:bg-white/5 text-zinc-400 hover:text-white px-3 py-1 rounded transition-colors"
                                    >
                                        View Scorecard
                                    </button>
                                </div>
                            </div>
                        </div>
                    `)}
                </div>

                ${this.vendors.length === 0 ? html`
                    <div class="text-center py-20 bg-zinc-900/50 rounded-lg border border-zinc-800 border-dashed">
                        ${icon(Warehouse, 48, 'w-12 h-12 text-zinc-600 mx-auto mb-4')}
                        <h3 class="text-lg font-medium text-white">No Vendors Found</h3>
                        <p class="text-zinc-400 mt-2 max-w-sm mx-auto">
                            We couldn't find any vendors. Vendors are automatically created from product data, or you can add them manually.
                        </p>
                    </div>
                ` : nothing}
            </div>
        `;
    }
}

export default VendorList;
