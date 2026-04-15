import { LitElement, html } from 'lit';
import { customElement, state, property } from 'lit/decorators.js';
import { icon } from '../../lib/icons.ts';
import { router } from '../../lib/router.ts';
import { VendorService } from '../../services/VendorService';
import type { Vendor } from '../../types/vendor';
import { ArrowLeft, TrendingUp, Clock, DollarSign, Truck } from 'lucide';

@customElement('gable-vendor-detail')
export class VendorDetail extends LitElement {
    createRenderRoot() { return this; }

    @property({ attribute: 'route-id' }) routeId = '';

    @state() private vendor: Vendor | null = null;
    @state() private loading = true;
    @state() private error: string | null = null;

    connectedCallback() {
        super.connectedCallback();
        if (this.routeId) this._loadVendor(this.routeId);
    }

    private async _loadVendor(vendorId: string) {
        this.error = null;
        this.loading = true;
        try {
            const data = await VendorService.getVendor(vendorId);
            this.vendor = data;
        } catch (err) {
            console.error(err);
            this.error = err instanceof Error ? err.message : 'Failed to load vendor';
        } finally {
            this.loading = false;
        }
    }

    render() {
        if (this.loading) {
            return html`<div class="p-8 text-center text-zinc-400">Loading vendor...</div>`;
        }
        if (this.error) {
            return html`
                <div class="p-8 text-center space-y-4">
                    <p class="text-red-400">${this.error}</p>
                    <button
                        @click=${() => this.routeId && this._loadVendor(this.routeId)}
                        class="px-4 py-2 border border-white/10 text-white rounded hover:bg-white/5 transition-colors"
                    >
                        Retry
                    </button>
                </div>
            `;
        }
        if (!this.vendor) {
            return html`<div class="p-8 text-center text-zinc-400">Vendor not found</div>`;
        }

        return html`
            <div class="p-6 max-w-[1600px] mx-auto space-y-6 animate-in fade-in duration-500">
                <!-- Header -->
                <div class="flex items-center gap-4 mb-6">
                    <button @click=${() => router.navigate('/purchasing/vendors')} class="p-2 rounded-full bg-white/5 hover:bg-white/10 text-zinc-400 transition-colors">
                        ${icon(ArrowLeft, 20, 'w-5 h-5')}
                    </button>
                    <div>
                        <h1 class="text-2xl font-bold text-white">${this.vendor.name}</h1>
                        <div class="flex gap-4 text-sm text-zinc-400 mt-1">
                            <span>${this.vendor.contact_email || 'No email'}</span>
                            <span>&bull;</span>
                            <span>${this.vendor.phone || 'No phone'}</span>
                            <span>&bull;</span>
                            <span class="text-emerald-400">${this.vendor.payment_terms}</span>
                        </div>
                    </div>
                </div>

                <!-- KPI Cards -->
                <div class="grid grid-cols-1 md:grid-cols-3 gap-6">
                    <div class="backdrop-blur-md bg-white/5 border border-white/10 rounded-xl border-l-4 border-l-emerald-500">
                        <div class="p-6">
                            <div class="flex justify-between items-start mb-4">
                                <div>
                                    <p class="text-sm text-zinc-400 font-medium uppercase tracking-wide">Fill Rate</p>
                                    <h3 class="text-3xl font-bold text-white mt-1">${this.vendor.fill_rate.toFixed(1)}%</h3>
                                </div>
                                <div class="p-2 bg-emerald-500/10 rounded-lg">
                                    ${icon(Truck, 20, 'w-5 h-5 text-emerald-400')}
                                </div>
                            </div>
                            <p class="text-xs text-emerald-400 flex items-center">
                                ${icon(TrendingUp, 12, 'w-3 h-3 mr-1')}
                                Acceptable Range (&gt;95%)
                            </p>
                        </div>
                    </div>

                    <div class="backdrop-blur-md bg-white/5 border border-white/10 rounded-xl border-l-4 border-l-blue-500">
                        <div class="p-6">
                            <div class="flex justify-between items-start mb-4">
                                <div>
                                    <p class="text-sm text-zinc-400 font-medium uppercase tracking-wide">Avg Lead Time</p>
                                    <h3 class="text-3xl font-bold text-white mt-1">${this.vendor.average_lead_time_days.toFixed(1)} <span class="text-sm font-normal text-zinc-500">days</span></h3>
                                </div>
                                <div class="p-2 bg-blue-500/10 rounded-lg">
                                    ${icon(Clock, 20, 'w-5 h-5 text-blue-400')}
                                </div>
                            </div>
                            <p class="text-xs text-zinc-500">
                                Measured from PO Create to Receipt
                            </p>
                        </div>
                    </div>

                    <div class="backdrop-blur-md bg-white/5 border border-white/10 rounded-xl border-l-4 border-l-amber-500">
                        <div class="p-6">
                            <div class="flex justify-between items-start mb-4">
                                <div>
                                    <p class="text-sm text-zinc-400 font-medium uppercase tracking-wide">Spend YTD</p>
                                    <h3 class="text-3xl font-bold text-white mt-1">$${this.vendor.total_spend_ytd.toLocaleString()}</h3>
                                </div>
                                <div class="p-2 bg-amber-500/10 rounded-lg">
                                    ${icon(DollarSign, 20, 'w-5 h-5 text-amber-400')}
                                </div>
                            </div>
                            <p class="text-xs text-zinc-500">
                                Total value of received goods
                            </p>
                        </div>
                    </div>
                </div>

                <!-- Placeholder for Historical Chart -->
                <div class="backdrop-blur-md bg-white/5 border border-white/10 rounded-xl">
                    <div class="p-4 pb-2">
                        <h3 class="text-lg font-semibold text-white">Performance History</h3>
                    </div>
                    <div class="p-6">
                        <div class="h-64 flex items-center justify-center text-zinc-500 bg-black/20 rounded-lg border border-dashed border-zinc-800">
                            <p>Historical trend data requires more history.</p>
                        </div>
                    </div>
                </div>
            </div>
        `;
    }
}

export default VendorDetail;
