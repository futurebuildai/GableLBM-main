import { LitElement, html, nothing } from 'lit';
import { customElement, state } from 'lit/decorators.js';
import { icon } from '../../lib/icons.ts';
import { router } from '../../lib/router.ts';
import { ToastService } from '../../lib/toast-service.ts';
import { Forklift, ChevronRight, Truck, Boxes, CalendarDays } from 'lucide';
import { deliveryService } from '../../services/deliveryService';
import type { Route } from '../../types/delivery';

function dateStr(offsetDays: number): string {
    const d = new Date();
    d.setDate(d.getDate() + offsetDays);
    return d.toISOString().slice(0, 10);
}

/**
 * Pack Trucks queue — scheduled routes that carry an AI_LM packing manifest,
 * ready for step-by-step loading by yard staff.
 */
@customElement('gable-pack-queue')
export class PackQueue extends LitElement {
    createRenderRoot() { return this; }

    @state() private routes: Route[] = [];
    @state() private loading = true;
    @state() private day: 'today' | 'tomorrow' = 'today';

    connectedCallback() {
        super.connectedCallback();
        this._load();
    }

    private async _load() {
        this.loading = true;
        try {
            const date = this.day === 'today' ? dateStr(0) : dateStr(1);
            const routes = await deliveryService.listRoutes(date);
            this.routes = (routes || []).filter((r) => r.has_manifest);
        } catch {
            this.routes = [];
            ToastService.show('Failed to load pack queue', 'error');
        } finally {
            this.loading = false;
        }
    }

    render() {
        return html`
            <div class="flex flex-col space-y-4 p-4 max-w-md mx-auto">
                <div class="flex items-center justify-between mb-1">
                    <h1 class="text-xl font-bold text-white tracking-tight flex items-center gap-2">
                        ${icon(Forklift, 20, 'text-amber-400')}
                        Pack Trucks
                    </h1>
                    <span class="text-xs font-mono px-2 py-1 rounded bg-amber-400/10 text-amber-400 border border-amber-400/20">
                        ${this.routes.length} Trucks
                    </span>
                </div>

                <div class="flex rounded-lg border border-white/10 overflow-hidden text-sm font-mono">
                    ${(['today', 'tomorrow'] as const).map(
                        (d) => html`
                            <button
                                @click=${() => { this.day = d; this._load(); }}
                                class="flex-1 py-2 flex items-center justify-center gap-2 transition-colors ${this.day === d
                                    ? 'bg-amber-400 text-black font-bold'
                                    : 'bg-[#161821] text-zinc-400'}"
                            >
                                ${icon(CalendarDays, 14)} ${d.toUpperCase()}
                            </button>
                        `,
                    )}
                </div>

                ${this.loading
                    ? html`<div class="flex justify-center items-center h-48">
                          <div class="animate-spin rounded-full h-10 w-10 border-b-2 border-amber-400"></div>
                      </div>`
                    : nothing}

                ${!this.loading && this.routes.length === 0
                    ? html`<div class="text-center py-16 flex flex-col items-center gap-4 opacity-50">
                          ${icon(Boxes, 56, 'text-zinc-600')}
                          <p class="text-zinc-400 text-lg">No trucks to pack</p>
                          <p class="text-zinc-500 text-sm">
                              Routes appear here once dispatch pushes an optimized load plan from the AI Load Manager.
                          </p>
                      </div>`
                    : nothing}

                <div class="space-y-3">
                    ${this.routes.map(
                        (r) => html`
                            <div
                                class="rounded-2xl border border-white/[0.06] bg-[#161821]/80 backdrop-blur-xl active:scale-[0.98] transition-all cursor-pointer hover:border-amber-400/30 p-4"
                                @click=${() => router.navigate(`/yard/loading/${r.id}`)}
                            >
                                <div class="flex justify-between items-start mb-3">
                                    <span class="text-[10px] font-mono px-2 py-0.5 rounded uppercase tracking-wide font-bold ${r.status === 'SCHEDULED'
                                        ? 'bg-amber-400 text-black'
                                        : 'bg-white/10 text-zinc-300'}">${r.status}</span>
                                    ${icon(ChevronRight, 16, 'text-zinc-600')}
                                </div>
                                <h3 class="text-lg font-bold text-white flex items-center gap-2 mb-1">
                                    ${icon(Truck, 16, 'text-zinc-500')}
                                    ${r.vehicle_name || 'Truck'}
                                </h3>
                                <div class="flex items-center justify-between pt-3 border-t border-white/5 text-xs font-mono text-zinc-400">
                                    <span>${r.driver_name || 'No driver'}</span>
                                    <span>${r.stop_count} stop(s)</span>
                                    <span>${r.scheduled_date.slice(0, 10)}</span>
                                </div>
                            </div>
                        `,
                    )}
                </div>
            </div>
        `;
    }
}
