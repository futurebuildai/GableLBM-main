import { LitElement, html, nothing } from 'lit';
import { customElement, property, state } from 'lit/decorators.js';
import { icon } from '../../lib/icons';
import { X, Truck, User, Calendar, FileText } from 'lucide';
import { deliveryService } from '../../services/deliveryService';
import { ToastService } from '../../lib/toast-service';
import type { Vehicle, Driver, CreateRouteRequest } from '../../types/delivery';

@customElement('gable-create-route-modal')
export class GableCreateRouteModal extends LitElement {
  createRenderRoot() { return this; }

  @property({ type: Boolean, attribute: 'is-open' }) isOpen = false;

  @state() private _vehicles: Vehicle[] = [];
  @state() private _drivers: Driver[] = [];
  @state() private _vehicleId = '';
  @state() private _driverId = '';
  @state() private _scheduledDate = new Date().toISOString().split('T')[0];
  @state() private _notes = '';
  @state() private _saving = false;

  updated(changed: Map<string, unknown>) {
    if (changed.has('isOpen') && this.isOpen) {
      this._loadFleet();
    }
  }

  private async _loadFleet() {
    try {
      const [v, d] = await Promise.all([
        deliveryService.listVehicles(),
        deliveryService.listDrivers(),
      ]);
      this._vehicles = v;
      this._drivers = d.filter((dr: Driver) => dr.status === 'ACTIVE');
    } catch {
      ToastService.show('Failed to load fleet data', 'error');
    }
  }

  private async _handleSubmit(e: Event) {
    e.preventDefault();
    if (!this._vehicleId || !this._driverId || !this._scheduledDate) return;

    this._saving = true;
    try {
      const req: CreateRouteRequest = {
        vehicle_id: this._vehicleId,
        driver_id: this._driverId,
        scheduled_date: this._scheduledDate,
        notes: this._notes || undefined,
      };
      await deliveryService.createRoute(req);
      ToastService.show('Route created successfully', 'success');
      this.dispatchEvent(new CustomEvent('created', { bubbles: true, composed: true }));
      this._close();
      this._vehicleId = '';
      this._driverId = '';
      this._notes = '';
    } catch {
      ToastService.show('Failed to create route', 'error');
    } finally {
      this._saving = false;
    }
  }

  private _close() {
    this.dispatchEvent(new CustomEvent('close', { bubbles: true, composed: true }));
  }

  render() {
    if (!this.isOpen) return nothing;

    const selectedVehicle = this._vehicles.find(v => v.id === this._vehicleId);

    return html`
      <div class="fixed inset-0 bg-black/80 backdrop-blur-sm z-50" aria-hidden="true" @click=${this._close}></div>
      <div class="fixed inset-0 flex items-center justify-center p-4 z-50 pointer-events-none">
        <dialog open class="w-full max-w-lg transform overflow-hidden rounded-2xl bg-slate-steel border border-white/10 p-6 shadow-xl pointer-events-auto relative">
          <div class="flex items-center justify-between mb-6 border-b border-white/10 pb-4">
            <h2 class="text-xl font-bold font-mono text-white flex items-center gap-2">
              ${icon(Truck, 20, 'text-gable-green')} Create Route
            </h2>
            <button @click=${this._close} class="text-zinc-400 hover:text-white transition-colors">
              ${icon(X, 24)}
            </button>
          </div>

          <form @submit=${this._handleSubmit} class="space-y-5">
            <div>
              <label class="block text-sm font-medium text-zinc-400 mb-1.5 flex items-center gap-1.5">
                ${icon(Truck, 14)} Vehicle
              </label>
              <select
                .value=${this._vehicleId}
                @change=${(e: Event) => this._vehicleId = (e.target as HTMLSelectElement).value}
                required
                class="w-full bg-[#0A0B10] border border-white/10 rounded-lg px-3 py-2.5 text-white text-sm focus:border-gable-green/50 focus:outline-none"
              >
                <option value="">Select vehicle...</option>
                ${this._vehicles.map(v => html`
                  <option value=${v.id}>
                    ${v.name} -- ${v.vehicle_type.replace('_', ' ')} (${v.license_plate})${v.capacity_weight_lbs ? ` - ${v.capacity_weight_lbs.toLocaleString()} lbs` : ''}
                  </option>
                `)}
              </select>
              ${selectedVehicle?.capacity_weight_lbs ? html`
                <p class="text-xs text-zinc-500 mt-1 font-mono">
                  Capacity: ${selectedVehicle.capacity_weight_lbs.toLocaleString()} lbs
                </p>
              ` : nothing}
            </div>

            <div>
              <label class="block text-sm font-medium text-zinc-400 mb-1.5 flex items-center gap-1.5">
                ${icon(User, 14)} Driver
              </label>
              <select
                .value=${this._driverId}
                @change=${(e: Event) => this._driverId = (e.target as HTMLSelectElement).value}
                required
                class="w-full bg-[#0A0B10] border border-white/10 rounded-lg px-3 py-2.5 text-white text-sm focus:border-gable-green/50 focus:outline-none"
              >
                <option value="">Select driver...</option>
                ${this._drivers.map(d => html`
                  <option value=${d.id}>
                    ${d.name} ${d.phone_number ? `(${d.phone_number})` : ''}
                  </option>
                `)}
              </select>
            </div>

            <div>
              <label class="block text-sm font-medium text-zinc-400 mb-1.5 flex items-center gap-1.5">
                ${icon(Calendar, 14)} Scheduled Date
              </label>
              <input
                type="date"
                .value=${this._scheduledDate}
                @input=${(e: InputEvent) => this._scheduledDate = (e.target as HTMLInputElement).value}
                required
                class="w-full bg-[#0A0B10] border border-white/10 rounded-lg px-3 py-2.5 text-white text-sm focus:border-gable-green/50 focus:outline-none"
              />
            </div>

            <div>
              <label class="block text-sm font-medium text-zinc-400 mb-1.5 flex items-center gap-1.5">
                ${icon(FileText, 14)} Notes (optional)
              </label>
              <textarea
                .value=${this._notes}
                @input=${(e: InputEvent) => this._notes = (e.target as HTMLTextAreaElement).value}
                rows="2"
                placeholder="Special instructions, area focus, etc."
                class="w-full bg-[#0A0B10] border border-white/10 rounded-lg px-3 py-2.5 text-white text-sm focus:border-gable-green/50 focus:outline-none resize-none"
              ></textarea>
            </div>

            <div class="flex justify-end gap-3 pt-2">
              <button type="button" @click=${this._close} class="border border-white/10 bg-transparent hover:bg-white/5 text-white hover:border-gable-green/50 inline-flex items-center justify-center rounded-lg text-sm font-medium transition-all duration-300 h-10 py-2 px-4">Cancel</button>
              <button type="submit" ?disabled=${this._saving || !this._vehicleId || !this._driverId} class="bg-gable-green text-deep-space hover:shadow-glow font-bold inline-flex items-center justify-center rounded-lg text-sm transition-all duration-300 h-10 py-2 px-4 disabled:opacity-50 disabled:pointer-events-none">
                ${this._saving ? 'Creating...' : 'Create Route'}
              </button>
            </div>
          </form>
        </dialog>
      </div>
    `;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'gable-create-route-modal': GableCreateRouteModal;
  }
}
