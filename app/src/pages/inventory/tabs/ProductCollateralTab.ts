import { LitElement, html, nothing } from 'lit';
import { customElement, property, state } from 'lit/decorators.js';
import { icon } from '../../../lib/icons.ts';
import { Sparkles, Trash2, Copy, Loader2, FileText, RefreshCw, AlertTriangle } from 'lucide';
import { PIMService } from '../../../services/PIMService.ts';
import { ToastService } from '../../../lib/toast-service.ts';
import type { PIMCollateral, CollateralType } from '../../../types/pim.ts';

const TYPES: { value: CollateralType; label: string }[] = [
    { value: 'sell_sheet', label: 'Sell Sheet' },
    { value: 'facebook', label: 'Facebook Post' },
    { value: 'instagram', label: 'Instagram Caption' },
    { value: 'linkedin', label: 'LinkedIn Post' },
    { value: 'email_blast', label: 'Email Blast' },
];

const TONES = ['professional', 'casual', 'technical', 'persuasive', 'urgent'];
const AUDIENCES = ['contractors and builders', 'DIY homeowners', 'architects and designers', 'wholesale buyers', 'general public'];

@customElement('gable-product-collateral-tab')
export class GableProductCollateralTab extends LitElement {
    createRenderRoot() { return this; }

    @property({ type: String }) productId = '';
    @property({ attribute: false }) collateral: PIMCollateral[] = [];

    @state() private type: CollateralType = 'sell_sheet';
    @state() private tone = 'professional';
    @state() private audience = 'contractors and builders';
    @state() private generating = false;
    @state() private copiedId: string | null = null;
    @state() private error: string | null = null;

    private _copiedTimer: ReturnType<typeof setTimeout> | null = null;

    disconnectedCallback() {
        super.disconnectedCallback();
        if (this._copiedTimer) clearTimeout(this._copiedTimer);
    }

    private async _handleGenerate() {
        this.generating = true;
        this.error = null;
        try {
            await PIMService.generateCollateral(this.productId, { type: this.type, tone: this.tone, audience: this.audience });
            this.dispatchEvent(new CustomEvent('collateral-update', { bubbles: true, composed: true }));
        } catch (err: unknown) {
            const msg = err instanceof Error ? err.message : 'Collateral generation failed';
            this.error = msg;
        } finally {
            this.generating = false;
        }
    }

    private async _handleDelete(collateralId: string) {
        try {
            await PIMService.deleteCollateral(this.productId, collateralId);
            this.dispatchEvent(new CustomEvent('collateral-update', { bubbles: true, composed: true }));
        } catch (err) {
            console.error('Delete failed:', err);
            ToastService.show('Failed to delete collateral', 'error');
        }
    }

    private _handleCopy(id: string, text: string) {
        navigator.clipboard.writeText(text).catch(() => ToastService.show('Failed to copy to clipboard', 'error'));
        this.copiedId = id;
        this._copiedTimer = setTimeout(() => { this.copiedId = null; }, 2000);
    }

    private _typeLabel(t: string): string {
        return TYPES.find(x => x.value === t)?.label || t;
    }

    render() {
        return html`
            <div class="space-y-6">
                <!-- Generation Controls -->
                <div class="bg-zinc-900 border border-white/10 rounded-xl p-5">
                    <h3 class="text-sm font-medium text-zinc-300 flex items-center gap-2 mb-4">
                        ${icon(Sparkles, 16, 'w-4 h-4 text-amber-400')}
                        AI Collateral Generation
                    </h3>
                    <div class="flex flex-wrap items-end gap-4">
                        <div>
                            <label class="block text-xs text-zinc-500 mb-1">Type</label>
                            <select
                                .value=${this.type}
                                @change=${(e: Event) => this.type = (e.target as HTMLSelectElement).value as CollateralType}
                                class="bg-zinc-800 border border-white/10 rounded-lg px-3 py-2 text-sm text-white"
                            >
                                ${TYPES.map(t => html`<option value="${t.value}">${t.label}</option>`)}
                            </select>
                        </div>
                        <div>
                            <label class="block text-xs text-zinc-500 mb-1">Tone</label>
                            <select
                                .value=${this.tone}
                                @change=${(e: Event) => this.tone = (e.target as HTMLSelectElement).value}
                                class="bg-zinc-800 border border-white/10 rounded-lg px-3 py-2 text-sm text-white"
                            >
                                ${TONES.map(t => html`<option value="${t}">${t.charAt(0).toUpperCase() + t.slice(1)}</option>`)}
                            </select>
                        </div>
                        <div>
                            <label class="block text-xs text-zinc-500 mb-1">Audience</label>
                            <select
                                .value=${this.audience}
                                @change=${(e: Event) => this.audience = (e.target as HTMLSelectElement).value}
                                class="bg-zinc-800 border border-white/10 rounded-lg px-3 py-2 text-sm text-white"
                            >
                                ${AUDIENCES.map(a => html`<option value="${a}">${a.charAt(0).toUpperCase() + a.slice(1)}</option>`)}
                            </select>
                        </div>
                        <button
                            @click=${this._handleGenerate}
                            ?disabled=${this.generating}
                            class="flex items-center gap-2 px-4 py-2 bg-amber-500/20 text-amber-400 border border-amber-500/30 rounded-lg hover:bg-amber-500/30 transition-colors disabled:opacity-50"
                        >
                            ${this.generating ? icon(Loader2, 16, 'w-4 h-4 animate-spin') : icon(Sparkles, 16, 'w-4 h-4')}
                            ${this.generating ? 'Generating...' : 'Generate'}
                        </button>
                    </div>
                    ${this.error ? html`
                        <div class="flex items-start gap-2 p-3 mt-4 bg-rose-500/10 border border-rose-500/20 rounded-lg text-sm text-rose-400">
                            ${icon(AlertTriangle, 16, 'w-4 h-4 mt-0.5 shrink-0')}
                            <span>${this.error}</span>
                        </div>
                    ` : nothing}
                </div>

                <!-- Collateral Items -->
                ${this.collateral.length === 0
                    ? html`
                        <div class="bg-zinc-900 border border-white/10 rounded-xl p-12 text-center">
                            ${icon(FileText, 48, 'w-12 h-12 text-zinc-600 mx-auto mb-3')}
                            <p class="text-zinc-500 text-sm">No collateral yet. Generate some using AI above.</p>
                        </div>
                    `
                    : html`
                        <div class="space-y-4">
                            ${this.collateral.map(c => html`
                                <div class="bg-zinc-900 border border-white/10 rounded-xl p-5">
                                    <div class="flex items-start justify-between mb-3">
                                        <div>
                                            <div class="flex items-center gap-2 mb-1">
                                                <span class="px-2 py-0.5 bg-white/5 border border-white/10 rounded text-xs font-medium text-zinc-300">
                                                    ${this._typeLabel(c.collateral_type)}
                                                </span>
                                                <span class="text-xs text-zinc-500">${c.tone} / ${c.audience}</span>
                                            </div>
                                            <h4 class="text-white font-medium">${c.title}</h4>
                                        </div>
                                        <div class="flex items-center gap-1.5">
                                            <button
                                                @click=${() => this._handleCopy(c.id, c.content)}
                                                class="p-1.5 rounded-md hover:bg-white/10 text-zinc-400 hover:text-white transition-colors"
                                                title="Copy to clipboard"
                                            >
                                                ${this.copiedId === c.id ? icon(RefreshCw, 16, 'w-4 h-4 text-gable-green') : icon(Copy, 16, 'w-4 h-4')}
                                            </button>
                                            <button
                                                @click=${() => this._handleDelete(c.id)}
                                                class="p-1.5 rounded-md hover:bg-rose-500/20 text-zinc-400 hover:text-rose-400 transition-colors"
                                                title="Delete"
                                            >
                                                ${icon(Trash2, 16, 'w-4 h-4')}
                                            </button>
                                        </div>
                                    </div>
                                    <pre class="whitespace-pre-wrap text-sm text-zinc-300 bg-zinc-800/50 rounded-lg p-3 font-sans">${c.content}</pre>
                                    ${c.generated_at ? html`
                                        <div class="mt-2 text-xs text-zinc-600">
                                            Generated ${new Date(c.generated_at).toLocaleString()} by ${c.gen_model}
                                        </div>
                                    ` : nothing}
                                </div>
                            `)}
                        </div>
                    `
                }
            </div>
        `;
    }
}
