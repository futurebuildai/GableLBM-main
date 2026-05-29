import { LitElement, html, nothing } from 'lit';
import { customElement, property, state } from 'lit/decorators.js';
import { icon } from '../../lib/icons.ts';
import { ExposureService } from '../../services/ExposureService';
import type { ExposureState, QuoteExposureDetail, QuoteExposureEvent } from '../../types/exposure';
import { ShieldAlert, TrendingUp, ArrowRight } from 'lucide';
import './acknowledgment-modal.ts';

const STATE_META: Record<ExposureState, { label: string; ring: string; text: string; bg: string }> = {
  OK:           { label: 'On Track',     ring: 'border-white/10',        text: 'text-zinc-400',       bg: 'bg-white/5' },
  FLAGGED:      { label: 'Flagged',      ring: 'border-amber-500/30',    text: 'text-amber-400',      bg: 'bg-amber-500/10' },
  ESCALATED:    { label: 'Escalated',    ring: 'border-sky-500/30',      text: 'text-blueprint-blue', bg: 'bg-sky-500/10' },
  ACK_REQUIRED: { label: 'Ack Required', ring: 'border-rose-500/30',     text: 'text-rose-400',       bg: 'bg-rose-500/10' },
  ACKNOWLEDGED: { label: 'Acknowledged', ring: 'border-emerald-500/30',  text: 'text-emerald-400',    bg: 'bg-emerald-500/10' },
  BLOCKED:      { label: 'Blocked',      ring: 'border-rose-500/30',     text: 'text-rose-400',       bg: 'bg-rose-500/10' },
  OVERRIDDEN:   { label: 'Overridden',   ring: 'border-violet-500/30',   text: 'text-violet-400',     bg: 'bg-violet-500/10' },
};

const ACTION_LABELS: Record<string, string> = {
  acknowledge: 'Customer acknowledgment required before shipment.',
  requote: 'Consider re-quoting at the current market price.',
  request_ack: 'Request customer acknowledgment of the new price.',
  override: 'Owner override required to release this quote.',
};

/**
 * Surfaces lumber-index price exposure (margin erosion) on the quote-detail
 * page. Self-hides when the quote has no active exposure. Hosts the in-app
 * acknowledgment modal so salespeople can clear ACK-required quotes in place.
 */
@customElement('gable-exposure-banner')
export class GableExposureBanner extends LitElement {
  createRenderRoot() { return this; }

  @property({ attribute: false }) quoteId = '';
  @property({ attribute: false }) shortId = '';

  @state() private detail: QuoteExposureDetail | null = null;
  @state() private ackOpen = false;

  connectedCallback() {
    super.connectedCallback();
    if (this.quoteId) this._load();
  }

  updated(changed: Map<string, unknown>) {
    if (changed.has('quoteId') && changed.get('quoteId') !== undefined && this.quoteId) {
      this._load();
    }
  }

  private async _load() {
    try {
      this.detail = await ExposureService.getQuoteExposure(this.quoteId);
    } catch {
      // No exposure record (404) or transient error — render nothing.
      this.detail = null;
    }
  }

  private _fmt(v: number) {
    return `$${v.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  }

  /** Most recent ledger event carrying an index delta. */
  private _latestMove(events: QuoteExposureEvent[]): QuoteExposureEvent | null {
    const withDelta = events.filter((e) => e.delta_pct != null);
    if (withDelta.length === 0) return null;
    return withDelta.reduce((a, b) =>
      new Date(b.created_at).getTime() > new Date(a.created_at).getTime() ? b : a);
  }

  render() {
    const d = this.detail;
    if (!d || d.exposure_state === 'OK') return nothing;

    const meta = STATE_META[d.exposure_state] || STATE_META.OK;
    const move = this._latestMove(d.events || []);
    const delta = move?.delta_pct ?? 0;
    const canAck = (d.required_action === 'acknowledge') || d.exposure_state === 'ACK_REQUIRED' || d.exposure_state === 'FLAGGED';
    const actionNote = d.required_action ? ACTION_LABELS[d.required_action] : '';

    return html`
      <div class="rounded-xl border ${meta.ring} ${meta.bg} p-5">
        <div class="flex items-start justify-between gap-4 flex-wrap">
          <div class="flex items-start gap-3">
            ${icon(ShieldAlert, 22, `w-5.5 h-5.5 ${meta.text} shrink-0 mt-0.5`)}
            <div>
              <div class="flex items-center gap-2">
                <h3 class="text-sm font-semibold text-white uppercase tracking-wider">Lumber Index Exposure</h3>
                <span class="px-2 py-0.5 rounded-md text-xs font-medium ${meta.text} ${meta.bg} border ${meta.ring}">
                  ${meta.label}
                </span>
              </div>
              <p class="text-xs text-zinc-400 mt-1">
                ${(d.indexes || []).join(', ') || 'Tracking index'} moved since this quote was sent —
                the locked price now erodes margin.
              </p>
              ${actionNote ? html`<p class="text-xs ${meta.text} mt-1.5 font-medium">${actionNote}</p>` : nothing}
            </div>
          </div>

          ${canAck ? html`
            <button
              @click=${() => { this.ackOpen = true; }}
              class="px-3 py-1.5 text-xs font-medium rounded-lg bg-gable-green text-black hover:bg-gable-green/90 transition-colors shrink-0">
              Acknowledge
            </button>
          ` : nothing}
        </div>

        <div class="grid grid-cols-2 md:grid-cols-3 gap-4 mt-5">
          <div>
            <div class="text-[11px] text-zinc-500 uppercase tracking-wider mb-1">Index Move</div>
            ${move && move.base_index_value != null && move.current_index_value != null ? html`
              <div class="flex items-center gap-2 font-mono text-sm text-white">
                <span class="text-zinc-400">${move.base_index_value.toFixed(0)}</span>
                ${icon(ArrowRight, 12, 'w-3 h-3 text-zinc-600')}
                <span>${move.current_index_value.toFixed(0)}</span>
              </div>
            ` : html`<div class="font-mono text-sm text-zinc-500">—</div>`}
          </div>

          <div>
            <div class="text-[11px] text-zinc-500 uppercase tracking-wider mb-1">Δ Since Sent</div>
            <div class="flex items-center gap-1.5 font-mono text-lg font-bold ${delta >= 0 ? 'text-rose-400' : 'text-emerald-400'}">
              ${icon(TrendingUp, 16, 'w-4 h-4')}
              ${delta >= 0 ? '+' : ''}${delta.toFixed(2)}%
            </div>
          </div>

          <div>
            <div class="text-[11px] text-zinc-500 uppercase tracking-wider mb-1">Margin Erosion</div>
            <div class="font-mono text-lg font-bold text-rose-400">${this._fmt(d.exposure_dollars)}</div>
          </div>
        </div>
      </div>

      <gable-acknowledgment-modal
        .open=${this.ackOpen}
        .quoteId=${this.quoteId}
        .shortId=${this.shortId}
        @close=${() => { this.ackOpen = false; }}
        @acknowledged=${() => { this.ackOpen = false; this._load(); }}>
      </gable-acknowledgment-modal>
    `;
  }
}
