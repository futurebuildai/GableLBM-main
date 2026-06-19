import { LitElement, html, nothing } from 'lit';
import { customElement, state } from 'lit/decorators.js';
import { icon } from '../lib/icons.ts';
import { Truck, Calendar, FileText, Map as MapIcon } from 'lucide';
import type { Delivery, RouteStatus } from '../types/delivery';

// Side-effect imports: register child custom elements
import '../components/logistics/RouteList.ts';
import '../components/logistics/DeliveryList.ts';
import '../components/logistics/RouteMap.ts';

@customElement('gable-dispatch-board')
export class DispatchBoard extends LitElement {
  createRenderRoot() { return this; }

  @state() private _selectedRouteId: string | null = null;
  @state() private _selectedVehicleId: string | undefined = undefined;
  @state() private _selectedRouteStatus: RouteStatus | undefined = undefined;
  @state() private _currentDeliveries: Delivery[] = [];
  @state() private _activeTab: 'manifest' | 'map' = 'manifest';
  @state() private _selectedDeliveryId: string | null = null;

  updated(changed: Map<string, unknown>) {
    if (!changed.has('_activeTab')) return;
    // Both panes stay mounted while hidden, so nudge the newly-visible one:
    // Leaflet needs invalidateSize after its 0x0 hidden-tab init, and the
    // manifest needs a stop selected while it was hidden scrolled into view.
    requestAnimationFrame(() => {
      if (!this.isConnected) return;
      if (this._activeTab === 'map') {
        const map = this.querySelector('gable-route-map') as (HTMLElement & { refresh?: () => void }) | null;
        map?.refresh?.();
      } else {
        const list = this.querySelector('gable-delivery-list') as (HTMLElement & { scrollToSelected?: () => void }) | null;
        list?.scrollToSelected?.();
      }
    });
  }

  private _handleSelectRoute(routeId: string, vehicleId?: string, routeStatus?: RouteStatus) {
    if (routeId !== this._selectedRouteId) {
      this._currentDeliveries = [];
      this._selectedDeliveryId = null;
    }
    this._selectedRouteId = routeId;
    this._selectedVehicleId = vehicleId;
    this._selectedRouteStatus = routeStatus;
  }

  private _handleDeliveriesChange(deliveries: Delivery[]) {
    this._currentDeliveries = deliveries;
  }

  // Bidirectional list <-> map sync; clicking the active stop again clears it.
  private _handleStopSelect(id: string) {
    this._selectedDeliveryId = this._selectedDeliveryId === id ? null : id;
  }

  render() {
    const today = new Date().toLocaleDateString(undefined, { weekday: 'short', month: 'long', day: 'numeric' });

    return html`
      <div class="flex flex-col lg:h-[calc(100vh-2rem)]">
        <div class="flex flex-wrap justify-between items-center gap-4 mb-6">
          <div>
            <h1 class="text-display-large text-white flex items-center gap-3">
              ${icon(Truck, 40, 'text-gable-green')}
              Logistics &amp; Dispatch
            </h1>
            <p class="text-zinc-500 mt-1 text-lg">
              Manage fleet routing and delivery schedules.
            </p>
          </div>
          <div class="flex items-center gap-2 px-4 py-2 rounded-lg bg-white/5 border border-white/10 text-zinc-300 font-mono text-sm">
            ${icon(Calendar, 16, 'text-gable-green')}
            Today: ${today}
          </div>
        </div>

        <div class="flex flex-col lg:flex-row gap-6 lg:flex-1 lg:min-h-0">
          <!-- Left Panel: Route List -->
          <div class="w-full lg:w-1/3 h-[45vh] lg:h-auto flex flex-col overflow-hidden rounded-2xl bg-white/[0.03] border border-white/5 backdrop-blur-md">
            <div class="p-0 flex-1 overflow-hidden flex flex-col">
              <gable-route-list-component
                class="flex-1 min-h-0 flex flex-col"
                .selectedRouteId=${this._selectedRouteId}
                @select-route=${(e: CustomEvent) => {
                  const { routeId, vehicleId, routeStatus } = e.detail;
                  this._handleSelectRoute(routeId, vehicleId, routeStatus);
                }}
              ></gable-route-list-component>
            </div>
          </div>

          <!-- Right Panel: Delivery Manifest / Map (tabbed) -->
          <div class="w-full lg:w-2/3 h-[75vh] lg:h-auto flex flex-col overflow-hidden rounded-2xl bg-white/[0.03] border border-white/5 backdrop-blur-md">
            <!-- Tab bar -->
            <div role="tablist" aria-label="Delivery views" class="flex items-center gap-1 p-2 border-b border-white/5 bg-white/5 shrink-0">
              <button
                type="button"
                role="tab"
                id="dispatch-tab-manifest"
                aria-selected=${this._activeTab === 'manifest'}
                aria-controls="dispatch-panel-manifest"
                class="h-8 px-3 text-sm rounded-lg inline-flex items-center gap-1.5 font-medium transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-gable-green/60 ${this._activeTab === 'manifest'
                  ? 'bg-gable-green/10 text-gable-green border border-gable-green/30'
                  : 'text-zinc-400 hover:text-white hover:bg-white/5 border border-transparent'}"
                @click=${() => (this._activeTab = 'manifest')}
              >
                ${icon(FileText, 14)} Manifest
              </button>
              <button
                type="button"
                role="tab"
                id="dispatch-tab-map"
                aria-selected=${this._activeTab === 'map'}
                aria-controls="dispatch-panel-map"
                class="h-8 px-3 text-sm rounded-lg inline-flex items-center gap-1.5 font-medium transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-gable-green/60 ${this._activeTab === 'map'
                  ? 'bg-gable-green/10 text-gable-green border border-gable-green/30'
                  : 'text-zinc-400 hover:text-white hover:bg-white/5 border border-transparent'}"
                @click=${() => (this._activeTab = 'map')}
              >
                ${icon(MapIcon, 14)} Map
              </button>
              ${this._currentDeliveries.length
                ? html`<span class="ml-auto pr-1 text-xs font-mono text-zinc-500">${this._currentDeliveries.length} stops</span>`
                : nothing}
            </div>

            <!-- Tab content: both panes stay mounted; the inactive one is hidden -->
            <div class="flex-1 min-h-0 flex flex-col">
              <gable-delivery-list
                role="tabpanel"
                id="dispatch-panel-manifest"
                aria-labelledby="dispatch-tab-manifest"
                class=${this._activeTab === 'manifest' ? 'flex-1 min-h-0 flex flex-col' : 'hidden'}
                .routeId=${this._selectedRouteId}
                .vehicleId=${this._selectedVehicleId}
                .routeStatus=${this._selectedRouteStatus}
                .selectedId=${this._selectedDeliveryId}
                @deliveries-change=${(e: CustomEvent) => this._handleDeliveriesChange(e.detail)}
                @stop-select=${(e: CustomEvent) => this._handleStopSelect(e.detail.id)}
              ></gable-delivery-list>
              <gable-route-map
                role="tabpanel"
                id="dispatch-panel-map"
                aria-labelledby="dispatch-tab-map"
                class=${this._activeTab === 'map' ? 'flex-1 min-h-0' : 'hidden'}
                .deliveries=${this._currentDeliveries}
                .selectedId=${this._selectedDeliveryId}
                @stop-select=${(e: CustomEvent) => this._handleStopSelect(e.detail.id)}
              ></gable-route-map>
            </div>
          </div>
        </div>
      </div>
    `;
  }
}
