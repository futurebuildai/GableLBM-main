import { LitElement, html } from 'lit';
import { customElement, property, state } from 'lit/decorators.js';
import { TrendingUp } from 'lucide';
import { icon } from '../../lib/icons';
import { ExposureService } from '../../services/ExposureService';
import { ToastService } from '../../lib/toast-service';
import type { CustomerEscalationPolicy, EscalationPolicy } from '../../types/exposure';

interface PolicyOption {
  value: EscalationPolicy;
  label: string;
  description: string;
  accent: string;
}

const POLICY_OPTIONS: PolicyOption[] = [
  {
    value: 'FLAG_FOR_REQUOTE',
    label: 'Flag for re-quote',
    description: 'Notify salesperson if index moves above threshold; manual re-quote.',
    accent: 'gable-green',
  },
  {
    value: 'AUTO_ESCALATE',
    label: 'Auto-escalate',
    description: 'Automatically adjust prices and notify customer. Requires signed agreement.',
    accent: 'blueprint-blue',
  },
  {
    value: 'REQUIRE_ACK',
    label: 'Require acknowledgment',
    description: 'Block shipment until customer acknowledges new price.',
    accent: 'safety-red',
  },
];

/**
 * gable-customer-policy-section — embeddable card for the customer edit
 * screen. Reads the customer's escalation policy on mount, lets the user
 * change it, and PUTs the change. AUTO_ESCALATE shows the agreement
 * reference + signed-date fields and requires both.
 *
 * Emits `policy-saved` (bubbles, composed) with the new policy on success.
 */
@customElement('gable-customer-policy-section')
export class GableCustomerPolicySection extends LitElement {
  createRenderRoot() { return this; }

  @property({ attribute: 'customer-id' }) customerId = '';

  @state() private _policy: EscalationPolicy = 'FLAG_FOR_REQUOTE';
  @state() private _threshold = 5.0;
  @state() private _agreementRef = '';
  @state() private _agreementSignedAt: string | null = null;
  @state() private _loading = true;
  @state() private _saving = false;
  @state() private _error = '';
  @state() private _dirty = false;

  connectedCallback() {
    super.connectedCallback();
    if (this.customerId) this._load();
  }

  updated(changed: Map<string, unknown>) {
    if (changed.has('customerId') && this.customerId) this._load();
  }

  private async _load() {
    this._loading = true;
    try {
      const p = await ExposureService.getCustomerPolicy(this.customerId);
      this._policy = p.price_escalation_policy;
      this._threshold = p.escalation_threshold_pct;
      this._agreementRef = p.escalation_agreement_ref || '';
      this._agreementSignedAt = p.escalation_agreement_signed_at?.split('T')[0] || null;
      this._dirty = false;
    } catch (err) {
      this._error = err instanceof Error ? err.message : 'Failed to load policy';
    } finally {
      this._loading = false;
    }
  }

  private async _save() {
    this._error = '';
    if (this._threshold <= 0 || this._threshold > 50) {
      this._error = 'Threshold must be > 0 and ≤ 50';
      return;
    }
    if (this._policy === 'AUTO_ESCALATE') {
      if (!this._agreementSignedAt || !this._agreementRef.trim()) {
        this._error = 'AUTO_ESCALATE requires a signed agreement (reference + signed date)';
        return;
      }
    }
    this._saving = true;
    try {
      const payload: CustomerEscalationPolicy = {
        customer_id: this.customerId,
        price_escalation_policy: this._policy,
        escalation_threshold_pct: this._threshold,
        escalation_agreement_signed_at: this._agreementSignedAt
          ? new Date(this._agreementSignedAt).toISOString()
          : null,
        escalation_agreement_ref: this._agreementRef,
      };
      const saved = await ExposureService.updateCustomerPolicy(this.customerId, payload);
      ToastService.show('Escalation policy saved', 'success');
      this._dirty = false;
      this.dispatchEvent(new CustomEvent('policy-saved', {
        detail: saved, bubbles: true, composed: true,
      }));
    } catch (err) {
      this._error = err instanceof Error ? err.message : 'Failed to save';
    } finally {
      this._saving = false;
    }
  }

  private _mark() { this._dirty = true; }

  render() {
    if (this._loading) {
      return html`
        <div class="bg-slate-steel rounded p-4 animate-pulse space-y-2">
          <div class="h-5 w-48 bg-white/5 rounded"></div>
          <div class="h-20 bg-white/5 rounded"></div>
        </div>`;
    }

    return html`
      <section class="bg-slate-steel rounded p-4 border border-white/5">
        <div class="flex items-center gap-2 mb-3">
          ${icon(TrendingUp, 18, 'text-blueprint-blue')}
          <h3 class="text-sm font-semibold text-white uppercase tracking-wide">Price Escalation Policy</h3>
        </div>
        <p class="text-xs text-gray-400 mb-4">
          How GableLBM responds when a lumber market index moves above this customer's threshold during an open quote's validity window.
        </p>

        <div class="grid grid-cols-1 md:grid-cols-3 gap-2 mb-4">
          ${POLICY_OPTIONS.map(opt => {
            const selected = this._policy === opt.value;
            return html`
              <button
                @click=${() => { this._policy = opt.value; this._mark(); }}
                class="text-left p-3 rounded border transition
                       ${selected
                         ? `border-${opt.accent} bg-${opt.accent}/10`
                         : 'border-white/10 hover:border-white/30'}">
                <div class="font-medium text-white text-sm mb-1">${opt.label}</div>
                <div class="text-gray-400 text-xs">${opt.description}</div>
                <div class="text-${opt.accent} font-mono text-xs mt-2 uppercase">${opt.value}</div>
              </button>
            `;
          })}
        </div>

        <div class="grid grid-cols-1 md:grid-cols-2 gap-4 mb-3">
          <div>
            <label class="block text-xs text-gray-400 uppercase mb-1">Threshold</label>
            <div class="flex items-center gap-2">
              <input type="number" min="0.1" max="50" step="0.1"
                .value=${String(this._threshold)}
                @input=${(e: Event) => { this._threshold = parseFloat((e.target as HTMLInputElement).value) || 0; this._mark(); }}
                class="w-24 px-3 py-2 bg-deep-space border border-white/10 rounded text-white font-mono text-right focus:border-gable-green focus:outline-none" />
              <span class="text-gray-400 font-mono">%</span>
            </div>
            <div class="text-xs text-gray-500 mt-1">Industry default is 5%.</div>
          </div>

          ${this._policy === 'AUTO_ESCALATE' ? html`
            <div>
              <label class="block text-xs text-gray-400 uppercase mb-1">Agreement reference</label>
              <input type="text"
                .value=${this._agreementRef}
                @input=${(e: Event) => { this._agreementRef = (e.target as HTMLInputElement).value; this._mark(); }}
                placeholder="e.g. AGR-2026-0042"
                class="w-full px-3 py-2 bg-deep-space border border-white/10 rounded text-white font-mono text-sm focus:border-gable-green focus:outline-none" />
            </div>
          ` : ''}
        </div>

        ${this._policy === 'AUTO_ESCALATE' ? html`
          <div class="mb-3">
            <label class="block text-xs text-gray-400 uppercase mb-1">Agreement signed date</label>
            <input type="date"
              .value=${this._agreementSignedAt || ''}
              @input=${(e: Event) => { this._agreementSignedAt = (e.target as HTMLInputElement).value; this._mark(); }}
              class="px-3 py-2 bg-deep-space border border-white/10 rounded text-white font-mono text-sm focus:border-gable-green focus:outline-none" />
          </div>
        ` : ''}

        ${this._error ? html`
          <div class="text-safety-red text-sm bg-safety-red/10 border border-safety-red/30 px-3 py-2 rounded mb-3">
            ${this._error}
          </div>
        ` : ''}

        <div class="flex justify-end pt-2 border-t border-white/5">
          <button @click=${() => this._save()}
            ?disabled=${this._saving || !this._dirty}
            class="px-4 py-2 bg-gable-green text-black font-semibold rounded hover:opacity-90 transition disabled:opacity-40 disabled:cursor-not-allowed">
            ${this._saving ? 'Saving…' : 'Save Policy'}
          </button>
        </div>
      </section>
    `;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'gable-customer-policy-section': GableCustomerPolicySection;
  }
}
