import { LitElement, html, nothing } from 'lit';
import { customElement, state } from 'lit/decorators.js';
import { icon } from '../../lib/icons.ts';
import { ToastService } from '../../lib/toast-service.ts';
import { ExposureService } from '../../services/ExposureService';
import type { MarketIndex } from '../../types/exposure';
import { Activity, RefreshCw } from 'lucide';

@customElement('gable-market-indices')
export class MarketIndicesPage extends LitElement {
  createRenderRoot() { return this; }

  @state() private indices: MarketIndex[] = [];
  @state() private loading = true;
  @state() private busyIndex = '';

  connectedCallback() {
    super.connectedCallback();
    this._load();
  }

  private async _load() {
    this.loading = true;
    try {
      this.indices = await ExposureService.listMarketIndices();
    } catch (err) {
      console.error(err);
      ToastService.show('Failed to load market indices', 'error');
    } finally {
      this.loading = false;
    }
  }

  private _fmt(v: number | undefined) {
    if (v == null) return '—';
    return v.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }

  private async _refresh(idx: MarketIndex) {
    const raw = window.prompt(
      `Apply a new value for ${idx.name} (${idx.index_code || '—'}).\nCurrent: ${this._fmt(idx.current_value)} ${idx.unit || ''}\n\nEnter the new index value:`,
      idx.current_value != null ? String(idx.current_value) : '',
    );
    if (raw == null) return;
    const newValue = Number(raw);
    if (!Number.isFinite(newValue) || newValue <= 0) {
      ToastService.show('Value must be a number greater than 0', 'error');
      return;
    }
    this.busyIndex = idx.id;
    try {
      await ExposureService.refreshIndex(idx.id, { new_value: newValue, source: 'MANUAL' });
      ToastService.show('Index updated — exposure rescanned', 'success');
      await this._load();
    } catch (err) {
      console.error(err);
      ToastService.show('Failed to refresh index', 'error');
    } finally {
      this.busyIndex = '';
    }
  }

  render() {
    return html`
      <div class="mb-8">
        <h1 class="text-3xl font-bold text-white flex items-center gap-3">
          ${icon(Activity, 32, 'w-8 h-8 text-gable-green')}
          Market Indices
        </h1>
        <p class="text-zinc-500 mt-1">Lumber commodity indices driving quote price-exposure detection</p>
      </div>

      <div class="backdrop-blur-md bg-white/5 border border-white/10 rounded-xl">
        ${this.loading ? html`
          <div class="p-12 flex justify-center">
            <div class="animate-spin rounded-full h-8 w-8 border-b-2 border-gable-green"></div>
          </div>
        ` : this.indices.length === 0 ? html`
          <div class="p-12 text-center text-zinc-500">No market indices configured</div>
        ` : html`
          <table class="w-full text-sm text-left">
            <thead class="bg-white/5 text-zinc-400 uppercase tracking-wider text-xs font-semibold">
              <tr>
                <th class="px-6 py-4">Index</th>
                <th class="px-6 py-4">Code</th>
                <th class="px-6 py-4">Commodity</th>
                <th class="px-6 py-4 text-right">Current Value</th>
                <th class="px-6 py-4">Unit</th>
                <th class="px-6 py-4 text-center">Active</th>
                <th class="px-6 py-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody class="divide-y divide-white/5">
              ${this.indices.map((idx) => {
                const busy = this.busyIndex === idx.id;
                return html`
                  <tr class="hover:bg-white/5 transition-colors">
                    <td class="px-6 py-4 text-white font-medium">
                      ${idx.name}
                      ${idx.description ? html`<div class="text-xs text-zinc-500 font-normal">${idx.description}</div>` : nothing}
                    </td>
                    <td class="px-6 py-4 font-mono text-blueprint-blue">${idx.index_code || '—'}</td>
                    <td class="px-6 py-4 text-zinc-300">${idx.commodity_kind || '—'}</td>
                    <td class="px-6 py-4 text-right font-mono text-white font-bold">${this._fmt(idx.current_value)}</td>
                    <td class="px-6 py-4 font-mono text-zinc-400">${idx.unit || '—'}</td>
                    <td class="px-6 py-4 text-center">
                      <span class="px-2 py-1 rounded-md text-xs font-medium ${idx.is_active ? 'text-emerald-400 bg-emerald-500/10' : 'text-zinc-500 bg-white/5'}">
                        ${idx.is_active ? 'Active' : 'Inactive'}
                      </span>
                    </td>
                    <td class="px-6 py-4 text-right">
                      <button
                        ?disabled=${busy}
                        @click=${() => this._refresh(idx)}
                        class="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-md bg-gable-green/10 text-gable-green hover:bg-gable-green/20 transition-colors disabled:opacity-50">
                        ${icon(RefreshCw, 14, busy ? 'w-3.5 h-3.5 animate-spin' : 'w-3.5 h-3.5')}
                        Refresh
                      </button>
                    </td>
                  </tr>
                `;
              })}
            </tbody>
          </table>
        `}
      </div>
    `;
  }
}
