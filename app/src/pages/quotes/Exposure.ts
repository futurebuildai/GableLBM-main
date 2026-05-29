import { LitElement, html, nothing } from 'lit';
import { customElement, state } from 'lit/decorators.js';
import { icon } from '../../lib/icons.ts';
import { router } from '../../lib/router.ts';
import { ToastService } from '../../lib/toast-service.ts';
import { ExposureService } from '../../services/ExposureService';
import type { ExposureRow, ExposureState } from '../../types/exposure';
import { TrendingUp, ShieldAlert } from 'lucide';
import '../../components/quotes/acknowledgment-modal.ts';

const STATE_STYLES: Record<ExposureState, string> = {
  OK: 'text-zinc-400 bg-white/5',
  FLAGGED: 'text-amber-400 bg-amber-500/10',
  ESCALATED: 'text-blueprint-blue bg-sky-500/10',
  ACK_REQUIRED: 'text-rose-400 bg-rose-500/10',
  ACKNOWLEDGED: 'text-emerald-400 bg-emerald-500/10',
  BLOCKED: 'text-rose-400 bg-rose-500/10',
  OVERRIDDEN: 'text-violet-400 bg-violet-500/10',
};

@customElement('gable-quote-exposure')
export class QuoteExposurePage extends LitElement {
  createRenderRoot() { return this; }

  @state() private rows: ExposureRow[] = [];
  @state() private loading = true;
  @state() private stateFilter = '';
  @state() private busyQuote = '';
  @state() private ackRow: ExposureRow | null = null;

  connectedCallback() {
    super.connectedCallback();
    this._load();
  }

  private async _load() {
    this.loading = true;
    try {
      const res = await ExposureService.listAtRisk({
        owner: 'me',
        state: this.stateFilter || undefined,
      });
      this.rows = res.items;
    } catch (err) {
      console.error(err);
      ToastService.show('Failed to load at-risk quotes', 'error');
    } finally {
      this.loading = false;
    }
  }

  private _fmt(v: number) {
    return `$${v.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  }

  private _acknowledge(row: ExposureRow) {
    this.ackRow = row;
  }

  private async _requestAck(row: ExposureRow) {
    this.busyQuote = row.quote_id;
    try {
      await ExposureService.requestAck(row.quote_id);
      ToastService.show('Acknowledgment requested', 'success');
      await this._load();
    } catch (err) {
      console.error(err);
      ToastService.show('Failed to request acknowledgment', 'error');
    } finally {
      this.busyQuote = '';
    }
  }

  private _rowAction(row: ExposureRow) {
    const actions = row.available_actions || [];
    const busy = this.busyQuote === row.quote_id;
    return html`
      <div class="flex items-center justify-end gap-2">
        ${actions.includes('acknowledge') ? html`
          <button
            ?disabled=${busy}
            @click=${(e: Event) => { e.stopPropagation(); this._acknowledge(row); }}
            class="px-2.5 py-1 text-xs rounded-md bg-emerald-500/10 text-emerald-400 hover:bg-emerald-500/20 transition-colors disabled:opacity-50">
            Acknowledge
          </button>
        ` : nothing}
        ${actions.includes('request_ack') ? html`
          <button
            ?disabled=${busy}
            @click=${(e: Event) => { e.stopPropagation(); this._requestAck(row); }}
            class="px-2.5 py-1 text-xs rounded-md bg-rose-500/10 text-rose-400 hover:bg-rose-500/20 transition-colors disabled:opacity-50">
            Request Ack
          </button>
        ` : nothing}
        <a
          href="/quotes/${row.quote_id}"
          @click=${(e: Event) => e.stopPropagation()}
          class="px-2.5 py-1 text-xs rounded-md bg-white/5 text-zinc-300 hover:bg-white/10 transition-colors">
          View
        </a>
      </div>
    `;
  }

  render() {
    const totalExposure = this.rows.reduce((s, r) => s + r.exposure_dollars, 0);

    return html`
      <div class="mb-8 flex items-start justify-between">
        <div>
          <h1 class="text-3xl font-bold text-white flex items-center gap-3">
            ${icon(ShieldAlert, 32, 'w-8 h-8 text-gable-green')}
            At-Risk Quotes
          </h1>
          <p class="text-zinc-500 mt-1">Open quotes exposed to lumber-index price movement</p>
        </div>
        <div class="text-right">
          <p class="text-xs text-zinc-500 uppercase tracking-wider">Total Exposure</p>
          <p class="text-2xl font-mono font-bold text-rose-400">${this._fmt(totalExposure)}</p>
        </div>
      </div>

      <div class="flex items-center gap-3 mb-4">
        <select
          .value=${this.stateFilter}
          @change=${(e: Event) => { this.stateFilter = (e.target as HTMLSelectElement).value; this._load(); }}
          class="bg-slate-steel border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:ring-1 focus:ring-gable-green/50">
          <option value="">All states</option>
          <option value="FLAGGED">Flagged</option>
          <option value="ESCALATED">Escalated</option>
          <option value="ACK_REQUIRED">Ack Required</option>
          <option value="ACKNOWLEDGED">Acknowledged</option>
          <option value="OVERRIDDEN">Overridden</option>
        </select>
      </div>

      <div class="backdrop-blur-md bg-white/5 border border-white/10 rounded-xl">
        ${this.loading ? html`
          <div class="p-12 flex justify-center">
            <div class="animate-spin rounded-full h-8 w-8 border-b-2 border-gable-green"></div>
          </div>
        ` : this.rows.length === 0 ? html`
          <div class="p-12 text-center text-zinc-500 flex flex-col items-center gap-3">
            ${icon(TrendingUp, 32, 'text-zinc-600')}
            No at-risk quotes — your book is clear.
          </div>
        ` : html`
          <table class="w-full text-sm text-left">
            <thead class="bg-white/5 text-zinc-400 uppercase tracking-wider text-xs font-semibold">
              <tr>
                <th class="px-6 py-4">Quote</th>
                <th class="px-6 py-4">Customer</th>
                <th class="px-6 py-4">Index</th>
                <th class="px-6 py-4 text-right">Δ %</th>
                <th class="px-6 py-4 text-right">Exposure</th>
                <th class="px-6 py-4">State</th>
                <th class="px-6 py-4 text-right">Days</th>
                <th class="px-6 py-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody class="divide-y divide-white/5">
              ${this.rows.map((row) => html`
                <tr class="hover:bg-white/5 transition-colors cursor-pointer"
                    @click=${() => router.navigate(`/quotes/${row.quote_id}`)}>
                  <td class="px-6 py-4 font-mono text-blueprint-blue">${row.short_id}</td>
                  <td class="px-6 py-4 text-white font-medium">${row.customer_name}</td>
                  <td class="px-6 py-4 font-mono text-zinc-300">${(row.indexes || []).join(', ') || '—'}</td>
                  <td class="px-6 py-4 text-right font-mono ${row.max_delta_pct >= 0 ? 'text-rose-400' : 'text-emerald-400'}">
                    ${row.max_delta_pct >= 0 ? '+' : ''}${row.max_delta_pct.toFixed(2)}%
                  </td>
                  <td class="px-6 py-4 text-right font-mono text-rose-400 font-bold">${this._fmt(row.exposure_dollars)}</td>
                  <td class="px-6 py-4">
                    <span class="px-2 py-1 rounded-md text-xs font-medium ${STATE_STYLES[row.exposure_state] || STATE_STYLES.OK}">
                      ${row.exposure_state}
                    </span>
                  </td>
                  <td class="px-6 py-4 text-right font-mono text-zinc-400">${row.days_open}</td>
                  <td class="px-6 py-4">${this._rowAction(row)}</td>
                </tr>
              `)}
            </tbody>
          </table>
        `}
      </div>

      <gable-acknowledgment-modal
        .open=${this.ackRow != null}
        .quoteId=${this.ackRow?.quote_id ?? ''}
        .shortId=${this.ackRow?.short_id ?? ''}
        @close=${() => { this.ackRow = null; }}
        @acknowledged=${() => { this.ackRow = null; this._load(); }}>
      </gable-acknowledgment-modal>
    `;
  }
}
