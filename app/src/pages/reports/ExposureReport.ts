import { LitElement, html, nothing } from 'lit';
import { customElement, state } from 'lit/decorators.js';
import { icon } from '../../lib/icons.ts';
import { ToastService } from '../../lib/toast-service.ts';
import { ExposureService } from '../../services/ExposureService';
import type { PortfolioSummary } from '../../types/exposure';
import { BarChart3 } from 'lucide';

@customElement('gable-exposure-report')
export class ExposureReportPage extends LitElement {
  createRenderRoot() { return this; }

  @state() private summary: PortfolioSummary | null = null;
  @state() private loading = true;

  connectedCallback() {
    super.connectedCallback();
    this._load();
  }

  private async _load() {
    this.loading = true;
    try {
      this.summary = await ExposureService.getPortfolio();
    } catch (err) {
      console.error(err);
      ToastService.show('Failed to load exposure portfolio', 'error');
    } finally {
      this.loading = false;
    }
  }

  private _fmt(v: number) {
    return `$${v.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  }

  render() {
    if (this.loading) {
      return html`
        <div class="p-12 flex justify-center">
          <div class="animate-spin rounded-full h-8 w-8 border-b-2 border-gable-green"></div>
        </div>
      `;
    }

    const s = this.summary;
    return html`
      <div class="mb-8">
        <h1 class="text-3xl font-bold text-white flex items-center gap-3">
          ${icon(BarChart3, 32, 'w-8 h-8 text-gable-green')}
          Exposure Portfolio
        </h1>
        <p class="text-zinc-500 mt-1">Lumber-index price exposure across all open quotes</p>
      </div>

      <div class="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
        ${[
          { label: 'Total Exposure', value: this._fmt(s?.total_exposure_dollars ?? 0), color: 'text-rose-400' },
          { label: 'Exposed Quotes', value: String(s?.total_quotes ?? 0), color: 'text-white' },
          { label: 'Customers', value: String(s?.total_customers ?? 0), color: 'text-white' },
        ].map((item) => html`
          <div class="backdrop-blur-md bg-white/5 border border-white/10 rounded-xl p-4 text-center">
            <p class="text-xs text-zinc-500 uppercase tracking-wider mb-1">${item.label}</p>
            <p class="text-2xl font-mono font-bold ${item.color}">${item.value}</p>
          </div>
        `)}
      </div>

      <div class="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <!-- By customer -->
        <div class="backdrop-blur-md bg-white/5 border border-white/10 rounded-xl">
          <div class="px-6 py-4 border-b border-white/5 text-sm font-semibold text-white">By Customer</div>
          ${!s || s.by_customer.length === 0 ? html`
            <div class="p-8 text-center text-zinc-500">No exposed customers</div>
          ` : html`
            <table class="w-full text-sm text-left">
              <thead class="bg-white/5 text-zinc-400 uppercase tracking-wider text-xs font-semibold">
                <tr>
                  <th class="px-6 py-3">Customer</th>
                  <th class="px-6 py-3">Top Index</th>
                  <th class="px-6 py-3 text-right">Quotes</th>
                  <th class="px-6 py-3 text-right">Exposure</th>
                </tr>
              </thead>
              <tbody class="divide-y divide-white/5">
                ${s.by_customer.map((c) => html`
                  <tr class="hover:bg-white/5 transition-colors">
                    <td class="px-6 py-3 text-white font-medium">${c.customer_name}</td>
                    <td class="px-6 py-3 font-mono text-zinc-300">${c.top_index_code || '—'}</td>
                    <td class="px-6 py-3 text-right font-mono text-zinc-400">${c.quote_count}</td>
                    <td class="px-6 py-3 text-right font-mono text-rose-400 font-bold">${this._fmt(c.exposure_dollars)}</td>
                  </tr>
                `)}
              </tbody>
            </table>
          `}
        </div>

        <!-- By salesperson -->
        <div class="backdrop-blur-md bg-white/5 border border-white/10 rounded-xl">
          <div class="px-6 py-4 border-b border-white/5 text-sm font-semibold text-white">By Salesperson</div>
          ${!s || s.by_salesperson.length === 0 ? html`
            <div class="p-8 text-center text-zinc-500">No exposed salespeople</div>
          ` : html`
            <table class="w-full text-sm text-left">
              <thead class="bg-white/5 text-zinc-400 uppercase tracking-wider text-xs font-semibold">
                <tr>
                  <th class="px-6 py-3">Salesperson</th>
                  <th class="px-6 py-3 text-right">Flagged</th>
                  <th class="px-6 py-3 text-right">Ack Req.</th>
                  <th class="px-6 py-3 text-right">Exposure</th>
                </tr>
              </thead>
              <tbody class="divide-y divide-white/5">
                ${s.by_salesperson.map((sp) => html`
                  <tr class="hover:bg-white/5 transition-colors">
                    <td class="px-6 py-3 text-white font-medium">${sp.salesperson_name}</td>
                    <td class="px-6 py-3 text-right font-mono text-amber-400">${sp.flagged_count}</td>
                    <td class="px-6 py-3 text-right font-mono text-rose-400">${sp.ack_required_count}</td>
                    <td class="px-6 py-3 text-right font-mono text-rose-400 font-bold">${this._fmt(sp.exposure_dollars)}</td>
                  </tr>
                `)}
              </tbody>
            </table>
          `}
        </div>
      </div>
      ${nothing}
    `;
  }
}
