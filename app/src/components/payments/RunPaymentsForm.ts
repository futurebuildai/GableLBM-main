import { LitElement, html } from 'lit';
import { customElement, property, state } from 'lit/decorators.js';
import { paymentService } from '../../services/paymentService';
import type { Payment } from '../../types/payment';

declare global {
  interface Window {
    Runner?: {
      init(opts: Record<string, unknown>): void;
      createToken(): Promise<{ token: string }>;
    };
  }
}

@customElement('gable-run-payments-form')
export class GableRunPaymentsForm extends LitElement {
  createRenderRoot() { return this; }

  @property({ type: String, attribute: 'invoice-id' }) invoiceId = '';
  @property({ type: Number, attribute: 'amount-cents' }) amountCents = 0;

  @state() private _loading = false;
  @state() private _initError: string | null = null;
  @state() private _notes = '';
  @state() private _demoMode = false;
  @state() private _demoCardNumber = '';

  get _displayAmount(): string {
    return (this.amountCents / 100).toFixed(2);
  }

  connectedCallback() {
    super.connectedCallback();
    this._fetchIntent();
  }

  private async _fetchIntent() {
    try {
      const intent = await paymentService.createPaymentIntent({
        invoice_id: this.invoiceId,
        amount: this.amountCents,
      });
      // public_key available from intent if needed for payment processor SDK

      if (typeof window.Runner !== 'undefined') {
        window.Runner.init({
          publicKey: intent.public_key,
          container: '#run-payments-container',
        });
      }
    } catch (err: unknown) {
      console.warn('Run Payments not available, using demo mode:', err instanceof Error ? err.message : 'Unknown error');
      this._demoMode = true;
    }
  }

  private async _handleSubmit(e: Event) {
    e.preventDefault();
    this._loading = true;

    try {
      let tokenId: string;

      if (this._demoMode) {
        tokenId = `demo_tok_${Date.now()}`;
      } else if (typeof window.Runner !== 'undefined') {
        const result = await window.Runner.createToken();
        tokenId = result.token;
      } else {
        throw new Error('Runner.js not loaded');
      }

      const payment: Payment = await paymentService.processCardPayment({
        invoice_id: this.invoiceId,
        token_id: tokenId,
        amount: this.amountCents,
        notes: this._notes,
      });

      this.dispatchEvent(new CustomEvent('success', { detail: payment, bubbles: true, composed: true }));
    } catch (err: unknown) {
      this.dispatchEvent(new CustomEvent('error', {
        detail: err instanceof Error ? err.message : 'Card payment failed',
        bubbles: true,
        composed: true,
      }));
    } finally {
      this._loading = false;
    }
  }

  private _handleCancel() {
    this.dispatchEvent(new CustomEvent('cancel', { bubbles: true, composed: true }));
  }

  render() {
    if (this._initError) {
      return html`
        <div style="padding:24px;text-align:center">
          <p style="color:#f85149;margin-bottom:16px">Warning: ${this._initError}</p>
          <button @click=${this._handleCancel} style="padding:10px 20px;background:transparent;border:1px solid #30363d;border-radius:8px;color:#c9d1d9;font-size:14px;cursor:pointer">Cancel</button>
        </div>
      `;
    }

    return html`
      <form @submit=${this._handleSubmit} style="display:flex;flex-direction:column;gap:16px;padding:24px;background:#0f1419;border-radius:12px;border:1px solid #2a3441;max-width:480px">
        <div style="display:flex;justify-content:space-between;align-items:center;padding-bottom:16px;border-bottom:1px solid #2a3441">
          <div style="display:flex;flex-direction:column">
            <span style="font-size:12px;color:#8b949e;text-transform:uppercase;letter-spacing:0.5px">Charge Amount</span>
            <span style="font-size:28px;font-weight:700;color:#e6edf3">$${this._displayAmount}</span>
          </div>
          <div style="font-size:11px;color:#6e7681">Powered by <strong>Run Payments</strong></div>
        </div>

        <div style="display:flex;flex-direction:column;gap:8px">
          ${this._demoMode ? html`
            <div>
              <div style="padding:8px 12px;background:#1a1f2e;border:1px solid #3a4553;border-radius:6px;font-size:12px;color:#f0c040;margin-bottom:12px;text-align:center">
                Demo Mode -- No live gateway configured
              </div>
              <label style="font-size:13px;font-weight:600;color:#c9d1d9;margin-bottom:4px;display:block">Card Number (demo)</label>
              <input type="text" placeholder="4242 4242 4242 4242"
                .value=${this._demoCardNumber}
                @input=${(e: InputEvent) => this._demoCardNumber = (e.target as HTMLInputElement).value}
                style="padding:10px 14px;background:#161b22;border:1px solid #30363d;border-radius:8px;color:#e6edf3;font-size:14px;width:100%;box-sizing:border-box;outline:none"
                maxlength="19"
              />
            </div>
          ` : html`
            <div>
              <label style="font-size:13px;font-weight:600;color:#c9d1d9;margin-bottom:4px;display:block">Card Details</label>
              <div id="run-payments-container" style="min-height:60px;background:#161b22;border:1px solid #30363d;border-radius:8px;padding:12px">
                <div style="color:#6e7681;font-size:13px;text-align:center">Loading secure payment form...</div>
              </div>
            </div>
          `}
        </div>

        <div style="display:flex;flex-direction:column;gap:4px">
          <label style="font-size:13px;font-weight:600;color:#c9d1d9;margin-bottom:4px;display:block">Notes (optional)</label>
          <input type="text" placeholder="e.g., Customer phone order"
            .value=${this._notes}
            @input=${(e: InputEvent) => this._notes = (e.target as HTMLInputElement).value}
            style="padding:10px 14px;background:#161b22;border:1px solid #30363d;border-radius:8px;color:#e6edf3;font-size:14px;width:100%;box-sizing:border-box;outline:none"
          />
        </div>

        <div style="display:flex;gap:12px;justify-content:flex-end;padding-top:12px">
          <button type="button" @click=${this._handleCancel} ?disabled=${this._loading}
            style="padding:10px 20px;background:transparent;border:1px solid #30363d;border-radius:8px;color:#c9d1d9;font-size:14px;cursor:pointer">
            Cancel
          </button>
          <button type="submit" ?disabled=${this._loading}
            style="padding:10px 24px;background:#238636;border:none;border-radius:8px;color:#fff;font-size:14px;font-weight:600;cursor:pointer">
            ${this._loading ? 'Processing...' : `Charge $${this._displayAmount}`}
          </button>
        </div>
      </form>
    `;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'gable-run-payments-form': GableRunPaymentsForm;
  }
}
