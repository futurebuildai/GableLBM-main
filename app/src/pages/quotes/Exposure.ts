import { LitElement, html, nothing } from 'lit';
import { customElement, state } from 'lit/decorators.js';
import { PackageOpen, RefreshCcw, TrendingUp, AlertOctagon, ShieldCheck, Activity } from 'lucide';
import { icon } from '../../lib/icons';
import { router } from '../../lib/router';
import { ExposureService } from '../../services/ExposureService';
import type { ExposureRow, ExposureState } from '../../types/exposure';
import '../../components/quotes/acknowledgment-modal';

const STATE_FILTERS: ExposureState[] = ['FLAGGED', 'ACK_REQUIRED', 'BLOCKED', 'ESCALATED', 'ACKNOWLEDGED', 'OVERRIDDEN'];

/**
 * gable-exposure-page — route `/quotes/exposure`. The salesperson's at-risk
 * quotes view (and an owner-mode that shows the whole book). Fetches on
 * mount + filter change, renders a sortable table sorted by exposure $.
 */
@customElement('gable-exposure-page')
export class GableExposurePage extends LitElement {
  createRenderRoot() { return this; }

  @state() private _rows: ExposureRow[] = [];
  @state() private _loading = true;
  @state() private _error = '';
  @state() private _owner: 'me' | 'all' = 'me';
  @state() private _stateFilter: Set<ExposureState> = new Set(['FLAGGED', 'ACK_REQUIRED', 'BLOCKED']);

  // Acknowledgment modal state
  @state() private _ackModalOpen = false;
  @state() private _ackTarget: ExposureRow | null = null;

  connectedCallback() {
    super.connectedCallback();
    this._load();
  }

  private async _load() {
    this._loading = true;
    this._error = '';
    try {
      const res = await ExposureService.listExposure({
        owner: this._owner,
        state: Array.from(this._stateFilter),
        limit: 250,
      });
      this._rows = res.items;
    } catch (err) {
      this._error = err instanceof Error ? err.message : 'Failed to load exposure';
    } finally {
      this._loading = false;
    }
  }

  private _toggleState(s: ExposureState) {
    const next = new Set(this._stateFilter);
    if (next.has(s)) next.delete(s);
    else next.add(s);
    this._stateFilter = next;
    this._load();
  }

  private _summary() {
    const total = this._rows.reduce((acc, r) => acc + r.exposure_dollars, 0);
    const customers = new Set(this._rows.map(r => r.customer_id)).size;
    const avgDelta = this._rows.length === 0
      ? 0
      : this._rows.reduce((acc, r) => acc + r.max_delta_pct, 0) / this._rows.length;
    return { total, customers, avgDelta };
  }

  private _onAck(row: ExposureRow) {
    this._ackTarget = row;
    this._ackModalOpen = true;
  }

  private _onAcknowledged() {
    this._ackModalOpen = false;
    this._ackTarget = null;
    this._load();
  }

  private _openQuote(row: ExposureRow) {
    router.navigate(`/quotes/${row.quote_id}/edit`);
  }

  private _stateBadge(state: ExposureState) {
    const map: Record<ExposureState, { cls: string; icon: typeof PackageOpen }> = {
      OK:           { cls: 'bg-gable-green/20 text-gable-green',   icon: ShieldCheck },
      FLAGGED:      { cls: 'bg-yellow-400/20 text-yellow-200',     icon: TrendingUp },
      ESCALATED:    { cls: 'bg-blueprint-blue/20 text-blueprint-blue', icon: Activity },
      ACK_REQUIRED: { cls: 'bg-safety-red/20 text-safety-red',     icon: AlertOctagon },
      BLOCKED:      { cls: 'bg-safety-red/20 text-safety-red',     icon: AlertOctagon },
      ACKNOWLEDGED: { cls: 'bg-gable-green/20 text-gable-green',   icon: ShieldCheck },
      OVERRIDDEN:   { cls: 'bg-white/10 text-gray-300',            icon: ShieldCheck },
    };
    const m = map[state];
    return html`
      <span class="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-mono uppercase ${m.cls}">
        ${icon(m.icon, 12)} ${state}
      </span>`;
  }

  private _renderTable() {
    if (this._loading) {
      return html`<div class="space-y-2 animate-pulse">
        ${[1,2,3,4].map(() => html`<div class="h-12 bg-white/5 rounded"></div>`)}
      </div>`;
    }
    if (this._error) {
      return html`
        <div class="bg-safety-red/10 border border-safety-red/30 rounded p-4 text-safety-red flex items-center justify-between">
          <span>${this._error}</span>
          <button @click=${() => this._load()} class="px-3 py-1 border border-safety-red/50 rounded hover:bg-safety-red/10 text-sm">
            ${icon(RefreshCcw, 14, 'inline')} Retry
          </button>
        </div>`;
    }
    if (this._rows.length === 0) {
      return html`
        <div class="flex flex-col items-center justify-center py-16 text-center">
          ${icon(PackageOpen, 48, 'text-gray-600 mb-4')}
          <p class="text-gray-400 font-medium">No at-risk quotes</p>
          <p class="text-gray-600 text-sm mt-1">Index movement has stayed below threshold for all your open quotes.</p>
        </div>`;
    }
    return html`
      <div class="overflow-x-auto border border-white/5 rounded">
        <table class="w-full text-sm">
          <thead class="bg-slate-steel text-left text-xs uppercase text-gray-400">
            <tr>
              <th class="px-3 py-2">Quote</th>
              <th class="px-3 py-2">Customer</th>
              ${this._owner === 'all' ? html`<th class="px-3 py-2">Salesperson</th>` : nothing}
              <th class="px-3 py-2 text-right">Days</th>
              <th class="px-3 py-2">Indexes</th>
              <th class="px-3 py-2 text-right">Δ %</th>
              <th class="px-3 py-2 text-right">Exposure $</th>
              <th class="px-3 py-2">Policy</th>
              <th class="px-3 py-2">State</th>
              <th class="px-3 py-2 text-right">Actions</th>
            </tr>
          </thead>
          <tbody class="divide-y divide-white/5">
            ${this._rows.map(r => html`
              <tr class="hover:bg-white/5 transition-colors">
                <td class="px-3 py-2 font-mono text-white">
                  <a class="text-blueprint-blue hover:underline" href="/quotes/${r.quote_id}/edit"
                     @click=${(e: MouseEvent) => { e.preventDefault(); this._openQuote(r); }}>
                    Q-${r.short_id}
                  </a>
                </td>
                <td class="px-3 py-2 text-white">${r.customer_name}</td>
                ${this._owner === 'all' ? html`<td class="px-3 py-2 text-gray-400">${r.salesperson_name || '—'}</td>` : nothing}
                <td class="px-3 py-2 text-right font-mono text-gray-300">${r.days_open}</td>
                <td class="px-3 py-2">
                  <div class="flex gap-1 flex-wrap">
                    ${(r.indexes || []).map(c => html`
                      <span class="px-1.5 py-0.5 rounded bg-blueprint-blue/15 text-blueprint-blue font-mono text-xs">${c}</span>
                    `)}
                  </div>
                </td>
                <td class="px-3 py-2 text-right font-mono ${r.max_delta_pct >= 5 ? 'text-safety-red' : 'text-gray-300'}">
                  ${r.max_delta_pct >= 0 ? '+' : ''}${r.max_delta_pct.toFixed(2)}%
                </td>
                <td class="px-3 py-2 text-right font-mono font-semibold text-white">
                  $${r.exposure_dollars.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </td>
                <td class="px-3 py-2 font-mono text-xs uppercase text-gray-400">${r.policy}</td>
                <td class="px-3 py-2">${this._stateBadge(r.exposure_state)}</td>
                <td class="px-3 py-2 text-right">
                  <div class="flex justify-end gap-1">
                    ${r.exposure_state === 'FLAGGED' ? html`
                      <button @click=${() => this._openQuote(r)}
                        class="px-2 py-1 bg-gable-green text-black font-semibold rounded hover:opacity-90 text-xs">
                        Re-quote
                      </button>
                    ` : ''}
                    ${r.exposure_state === 'ACK_REQUIRED' || r.exposure_state === 'BLOCKED' ? html`
                      <button @click=${() => this._onAck(r)}
                        class="px-2 py-1 border border-safety-red/50 text-safety-red rounded hover:bg-safety-red/10 text-xs">
                        Acknowledge
                      </button>
                    ` : ''}
                    <button @click=${() => this._openQuote(r)}
                      class="px-2 py-1 border border-white/10 text-gray-300 rounded hover:bg-white/10 text-xs">
                      Open
                    </button>
                  </div>
                </td>
              </tr>
            `)}
          </tbody>
        </table>
      </div>`;
  }

  render() {
    const s = this._summary();
    return html`
      <div class="p-6">
        <header class="mb-6">
          <h1 class="text-2xl font-semibold text-white">Quote Exposure</h1>
          <p class="text-gray-400 text-sm mt-1">
            ${this._rows.length} open quote${this._rows.length === 1 ? '' : 's'} with index movement
          </p>
        </header>

        <!-- Filter bar -->
        <div class="bg-slate-steel rounded p-4 mb-4 flex flex-wrap items-center gap-3 border border-white/5">
          <div class="flex gap-1">
            <button @click=${() => { this._owner = 'me'; this._load(); }}
              class="px-3 py-1.5 rounded text-sm transition
                     ${this._owner === 'me' ? 'bg-gable-green text-black font-semibold' : 'text-gray-400 hover:text-white'}">
              My book
            </button>
            <button @click=${() => { this._owner = 'all'; this._load(); }}
              class="px-3 py-1.5 rounded text-sm transition
                     ${this._owner === 'all' ? 'bg-gable-green text-black font-semibold' : 'text-gray-400 hover:text-white'}">
              All
            </button>
          </div>
          <div class="h-6 w-px bg-white/10"></div>
          <div class="flex gap-1 flex-wrap">
            ${STATE_FILTERS.map(s => html`
              <button @click=${() => this._toggleState(s)}
                class="px-2 py-1 rounded text-xs font-mono uppercase border transition
                       ${this._stateFilter.has(s)
                         ? 'border-gable-green text-gable-green bg-gable-green/10'
                         : 'border-white/10 text-gray-400 hover:border-white/30'}">
                ${s}
              </button>
            `)}
          </div>
          <button @click=${() => this._load()} class="ml-auto text-gray-400 hover:text-white"
            title="Refresh">${icon(RefreshCcw, 16)}</button>
        </div>

        <!-- Summary tiles -->
        <div class="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
          <div class="bg-slate-steel rounded p-3 border border-white/5">
            <div class="text-xs uppercase text-gray-400">Total exposure</div>
            <div class="text-xl font-mono text-white mt-1">
              $${s.total.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </div>
          </div>
          <div class="bg-slate-steel rounded p-3 border border-white/5">
            <div class="text-xs uppercase text-gray-400">Quotes</div>
            <div class="text-xl font-mono text-white mt-1">${this._rows.length}</div>
          </div>
          <div class="bg-slate-steel rounded p-3 border border-white/5">
            <div class="text-xs uppercase text-gray-400">Customers</div>
            <div class="text-xl font-mono text-white mt-1">${s.customers}</div>
          </div>
          <div class="bg-slate-steel rounded p-3 border border-white/5">
            <div class="text-xs uppercase text-gray-400">Avg Δ%</div>
            <div class="text-xl font-mono text-white mt-1">${s.avgDelta.toFixed(2)}%</div>
          </div>
        </div>

        ${this._renderTable()}

        <gable-acknowledgment-modal
          ?is-open=${this._ackModalOpen}
          quote-id=${this._ackTarget?.quote_id || ''}
          customer-name=${this._ackTarget?.customer_name || ''}
          .exposureDollars=${this._ackTarget?.exposure_dollars || 0}
          indexes=${(this._ackTarget?.indexes || []).join(', ')}
          @close=${() => { this._ackModalOpen = false; this._ackTarget = null; }}
          @acknowledged=${() => this._onAcknowledged()}>
        </gable-acknowledgment-modal>
      </div>`;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'gable-exposure-page': GableExposurePage;
  }
}
