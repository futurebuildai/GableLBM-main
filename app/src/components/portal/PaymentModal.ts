import { LitElement, html } from 'lit';
import { customElement, property, state } from 'lit/decorators.js';
import { icon } from '../../lib/icons.ts';
import { X, CreditCard, Landmark, Check } from 'lucide';

@customElement('gable-payment-modal')
export class PaymentModal extends LitElement {
    createRenderRoot() { return this; }

    @property({ type: Boolean }) open = false;
    @property({ type: Number }) amount = 0;
    
    @state() private selectedMethod = 'card';
    @state() private processing = false;
    @state() private success = false;

    private _close() {
        this.open = false;
        this.success = false;
        this.dispatchEvent(new CustomEvent('close'));
    }

    private async _processPayment() {
        this.processing = true;
        await new Promise(r => setTimeout(r, 1500));
        this.processing = false;
        this.success = true;
        setTimeout(() => {
            this._close();
            this.dispatchEvent(new CustomEvent('payment-success'));
        }, 1500);
    }

    render() {
        if (!this.open) return html``;
        
        return html`
            <div class="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
                <div class="bg-[#161821] border border-white/10 rounded-2xl w-full max-w-md shadow-2xl overflow-hidden">
                    <div class="flex items-center justify-between p-6 border-b border-white/10">
                        <h2 class="text-xl font-bold text-white">Make Payment</h2>
                        <button @click=${this._close} class="text-zinc-400 hover:text-white transition-colors">
                            ${icon(X, 20)}
                        </button>
                    </div>
                    
                    ${this.success ? html`
                        <div class="p-8 text-center">
                            <div class="w-16 h-16 bg-emerald-500/20 text-emerald-500 rounded-full flex items-center justify-center mx-auto mb-4">
                                ${icon(Check, 32)}
                            </div>
                            <h3 class="text-xl font-semibold text-white mb-2">Payment Successful!</h3>
                            <p class="text-zinc-400">Your payment of $${(this.amount/100).toFixed(2)} has been processed.</p>
                        </div>
                    ` : html`
                        <div class="p-6">
                            <div class="text-center mb-6">
                                <p class="text-zinc-400 text-sm">Total Due</p>
                                <h3 class="text-4xl font-mono font-bold text-white mt-1">$${(this.amount/100).toFixed(2)}</h3>
                            </div>
                            
                            <div class="space-y-3 mb-6">
                                <p class="text-sm font-medium text-white">Select Payment Method</p>
                                <label class="flex items-center gap-4 p-4 rounded-xl border ${this.selectedMethod === 'card' ? 'border-gable-green bg-gable-green/10' : 'border-white/10 hover:border-white/20'} cursor-pointer transition-colors">
                                    <input type="radio" name="method" value="card" ?checked=${this.selectedMethod === 'card'} @change=${() => this.selectedMethod = 'card'} class="hidden" />
                                    ${icon(CreditCard, 24, this.selectedMethod === 'card' ? 'text-gable-green' : 'text-zinc-400')}
                                    <div>
                                        <p class="font-medium text-white">Visa ending in 4242</p>
                                        <p class="text-xs text-zinc-400 mt-0.5">Expires 12/28</p>
                                    </div>
                                </label>
                                
                                <label class="flex items-center gap-4 p-4 rounded-xl border ${this.selectedMethod === 'ach' ? 'border-gable-green bg-gable-green/10' : 'border-white/10 hover:border-white/20'} cursor-pointer transition-colors">
                                    <input type="radio" name="method" value="ach" ?checked=${this.selectedMethod === 'ach'} @change=${() => this.selectedMethod = 'ach'} class="hidden" />
                                    ${icon(Landmark, 24, this.selectedMethod === 'ach' ? 'text-gable-green' : 'text-zinc-400')}
                                    <div>
                                        <p class="font-medium text-white">Chase Checking ...1234</p>
                                        <p class="text-xs text-zinc-400 mt-0.5">ACH Bank Transfer</p>
                                    </div>
                                </label>
                            </div>
                            
                            <button 
                                @click=${this._processPayment}
                                ?disabled=${this.processing}
                                class="w-full py-3 rounded-lg font-medium text-black bg-gable-green hover:bg-[#00e693] disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center justify-center gap-2"
                            >
                                ${this.processing ? html`<div class="w-5 h-5 border-2 border-black/20 border-t-black rounded-full animate-spin"></div> Processing...` : 'Pay Now'}
                            </button>
                        </div>
                    `}
                </div>
            </div>
        `;
    }
}
