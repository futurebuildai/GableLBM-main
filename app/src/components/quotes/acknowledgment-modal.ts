import { LitElement, html } from 'lit';
import { customElement, property, state } from 'lit/decorators.js';
import { ShieldCheck, X } from 'lucide';
import { icon } from '../../lib/icons';
import { ExposureService } from '../../services/ExposureService';
import { ToastService } from '../../lib/toast-service';
import type { AckMethod } from '../../types/exposure';

/**
 * gable-acknowledgment-modal — captures the actor, method (verbal / email /
 * portal-signed), customer contact name, and free-form notes describing the
 * customer's acceptance of the current index exposure. Posts to
 * /api/v1/quotes/:id/exposure/acknowledge.
 *
 * Open by setting `is-open` to true. Emits `acknowledged` (bubbles, composed)
 * with `{ quoteId }` on success so the parent can refresh banner state.
 */
@customElement('gable-acknowledgment-modal')
export class GableAcknowledgmentModal extends LitElement {
  createRenderRoot() { return this; }

  @property({ type: Boolean, attribute: 'is-open' }) isOpen = false;
  @property({ attribute: 'quote-id' }) quoteId = '';
  @property({ attribute: 'customer-name' }) customerName = '';
  @property({ type: Number, attribute: 'exposure-dollars' }) exposureDollars = 0;
  @property({ attribute: 'indexes' }) indexes = '';

  @state() private _method: AckMethod = 'VERBAL';
  @state() private _customerContact = '';
  @state() private _notes = '';
  @state() private _submitting = false;
  @state() private _error = '';

  private _close() {
    this.isOpen = false;
    this._reset();
    this.dispatchEvent(new CustomEvent('close', { bubbles: true, composed: true }));
  }

  private _reset() {
    this._method = 'VERBAL';
    this._customerContact = '';
    this._notes = '';
    this._error = '';
    this._submitting = false;
  }

  private async _submit() {
    if (this._notes.trim().length < 10) {
      this._error = 'Notes must be at least 10 characters';
      return;
    }
    this._submitting = true;
    this._error = '';
    try {
      await ExposureService.acknowledge(this.quoteId, {
        method: this._method,
        customer_contact: this._customerContact || undefined,
        notes: this._notes,
      });
      ToastService.show('Acknowledgment recorded', 'success');
      this.dispatchEvent(new CustomEvent('acknowledged', {
        detail: { quoteId: this.quoteId },
        bubbles: true, composed: true,
      }));
      this._close();
    } catch (err) {
      this._error = err instanceof Error ? err.message : 'Failed to record acknowledgment';
    } finally {
      this._submitting = false;
    }
  }

  render() {
    if (!this.isOpen) return html``;
    const dollars = `$${this.exposureDollars.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
    const submitDisabled = this._submitting || this._notes.trim().length < 10;

    return html`
      <div class="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
        <div class="bg-slate-steel rounded-lg max-w-lg w-full p-6 shadow-xl border border-white/10">
          <div class="flex items-center justify-between mb-4">
            <div class="flex items-center gap-2">
              ${icon(ShieldCheck, 20, 'text-gable-green')}
              <h2 class="text-lg font-semibold text-white">Acknowledge Index Exposure</h2>
            </div>
            <button @click=${() => this._close()} class="text-gray-400 hover:text-white">
              ${icon(X, 18)}
            </button>
          </div>

          <div class="bg-deep-space/50 rounded p-3 mb-4 text-sm">
            <div class="text-gray-400">Customer</div>
            <div class="text-white font-medium">${this.customerName}</div>
            <div class="grid grid-cols-2 gap-2 mt-2">
              <div>
                <div class="text-gray-400 text-xs">Exposure</div>
                <div class="text-safety-red font-mono">${dollars}</div>
              </div>
              <div>
                <div class="text-gray-400 text-xs">Index(es)</div>
                <div class="font-mono text-blueprint-blue">${this.indexes || '—'}</div>
              </div>
            </div>
          </div>

          <div class="space-y-3">
            <div>
              <label class="block text-sm text-gray-300 mb-1">Acknowledgment method</label>
              <div class="flex gap-2">
                ${(['VERBAL', 'EMAIL', 'PORTAL'] as AckMethod[]).map(m => html`
                  <button
                    @click=${() => { this._method = m; }}
                    ?disabled=${m === 'PORTAL'}
                    class="flex-1 px-3 py-2 rounded border text-sm transition
                           ${this._method === m
                             ? 'border-gable-green text-gable-green bg-gable-green/10'
                             : 'border-white/10 text-gray-400 hover:border-white/30'}
                           ${m === 'PORTAL' ? 'opacity-40 cursor-not-allowed' : ''}">
                    ${m}${m === 'PORTAL' ? ' (soon)' : ''}
                  </button>
                `)}
              </div>
            </div>

            <div>
              <label class="block text-sm text-gray-300 mb-1">Customer contact (optional)</label>
              <input
                type="text"
                .value=${this._customerContact}
                @input=${(e: Event) => { this._customerContact = (e.target as HTMLInputElement).value; }}
                placeholder="Name of person who acknowledged"
                class="w-full px-3 py-2 bg-deep-space border border-white/10 rounded text-white placeholder-gray-500 focus:border-gable-green focus:outline-none" />
            </div>

            <div>
              <label class="block text-sm text-gray-300 mb-1">
                Notes <span class="text-gray-500">(min 10 chars)</span>
              </label>
              <textarea
                .value=${this._notes}
                @input=${(e: Event) => { this._notes = (e.target as HTMLTextAreaElement).value; this._error = ''; }}
                rows="3"
                placeholder="What did the customer agree to? Include time/date if verbal."
                class="w-full px-3 py-2 bg-deep-space border border-white/10 rounded text-white placeholder-gray-500 focus:border-gable-green focus:outline-none font-mono text-sm"></textarea>
              <div class="text-xs text-gray-500 mt-1">${this._notes.length} / 10 minimum</div>
            </div>

            ${this._error ? html`
              <div class="text-safety-red text-sm bg-safety-red/10 border border-safety-red/30 px-3 py-2 rounded">
                ${this._error}
              </div>
            ` : ''}
          </div>

          <div class="flex justify-end gap-2 mt-6 pt-4 border-t border-white/10">
            <button @click=${() => this._close()}
              ?disabled=${this._submitting}
              class="px-4 py-2 border border-white/10 text-gray-300 rounded hover:bg-white/10 transition">
              Cancel
            </button>
            <button @click=${() => this._submit()}
              ?disabled=${submitDisabled}
              class="px-4 py-2 bg-gable-green text-black font-semibold rounded hover:opacity-90 transition disabled:opacity-40 disabled:cursor-not-allowed">
              ${this._submitting ? 'Recording…' : 'Record Acknowledgment'}
            </button>
          </div>
        </div>
      </div>
    `;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'gable-acknowledgment-modal': GableAcknowledgmentModal;
  }
}
