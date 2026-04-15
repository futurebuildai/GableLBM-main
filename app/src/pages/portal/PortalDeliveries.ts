import { LitElement, html, nothing } from 'lit';
import { customElement, state } from 'lit/decorators.js';
import { icon } from '../../lib/icons.ts';
import { Truck, Camera, RefreshCw, AlertTriangle, X, User, Clock, Phone, MapPin, FileText, ChevronDown, ChevronUp } from 'lucide';
import { PortalService } from '../../services/PortalService';
import type { PortalDelivery } from '../../types/portal';

type FilterTab = 'all' | 'active' | 'upcoming' | 'completed';

const STATUS_STEPS = ['PENDING', 'OUT_FOR_DELIVERY', 'DELIVERED'] as const;

function etaLabel(eta: string | null): string | null {
    if (!eta) return null;
    const arrival = new Date(eta);
    const now = new Date();
    const diffMs = arrival.getTime() - now.getTime();
    if (diffMs <= 0) return 'Arriving now';
    const diffMin = Math.round(diffMs / 60000);
    if (diffMin < 120) return `Arriving in ${diffMin} min`;
    return `ETA ${arrival.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
}

const deliveryStatusColor = (status: string): { fg: string; bg: string } => {
    const map: Record<string, { fg: string; bg: string }> = {
        PENDING: { fg: '#F59E0B', bg: 'rgba(245,158,11,0.1)' },
        OUT_FOR_DELIVERY: { fg: '#38BDF8', bg: 'rgba(56,189,248,0.1)' },
        DELIVERED: { fg: '#00FFA3', bg: 'rgba(0,255,163,0.1)' },
        FAILED: { fg: '#F43F5E', bg: 'rgba(244,63,94,0.1)' },
        PARTIAL: { fg: '#A78BFA', bg: 'rgba(167,139,250,0.1)' },
    };
    return map[status] || map.PENDING;
};

const DELIVERY_STATUS_COLORS: Record<string, string> = {
    PENDING: 'bg-amber-500/10 text-amber-400 border-amber-500/20',
    OUT_FOR_DELIVERY: 'bg-blue-500/10 text-blue-400 border-blue-500/20',
    DELIVERED: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20',
    FAILED: 'bg-red-500/10 text-red-400 border-red-500/20',
    PARTIAL: 'bg-purple-500/10 text-purple-400 border-purple-500/20',
};

@customElement('gable-portal-deliveries')
export class PortalDeliveries extends LitElement {
    createRenderRoot() { return this; }

    @state() private deliveries: PortalDelivery[] = [];
    @state() private loading = true;
    @state() private error = '';
    @state() private lightboxUrl: string | null = null;
    @state() private filter: FilterTab = 'all';
    @state() private expandedId: string | null = null;

    private _escHandler = (e: KeyboardEvent) => {
        if (e.key === 'Escape') this.lightboxUrl = null;
    };

    connectedCallback() {
        super.connectedCallback();
        this._fetchDeliveries();
    }

    disconnectedCallback() {
        super.disconnectedCallback();
        window.removeEventListener('keydown', this._escHandler);
    }

    private _fetchDeliveries() {
        this.loading = true;
        this.error = '';
        PortalService.getDeliveries()
            .then(data => { this.deliveries = data; })
            .catch(err => { this.error = err instanceof Error ? err.message : 'Failed to load deliveries'; })
            .finally(() => { this.loading = false; });
    }

    updated(changed: Map<string, unknown>) {
        if (changed.has('lightboxUrl')) {
            window.removeEventListener('keydown', this._escHandler);
            if (this.lightboxUrl) {
                window.addEventListener('keydown', this._escHandler);
            }
        }
    }

    private get _active() { return this.deliveries.filter(d => d.status === 'OUT_FOR_DELIVERY'); }
    private get _upcoming() { return this.deliveries.filter(d => d.status === 'PENDING'); }
    private get _completed() { return this.deliveries.filter(d => d.status !== 'OUT_FOR_DELIVERY' && d.status !== 'PENDING'); }

    private get _filtered(): PortalDelivery[] {
        if (this.filter === 'active') return this._active;
        if (this.filter === 'upcoming') return this._upcoming;
        if (this.filter === 'completed') return this._completed;
        return this.deliveries;
    }

    private _renderTimeline(status: string) {
        const currentIdx = STATUS_STEPS.indexOf(status as typeof STATUS_STEPS[number]);
        const isFailed = status === 'FAILED' || status === 'PARTIAL';

        return html`
            <div class="flex items-center gap-1 w-full max-w-xs">
                ${STATUS_STEPS.map((_, i) => {
                    const isActive = i <= currentIdx;
                    const isCurrent = i === currentIdx;
                    return html`
                        <div class="flex items-center flex-1">
                            <div class="w-3 h-3 rounded-full border-2 shrink-0 transition-colors ${
                                isFailed && isCurrent ? 'border-red-400 bg-red-400/30' :
                                isActive ? 'border-gable-green bg-gable-green/30' :
                                'border-zinc-600 bg-transparent'
                            }"></div>
                            ${i < STATUS_STEPS.length - 1
                                ? html`<div class="flex-1 h-0.5 mx-1 transition-colors ${i < currentIdx ? 'bg-gable-green/50' : 'bg-zinc-700'}"></div>`
                                : nothing
                            }
                        </div>
                    `;
                })}
                <span class="text-[9px] text-zinc-500 uppercase ml-2 whitespace-nowrap">
                    ${STATUS_STEPS[Math.max(0, currentIdx)] ?? status}
                </span>
            </div>
        `;
    }

    private _renderDeliveryCard(del: PortalDelivery) {
        const isActive = del.status === 'OUT_FOR_DELIVERY';
        const isCompleted = del.status === 'DELIVERED' || del.status === 'FAILED' || del.status === 'PARTIAL';
        const eta = etaLabel(del.estimated_arrival);
        const expanded = this.expandedId === del.id;

        return html`
            <div class="rounded-2xl border border-white/[0.06] bg-[#161821]/80 backdrop-blur-xl overflow-hidden">
                <!-- Header row -->
                <button @click=${() => { this.expandedId = expanded ? null : del.id; }} class="w-full text-left p-4 hover:bg-white/5 transition-colors">
                    <div class="flex items-center justify-between">
                        <div class="flex items-center gap-4">
                            <div
                                class="w-10 h-10 rounded-lg flex items-center justify-center shrink-0"
                                style="background-color: ${deliveryStatusColor(del.status).bg}"
                            >
                                ${icon(Truck, 18)}
                            </div>
                            <div>
                                <div class="flex items-center gap-2">
                                    <span class="font-mono text-sm font-medium text-white">
                                        DEL-${del.id.substring(0, 8).toUpperCase()}
                                    </span>
                                    <span class="inline-block px-2 py-0.5 rounded text-[10px] uppercase tracking-wider font-semibold border whitespace-nowrap ${DELIVERY_STATUS_COLORS[del.status] || DELIVERY_STATUS_COLORS.PENDING}">
                                        ${del.status.replace(/_/g, ' ')}
                                    </span>
                                </div>
                                <div class="text-xs text-zinc-500 mt-0.5 flex items-center gap-2">
                                    <span class="flex items-center gap-1">
                                        ${icon(FileText, 10)}
                                        Order ${(del.order_number ?? del.order_id).substring(0, 8).toUpperCase()}
                                    </span>
                                    ${del.scheduled_date
                                        ? html`<span class="flex items-center gap-1">${icon(Clock, 10)} ${new Date(del.scheduled_date).toLocaleDateString()}</span>`
                                        : html`<span>${new Date(del.created_at).toLocaleDateString()}</span>`
                                    }
                                </div>
                            </div>
                        </div>
                        <div class="flex items-center gap-3">
                            ${isActive && eta
                                ? html`<span class="text-xs font-semibold text-sky-400 bg-sky-500/10 px-2 py-1 rounded border border-sky-500/20">${eta}</span>`
                                : nothing
                            }
                            ${del.stop_sequence != null && del.total_stops != null
                                ? html`<span class="text-[10px] text-zinc-500 font-mono">Stop ${del.stop_sequence} of ${del.total_stops}</span>`
                                : nothing
                            }
                            ${expanded ? icon(ChevronUp, 16, 'text-zinc-500') : icon(ChevronDown, 16, 'text-zinc-500')}
                        </div>
                    </div>

                    ${isActive ? html`<div class="mt-3 pl-14">${this._renderTimeline(del.status)}</div>` : nothing}
                </button>

                <!-- Expanded details -->
                ${expanded ? html`
                    <div class="border-t border-white/5 p-4 pl-[4.5rem] space-y-3">
                        ${(del.driver_name || del.vehicle_name) ? html`
                            <div class="flex flex-wrap gap-4 text-sm">
                                ${del.driver_name ? html`
                                    <div class="flex items-center gap-2 text-zinc-300">
                                        ${del.driver_photo_url
                                            ? html`<img src="${del.driver_photo_url}" alt="${del.driver_name}" class="w-7 h-7 rounded-full object-cover border border-white/10" />`
                                            : icon(User, 14, 'text-zinc-500')
                                        }
                                        <span>${del.driver_name}</span>
                                        ${del.driver_phone ? html`
                                            <a href="tel:${del.driver_phone}" class="flex items-center gap-1 text-sky-400 hover:text-sky-300">
                                                ${icon(Phone, 12)}
                                                <span class="text-xs">${del.driver_phone}</span>
                                            </a>
                                        ` : nothing}
                                    </div>
                                ` : nothing}
                                ${del.vehicle_name ? html`
                                    <div class="flex items-center gap-2 text-zinc-400">
                                        ${del.vehicle_photo_url
                                            ? html`<img src="${del.vehicle_photo_url}" alt="${del.vehicle_name}" class="w-7 h-7 rounded-lg object-cover border border-white/10" />`
                                            : icon(Truck, 14, 'text-zinc-500')
                                        }
                                        <span>${del.vehicle_name}</span>
                                    </div>
                                ` : nothing}
                            </div>
                        ` : nothing}

                        ${del.delivery_address ? html`
                            <div class="flex items-start gap-2 text-sm text-zinc-400">
                                ${icon(MapPin, 14, 'text-zinc-500 mt-0.5 shrink-0')}
                                <span>${del.delivery_address}</span>
                            </div>
                        ` : nothing}

                        ${del.delivery_instructions ? html`
                            <div class="text-sm bg-amber-500/5 text-amber-500/90 p-3 rounded-lg border border-amber-500/10 flex gap-2">
                                <span class="font-bold text-[10px] px-1.5 py-0.5 bg-amber-500/20 rounded h-fit shrink-0">NOTE</span>
                                <span class="italic">${del.delivery_instructions}</span>
                            </div>
                        ` : nothing}

                        ${isCompleted && (del.pod_signed_by || del.pod_proof_url) ? html`
                            <div class="flex items-center gap-4 pt-2 border-t border-white/5">
                                ${del.pod_signed_by ? html`
                                    <div class="flex items-center gap-1 text-xs text-zinc-400">
                                        ${icon(User, 12)}
                                        <span>Signed by ${del.pod_signed_by}</span>
                                    </div>
                                ` : nothing}
                                ${del.pod_timestamp ? html`
                                    <div class="flex items-center gap-1 text-xs text-zinc-500">
                                        ${icon(Clock, 12)}
                                        <span>${new Date(del.pod_timestamp).toLocaleString()}</span>
                                    </div>
                                ` : nothing}
                                ${del.pod_proof_url ? html`
                                    <button
                                        @click=${(e: Event) => { e.stopPropagation(); this.lightboxUrl = del.pod_proof_url!; }}
                                        class="w-10 h-10 rounded-lg overflow-hidden border border-white/10 hover:border-gable-green/50 transition-colors relative group"
                                    >
                                        <img src="${del.pod_proof_url}" alt="POD" class="w-full h-full object-cover" />
                                        <div class="absolute inset-0 bg-black/40 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                                            ${icon(Camera, 12, 'text-white')}
                                        </div>
                                    </button>
                                ` : nothing}
                            </div>
                        ` : nothing}
                    </div>
                ` : nothing}
            </div>
        `;
    }

    render() {
        if (this.loading) {
            return html`
                <div class="space-y-4">
                    ${[1, 2, 3].map(() => html`<div class="h-24 bg-white/5 rounded-2xl animate-pulse"></div>`)}
                </div>
            `;
        }

        if (this.error) {
            return html`
                <div class="flex flex-col items-center justify-center h-64 text-center">
                    ${icon(AlertTriangle, 48, 'text-amber-500 mb-4')}
                    <p class="text-zinc-400 mb-4">${this.error}</p>
                    <button
                        @click=${() => this._fetchDeliveries()}
                        class="flex items-center gap-2 px-4 py-2 rounded-lg bg-white/5 border border-white/10 text-white hover:bg-white/10 transition-colors"
                    >
                        ${icon(RefreshCw, 16)} Retry
                    </button>
                </div>
            `;
        }

        const tabs: { key: FilterTab; label: string; count: number }[] = [
            { key: 'all', label: 'All', count: this.deliveries.length },
            { key: 'active', label: 'Active', count: this._active.length },
            { key: 'upcoming', label: 'Upcoming', count: this._upcoming.length },
            { key: 'completed', label: 'Completed', count: this._completed.length },
        ];

        const filtered = this._filtered;

        return html`
            <div>
                <div class="mb-6">
                    <h1 class="text-2xl font-bold text-white">Deliveries</h1>
                    <p class="text-zinc-400 text-sm mt-1">Track your orders from warehouse to jobsite</p>
                </div>

                <!-- Filter Tabs -->
                <div class="flex gap-1 mb-6 bg-white/5 rounded-lg p-1 w-fit">
                    ${tabs.map(t => html`
                        <button
                            @click=${() => { this.filter = t.key; }}
                            class="px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${this.filter === t.key ? 'bg-gable-green/20 text-gable-green' : 'text-zinc-400 hover:text-white'}"
                        >
                            ${t.label} <span class="ml-1 text-[10px] opacity-70">${t.count}</span>
                        </button>
                    `)}
                </div>

                ${this.deliveries.length === 0
                    ? html`
                        <div class="rounded-2xl border border-white/[0.06] bg-[#161821]/80 backdrop-blur-xl">
                            <div class="p-12 text-center">
                                ${icon(Truck, 48, 'text-zinc-600 mx-auto mb-4')}
                                <p class="text-zinc-400">No deliveries yet.</p>
                            </div>
                        </div>
                    `
                    : filtered.length === 0
                        ? html`
                            <div class="rounded-2xl border border-white/[0.06] bg-[#161821]/80 backdrop-blur-xl">
                                <div class="p-8 text-center">
                                    <p class="text-zinc-500 text-sm">No deliveries match this filter.</p>
                                </div>
                            </div>
                        `
                        : html`
                            <div class="space-y-3">
                                ${filtered.map(del => this._renderDeliveryCard(del))}
                            </div>
                        `
                }

                <!-- Lightbox -->
                ${this.lightboxUrl ? html`
                    <div
                        class="fixed inset-0 z-[100] bg-black/80 backdrop-blur-md flex items-center justify-center p-8"
                        @click=${() => { this.lightboxUrl = null; }}
                    >
                        <div class="relative max-w-3xl w-full">
                            <button
                                @click=${() => { this.lightboxUrl = null; }}
                                class="absolute -top-12 right-0 p-2 rounded-lg bg-white/10 text-white hover:bg-white/20 transition-colors"
                            >
                                ${icon(X, 20)}
                            </button>
                            <img
                                src="${this.lightboxUrl}"
                                alt="Proof of Delivery"
                                class="w-full h-auto rounded-2xl border border-white/10 shadow-2xl"
                            />
                            <p class="text-center text-zinc-400 text-sm mt-4">Proof of Delivery Photo</p>
                        </div>
                    </div>
                ` : nothing}
            </div>
        `;
    }
}
