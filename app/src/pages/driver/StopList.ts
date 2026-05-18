import { LitElement, html, nothing } from 'lit';
import { customElement, property, state } from 'lit/decorators.js';
import { icon } from '../../lib/icons.ts';
import { router } from '../../lib/router.ts';
import { ToastService } from '../../lib/toast-service.ts';
import { ArrowLeft, MapPin, CheckCircle, Navigation, Package } from 'lucide';
import { deliveryService } from '../../services/deliveryService';
import type { Delivery } from '../../types/delivery';

@customElement('gable-stop-list')
export class StopList extends LitElement {
    createRenderRoot() { return this; }

    @property({ attribute: 'route-id' }) routeId = '';

    @state() private deliveries: Delivery[] = [];
    @state() private loading = true;

    connectedCallback() {
        super.connectedCallback();
        this._loadDeliveries();
    }

    private _loadDeliveries() {
        if (!this.routeId) return;
        this.loading = true;
        deliveryService.listDeliveries(this.routeId)
            .then(data => { this.deliveries = data; })
            .catch(() => { this.deliveries = []; ToastService.show('Failed to load deliveries', 'error'); })
            .finally(() => { this.loading = false; });
    }

    render() {
        if (!this.routeId) return html`<div>Invalid Route</div>`;

        if (this.loading) {
            return html`
                <div class="flex justify-center items-center h-screen bg-[#0A0B10]">
                    <div class="animate-spin rounded-full h-12 w-12 border-b-2 border-gable-green"></div>
                </div>
            `;
        }

        const completedCount = this.deliveries.filter(d => d.status === 'DELIVERED').length;
        const progress = this.deliveries.length > 0 ? (completedCount / this.deliveries.length) * 100 : 0;

        return html`
            <div class="flex flex-col h-full space-y-4 p-4 max-w-md mx-auto min-h-screen">
                <!-- Header -->
                <div class="flex items-center gap-4 mb-2">
                    <button @click=${() => router.navigate('/driver')} aria-label="Go back" class="p-2 rounded-full bg-white/5 hover:bg-white/10 text-zinc-400 transition-colors">
                        ${icon(ArrowLeft, 20)}
                    </button>
                    <div>
                        <div class="font-bold text-lg text-white">Route Stops</div>
                        <div class="text-xs text-zinc-500 font-mono flex items-center gap-2">
                            ${completedCount} / ${this.deliveries.length} COMPLETED
                        </div>
                    </div>
                </div>

                <!-- Progress Bar -->
                <div class="h-1 bg-white/10 rounded-full overflow-hidden">
                    <div
                        class="h-full bg-gable-green transition-all duration-1000 ease-out"
                        style="width: ${progress}%"
                    ></div>
                </div>

                <div class="space-y-4 relative pb-20">
                    <!-- Timeline Line -->
                    ${this.deliveries.length > 0 ? html`
                        <div class="absolute left-[1.65rem] top-4 bottom-4 w-px bg-white/10"></div>
                    ` : nothing}

                    ${this.deliveries.length === 0 ? html`
                        <div class="text-zinc-500 text-center py-12 flex flex-col items-center gap-4 opacity-50">
                            ${icon(Package, 48, 'text-zinc-600')}
                            <p>No stops assigned to this route.</p>
                        </div>
                    ` : nothing}

                    ${this.deliveries.map((d, index) => {
                        const isNext = d.status === 'PENDING' && (index === 0 || this.deliveries[index - 1].status !== 'PENDING');
                        const isCompleted = d.status === 'DELIVERED';
                        const isFailed = d.status === 'FAILED';

                        return html`
                            <div class="relative pl-10">
                                <!-- Timeline Node -->
                                <div class="absolute left-0 top-6 -translate-y-1/2 w-8 h-8 rounded-full border-2 flex items-center justify-center font-bold text-xs z-10 bg-[#0A0B10] transition-colors ${
                                    isCompleted ? 'border-gable-green text-gable-green' :
                                    isFailed ? 'border-rose-500 text-rose-500' :
                                    isNext ? 'border-white text-white shadow-[0_0_10px_rgba(255,255,255,0.3)]' :
                                    'border-zinc-700 text-zinc-500'
                                }">
                                    ${isCompleted ? icon(CheckCircle, 16) : String(index + 1)}
                                </div>

                                <div
                                    class="rounded-2xl border border-white/[0.06] bg-[#161821]/80 backdrop-blur-xl transition-all active:scale-[0.98] cursor-pointer relative overflow-hidden ${
                                        isNext ? 'border-gable-green/50 bg-gable-green/5' : 'border-white/5'
                                    } ${isCompleted ? 'opacity-60 grayscale-[0.5]' : ''}"
                                    @click=${() => router.navigate(`/driver/deliveries/${d.id}`)}
                                >
                                    ${isNext ? html`<div class="absolute top-0 right-0 px-2 py-0.5 bg-gable-green text-black text-[10px] font-bold font-mono uppercase rounded-bl-lg">Next Stop</div>` : nothing}

                                    <div class="p-4">
                                        <div class="flex justify-between items-start mb-1">
                                            <h3 class="font-bold text-lg ${isCompleted ? 'text-zinc-400' : 'text-white'}">${d.customer_name}</h3>
                                        </div>

                                        <div class="flex items-start gap-2 text-zinc-400 text-sm mb-3">
                                            ${icon(MapPin, 16, 'shrink-0 mt-0.5 text-zinc-600')}
                                            ${d.address}
                                        </div>

                                        <div class="flex items-center justify-between pt-3 border-t border-white/5">
                                            <div class="text-xs font-mono text-zinc-500">
                                                Order #${d.order_number}
                                            </div>
                                            ${isNext ? html`
                                                <div class="text-xs font-bold text-gable-green flex items-center gap-1">
                                                    NAVIGATE ${icon(Navigation, 12)}
                                                </div>
                                            ` : nothing}
                                        </div>
                                    </div>
                                </div>
                            </div>
                        `;
                    })}
                </div>
            </div>
        `;
    }
}
