import { LitElement, html, nothing } from 'lit';
import { customElement, property, state } from 'lit/decorators.js';
import { icon } from '../../lib/icons';
import { X, Package, MapPin, FileText, AlertTriangle } from 'lucide';
import { deliveryService } from '../../services/deliveryService';
import { OrderService } from '../../services/OrderService';
import { ToastService } from '../../lib/toast-service';
import type { Order } from '../../types/order';
import type { Vehicle, Delivery } from '../../types/delivery';

@customElement('gable-assign-order-modal')
export class GableAssignOrderModal extends LitElement {
  createRenderRoot() { return this; }

  @property({ type: Boolean, attribute: 'is-open' }) isOpen = false;
  @property({ type: String, attribute: 'route-id' }) routeId = '';
  @property({ type: String, attribute: 'vehicle-id' }) vehicleId = '';
  @property({ type: Array, attribute: false }) existingDeliveries: Delivery[] = [];

  @state() private _orders: Order[] = [];
  @state() private _vehicle: Vehicle | null = null;
  @state() private _selectedOrderId = '';
  @state() private _instructions = '';
  @state() private _saving = false;
  @state() private _loading = true;

  updated(changed: Map<string, unknown>) {
    if (changed.has('isOpen') && this.isOpen) {
      this._loadData();
    }
  }

  private async _loadData() {
    this._loading = true;
    try {
      const [allOrders, vehicles] = await Promise.all([
        OrderService.listOrders(),
        deliveryService.listVehicles(),
      ]);
      const assignedOrderIds = new Set(this.existingDeliveries.map(d => d.order_id));
      this._orders = allOrders.filter((o: Order) => o.status === 'CONFIRMED' && !assignedOrderIds.has(o.id));
      this._vehicle = vehicles.find((v: Vehicle) => v.id === this.vehicleId) || null;
    } catch {
      ToastService.show('Failed to load orders', 'error');
    } finally {
      this._loading = false;
    }
  }

  private async _handleSubmit(e: Event) {
    e.preventDefault();
    if (!this._selectedOrderId) return;

    this._saving = true;
    try {
      const nextSequence = this.existingDeliveries.length + 1;
      const result = await deliveryService.assignOrder({
        route_id: this.routeId,
        order_id: this._selectedOrderId,
        stop_sequence: nextSequence,
        delivery_instructions: this._instructions || undefined,
      });
      if (result.capacity_warning) {
        const w = result.capacity_warning;
        ToastService.show(
          `Warning: Vehicle capacity ${w.vehicle_capacity_lbs.toLocaleString()} lbs exceeded - load after: ${w.total_after_lbs.toLocaleString()} lbs`,
          'error'
        );
      } else {
        ToastService.show('Order assigned to route', 'success');
      }
      this.dispatchEvent(new CustomEvent('assigned', { bubbles: true, composed: true }));
      this._close();
      this._selectedOrderId = '';
      this._instructions = '';
    } catch {
      ToastService.show('Failed to assign order', 'error');
    } finally {
      this._saving = false;
    }
  }

  private _close() {
    this.dispatchEvent(new CustomEvent('close', { bubbles: true, composed: true }));
  }

  private get _capacityWarning(): string | null {
    if (this._vehicle?.capacity_weight_lbs && this.existingDeliveries.length >= 20) {
      return 'Route has many stops -- verify vehicle can handle the load.';
    }
    return null;
  }

  render() {
    if (!this.isOpen) return nothing;

    return html`
      <div class="fixed inset-0 bg-black/80 backdrop-blur-sm z-50" aria-hidden="true" @click=${this._close}></div>
      <div class="fixed inset-0 flex items-center justify-center p-4 z-50 pointer-events-none">
        <dialog open class="w-full max-w-lg transform overflow-hidden rounded-2xl bg-slate-steel border border-white/10 p-6 shadow-xl pointer-events-auto relative">
          <div class="flex items-center justify-between mb-6 border-b border-white/10 pb-4">
            <h2 class="text-xl font-bold font-mono text-white flex items-center gap-2">
              ${icon(Package, 20, 'text-gable-green')} Assign Order to Route
            </h2>
            <button @click=${this._close} class="text-zinc-400 hover:text-white transition-colors">
              ${icon(X, 24)}
            </button>
          </div>

          ${this._vehicle?.capacity_weight_lbs ? html`
            <div class="mb-4 p-3 bg-sky-500/10 border border-sky-500/20 rounded-lg text-sm text-sky-300 font-mono">
              Vehicle capacity: ${this._vehicle.capacity_weight_lbs.toLocaleString()} lbs
              <span class="text-zinc-500 ml-2">&bull; ${this.existingDeliveries.length} stops assigned</span>
            </div>
          ` : nothing}

          ${this._capacityWarning ? html`
            <div class="mb-4 p-3 bg-amber-500/10 border border-amber-500/20 rounded-lg text-sm text-amber-400 flex items-center gap-2">
              ${icon(AlertTriangle, 16, 'shrink-0')}
              ${this._capacityWarning}
            </div>
          ` : nothing}

          ${this._loading ? html`
            <div class="py-12 text-center text-zinc-500 animate-pulse">Loading orders...</div>
          ` : html`
            <form @submit=${this._handleSubmit} class="space-y-5">
              <div>
                <label class="block text-sm font-medium text-zinc-400 mb-1.5 flex items-center gap-1.5">
                  ${icon(MapPin, 14)} Select Order
                </label>
                ${this._orders.length === 0 ? html`
                  <p class="text-zinc-500 text-sm py-4 text-center">No confirmed orders available for assignment.</p>
                ` : html`
                  <div class="max-h-60 overflow-y-auto space-y-2">
                    ${this._orders.map(order => html`
                      <label
                        class="flex items-center gap-3 p-3 rounded-lg border cursor-pointer transition-all ${this._selectedOrderId === order.id
                          ? 'bg-gable-green/10 border-gable-green/50'
                          : 'bg-[#0A0B10] border-white/10 hover:border-white/20'
                        }"
                      >
                        <input
                          type="radio"
                          name="order"
                          .value=${order.id}
                          ?checked=${this._selectedOrderId === order.id}
                          @change=${() => this._selectedOrderId = order.id}
                          class="accent-emerald-500"
                        />
                        <div class="flex-1 min-w-0">
                          <div class="flex justify-between items-center">
                            <span class="text-white font-mono text-sm">${order.customer_name}</span>
                            <span class="text-xs text-zinc-500 font-mono">$${(order.total_amount / 100).toFixed(2)}</span>
                          </div>
                          <span class="text-xs text-zinc-500">Order #${order.id.slice(0, 8)}</span>
                        </div>
                      </label>
                    `)}
                  </div>
                `}
              </div>

              <div>
                <label class="block text-sm font-medium text-zinc-400 mb-1.5 flex items-center gap-1.5">
                  ${icon(FileText, 14)} Delivery Instructions (optional)
                </label>
                <textarea
                  .value=${this._instructions}
                  @input=${(e: InputEvent) => this._instructions = (e.target as HTMLTextAreaElement).value}
                  rows="2"
                  placeholder="Gate code, dock preference, contact on arrival..."
                  class="w-full bg-[#0A0B10] border border-white/10 rounded-lg px-3 py-2.5 text-white text-sm focus:border-gable-green/50 focus:outline-none resize-none"
                ></textarea>
              </div>

              <div class="flex justify-end gap-3 pt-2">
                <button type="button" @click=${this._close} class="border border-white/10 bg-transparent hover:bg-white/5 text-white hover:border-gable-green/50 inline-flex items-center justify-center rounded-lg text-sm font-medium transition-all duration-300 h-10 py-2 px-4">Cancel</button>
                <button type="submit" ?disabled=${this._saving || !this._selectedOrderId || this._orders.length === 0} class="bg-gable-green text-deep-space hover:shadow-glow font-bold inline-flex items-center justify-center rounded-lg text-sm transition-all duration-300 h-10 py-2 px-4 disabled:opacity-50 disabled:pointer-events-none">
                  ${this._saving ? 'Assigning...' : `Assign as Stop #${this.existingDeliveries.length + 1}`}
                </button>
              </div>
            </form>
          `}
        </dialog>
      </div>
    `;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'gable-assign-order-modal': GableAssignOrderModal;
  }
}
