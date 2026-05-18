import { LitElement, html, nothing } from 'lit';
import { customElement, property } from 'lit/decorators.js';
import { TrendingUp, AlertOctagon, ShieldCheck, Activity } from 'lucide';
import { icon } from '../../lib/icons';
import type { ExposureState } from '../../types/exposure';

/**
 * gable-exposure-banner — red/yellow/blue banner rendered at the top of the
 * quote editor + detail pages when a quote has non-OK index exposure.
 *
 * Emits `exposure-action` (bubbles, composed) with detail:
 *   { action: 'requote' | 'acknowledge' | 'request-ack' | 'view-audit' | 'override', quoteId }
 *
 * The parent page is responsible for showing the acknowledgment / re-quote
 * modal or navigating to the audit view. This component is purely
 * presentational + intent emission.
 */
@customElement('gable-exposure-banner')
export class GableExposureBanner extends LitElement {
  createRenderRoot() { return this; }

  @property({ attribute: 'quote-id' }) quoteId = '';
  @property({ attribute: 'state' }) state: ExposureState = 'OK';
  @property({ type: Number, attribute: 'exposure-dollars' }) exposureDollars = 0;
  @property({ attribute: 'indexes' }) indexes = ''; // comma-separated index codes
  @property({ attribute: 'policy' }) policy = '';
  @property({ type: Number, attribute: 'max-delta-pct' }) maxDeltaPct = 0;

  private get _indexList(): string[] {
    return this.indexes.split(',').map(s => s.trim()).filter(Boolean);
  }

  private _fire(action: string) {
    this.dispatchEvent(new CustomEvent('exposure-action', {
      detail: { action, quoteId: this.quoteId },
      bubbles: true, composed: true,
    }));
  }

  render() {
    if (this.state === 'OK') return nothing;

    const dollars = `$${this.exposureDollars.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
    const deltaSign = this.maxDeltaPct >= 0 ? '▲' : '▼';
    const deltaStr = `${deltaSign} ${Math.abs(this.maxDeltaPct).toFixed(2)}%`;
    const idxList = this._indexList.join(', ');

    switch (this.state) {
      case 'FLAGGED':
        return html`
          <div class="bg-yellow-400/10 border-l-4 border-yellow-400 px-4 py-3 flex items-center gap-3 mb-4 rounded-r">
            ${icon(TrendingUp, 20, 'text-yellow-400 shrink-0')}
            <div class="flex-1">
              <div class="text-yellow-200 font-medium">
                Index exposure — ${idxList ? html`<span class="font-mono">${idxList}</span> moved ` : ''}<span class="font-mono">${deltaStr}</span>
                — <span class="font-mono">${dollars}</span> margin at risk
              </div>
              <div class="text-yellow-100/70 text-xs mt-0.5">Salesperson action required. Customer policy: <span class="font-mono">${this.policy}</span>.</div>
            </div>
            <button @click=${() => this._fire('requote')}
              class="px-3 py-1.5 bg-gable-green text-black font-semibold rounded hover:opacity-90 transition shrink-0">
              Re-quote at Market
            </button>
            <button @click=${() => this._fire('acknowledge')}
              class="px-3 py-1.5 border border-white/10 text-gray-300 rounded hover:bg-white/10 transition shrink-0">
              Acknowledge
            </button>
          </div>
        `;

      case 'ESCALATED':
        return html`
          <div class="bg-blueprint-blue/10 border-l-4 border-blueprint-blue px-4 py-3 flex items-center gap-3 mb-4 rounded-r">
            ${icon(Activity, 20, 'text-blueprint-blue shrink-0')}
            <div class="flex-1">
              <div class="text-blueprint-blue font-medium">
                Prices auto-escalated — ${idxList ? html`<span class="font-mono">${idxList}</span>, ` : ''}<span class="font-mono">${deltaStr}</span>
              </div>
              <div class="text-gray-400 text-xs mt-0.5">Customer notified per signed agreement. <span class="font-mono">${dollars}</span> escalation applied.</div>
            </div>
            <button @click=${() => this._fire('view-audit')}
              class="px-3 py-1.5 border border-white/10 text-gray-300 rounded hover:bg-white/10 transition shrink-0">
              View Audit Trail
            </button>
          </div>
        `;

      case 'ACK_REQUIRED':
      case 'BLOCKED':
        return html`
          <div class="bg-safety-red/10 border-l-4 border-safety-red px-4 py-3 flex items-center gap-3 mb-4 rounded-r">
            ${icon(AlertOctagon, 20, 'text-safety-red shrink-0')}
            <div class="flex-1">
              <div class="text-safety-red font-medium">
                ${this.state === 'BLOCKED'
                  ? html`Order shipment blocked — index exposure unresolved`
                  : html`Customer acknowledgment required before shipment`}
              </div>
              <div class="text-gray-300 text-xs mt-0.5">
                <span class="font-mono">${dollars}</span> exposure
                ${idxList ? html` on <span class="font-mono">${idxList}</span>` : ''}
                — delta <span class="font-mono">${deltaStr}</span>
              </div>
            </div>
            <button @click=${() => this._fire('acknowledge')}
              class="px-3 py-1.5 bg-gable-green text-black font-semibold rounded hover:opacity-90 transition shrink-0">
              Mark Acknowledged
            </button>
            <button @click=${() => this._fire('request-ack')}
              class="px-3 py-1.5 border border-white/10 text-gray-300 rounded hover:bg-white/10 transition shrink-0">
              Request from Sales
            </button>
          </div>
        `;

      case 'ACKNOWLEDGED':
      case 'OVERRIDDEN':
        return html`
          <div class="bg-gable-green/10 border-l-4 border-gable-green px-4 py-3 flex items-center gap-3 mb-4 rounded-r">
            ${icon(ShieldCheck, 20, 'text-gable-green shrink-0')}
            <div class="flex-1">
              <div class="text-gable-green font-medium">
                ${this.state === 'OVERRIDDEN' ? 'Exposure manually overridden' : 'Customer acknowledged exposure'}
              </div>
              <div class="text-gray-400 text-xs mt-0.5">Order may proceed. <span class="font-mono">${dollars}</span> on record.</div>
            </div>
            <button @click=${() => this._fire('view-audit')}
              class="px-3 py-1.5 border border-white/10 text-gray-300 rounded hover:bg-white/10 transition shrink-0">
              View Audit Trail
            </button>
          </div>
        `;

      default:
        return nothing;
    }
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'gable-exposure-banner': GableExposureBanner;
  }
}
