import { LitElement, html } from 'lit';
import { customElement, state } from 'lit/decorators.js';
import { icon } from '../lib/icons.ts';
import { Truck, Calendar } from 'lucide';
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

  private _handleSelectRoute(routeId: string, vehicleId?: string, routeStatus?: RouteStatus) {
    if (routeId !== this._selectedRouteId) {
      this._currentDeliveries = [];
    }
    this._selectedRouteId = routeId;
    this._selectedVehicleId = vehicleId;
    this._selectedRouteStatus = routeStatus;
  }

  private _handleDeliveriesChange(deliveries: Delivery[]) {
    this._currentDeliveries = deliveries;
  }

  render() {
    const today = new Date().toLocaleDateString(undefined, { weekday: 'short', month: 'long', day: 'numeric' });

    return html`
      <div class="h-[calc(100vh-2rem)] flex flex-col">
        <div class="flex justify-between items-center mb-6">
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

        <div class="flex gap-6 flex-1 min-h-0">
          <!-- Left Panel: Route List -->
          <div class="w-1/3 flex flex-col overflow-hidden rounded-2xl bg-white/[0.03] border border-white/5 backdrop-blur-md">
            <div class="p-0 flex-1 overflow-hidden flex flex-col">
              <gable-route-list-component
                .selectedRouteId=${this._selectedRouteId}
                @select-route=${(e: CustomEvent) => {
                  const { routeId, vehicleId, routeStatus } = e.detail;
                  this._handleSelectRoute(routeId, vehicleId, routeStatus);
                }}
              ></gable-route-list-component>
            </div>
          </div>

          <!-- Right Panel: Delivery Manifest & Map -->
          <div class="w-2/3 flex flex-col gap-6">
            <div class="flex-1 flex flex-col overflow-hidden rounded-2xl bg-white/[0.03] border border-white/5 backdrop-blur-md">
              <div class="p-0 flex-1 overflow-hidden flex flex-col">
                <gable-delivery-list
                  .routeId=${this._selectedRouteId}
                  .vehicleId=${this._selectedVehicleId}
                  .routeStatus=${this._selectedRouteStatus}
                  @deliveries-change=${(e: CustomEvent) => this._handleDeliveriesChange(e.detail)}
                ></gable-delivery-list>
              </div>
            </div>

            <div class="h-[350px] relative overflow-hidden rounded-2xl bg-white/[0.03] border border-white/5 backdrop-blur-md">
              <gable-route-map
                .deliveries=${this._currentDeliveries}
              ></gable-route-map>
            </div>
          </div>
        </div>
      </div>
    `;
  }
}
