import { LitElement, html } from 'lit';
import { customElement, property, state } from 'lit/decorators.js';
import { icon } from '../../lib/icons.ts';
import { X, FileText, Check } from 'lucide';

@customElement('gable-quick-quote-modal')
export class QuickQuoteModal extends LitElement {
    createRenderRoot() { return this; }

    @property({ type: Boolean }) open = false;
    
    @state() private submitting = false;
    @state() private success = false;
    
    @state() private project = '';
    @state() private description = '';

    private _close() {
        this.open = false;
        this.success = false;
        this.project = '';
        this.description = '';
        this.dispatchEvent(new CustomEvent('close'));
    }

    private async _submitQuote(e: Event) {
        e.preventDefault();
        this.submitting = true;
        await new Promise(r => setTimeout(r, 1500));
        this.submitting = false;
        this.success = true;
        setTimeout(() => {
            this._close();
        }, 2000);
    }

    render() {
        if (!this.open) return html``;
        
        return html`
            <div class="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
                <div class="bg-[#161821] border border-white/10 rounded-2xl w-full max-w-lg shadow-2xl overflow-hidden">
                    <div class="flex items-center justify-between p-6 border-b border-white/10">
                        <h2 class="text-xl font-bold text-white flex items-center gap-2">
                            ${icon(FileText, 20, 'text-gable-green')} Request Quick Quote
                        </h2>
                        <button @click=${this._close} class="text-zinc-400 hover:text-white transition-colors">
                            ${icon(X, 20)}
                        </button>
                    </div>
                    
                    ${this.success ? html`
                        <div class="p-8 text-center">
                            <div class="w-16 h-16 bg-emerald-500/20 text-emerald-500 rounded-full flex items-center justify-center mx-auto mb-4">
                                ${icon(Check, 32)}
                            </div>
                            <h3 class="text-xl font-semibold text-white mb-2">Quote Requested!</h3>
                            <p class="text-zinc-400">Our sales team will review your request and get back to you shortly.</p>
                        </div>
                    ` : html`
                        <form @submit=${this._submitQuote} class="p-6">
                            <div class="space-y-4 mb-6">
                                <div>
                                    <label class="block text-sm font-medium text-zinc-300 mb-1">Project Name / PO</label>
                                    <input 
                                        type="text" 
                                        required
                                        .value=${this.project}
                                        @input=${(e: Event) => this.project = (e.target as HTMLInputElement).value}
                                        class="w-full bg-white/5 border border-white/10 rounded-lg px-4 py-2.5 text-white focus:outline-none focus:border-gable-green transition-colors"
                                        placeholder="e.g. 123 Main St Renovation"
                                    />
                                </div>
                                
                                <div>
                                    <label class="block text-sm font-medium text-zinc-300 mb-1">Materials Needed</label>
                                    <textarea 
                                        required
                                        rows="4"
                                        .value=${this.description}
                                        @input=${(e: Event) => this.description = (e.target as HTMLTextAreaElement).value}
                                        class="w-full bg-white/5 border border-white/10 rounded-lg px-4 py-2.5 text-white focus:outline-none focus:border-gable-green transition-colors resize-none"
                                        placeholder="List the materials you need quoted..."
                                    ></textarea>
                                </div>
                                
                                <div>
                                    <label class="block text-sm font-medium text-zinc-300 mb-1">Delivery Requirement</label>
                                    <select class="w-full bg-white/5 border border-white/10 rounded-lg px-4 py-2.5 text-white focus:outline-none focus:border-gable-green transition-colors appearance-none">
                                        <option value="asap">ASAP</option>
                                        <option value="next_week">Next Week</option>
                                        <option value="flexible">Flexible</option>
                                    </select>
                                </div>
                            </div>
                            
                            <div class="flex justify-end gap-3">
                                <button 
                                    type="button"
                                    @click=${this._close}
                                    class="px-4 py-2 rounded-lg font-medium text-white hover:bg-white/5 transition-colors"
                                >
                                    Cancel
                                </button>
                                <button 
                                    type="submit"
                                    ?disabled=${this.submitting}
                                    class="px-6 py-2 rounded-lg font-medium text-black bg-gable-green hover:bg-[#00e693] disabled:opacity-50 transition-colors flex items-center gap-2"
                                >
                                    ${this.submitting ? html`<div class="w-4 h-4 border-2 border-black/20 border-t-black rounded-full animate-spin"></div> Submitting...` : 'Submit Request'}
                                </button>
                            </div>
                        </form>
                    `}
                </div>
            </div>
        `;
    }
}
