import { LitElement, html, nothing } from 'lit';
import { customElement, state } from 'lit/decorators.js';
import { Award, ShieldAlert, TrendingDown, TrendingUp } from 'lucide';
import { icon } from '../../lib/icons';
import { router } from '../../lib/router';
import { ExposureService } from '../../services/ExposureService';
import type { PortfolioSummary } from '../../types/exposure';

/**
 * gable-exposure-report — route `/reports/exposure`. The owner's portfolio
 * view: hero KPI, by-customer and by-salesperson breakdowns. Sales-role
 * users see this auto-scoped to their own book (server-enforced).
 */
@customElement('gable-exposure-report')
export class GableExposureReport extends LitElement {
  createRenderRoot() { return this; }

  @state() private _data: PortfolioSummary | null = null;
  @state() private _loading = true;
  @state() private _error = '';

  connectedCallback() {
    super.connectedCallback();
    this._load();
  }

  private async _load() {
    this._loading = true;
    this._error = '';
    try {
      this._data = await ExposureService.reportExposure();
    } catch (err) {
      this._error = err instanceof Error ? err.message : 'Failed to load report';
    } finally {
      this._loading = false;
    }
  }

  private _moneyDelta(v: number) {
    const sign = v >= 0 ? '▲' : '▼';
    const cls = v >= 0 ? 'text-safety-red' : 'text-gable-green';
    const abs = Math.abs(v).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    return html`<span class="${cls} font-mono text-sm">${sign} $${abs}</span>`;
  }

  private _fmtMoney(v: number) {
    return `$${v.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  }

  private _drillCustomer(customerId: string) {
    router.navigate(`/quotes/exposure?customer_id=${customerId}`);
  }

  private _renderEmpty() {
    return html`
      <div class="flex flex-col items-center justify-center py-16 text-center">
        ${icon(Award, 48, 'text-gable-green/60 mb-4')}
        <p class="text-gray-200 font-medium">No open exposure</p>
        <p class="text-gray-500 text-sm mt-1">All open quotes are at or below threshold.</p>
      </div>`;
  }

  render() {
    if (this._loading) {
      return html`
        <div class="p-6 space-y-4 animate-pulse">
          <div class="h-12 w-72 bg-white/5 rounded"></div>
          <div class="h-32 bg-white/5 rounded"></div>
          <div class="h-64 bg-white/5 rounded"></div>
        </div>`;
    }
    if (this._error) {
      return html`
        <div class="p-6">
          <div class="bg-safety-red/10 border border-safety-red/30 rounded p-4 text-safety-red">
            ${this._error}
          </div>
        </div>`;
    }
    if (!this._data || this._data.total_quotes === 0) {
      return html`<div class="p-6">${this._renderEmpty()}</div>`;
    }

    const d = this._data;
    return html`
      <div class="p-6 space-y-6">
        <header class="flex items-center justify-between">
          <div>
            <h1 class="text-2xl font-semibold text-white flex items-center gap-2">
              ${icon(ShieldAlert, 22, 'text-blueprint-blue')} Open Quote Exposure
            </h1>
            <p class="text-gray-400 text-sm mt-1">
              Live snapshot of commodity-line price exposure across the dealer's open quote portfolio.
            </p>
          </div>
        </header>

        <!-- Hero KPI -->
        <div class="bg-slate-steel border border-white/5 rounded p-6 flex flex-col md:flex-row md:items-center md:justify-between gap-3">
          <div>
            <div class="text-xs uppercase text-gray-400 mb-1">Total open exposure</div>
            <div class="text-4xl font-mono text-white">
              ${this._fmtMoney(d.total_exposure_dollars)}
            </div>
            <div class="text-gray-500 text-xs mt-2">
              ${d.total_quotes} quote${d.total_quotes === 1 ? '' : 's'} ·
              ${d.total_customers} customer${d.total_customers === 1 ? '' : 's'}
            </div>
          </div>
          <div class="md:text-right">
            <div class="text-xs uppercase text-gray-400 mb-1">Δ vs prior week</div>
            <div class="flex items-center gap-2 md:justify-end">
              ${icon(d.delta_vs_prior_week_dollars >= 0 ? TrendingUp : TrendingDown, 18,
                d.delta_vs_prior_week_dollars >= 0 ? 'text-safety-red' : 'text-gable-green')}
              ${this._moneyDelta(d.delta_vs_prior_week_dollars)}
            </div>
          </div>
        </div>

        <!-- By Customer -->
        ${(d.by_customer && d.by_customer.length > 0) ? html`
          <section>
            <h2 class="text-sm font-semibold uppercase text-gray-400 mb-2">By Customer</h2>
            <div class="overflow-x-auto border border-white/5 rounded">
              <table class="w-full text-sm">
                <thead class="bg-slate-steel text-left text-xs uppercase text-gray-400">
                  <tr>
                    <th class="px-3 py-2">Customer</th>
                    <th class="px-3 py-2 text-right">Quotes</th>
                    <th class="px-3 py-2 text-right">Exposure $</th>
                    <th class="px-3 py-2">Top index</th>
                    <th class="px-3 py-2">Policy</th>
                  </tr>
                </thead>
                <tbody class="divide-y divide-white/5">
                  ${d.by_customer.map(row => html`
                    <tr class="hover:bg-white/5 cursor-pointer transition-colors"
                        @click=${() => this._drillCustomer(row.customer_id)}>
                      <td class="px-3 py-2 text-white">${row.customer_name}</td>
                      <td class="px-3 py-2 text-right font-mono">${row.quote_count}</td>
                      <td class="px-3 py-2 text-right font-mono font-semibold text-white">
                        ${this._fmtMoney(row.exposure_dollars)}
                      </td>
                      <td class="px-3 py-2 font-mono text-blueprint-blue text-xs">${row.top_index_code || '—'}</td>
                      <td class="px-3 py-2 font-mono text-xs uppercase text-gray-400">${row.policy}</td>
                    </tr>
                  `)}
                </tbody>
              </table>
            </div>
          </section>
        ` : nothing}

        <!-- By Salesperson -->
        ${(d.by_salesperson && d.by_salesperson.length > 0) ? html`
          <section>
            <h2 class="text-sm font-semibold uppercase text-gray-400 mb-2">By Salesperson</h2>
            <div class="overflow-x-auto border border-white/5 rounded">
              <table class="w-full text-sm">
                <thead class="bg-slate-steel text-left text-xs uppercase text-gray-400">
                  <tr>
                    <th class="px-3 py-2">Salesperson</th>
                    <th class="px-3 py-2 text-right">Quotes</th>
                    <th class="px-3 py-2 text-right">Exposure $</th>
                    <th class="px-3 py-2 text-right">Flagged</th>
                    <th class="px-3 py-2 text-right">Ack required</th>
                  </tr>
                </thead>
                <tbody class="divide-y divide-white/5">
                  ${d.by_salesperson.map(row => html`
                    <tr class="hover:bg-white/5 transition-colors">
                      <td class="px-3 py-2 text-white">${row.salesperson_name}</td>
                      <td class="px-3 py-2 text-right font-mono">${row.quote_count}</td>
                      <td class="px-3 py-2 text-right font-mono font-semibold text-white">
                        ${this._fmtMoney(row.exposure_dollars)}
                      </td>
                      <td class="px-3 py-2 text-right font-mono text-yellow-300">${row.flagged_count}</td>
                      <td class="px-3 py-2 text-right font-mono text-safety-red">${row.ack_required_count}</td>
                    </tr>
                  `)}
                </tbody>
              </table>
            </div>
          </section>
        ` : nothing}
      </div>`;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'gable-exposure-report': GableExposureReport;
  }
}
