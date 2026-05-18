import { LitElement, html } from 'lit';
import { customElement, property, state } from 'lit/decorators.js';
import { AlertOctagon, X } from 'lucide';
import { icon } from '../../lib/icons';
import { ExposureService } from '../../services/ExposureService';
import { ToastService } from '../../lib/toast-service';
import type { UnresolvedExposurePayload } from '../../types/exposure';

/**
 * gable-block-modal — shown when a quote-to-order or dispatch attempt is
 * blocked by unresolved index exposure on the source quote. The block-modal
 * presents three actions (role-gated):
 *
 *   1. Request Salesperson Acknowledgment (primary, all roles)
 *   2. Acknowledge Now (sales/owner only; opens acknowledgment modal)
 *   3. Override and Release (owner/admin only; requires notes)
 *
 * The parent should listen for `block-action` events to react.
 */
@customElement('gable-block-modal')
export class GableBlockModal extends LitElement {
  createRenderRoot() { return this; }

  @property({ type: Boolean, attribute: 'is-open' }) isOpen = false;
  @property({ type: Object }) exposure?: UnresolvedExposurePayload['exposure'];
  @property({ attribute: 'current-user-role' }) currentUserRole = '';
  @property({ attribute: 'current-user-id' }) currentUserId = '';

  @state() private _overrideOpen = false;
  @state() private _overrideNotes = '';
  @state() private _submitting = false;
  @state() private _error = '';

  private get _canAckNow(): boolean {
    return (
      this.currentUserRole === 'owner' ||
      this.currentUserRole === 'admin' ||
      (this.currentUserRole === 'sales' &&
        !!this.exposure?.salesperson_id &&
        this.exposure.salesperson_id === this.currentUserId)
    );
  }

  private get _canOverride(): boolean {
    return this.currentUserRole === 'owner' || this.currentUserRole === 'admin';
  }

  private _close() {
    this.isOpen = false;
    this._overrideOpen = false;
    this._overrideNotes = '';
    this._error = '';
    this.dispatchEvent(new CustomEvent('close', { bubbles: true, composed: true }));
  }

  private async _requestAck() {
    if (!this.exposure) return;
    this._submitting = true;
    try {
      await ExposureService.requestAck(this.exposure.quote_id);
      ToastService.show(`Acknowledgment request sent to ${this.exposure.salesperson_name || 'salesperson'}.`, 'info');
      this.dispatchEvent(new CustomEvent('block-action', {
        detail: { action: 'request-ack', quoteId: this.exposure.quote_id },
        bubbles: true, composed: true,
      }));
      this._close();
    } catch (err) {
      this._error = err instanceof Error ? err.message : 'Failed to request acknowledgment';
    } finally {
      this._submitting = false;
    }
  }

  private _ackNow() {
    if (!this.exposure) return;
    this.dispatchEvent(new CustomEvent('block-action', {
      detail: { action: 'ack-now', quoteId: this.exposure.quote_id },
      bubbles: true, composed: true,
    }));
    this._close();
  }

  private async _doOverride() {
    if (!this.exposure) return;
    if (this._overrideNotes.trim().length < 10) {
      this._error = 'Override notes must be at least 10 characters';
      return;
    }
    this._submitting = true;
    try {
      await ExposureService.override(this.exposure.quote_id, { notes: this._overrideNotes });
      ToastService.show('Exposure overridden — order may proceed.', 'success');
      this.dispatchEvent(new CustomEvent('block-action', {
        detail: { action: 'override', quoteId: this.exposure.quote_id },
        bubbles: true, composed: true,
      }));
      this._close();
    } catch (err) {
      this._error = err instanceof Error ? err.message : 'Failed to override';
    } finally {
      this._submitting = false;
    }
  }

  render() {
    if (!this.isOpen || !this.exposure) return html``;
    const dollars = `$${this.exposure.exposure_dollars.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
    const indexList = (this.exposure.indexes || []).join(', ');

    return html`
      <div class="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
        <div class="bg-slate-steel rounded-lg max-w-md w-full p-6 shadow-xl border-2 border-safety-red">
          <div class="flex items-center justify-between mb-4">
            <div class="flex items-center gap-2">
              ${icon(AlertOctagon, 22, 'text-safety-red')}
              <h2 class="text-base font-semibold text-white">Quote Cannot Be Converted</h2>
            </div>
            <button @click=${() => this._close()} class="text-gray-400 hover:text-white">
              ${icon(X, 18)}
            </button>
          </div>

          <p class="text-gray-300 text-sm mb-4">
            Index exposure on the source quote is unresolved — must be acknowledged or overridden before this order can move forward.
          </p>

          <div class="bg-deep-space/50 rounded p-4 space-y-2 mb-4 text-sm">
            <div class="flex justify-between">
              <span class="text-gray-400">Quote</span>
              <span class="font-mono text-white">${this.exposure.quote_short_id || this.exposure.quote_id.slice(0, 8)}</span>
            </div>
            <div class="flex justify-between">
              <span class="text-gray-400">Salesperson</span>
              <span class="text-white">${this.exposure.salesperson_name || '—'}</span>
            </div>
            <div class="flex justify-between">
              <span class="text-gray-400">Exposure</span>
              <span class="font-mono text-safety-red text-lg">${dollars}</span>
            </div>
            <div class="flex justify-between">
              <span class="text-gray-400">Index(es)</span>
              <span class="font-mono text-blueprint-blue">${indexList || '—'}</span>
            </div>
            <div class="flex justify-between">
              <span class="text-gray-400">State</span>
              <span class="font-mono text-safety-red uppercase text-xs">${this.exposure.state}</span>
            </div>
          </div>

          ${this._error ? html`
            <div class="text-safety-red text-sm bg-safety-red/10 border border-safety-red/30 px-3 py-2 rounded mb-3">
              ${this._error}
            </div>
          ` : ''}

          ${this._overrideOpen ? html`
            <div class="space-y-3 mb-4">
              <label class="block text-sm text-gray-300">
                Override justification <span class="text-gray-500">(min 10 chars, logged)</span>
              </label>
              <textarea
                .value=${this._overrideNotes}
                @input=${(e: Event) => { this._overrideNotes = (e.target as HTMLTextAreaElement).value; this._error = ''; }}
                rows="3"
                placeholder="e.g. Customer agreed verbally on call; formal ack will follow Monday."
                class="w-full px-3 py-2 bg-deep-space border border-white/10 rounded text-white placeholder-gray-500 focus:border-gable-green focus:outline-none text-sm font-mono"></textarea>
            </div>
            <div class="flex justify-end gap-2">
              <button @click=${() => { this._overrideOpen = false; this._overrideNotes = ''; this._error = ''; }}
                ?disabled=${this._submitting}
                class="px-4 py-2 border border-white/10 text-gray-300 rounded hover:bg-white/10 transition">
                Back
              </button>
              <button @click=${() => this._doOverride()}
                ?disabled=${this._submitting || this._overrideNotes.trim().length < 10}
                class="px-4 py-2 border border-safety-red/50 text-safety-red rounded hover:bg-safety-red/10 transition disabled:opacity-40 disabled:cursor-not-allowed">
                ${this._submitting ? 'Overriding…' : 'Override and Release'}
              </button>
            </div>
          ` : html`
            <div class="flex flex-col gap-2">
              <button @click=${() => this._requestAck()}
                ?disabled=${this._submitting}
                class="w-full px-4 py-2.5 bg-gable-green text-black font-semibold rounded hover:opacity-90 transition disabled:opacity-40">
                Request Salesperson Acknowledgment
              </button>
              ${this._canAckNow ? html`
                <button @click=${() => this._ackNow()}
                  class="w-full px-4 py-2.5 border border-white/10 text-gray-200 rounded hover:bg-white/10 transition">
                  Acknowledge Now
                </button>
              ` : ''}
              ${this._canOverride ? html`
                <button @click=${() => { this._overrideOpen = true; this._error = ''; }}
                  class="w-full px-4 py-2.5 border border-safety-red/30 text-safety-red rounded hover:bg-safety-red/10 transition text-sm">
                  Override and Release (logged)
                </button>
              ` : ''}
              <button @click=${() => this._close()}
                class="w-full px-4 py-2 text-gray-400 hover:text-gray-200 transition text-sm">
                Cancel
              </button>
            </div>
          `}
        </div>
      </div>
    `;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'gable-block-modal': GableBlockModal;
  }
}
