import { LitElement, html, nothing } from 'lit';
import { customElement, property, state } from 'lit/decorators.js';
import { icon } from '../../lib/icons';
import { Plus, User, Truck, Clock, MapPin } from 'lucide';
import type { Route, RouteStatus } from '../../types/delivery';
import { deliveryService } from '../../services/deliveryService';
import { ToastService } from '../../lib/toast-service';

const formatDate = (dateString: string) => {
  return new Date(dateString).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
};

function statusBadgeClass(status: RouteStatus): string {
  switch (status) {
    case 'SCHEDULED': return 'bg-sky-500/10 text-sky-400 border-sky-500/20';
    case 'IN_TRANSIT': return 'bg-amber-500/10 text-amber-400 border-amber-500/20';
    case 'COMPLETED': return 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20';
    case 'CANCELLED': return 'bg-rose-500/10 text-rose-400 border-rose-500/20';
    default: return 'bg-zinc-500/10 text-zinc-400 border-zinc-500/20';
  }
}

@customElement('gable-route-list-component')
export class GableRouteListComponent extends LitElement {
  createRenderRoot() { return this; }

  @property({ type: String, attribute: 'selected-route-id' }) selectedRouteId: string | null = null;

  @state() private _routes: Route[] = [];
  @state() private _loading = true;
  @state() private _showCreateModal = false;

  connectedCallback() {
    super.connectedCallback();
    this._loadRoutes();
  }

  private async _loadRoutes() {
    try {
      const data = await deliveryService.listRoutes();
      this._routes = data;
    } catch (err) {
      console.error(err);
      ToastService.show('Failed to load routes', 'error');
    } finally {
      this._loading = false;
    }
  }

  private _selectRoute(routeId: string, vehicleId?: string, routeStatus?: RouteStatus) {
    this.dispatchEvent(new CustomEvent('select-route', {
      detail: { routeId, vehicleId, routeStatus },
      bubbles: true,
      composed: true,
    }));
  }

  render() {
    if (this._loading) {
      return html`<div class="p-8 text-center text-zinc-500 animate-pulse">Loading Routes...</div>`;
    }

    return html`
      <div class="flex flex-col h-full">
        <div class="p-4 border-b border-white/5 bg-white/5 flex justify-between items-center">
          <h2 class="text-lg font-bold text-white">Active Routes</h2>
          <button
            class="bg-gable-green text-deep-space hover:shadow-glow font-bold inline-flex items-center justify-center rounded-lg text-sm transition-all h-8 px-2 shadow-glow"
            @click=${() => this._showCreateModal = true}
          >
            ${icon(Plus, 16)}
          </button>
        </div>

        <div class="flex-1 overflow-y-auto p-4 space-y-3">
          ${this._routes.map(route => {
            const isSelected = this.selectedRouteId === route.id;
            return html`
              <div
                @click=${() => this._selectRoute(route.id, route.vehicle_id, route.status)}
                class="p-4 rounded-lg border transition-all duration-200 cursor-pointer group relative overflow-hidden ${isSelected
                  ? 'bg-gable-green/10 border-gable-green/50 shadow-[0_0_15px_rgba(0,255,163,0.1)]'
                  : 'bg-[#161821] border-white/5 hover:border-white/20 hover:bg-white/5'
                }"
              >
                ${isSelected ? html`<div class="absolute left-0 top-0 bottom-0 w-1 bg-gable-green"></div>` : nothing}

                <div class="flex justify-between items-start mb-3">
                  <div class="flex items-center gap-2">
                    ${icon(Truck, 16, isSelected ? 'text-gable-green' : 'text-zinc-500')}
                    <span class="font-bold font-mono ${isSelected ? 'text-white' : 'text-zinc-300'}">
                      ${route.vehicle_name}
                    </span>
                  </div>
                  <span class="px-2 py-0.5 rounded text-[10px] font-mono uppercase tracking-wider border ${statusBadgeClass(route.status)}">
                    ${route.status.replace('_', ' ')}
                  </span>
                </div>

                <div class="flex items-center gap-2 text-sm text-zinc-400 mb-3 pl-6">
                  ${icon(User, 14, 'text-zinc-600')}
                  ${route.driver_name}
                </div>

                <div class="flex justify-between items-end pl-6 border-t border-white/5 pt-3">
                  <div class="flex items-center gap-1.5 text-xs text-zinc-500 font-mono">
                    ${icon(Clock, 14)}
                    ${formatDate(route.scheduled_date)}
                  </div>
                  <div class="flex items-center gap-1.5 text-xs font-mono bg-white/5 px-2 py-1 rounded text-zinc-300 border border-white/5">
                    ${icon(MapPin, 12, 'text-gable-green')}
                    ${route.stop_count} Stops
                  </div>
                </div>
              </div>
            `;
          })}
          ${this._routes.length === 0 ? html`
            <div class="text-zinc-500 text-center py-12 flex flex-col items-center gap-3">
              ${icon(Truck, 32, 'opacity-20')}
              <p>No active routes found.</p>
            </div>
          ` : nothing}
        </div>

        <gable-create-route-modal
          ?is-open=${this._showCreateModal}
          @close=${() => this._showCreateModal = false}
          @created=${() => this._loadRoutes()}
        ></gable-create-route-modal>
      </div>
    `;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'gable-route-list-component': GableRouteListComponent;
  }
}
