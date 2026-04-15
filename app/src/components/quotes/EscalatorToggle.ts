import { LitElement, html, nothing } from 'lit';
import { customElement, property, state } from 'lit/decorators.js';
import { icon } from '../../lib/icons';
import { TrendingUp, AlertTriangle, Link2, Calendar, Percent, BarChart3 } from 'lucide';
import { PricingService } from '../../services/pricing.service';
import { ToastService } from '../../lib/toast-service';
import type { EscalationType, MarketIndex, EscalationResult, QuoteLineEscalator } from '../../types/pricing';

@customElement('gable-escalator-toggle')
export class GableEscalatorToggle extends LitElement {
  createRenderRoot() { return this; }

  @property({ type: Number, attribute: 'base-price' }) basePrice = 0;
  @property({ type: Object }) escalator!: QuoteLineEscalator;

  @state() private _indices: MarketIndex[] = [];
  @state() private _loading = false;

  updated(changed: Map<string, unknown>) {
    if (changed.has('escalator') && this.escalator?.enabled) {
      this._loadIndices();
    }
  }

  private async _loadIndices() {
    try {
      const data = await PricingService.getMarketIndices();
      this._indices = data;
    } catch (err) {
      console.error('Failed to load market indices', err);
      ToastService.show('Failed to load market indices', 'error');
    }
  }

  private _emit(escalator: QuoteLineEscalator) {
    this.dispatchEvent(new CustomEvent('escalator-change', { detail: escalator, bubbles: true, composed: true }));
  }

  private _handleToggle() {
    const today = new Date().toISOString().split('T')[0];
    const threeMonthsOut = new Date(Date.now() + 90 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];

    this._emit({
      ...this.escalator,
      enabled: !this.escalator.enabled,
      escalation_type: this.escalator.escalation_type || 'PERCENTAGE',
      escalation_rate: this.escalator.escalation_rate || 5,
      effective_date: this.escalator.effective_date || today,
      target_date: this.escalator.target_date || threeMonthsOut,
      result: undefined,
    });
  }

  private _handleTypeChange(type: EscalationType) {
    this._emit({ ...this.escalator, escalation_type: type, result: undefined });
  }

  private _handleRateChange(rate: number) {
    this._emit({ ...this.escalator, escalation_rate: rate, result: undefined });
  }

  private _handleDateChange(field: 'effective_date' | 'target_date', value: string) {
    this._emit({ ...this.escalator, [field]: value, result: undefined });
  }

  private _handleIndexChange(indexId: string) {
    this._emit({ ...this.escalator, market_index_id: indexId, result: undefined });
  }

  private async _handleCalculate() {
    if (!this.escalator.enabled) return;
    this._loading = true;
    try {
      const result: EscalationResult = await PricingService.calculateEscalation({
        base_price: this.basePrice,
        escalation_type: this.escalator.escalation_type,
        escalation_rate: this.escalator.escalation_rate,
        effective_date: this.escalator.effective_date,
        target_date: this.escalator.target_date,
        market_index_id: this.escalator.market_index_id,
      });
      this._emit({ ...this.escalator, result });
    } catch (err) {
      console.error('Failed to calculate escalation', err);
      ToastService.show('Failed to calculate escalation', 'error');
    } finally {
      this._loading = false;
    }
  }

  render() {
    if (!this.escalator) return nothing;

    return html`
      <div class="mt-3">
        <button
          type="button"
          @click=${this._handleToggle}
          class="flex items-center gap-2 text-xs px-3 py-1.5 rounded-full border transition-all duration-200 ${this.escalator.enabled
            ? 'bg-gable-green/15 border-gable-green/40 text-gable-green hover:bg-gable-green/25'
            : 'bg-white/5 border-white/10 text-zinc-500 hover:border-white/20 hover:text-zinc-300'
          }"
        >
          ${icon(TrendingUp, 14)}
          ${this.escalator.enabled ? 'Escalator Active' : 'Enable Escalator'}
        </button>

        ${this.escalator.enabled ? html`
          <div class="mt-3 p-4 rounded-xl bg-white/[0.03] border border-white/10 space-y-4">
            <div class="flex gap-2">
              <button type="button" @click=${() => this._handleTypeChange('PERCENTAGE')}
                class="flex items-center gap-1.5 text-xs px-3 py-2 rounded-lg border transition-all ${this.escalator.escalation_type === 'PERCENTAGE'
                  ? 'bg-gable-green/10 border-gable-green/30 text-gable-green'
                  : 'bg-white/5 border-white/10 text-zinc-400 hover:border-white/20'
                }">
                ${icon(Percent, 14)} % Escalator
              </button>
              <button type="button" @click=${() => this._handleTypeChange('INDEX_DELTA')}
                class="flex items-center gap-1.5 text-xs px-3 py-2 rounded-lg border transition-all ${this.escalator.escalation_type === 'INDEX_DELTA'
                  ? 'bg-blue-500/10 border-blue-500/30 text-blue-400'
                  : 'bg-white/5 border-white/10 text-zinc-400 hover:border-white/20'
                }">
                ${icon(BarChart3, 14)} Index-Linked
              </button>
            </div>

            <div class="grid grid-cols-2 gap-3">
              ${this.escalator.escalation_type === 'PERCENTAGE' ? html`
                <div>
                  <label class="block text-[10px] uppercase tracking-wider text-zinc-500 mb-1.5">Monthly Rate (%)</label>
                  <input type="number" step="0.5" min="0" max="50"
                    .value=${String(this.escalator.escalation_rate)}
                    @input=${(e: InputEvent) => this._handleRateChange(parseFloat((e.target as HTMLInputElement).value) || 0)}
                    class="w-full bg-black/30 border border-white/10 rounded-lg px-3 py-2 text-sm text-white font-mono focus:border-gable-green/50 focus:outline-none focus:ring-1 focus:ring-gable-green/20 transition-colors"
                  />
                </div>
              ` : html`
                <div>
                  <label class="block text-[10px] uppercase tracking-wider text-zinc-500 mb-1.5">Market Index</label>
                  <select
                    .value=${this.escalator.market_index_id || ''}
                    @change=${(e: Event) => this._handleIndexChange((e.target as HTMLSelectElement).value)}
                    class="w-full bg-black/30 border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:border-blue-500/50 focus:outline-none focus:ring-1 focus:ring-blue-500/20 transition-colors"
                  >
                    <option value="">Select Index...</option>
                    ${this._indices.map(idx => html`
                      <option value=${idx.id}>${idx.name} (${idx.current_value.toFixed(2)} ${idx.unit})</option>
                    `)}
                  </select>
                </div>
              `}

              ${this.escalator.escalation_type === 'INDEX_DELTA' ? html`
                <div>
                  <label class="block text-[10px] uppercase tracking-wider text-zinc-500 mb-1.5">Base Index Value</label>
                  <input type="number" step="1" min="0"
                    .value=${String(this.escalator.escalation_rate)}
                    @input=${(e: InputEvent) => this._handleRateChange(parseFloat((e.target as HTMLInputElement).value) || 0)}
                    class="w-full bg-black/30 border border-white/10 rounded-lg px-3 py-2 text-sm text-white font-mono focus:border-blue-500/50 focus:outline-none focus:ring-1 focus:ring-blue-500/20 transition-colors"
                  />
                </div>
              ` : nothing}
            </div>

            <div class="grid grid-cols-2 gap-3">
              <div>
                <label class="block text-[10px] uppercase tracking-wider text-zinc-500 mb-1.5 flex items-center gap-1">
                  ${icon(Calendar, 12)} Effective Date
                </label>
                <input type="date" .value=${this.escalator.effective_date}
                  @input=${(e: InputEvent) => this._handleDateChange('effective_date', (e.target as HTMLInputElement).value)}
                  class="w-full bg-black/30 border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:border-gable-green/50 focus:outline-none focus:ring-1 focus:ring-gable-green/20 transition-colors"
                />
              </div>
              <div>
                <label class="block text-[10px] uppercase tracking-wider text-zinc-500 mb-1.5 flex items-center gap-1">
                  ${icon(Calendar, 12)} Target Date
                </label>
                <input type="date" .value=${this.escalator.target_date}
                  @input=${(e: InputEvent) => this._handleDateChange('target_date', (e.target as HTMLInputElement).value)}
                  class="w-full bg-black/30 border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:border-gable-green/50 focus:outline-none focus:ring-1 focus:ring-gable-green/20 transition-colors"
                />
              </div>
            </div>

            <button type="button" @click=${this._handleCalculate} ?disabled=${this._loading}
              class="w-full flex items-center justify-center gap-2 text-xs font-medium px-4 py-2.5 rounded-lg bg-gable-green/10 border border-gable-green/20 text-gable-green hover:bg-gable-green/20 transition-all disabled:opacity-50">
              ${icon(TrendingUp, 14)}
              ${this._loading ? 'Calculating...' : 'Calculate Future Price'}
            </button>

            ${this.escalator.result ? html`
              <div class="space-y-3 pt-2 border-t border-white/5">
                <div class="flex items-center justify-between">
                  <span class="text-xs text-zinc-400">Future Realized Price</span>
                  <span class="text-lg font-mono font-bold text-emerald-400">$${this.escalator.result.future_price.toFixed(2)}</span>
                </div>
                <div class="flex items-center justify-between text-xs">
                  <span class="text-zinc-500">${this.escalator.result.months_out} month${this.escalator.result.months_out !== 1 ? 's' : ''} out</span>
                  <span class="font-mono ${this.escalator.result.price_delta > 0 ? 'text-rose-400' : 'text-emerald-400'}">
                    ${this.escalator.result.price_delta > 0 ? '+' : ''}$${this.escalator.result.price_delta.toFixed(2)}
                    (${this.escalator.result.delta_percent > 0 ? '+' : ''}${this.escalator.result.delta_percent.toFixed(1)}%)
                  </span>
                </div>
                ${this.escalator.escalation_type === 'INDEX_DELTA' ? html`
                  <div class="flex items-center gap-1.5 text-[10px] text-blue-400 bg-blue-500/10 border border-blue-500/20 rounded-full px-2.5 py-1 w-fit">
                    ${icon(Link2, 12)} Index-Linked Pricing
                  </div>
                ` : nothing}
                ${this.escalator.result.is_stale ? html`
                  <div class="flex items-start gap-2 bg-amber-500/10 border border-amber-500/20 rounded-lg p-3 text-xs text-amber-400">
                    ${icon(AlertTriangle, 16, 'shrink-0 mt-0.5')}
                    <div>
                      <span class="font-semibold">Stale Price Warning</span>
                      <p class="text-amber-400/70 mt-0.5">Market index has moved ${this.escalator.result.stale_delta_pct.toFixed(1)}% since this price was set. Consider recalculating.</p>
                    </div>
                  </div>
                ` : nothing}
              </div>
            ` : nothing}
          </div>
        ` : nothing}
      </div>
    `;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'gable-escalator-toggle': GableEscalatorToggle;
  }
}
