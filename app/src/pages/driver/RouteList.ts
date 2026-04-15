import { LitElement, html, nothing } from 'lit';
import { customElement, state } from 'lit/decorators.js';
import { icon } from '../../lib/icons.ts';
import { router } from '../../lib/router.ts';
import { ToastService } from '../../lib/toast-service.ts';
import { Truck, MapPin, Calendar, ChevronRight, User } from 'lucide';
import { deliveryService } from '../../services/deliveryService';
import type { Driver, Route } from '../../types/delivery';

@customElement('gable-driver-route-list')
export class DriverRouteList extends LitElement {
    createRenderRoot() { return this; }

    @state() private drivers: Driver[] = [];
    @state() private selectedDriver = '';
    @state() private routes: Route[] = [];

    connectedCallback() {
        super.connectedCallback();
        deliveryService.listDrivers()
            .then(d => { this.drivers = d; })
            .catch(() => { this.drivers = []; ToastService.show('Failed to load drivers', 'error'); });
    }

    updated(changed: Map<string, unknown>) {
        if (changed.has('selectedDriver')) {
            this._loadRoutes();
        }
    }

    private _loadRoutes() {
        if (this.selectedDriver) {
            deliveryService.listRoutes(undefined, this.selectedDriver)
                .then(data => { this.routes = data; })
                .catch(() => { this.routes = []; ToastService.show('Failed to load routes', 'error'); });
        } else {
            this.routes = [];
        }
    }

    private _statusConfig(status: string) {
        switch (status) {
            case 'IN_TRANSIT': return 'text-amber-400 bg-amber-500/10 border-amber-500/20';
            case 'COMPLETED': return 'text-emerald-400 bg-emerald-500/10 border-emerald-500/20';
            default: return 'text-zinc-400 bg-zinc-500/10 border-zinc-500/20';
        }
    }

    render() {
        return html`
            <div class="flex flex-col h-full space-y-4 p-4 max-w-md mx-auto">
                <div class="flex items-center justify-between mb-2">
                    <h1 class="text-2xl font-bold text-white tracking-tight flex items-center gap-2">
                        ${icon(Truck, 24, 'text-gable-green')}
                        Driver App
                    </h1>
                </div>

                <div class="rounded-2xl border border-white/[0.06] bg-[#161821]/80 backdrop-blur-xl">
                    <div class="p-4">
                        <label class="block text-xs font-mono uppercase tracking-wider text-zinc-500 mb-2 flex items-center gap-2">
                            ${icon(User, 12)}
                            Select Driver
                        </label>
                        <div class="relative">
                            <select
                                .value=${this.selectedDriver}
                                @change=${(e: Event) => { this.selectedDriver = (e.target as HTMLSelectElement).value; }}
                                class="w-full bg-black/20 border border-white/10 text-white rounded-lg p-3 appearance-none focus:outline-none focus:border-gable-green/50 transition-colors"
                            >
                                <option value="">Choose your profile...</option>
                                ${this.drivers.map(d => html`<option value="${d.id}">${d.name}</option>`)}
                            </select>
                            <div class="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none">
                                ${icon(ChevronRight, 16, 'text-zinc-500 rotate-90')}
                            </div>
                        </div>
                    </div>
                </div>

                <div class="space-y-3">
                    <h2 class="text-sm font-medium text-zinc-400 px-1">Assigned Routes</h2>
                    ${this.routes.map(route => html`
                        <div
                            class="rounded-2xl border border-white/[0.06] bg-[#161821]/80 backdrop-blur-xl active:scale-[0.98] transition-transform cursor-pointer border-white/5 hover:border-gable-green/30"
                            @click=${() => router.navigate(`/driver/routes/${route.id}`)}
                        >
                            <div class="p-4">
                                <div class="flex justify-between items-start mb-3">
                                    <div class="flex items-center gap-2 text-zinc-400 text-sm font-mono">
                                        ${icon(Calendar, 14)}
                                        ${new Date(route.scheduled_date).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })}
                                    </div>
                                    <span class="text-[10px] font-mono px-2 py-0.5 rounded border uppercase tracking-wide ${this._statusConfig(route.status)}">
                                        ${route.status.replace('_', ' ')}
                                    </span>
                                </div>

                                <div class="flex justify-between items-center">
                                    <div>
                                        <h3 class="text-lg font-bold text-white mb-1">${route.vehicle_name}</h3>
                                        ${route.notes ? html`<p class="text-xs text-zinc-500 italic truncate max-w-[200px]">${route.notes}</p>` : nothing}
                                    </div>
                                    ${icon(ChevronRight, 20, 'text-zinc-600')}
                                </div>

                                <div class="mt-4 pt-3 border-t border-white/5 flex items-center justify-between">
                                    <div class="flex items-center gap-1.5 text-xs text-zinc-300 font-mono bg-white/5 px-2 py-1 rounded">
                                        ${icon(MapPin, 12, 'text-gable-green')}
                                        ${route.stop_count} Stops
                                    </div>
                                    <div class="text-xs text-zinc-500">Tap to start</div>
                                </div>
                            </div>
                        </div>
                    `)}

                    ${this.selectedDriver && this.routes.length === 0 ? html`
                        <div class="text-center py-12 flex flex-col items-center gap-4 opacity-50">
                            ${icon(Truck, 48, 'text-zinc-600')}
                            <p class="text-zinc-400">No routes assigned today.</p>
                        </div>
                    ` : nothing}

                    ${!this.selectedDriver ? html`
                        <div class="text-center py-12 flex flex-col items-center gap-4 opacity-50">
                            ${icon(User, 48, 'text-zinc-600')}
                            <p class="text-zinc-400">Select a driver to view routes.</p>
                        </div>
                    ` : nothing}
                </div>
            </div>
        `;
    }
}
