import { LitElement, html, nothing } from 'lit';
import { customElement, state } from 'lit/decorators.js';
import { Activity, TrendingUp, TrendingDown } from 'lucide';
import { icon } from '../../lib/icons';
import { ExposureService } from '../../services/ExposureService';
import { ToastService } from '../../lib/toast-service';
import type { IndexRefreshPreview, MarketIndexFull } from '../../types/exposure';

/**
 * gable-market-indices-admin — route `/admin/market-indices`. The buyer/
 * admin screen for managing the commodity-index taxonomy. Two-pane layout:
 * list of indices on the left, selected-index detail on the right. The
 * detail pane offers Preview-then-Apply on value updates so the buyer can
 * see expected impact before kicking the scanner.
 */
@customElement('gable-market-indices-admin')
export class GableMarketIndicesAdmin extends LitElement {
  createRenderRoot() { return this; }

  @state() private _indices: MarketIndexFull[] = [];
  @state() private _selectedId = '';
  @state() private _loading = true;
  @state() private _error = '';

  // Update-value form
  @state() private _newValue = '';
  @state() private _source = 'MANUAL';
  @state() private _notes = '';
  @state() private _preview: IndexRefreshPreview | null = null;
  @state() private _previewing = false;
  @state() private _applying = false;

  connectedCallback() {
    super.connectedCallback();
    this._loadIndices();
  }

  private async _loadIndices() {
    this._loading = true;
    try {
      this._indices = await ExposureService.listIndices();
      if (!this._selectedId && this._indices.length > 0) {
        this._selectedId = this._indices[0].id;
      }
    } catch (err) {
      this._error = err instanceof Error ? err.message : 'Failed to load indices';
    } finally {
      this._loading = false;
    }
  }

  private get _selected(): MarketIndexFull | undefined {
    return this._indices.find(i => i.id === this._selectedId);
  }

  private _select(id: string) {
    this._selectedId = id;
    this._newValue = '';
    this._preview = null;
    this._notes = '';
  }

  private _fmt(v: number) {
    return v.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }

  private _deltaPct(idx: MarketIndexFull) {
    if (!idx.previous_value || idx.previous_value <= 0) return 0;
    return ((idx.current_value - idx.previous_value) / idx.previous_value) * 100;
  }

  private async _doPreview() {
    if (!this._selected) return;
    const val = parseFloat(this._newValue);
    if (!val || val <= 0) {
      this._error = 'new_value must be > 0';
      return;
    }
    this._previewing = true;
    this._error = '';
    try {
      this._preview = await ExposureService.previewIndexRefresh(this._selected.id, {
        new_value: val, source: this._source, notes: this._notes,
      });
    } catch (err) {
      this._error = err instanceof Error ? err.message : 'Preview failed';
    } finally {
      this._previewing = false;
    }
  }

  private async _doApply() {
    if (!this._selected) return;
    const val = parseFloat(this._newValue);
    if (!val || val <= 0) {
      this._error = 'new_value must be > 0';
      return;
    }
    this._applying = true;
    this._error = '';
    try {
      await ExposureService.refreshIndex(this._selected.id, {
        new_value: val, source: this._source, notes: this._notes,
      });
      ToastService.show(
        `Index updated · ${this._preview?.affected_quote_count ?? 0} quotes flagged`,
        'success'
      );
      this._newValue = '';
      this._preview = null;
      this._notes = '';
      await this._loadIndices();
    } catch (err) {
      this._error = err instanceof Error ? err.message : 'Apply failed';
    } finally {
      this._applying = false;
    }
  }

  private async _toggleActive() {
    if (!this._selected) return;
    try {
      await ExposureService.updateIndex(this._selected.id, { is_active: !this._selected.is_active });
      await this._loadIndices();
    } catch (err) {
      this._error = err instanceof Error ? err.message : 'Failed to toggle';
    }
  }

  private _renderList() {
    if (this._loading) {
      return html`<div class="space-y-1 animate-pulse">
        ${[1,2,3,4,5,6,7].map(() => html`<div class="h-14 bg-white/5 rounded"></div>`)}
      </div>`;
    }
    return html`
      <div class="space-y-1">
        ${this._indices.map(idx => {
          const d = this._deltaPct(idx);
          const selected = idx.id === this._selectedId;
          return html`
            <button @click=${() => this._select(idx.id)}
              class="w-full text-left px-3 py-2.5 rounded transition flex items-center justify-between
                     ${selected
                       ? 'bg-gable-green/10 border-l-4 border-gable-green'
                       : 'bg-slate-steel hover:bg-white/5 border-l-4 border-transparent'}">
              <div class="min-w-0 flex-1">
                <div class="flex items-center gap-2">
                  <span class="font-mono text-xs px-1.5 py-0.5 rounded bg-white/10 text-blueprint-blue">
                    ${idx.index_code}
                  </span>
                  ${idx.is_active
                    ? html`<span class="w-1.5 h-1.5 rounded-full bg-gable-green"></span>`
                    : html`<span class="w-1.5 h-1.5 rounded-full bg-gray-600"></span>`}
                </div>
                <div class="text-sm text-white truncate mt-0.5">${idx.name}</div>
              </div>
              <div class="text-right shrink-0 ml-3">
                <div class="font-mono text-white text-sm">$${this._fmt(idx.current_value)}</div>
                <div class="font-mono text-xs ${d > 0 ? 'text-safety-red' : d < 0 ? 'text-gable-green' : 'text-gray-500'}">
                  ${d >= 0 ? '+' : ''}${d.toFixed(2)}%
                </div>
              </div>
            </button>
          `;
        })}
      </div>`;
  }

  private _renderDetail() {
    const idx = this._selected;
    if (!idx) {
      return html`<div class="text-gray-500">Select an index from the list.</div>`;
    }
    const d = this._deltaPct(idx);
    return html`
      <div class="space-y-6">
        <header>
          <div class="flex items-center gap-2 mb-1">
            <span class="font-mono text-sm px-2 py-0.5 rounded bg-white/10 text-blueprint-blue">${idx.index_code}</span>
            ${idx.commodity_kind ? html`
              <span class="font-mono text-xs px-2 py-0.5 rounded bg-white/5 text-gray-400">${idx.commodity_kind}</span>
            ` : ''}
            ${idx.is_active
              ? html`<span class="font-mono text-xs px-2 py-0.5 rounded bg-gable-green/20 text-gable-green">ACTIVE</span>`
              : html`<span class="font-mono text-xs px-2 py-0.5 rounded bg-gray-700 text-gray-400">INACTIVE</span>`}
          </div>
          <h2 class="text-xl text-white font-semibold">${idx.name}</h2>
          ${idx.description ? html`<p class="text-gray-400 text-sm mt-1">${idx.description}</p>` : ''}
        </header>

        <!-- Current value -->
        <div class="bg-slate-steel border border-white/5 rounded p-4">
          <div class="text-xs uppercase text-gray-400 mb-1">Current value</div>
          <div class="flex items-baseline gap-3">
            <span class="text-3xl font-mono text-white">$${this._fmt(idx.current_value)}</span>
            <span class="font-mono text-sm text-gray-500">/ ${idx.unit}</span>
            <span class="ml-auto flex items-center gap-1 text-sm font-mono
                         ${d > 0 ? 'text-safety-red' : d < 0 ? 'text-gable-green' : 'text-gray-400'}">
              ${icon(d >= 0 ? TrendingUp : TrendingDown, 14)}
              ${d >= 0 ? '+' : ''}${d.toFixed(2)}%
            </span>
          </div>
          <div class="text-xs text-gray-500 mt-2">
            Previous: <span class="font-mono">${idx.previous_value ? `$${this._fmt(idx.previous_value)}` : '—'}</span>
            · Last updated <span class="font-mono">${new Date(idx.last_updated_at).toLocaleString()}</span>
          </div>
        </div>

        <!-- Update form -->
        <div class="bg-slate-steel border border-white/5 rounded p-4">
          <h3 class="text-sm uppercase text-gray-400 mb-3">Apply new value</h3>
          <div class="grid grid-cols-1 md:grid-cols-3 gap-3">
            <div>
              <label class="block text-xs text-gray-400 mb-1">New value ($/${idx.unit})</label>
              <input type="number" min="0.01" step="0.01"
                .value=${this._newValue}
                @input=${(e: Event) => { this._newValue = (e.target as HTMLInputElement).value; this._preview = null; }}
                class="w-full px-3 py-2 bg-deep-space border border-white/10 rounded text-white font-mono focus:border-gable-green focus:outline-none" />
            </div>
            <div>
              <label class="block text-xs text-gray-400 mb-1">Source</label>
              <select
                .value=${this._source}
                @change=${(e: Event) => { this._source = (e.target as HTMLSelectElement).value; }}
                class="w-full px-3 py-2 bg-deep-space border border-white/10 rounded text-white focus:border-gable-green focus:outline-none">
                <option value="MANUAL">Manual</option>
                <option value="RANDOM_LENGTHS">Random Lengths</option>
                <option value="CME">CME Lumber</option>
                <option value="MADISONS">Madison's</option>
                <option value="IMPORT">CSV import</option>
              </select>
            </div>
            <div>
              <label class="block text-xs text-gray-400 mb-1">Notes (optional)</label>
              <input type="text"
                .value=${this._notes}
                @input=${(e: Event) => { this._notes = (e.target as HTMLInputElement).value; }}
                placeholder="e.g. Friday RL"
                class="w-full px-3 py-2 bg-deep-space border border-white/10 rounded text-white focus:border-gable-green focus:outline-none" />
            </div>
          </div>

          ${this._preview ? html`
            <div class="bg-yellow-400/10 border border-yellow-400/30 rounded p-3 mt-4">
              <div class="text-sm text-yellow-200 font-medium mb-2">
                ${this._preview.delta_pct >= 0 ? '▲' : '▼'} ${Math.abs(this._preview.delta_pct).toFixed(2)}% movement —
                this will flag <span class="font-mono">${this._preview.affected_quote_count}</span> open quote${this._preview.affected_quote_count === 1 ? '' : 's'},
                est. <span class="font-mono">$${this._fmt(this._preview.estimated_exposure_dollars)}</span> exposure
                across <span class="font-mono">${this._preview.affected_customer_count}</span> customer${this._preview.affected_customer_count === 1 ? '' : 's'}.
              </div>
              ${this._preview.top_customers && this._preview.top_customers.length > 0 ? html`
                <div class="text-xs text-yellow-100/70">
                  Top affected:
                  ${this._preview.top_customers.map(c => html`
                    <span class="font-mono mx-1">${c.customer_name} ($${this._fmt(c.exposure_dollars)})</span>
                  `)}
                </div>
              ` : ''}
            </div>
          ` : nothing}

          ${this._error ? html`
            <div class="text-safety-red text-sm bg-safety-red/10 border border-safety-red/30 px-3 py-2 rounded mt-3">
              ${this._error}
            </div>
          ` : ''}

          <div class="flex justify-end gap-2 mt-4">
            <button @click=${() => this._doPreview()}
              ?disabled=${this._previewing || !this._newValue}
              class="px-4 py-2 border border-white/10 text-gray-300 rounded hover:bg-white/10 transition disabled:opacity-40">
              ${this._previewing ? 'Computing…' : 'Preview Impact'}
            </button>
            <button @click=${() => this._doApply()}
              ?disabled=${this._applying || !this._preview}
              class="px-4 py-2 bg-gable-green text-black font-semibold rounded hover:opacity-90 transition disabled:opacity-40 disabled:cursor-not-allowed"
              title=${this._preview ? '' : 'Run Preview first'}>
              ${this._applying ? 'Applying…' : 'Apply Update'}
            </button>
          </div>
        </div>

        <!-- Toggle active -->
        <div class="bg-slate-steel border border-white/5 rounded p-4 flex items-center justify-between">
          <div>
            <div class="text-sm text-white font-medium">Active for new snapshots</div>
            <div class="text-xs text-gray-400 mt-0.5">
              When inactive, new quote-line snapshots won't resolve to this index. Existing snapshots are unaffected.
            </div>
          </div>
          <button @click=${() => this._toggleActive()}
            class="px-3 py-1.5 rounded text-sm transition
                   ${idx.is_active
                     ? 'border border-white/10 text-gray-300 hover:bg-white/10'
                     : 'bg-gable-green text-black font-semibold hover:opacity-90'}">
            ${idx.is_active ? 'Mark inactive' : 'Mark active'}
          </button>
        </div>
      </div>`;
  }

  render() {
    return html`
      <div class="p-6">
        <header class="mb-6 flex items-center gap-2">
          ${icon(Activity, 22, 'text-blueprint-blue')}
          <h1 class="text-2xl font-semibold text-white">Market Indices</h1>
        </header>
        <div class="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <aside class="lg:col-span-1">${this._renderList()}</aside>
          <main class="lg:col-span-2">${this._renderDetail()}</main>
        </div>
      </div>`;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'gable-market-indices-admin': GableMarketIndicesAdmin;
  }
}
