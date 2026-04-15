import { LitElement, html, nothing } from 'lit';
import { customElement, property, state } from 'lit/decorators.js';
import { icon } from '../../lib/icons';
import { MapPin, Box, FileText, ArrowRight, ArrowUp, ArrowDown, RotateCcw, Play, CheckCircle2, Clock } from 'lucide';
import type { Delivery, RouteStatus } from '../../types/delivery';
import { deliveryService } from '../../services/deliveryService';
import { ToastService } from '../../lib/toast-service';

@customElement('gable-delivery-list')
export class GableDeliveryList extends LitElement {
  createRenderRoot() { return this; }

  @property({ type: String, attribute: 'route-id' }) routeId: string | null = null;
  @property({ type: String, attribute: 'vehicle-id' }) vehicleId = '';
  @property({ type: String, attribute: 'route-status' }) routeStatus?: RouteStatus;

  @state() private _deliveries: Delivery[] = [];
  @state() private _loading = false;
  @state() private _showAssignModal = false;
  @state() private _reordering = false;
  @state() private _completing = false;

  updated(changed: Map<string, unknown>) {
    if (changed.has('routeId')) {
      if (this.routeId) {
        this._loadDeliveries(this.routeId);
      } else {
        this._deliveries = [];
        this._fireDeliveriesChange([]);
      }
    }
  }

  private async _loadDeliveries(id: string) {
    this._loading = true;
    try {
      const data = await deliveryService.listDeliveries(id);
      this._deliveries = data;
      this._fireDeliveriesChange(data);
    } catch (err) {
      console.error(err);
      ToastService.show('Failed to load deliveries', 'error');
    } finally {
      this._loading = false;
    }
  }

  private _fireDeliveriesChange(deliveries: Delivery[]) {
    this.dispatchEvent(new CustomEvent('deliveries-change', { detail: deliveries, bubbles: true, composed: true }));
  }

  private async _moveStop(index: number, direction: 'up' | 'down') {
    if (!this.routeId) return;
    const newIndex = direction === 'up' ? index - 1 : index + 1;
    if (newIndex < 0 || newIndex >= this._deliveries.length) return;

    const reordered = [...this._deliveries];
    [reordered[index], reordered[newIndex]] = [reordered[newIndex], reordered[index]];

    this._reordering = true;
    try {
      await deliveryService.reorderStops(this.routeId, reordered.map(d => d.id));
      this._deliveries = reordered;
      this._fireDeliveriesChange(reordered);
    } catch {
      ToastService.show('Failed to reorder stops', 'error');
    } finally {
      this._reordering = false;
    }
  }

  private async _reverseRoute() {
    if (!this.routeId || this._deliveries.length < 2) return;
    const reversed = [...this._deliveries].reverse();
    this._reordering = true;
    try {
      await deliveryService.reorderStops(this.routeId, reversed.map(d => d.id));
      this._deliveries = reversed;
      this._fireDeliveriesChange(reversed);
      ToastService.show('Route order reversed', 'success');
    } catch {
      ToastService.show('Failed to reverse route', 'error');
    } finally {
      this._reordering = false;
    }
  }

  private async _dispatchRoute() {
    if (!this.routeId) return;
    try {
      await deliveryService.dispatchRoute(this.routeId);
      ToastService.show('Route dispatched -- driver notified', 'success');
    } catch {
      ToastService.show('Failed to dispatch route', 'error');
    }
  }

  private async _completeRoute() {
    if (!this.routeId) return;
    this._completing = true;
    try {
      await deliveryService.completeRoute(this.routeId);
      ToastService.show('Route marked as completed', 'success');
    } catch {
      ToastService.show('Failed to complete route -- ensure all deliveries have a terminal status', 'error');
    } finally {
      this._completing = false;
    }
  }

  private get _allTerminal(): boolean {
    if (this._deliveries.length === 0) return false;
    return this._deliveries.every(d => d.status === 'DELIVERED' || d.status === 'FAILED' || d.status === 'PARTIAL');
  }

  render() {
    if (!this.routeId) {
      return html`
        <div class="flex flex-col items-center justify-center h-full text-zinc-500 gap-4 p-12">
          <div class="w-16 h-16 rounded-full bg-white/5 flex items-center justify-center">
            ${icon(MapPin, 32, 'opacity-50')}
          </div>
          <p>Select a route from the left to view its delivery manifest.</p>
        </div>
      `;
    }

    if (this._loading) {
      return html`
        <div class="flex flex-col items-center justify-center h-full text-zinc-500 gap-4">
          <div class="animate-spin rounded-full h-8 w-8 border-b-2 border-gable-green"></div>
          <p>Loading Manifest...</p>
        </div>
      `;
    }

    const routeStatusBadge = this.routeStatus ? html`
      <span class="text-[10px] font-mono uppercase px-1.5 py-0.5 rounded border ${
        this.routeStatus === 'COMPLETED' ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20' :
        this.routeStatus === 'IN_TRANSIT' ? 'bg-blue-500/10 text-blue-400 border-blue-500/20' :
        this.routeStatus === 'CANCELLED' ? 'bg-red-500/10 text-red-400 border-red-500/20' :
        'bg-white/5 text-zinc-400 border-white/10'
      }">
        ${this.routeStatus.replace(/_/g, ' ')}
      </span>
    ` : nothing;

    return html`
      <div class="flex flex-col h-full">
        <div class="p-4 border-b border-white/5 bg-white/5 flex justify-between items-center">
          <h2 class="text-lg font-bold text-white flex items-center gap-2">
            ${icon(FileText, 20, 'text-sky-400')}
            Delivery Manifest
          </h2>
          <div class="flex items-center gap-2">
            ${this._deliveries.length >= 2 ? html`
              <button
                @click=${this._reverseRoute}
                ?disabled=${this._reordering}
                class="p-1.5 rounded bg-white/5 border border-white/10 text-zinc-400 hover:text-white hover:bg-white/10 disabled:opacity-30 transition-colors"
                title="Reverse stop order"
                aria-label="Reverse stop order"
              >
                ${icon(RotateCcw, 14)}
              </button>
            ` : nothing}
            ${this._deliveries.length > 0 && this.routeStatus !== 'COMPLETED' && this.routeStatus !== 'CANCELLED' ? html`
              ${this.routeStatus === 'IN_TRANSIT' && this._allTerminal ? html`
                <button class="h-7 px-2 text-xs bg-emerald-600 hover:bg-emerald-500 text-white inline-flex items-center justify-center rounded-lg font-medium transition-all" @click=${this._completeRoute} ?disabled=${this._completing}>
                  ${icon(CheckCircle2, 12, 'mr-1')} ${this._completing ? 'Completing...' : 'Complete Route'}
                </button>
              ` : html`
                <button class="h-7 px-2 text-xs bg-gable-green text-deep-space inline-flex items-center justify-center rounded-lg font-bold transition-all" @click=${this._dispatchRoute}>
                  ${icon(Play, 12, 'mr-1')} Dispatch
                </button>
              `}
            ` : nothing}
            ${routeStatusBadge}
            <span class="text-xs text-zinc-400 font-mono ml-1">
              ${this._deliveries.length} DROPS
            </span>
          </div>
        </div>

        <div class="flex-1 overflow-y-auto p-6 space-y-6 relative">
          ${this._deliveries.length > 0 ? html`
            <div class="absolute left-[2.25rem] top-6 bottom-6 w-px bg-gradient-to-b from-gable-green/50 via-white/10 to-transparent"></div>
          ` : nothing}

          ${this._deliveries.map((delivery, index) => html`
            <div class="relative pl-12 group">
              <div class="absolute left-6 top-6 -translate-x-1/2 w-6 h-6 rounded-full bg-[#0A0B10] border-2 border-gable-green flex items-center justify-center shadow-[0_0_10px_rgba(0,255,163,0.3)] z-10 text-[10px] font-bold text-white">
                ${index + 1}
              </div>

              <div class="bg-[#161821] border border-white/5 p-5 rounded-xl hover:border-gable-green/30 hover:bg-white/5 transition-all duration-300 group-hover:translate-x-1">
                <div class="flex justify-between items-start mb-2">
                  <span class="font-bold text-lg text-white group-hover:text-gable-green transition-colors">${delivery.customer_name}</span>
                  <div class="flex items-center gap-2">
                    <div class="opacity-0 group-hover:opacity-100 transition-opacity flex gap-1">
                      <button
                        ?disabled=${index === 0 || this._reordering}
                        @click=${(e: Event) => { e.stopPropagation(); this._moveStop(index, 'up'); }}
                        class="p-1 rounded bg-white/5 border border-white/10 text-zinc-400 hover:text-white hover:bg-white/10 disabled:opacity-30 disabled:cursor-not-allowed"
                        title="Move up"
                        aria-label="Move up"
                      >
                        ${icon(ArrowUp, 12)}
                      </button>
                      <button
                        ?disabled=${index === this._deliveries.length - 1 || this._reordering}
                        @click=${(e: Event) => { e.stopPropagation(); this._moveStop(index, 'down'); }}
                        class="p-1 rounded bg-white/5 border border-white/10 text-zinc-400 hover:text-white hover:bg-white/10 disabled:opacity-30 disabled:cursor-not-allowed"
                        title="Move down"
                        aria-label="Move down"
                      >
                        ${icon(ArrowDown, 12)}
                      </button>
                    </div>
                    <span class="text-[10px] font-mono uppercase bg-white/5 px-2 py-1 rounded text-zinc-400 border border-white/5">
                      ${delivery.status}
                    </span>
                  </div>
                </div>

                <div class="flex items-start gap-2 text-zinc-400 text-sm mb-4">
                  ${icon(MapPin, 16, 'shrink-0 mt-0.5 text-zinc-600')}
                  ${delivery.address}
                </div>

                <div class="flex items-center gap-4 text-xs font-mono text-zinc-500 pl-6 border-l-2 border-white/5">
                  <span class="flex items-center gap-1.5">
                    ${icon(Box, 12)}
                    Order #${delivery.order_number}
                  </span>
                  ${delivery.estimated_arrival ? html`
                    <span class="flex items-center gap-1.5 text-sky-400">
                      ${icon(Clock, 12)}
                      ETA ${new Date(delivery.estimated_arrival).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </span>
                  ` : nothing}
                </div>

                ${delivery.delivery_instructions ? html`
                  <div class="mt-4 text-sm bg-amber-500/5 text-amber-500/90 p-3 rounded-lg border border-amber-500/10 italic flex gap-2">
                    <span class="not-italic font-bold text-[10px] px-1.5 py-0.5 bg-amber-500/20 rounded h-fit">NOTE</span>
                    ${delivery.delivery_instructions}
                  </div>
                ` : nothing}
              </div>
            </div>
          `)}

          ${this._deliveries.length === 0 ? html`
            <div class="text-zinc-500 text-center py-12">No deliveries assigned to this route.</div>
          ` : nothing}
        </div>

        <div class="p-4 border-t border-white/5 bg-white/5">
          <button
            class="w-full border-dashed border border-white/20 hover:border-gable-green/50 text-gable-green hover:bg-gable-green/5 inline-flex items-center justify-center rounded-lg text-sm font-medium transition-all h-10 py-2 px-4"
            @click=${() => this._showAssignModal = true}
          >
            ${icon(ArrowRight, 16, 'mr-2')}
            Assign Order to Route
          </button>
        </div>

        ${this.routeId ? html`
          <gable-assign-order-modal
            ?is-open=${this._showAssignModal}
            route-id=${this.routeId}
            vehicle-id=${this.vehicleId || ''}
            .existingDeliveries=${this._deliveries}
            @close=${() => this._showAssignModal = false}
            @assigned=${() => this._loadDeliveries(this.routeId!)}
          ></gable-assign-order-modal>
        ` : nothing}
      </div>
    `;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'gable-delivery-list': GableDeliveryList;
  }
}
