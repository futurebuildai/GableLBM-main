import { LitElement, html, nothing } from 'lit';
import { customElement, property, state } from 'lit/decorators.js';
import { icon } from '../../lib/icons.ts';
import { ToastService } from '../../lib/toast-service.ts';
import { ExposureService } from '../../services/ExposureService';
import type { AckMethod } from '../../types/exposure';
import { X, ShieldCheck } from 'lucide';

/**
 * In-app modal for recording a customer's acknowledgment of an at-risk quote.
 * Replaces the previous window.prompt flow. Self-contained: posts to the
 * exposure API and emits an `acknowledged` event so the host can refresh.
 */
@customElement('gable-acknowledgment-modal')
export class GableAcknowledgmentModal extends LitElement {
  createRenderRoot() { return this; }

  @property({ type: Boolean }) open = false;
  @property({ attribute: false }) quoteId = '';
  @property({ attribute: false }) shortId = '';

  @state() private method: AckMethod = 'VERBAL';
  @state() private contact = '';
  @state() private notes = '';
  @state() private submitting = false;

  private get _valid() {
    return this.notes.trim().length >= 10;
  }

  private _close() {
    if (this.submitting) return;
    this.dispatchEvent(new Event('close', { bubbles: true, composed: true }));
  }

  private _reset() {
    this.method = 'VERBAL';
    this.contact = '';
    this.notes = '';
  }

  private async _submit() {
    if (!this._valid || this.submitting) return;
    this.submitting = true;
    try {
      await ExposureService.acknowledge(this.quoteId, {
        method: this.method,
        customer_contact: this.contact.trim() || undefined,
        notes: this.notes.trim(),
      });
      ToastService.show('Acknowledgment recorded', 'success');
      this.dispatchEvent(new CustomEvent('acknowledged', {
        detail: { quoteId: this.quoteId }, bubbles: true, composed: true,
      }));
      this._reset();
      this.dispatchEvent(new Event('close', { bubbles: true, composed: true }));
    } catch (err) {
      console.error(err);
      ToastService.show('Failed to record acknowledgment', 'error');
    } finally {
      this.submitting = false;
    }
  }

  render() {
    if (!this.open) return nothing;

    const methods: AckMethod[] = ['VERBAL', 'EMAIL', 'PORTAL'];
    const charsLeft = Math.max(0, 10 - this.notes.trim().length);

    return html`
      <div class="relative z-[60]">
        <div class="fixed inset-0 bg-black/80 backdrop-blur-sm" @click=${this._close}></div>
        <div class="fixed inset-0 flex items-center justify-center p-4">
          <div class="w-full max-w-lg transform overflow-hidden rounded-2xl bg-slate-steel border border-white/10 p-6 text-left shadow-xl">
            <div class="flex items-center justify-between mb-1">
              <h3 class="text-xl font-bold text-white flex items-center gap-2">
                ${icon(ShieldCheck, 20, 'text-gable-green')} Record Acknowledgment
              </h3>
              <button @click=${this._close} aria-label="Close" class="text-zinc-400 hover:text-white transition-colors">
                ${icon(X, 22)}
              </button>
            </div>
            <p class="text-sm text-zinc-500 mb-6">
              Confirm the customer has accepted the index-driven price change on quote
              <span class="font-mono text-blueprint-blue">${this.shortId || this.quoteId.slice(0, 8)}</span>.
              This writes an audit entry and clears the pre-ship gate.
            </p>

            <div class="space-y-4">
              <div>
                <label class="block text-xs font-semibold text-zinc-400 uppercase tracking-wider mb-2">Method</label>
                <div class="flex gap-2">
                  ${methods.map((m) => html`
                    <button
                      type="button"
                      @click=${() => { this.method = m; }}
                      class="flex-1 px-3 py-2 text-sm rounded-lg border transition-colors ${
                        this.method === m
                          ? 'border-gable-green/50 bg-gable-green/10 text-gable-green'
                          : 'border-white/10 bg-white/5 text-zinc-400 hover:text-white'
                      }">
                      ${m}
                    </button>
                  `)}
                </div>
              </div>

              <div>
                <label class="block text-xs font-semibold text-zinc-400 uppercase tracking-wider mb-2">
                  Customer Contact <span class="text-zinc-600 normal-case font-normal">(optional)</span>
                </label>
                <input
                  type="text"
                  .value=${this.contact}
                  @input=${(e: Event) => { this.contact = (e.target as HTMLInputElement).value; }}
                  placeholder="Name or email of who approved"
                  class="w-full bg-deep-space border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:ring-1 focus:ring-gable-green/50" />
              </div>

              <div>
                <label class="block text-xs font-semibold text-zinc-400 uppercase tracking-wider mb-2">Notes</label>
                <textarea
                  rows="3"
                  .value=${this.notes}
                  @input=${(e: Event) => { this.notes = (e.target as HTMLTextAreaElement).value; }}
                  placeholder="How and when the customer acknowledged the new price…"
                  class="w-full bg-deep-space border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:ring-1 focus:ring-gable-green/50 resize-none"></textarea>
                <p class="mt-1 text-xs ${this._valid ? 'text-zinc-600' : 'text-amber-400'}">
                  ${this._valid ? 'Ready to record' : `${charsLeft} more character${charsLeft === 1 ? '' : 's'} required`}
                </p>
              </div>
            </div>

            <div class="mt-6 flex justify-end gap-2">
              <button
                @click=${this._close}
                ?disabled=${this.submitting}
                class="px-4 py-2 text-sm rounded-lg bg-white/5 text-zinc-300 hover:bg-white/10 transition-colors disabled:opacity-50">
                Cancel
              </button>
              <button
                @click=${this._submit}
                ?disabled=${!this._valid || this.submitting}
                class="px-4 py-2 text-sm font-medium rounded-lg bg-gable-green text-black hover:bg-gable-green/90 transition-colors disabled:opacity-40 disabled:cursor-not-allowed">
                ${this.submitting ? 'Recording…' : 'Record Acknowledgment'}
              </button>
            </div>
          </div>
        </div>
      </div>
    `;
  }
}
