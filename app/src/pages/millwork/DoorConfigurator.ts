import { LitElement, html, nothing } from 'lit';
import { customElement, state } from 'lit/decorators.js';
import type { MillworkOption, MillworkConfiguration } from '../../types/millwork';
import { MillworkService } from '../../services/MillworkService';

@customElement('gable-door-configurator')
export class DoorConfigurator extends LitElement {
  createRenderRoot() { return this; }

  @state() private _doorTypes: MillworkOption[] = [];
  @state() private _materials: MillworkOption[] = [];
  @state() private _glassOptions: MillworkOption[] = [];

  @state() private _config: MillworkConfiguration = {
    doorType: null,
    material: null,
    glass: null,
    width: 36,
    height: 80,
  };

  @state() private _loading = true;
  @state() private _error: string | null = null;

  connectedCallback() {
    super.connectedCallback();
    this._fetchOptions();
  }

  private async _fetchOptions() {
    this._error = null;
    this._loading = true;
    try {
      const [doors, mats, glass] = await Promise.all([
        MillworkService.getOptionsByCategory('door_type'),
        MillworkService.getOptionsByCategory('material'),
        MillworkService.getOptionsByCategory('glass'),
      ]);
      this._doorTypes = doors;
      this._materials = mats;
      this._glassOptions = glass;
    } catch (err) {
      console.error("Failed to load millwork options", err);
      this._error = err instanceof Error ? err.message : 'Failed to load configurator options';
    } finally {
      this._loading = false;
    }
  }

  render() {
    if (this._loading) {
      return html`<div class="p-8 text-white">Loading Configurator...</div>`;
    }

    if (this._error) {
      return html`
        <div class="flex h-full items-center justify-center bg-[#0A0B10] text-[#E0E0E0]">
          <div class="text-center space-y-4">
            <p class="text-red-400">${this._error}</p>
            <button
              @click=${() => this._fetchOptions()}
              class="px-4 py-2 rounded-lg bg-[#00FFA3]/10 text-[#00FFA3] border border-[#00FFA3]/20 hover:bg-[#00FFA3]/20 transition-colors text-sm font-medium"
            >
              Retry
            </button>
          </div>
        </div>
      `;
    }

    const currentPrice = MillworkService.calculateDoorPrice(this._config);
    const basePrice = 250.00;

    return html`
      <div class="flex h-full bg-[#0A0B10] text-[#E0E0E0]">
        <!-- Configuration Panel -->
        <div class="w-1/3 border-r border-white/10 p-6 overflow-y-auto">
          <h2 class="text-2xl font-bold mb-6 text-[#00FFA3]">Configure Door</h2>

          <div class="space-y-8">
            <!-- Door Type -->
            <div>
              <label class="block text-sm font-medium text-gray-400 mb-2">Door Style</label>
              <div class="grid grid-cols-2 gap-3">
                ${this._doorTypes.map(opt => html`
                  <button
                    @click=${() => { this._config = { ...this._config, doorType: opt }; }}
                    class="p-4 border rounded-lg text-left transition-all ${this._config.doorType?.id === opt.id
                      ? 'border-[#00FFA3] bg-[#00FFA3]/10 text-white'
                      : 'border-white/10 hover:border-white/30 text-gray-300'
                    }"
                  >
                    <div class="font-medium">${opt.name}</div>
                    <div class="text-sm text-gray-500">+$${opt.price_adjustment}</div>
                  </button>
                `)}
              </div>
            </div>

            <!-- Material -->
            <div>
              <label class="block text-sm font-medium text-gray-400 mb-2">Material</label>
              <div class="grid grid-cols-2 gap-3">
                ${this._materials.map(opt => html`
                  <button
                    @click=${() => { this._config = { ...this._config, material: opt }; }}
                    class="p-4 border rounded-lg text-left transition-all ${this._config.material?.id === opt.id
                      ? 'border-[#00FFA3] bg-[#00FFA3]/10 text-white'
                      : 'border-white/10 hover:border-white/30 text-gray-300'
                    }"
                  >
                    <div class="font-medium">${opt.name}</div>
                    <div class="text-sm text-gray-500">+$${opt.price_adjustment}</div>
                  </button>
                `)}
              </div>
            </div>

            <!-- Dimensions -->
            <div>
              <label class="block text-sm font-medium text-gray-400 mb-2">Dimensions (Inches)</label>
              <div class="flex gap-4">
                <div>
                  <label class="text-xs text-gray-500">Width</label>
                  <input
                    type="number"
                    .value=${String(this._config.width)}
                    @input=${(e: Event) => { this._config = { ...this._config, width: parseInt((e.target as HTMLInputElement).value) || 0 }; }}
                    class="w-full bg-[#161821] border border-white/20 rounded p-2 focus:border-[#00FFA3] outline-none"
                  />
                </div>
                <div>
                  <label class="text-xs text-gray-500">Height</label>
                  <input
                    type="number"
                    .value=${String(this._config.height)}
                    @input=${(e: Event) => { this._config = { ...this._config, height: parseInt((e.target as HTMLInputElement).value) || 0 }; }}
                    class="w-full bg-[#161821] border border-white/20 rounded p-2 focus:border-[#00FFA3] outline-none"
                  />
                </div>
              </div>
            </div>

            <!-- Glass -->
            <div>
              <label class="block text-sm font-medium text-gray-400 mb-2">Glass Options</label>
              <div class="grid grid-cols-1 gap-2">
                <button
                  @click=${() => { this._config = { ...this._config, glass: null }; }}
                  class="p-3 border rounded text-left ${this._config.glass === null
                    ? 'border-[#00FFA3] bg-[#00FFA3]/10'
                    : 'border-white/10'
                  }"
                >
                  No Glass
                </button>
                ${this._glassOptions.map(opt => html`
                  <button
                    @click=${() => { this._config = { ...this._config, glass: opt }; }}
                    class="p-3 border rounded text-left flex justify-between ${this._config.glass?.id === opt.id
                      ? 'border-[#00FFA3] bg-[#00FFA3]/10 text-white'
                      : 'border-white/10 hover:border-white/30 text-gray-300'
                    }"
                  >
                    <span>${opt.name}</span>
                    <span class="text-gray-500">+$${opt.price_adjustment}</span>
                  </button>
                `)}
              </div>
            </div>
          </div>
        </div>

        <!-- Visualizer / Summary -->
        <div class="flex-1 p-12 flex flex-col items-center justify-center bg-gradient-to-br from-[#0A0B10] to-[#161821]">

          <!-- Placeholder Visualizer -->
          <div
            class="border-4 bg-[#0A0B10] relative shadow-2xl mb-8 transition-all duration-500"
            style="width: ${this._config.width * 2}px; height: ${this._config.height * 2}px; border-color: ${this._config.material?.name === 'Mahogany' ? '#6D2E15' : '#38BDF8'}"
          >
            <div class="absolute inset-0 flex items-center justify-center text-white/20 font-mono text-4xl">
              ${this._config.doorType?.name || "Select Style"}
            </div>
            ${this._config.glass ? html`
              <div class="absolute top-10 left-10 right-10 bottom-40 bg-blue-400/20 border border-blue-400/30 backdrop-blur-sm"></div>
            ` : nothing}
          </div>

          <!-- Price Tag -->
          <div class="bg-[#161821] border border-white/10 p-6 rounded-xl w-96 shadow-xl">
            <h3 class="text-gray-400 uppercase text-xs tracking-wider mb-4">Estimate Summary</h3>

            <div class="space-y-2 mb-4 text-sm">
              <div class="flex justify-between">
                <span>Base Door (${this._config.width}" x ${this._config.height}")</span>
                <span>$${basePrice.toFixed(2)}</span>
              </div>
              ${this._config.doorType ? html`
                <div class="flex justify-between text-[#00FFA3]">
                  <span>${this._config.doorType.name}</span>
                  <span>+$${this._config.doorType.price_adjustment.toFixed(2)}</span>
                </div>
              ` : nothing}
              ${this._config.material ? html`
                <div class="flex justify-between text-[#00FFA3]">
                  <span>${this._config.material.name}</span>
                  <span>+$${this._config.material.price_adjustment.toFixed(2)}</span>
                </div>
              ` : nothing}
            </div>

            <div class="border-t border-white/10 pt-4 flex justify-between items-end">
              <span class="text-gray-400">Total</span>
              <span class="text-3xl font-mono font-bold text-white">$${currentPrice.toFixed(2)}</span>
            </div>

            <button class="w-full mt-6 bg-[#00FFA3] hover:bg-[#00FFA3]/90 text-black font-bold py-3 rounded uppercase tracking-wide transition-colors">
              Add to Order
            </button>
          </div>
        </div>
      </div>
    `;
  }
}
