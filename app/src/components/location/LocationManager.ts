import { LitElement, html } from 'lit';
import { customElement, state } from 'lit/decorators.js';
import { LocationService } from '../../services/LocationService';
import { ToastService } from '../../lib/toast-service';
import type { Location, LocationType } from '../../types/location';

@customElement('gable-location-manager')
export class GableLocationManager extends LitElement {
  createRenderRoot() { return this; }

  @state() private _locations: Location[] = [];
  @state() private _newCode = '';
  @state() private _newType: LocationType = 'ZONE';

  connectedCallback() {
    super.connectedCallback();
    this._loadLocations();
  }

  private async _loadLocations() {
    try {
      const data = await LocationService.listLocations();
      this._locations = data;
    } catch (error) {
      console.error(error);
      ToastService.show('Failed to load locations', 'error');
    }
  }

  private async _handleCreate() {
    try {
      await LocationService.createLocation({
        code: this._newCode,
        type: this._newType,
        path: this._newCode,
      });
      this._newCode = '';
      this._loadLocations();
    } catch {
      ToastService.show('Failed to create location', 'error');
    }
  }

  render() {
    return html`
      <div class="p-6 bg-[#161821] text-white rounded-lg shadow-lg">
        <h2 class="text-xl font-bold mb-4 font-inter text-[#00FFA3]">Location Manager</h2>

        <div class="flex gap-2 mb-6">
          <input
            class="bg-black/20 border border-white/10 rounded px-3 py-2 text-white focus:border-[#00FFA3] outline-none"
            placeholder="Code (e.g. Zone A)"
            .value=${this._newCode}
            @input=${(e: InputEvent) => this._newCode = (e.target as HTMLInputElement).value}
          />
          <select
            class="bg-black/20 border border-white/10 rounded px-3 py-2 text-white"
            .value=${this._newType}
            @change=${(e: Event) => this._newType = (e.target as HTMLSelectElement).value as LocationType}
          >
            <option value="YARD">Yard</option>
            <option value="ZONE">Zone</option>
            <option value="AISLE">Aisle</option>
            <option value="BIN">Bin</option>
          </select>
          <button
            @click=${this._handleCreate}
            class="bg-[#00FFA3] text-black font-semibold px-4 py-2 rounded hover:shadow-[0_0_10px_rgba(0,255,163,0.3)] transition-all"
          >
            Create
          </button>
        </div>

        <div class="space-y-2">
          ${this._locations.map(loc => html`
            <div class="flex justify-between items-center p-3 bg-white/5 rounded border border-white/5">
              <div>
                <span class="font-mono text-[#38BDF8] mr-2">${loc.type}</span>
                <span class="font-bold">${loc.path || loc.code}</span>
              </div>
              <span class="text-xs text-white/40">${loc.id}</span>
            </div>
          `)}
        </div>
      </div>
    `;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'gable-location-manager': GableLocationManager;
  }
}
