import { LitElement, html, nothing } from 'lit';
import { customElement, property, state } from 'lit/decorators.js';
import { icon } from '../../../lib/icons.ts';
import { Sparkles, Save, Loader2 } from 'lucide';
import { PIMService } from '../../../services/PIMService.ts';
import { ToastService } from '../../../lib/toast-service.ts';
import type { PIMContent } from '../../../types/pim.ts';

const TONES = ['professional', 'casual', 'technical', 'persuasive'];
const AUDIENCES = ['contractors and builders', 'DIY homeowners', 'architects and designers', 'wholesale buyers'];

@customElement('gable-product-content-tab')
export class GableProductContentTab extends LitElement {
    createRenderRoot() { return this; }

    @property({ type: String }) productId = '';
    @property({ attribute: false }) content: PIMContent | null = null;

    @state() private tone = 'professional';
    @state() private audience = 'contractors and builders';
    @state() private generating = false;
    @state() private saving = false;
    @state() private shortDesc = '';
    @state() private longDesc = '';
    @state() private marketingCopy = '';
    @state() private _productAttributes: Record<string, string> = {};

    private _lastContentRef: PIMContent | null = null;

    willUpdate(changedProperties: Map<string, unknown>) {
        if (changedProperties.has('content') && this.content !== this._lastContentRef) {
            this._lastContentRef = this.content;
            this.shortDesc = this.content?.short_description || '';
            this.longDesc = this.content?.long_description || '';
            this.marketingCopy = this.content?.marketing_copy || '';
            this._productAttributes = this.content?.attributes || {};
        }
    }

    private async _handleGenerate() {
        this.generating = true;
        try {
            const result = await PIMService.generateDescriptions(this.productId, { tone: this.tone, audience: this.audience });
            this.dispatchEvent(new CustomEvent('content-update', { detail: result, bubbles: true, composed: true }));
        } catch (err) {
            console.error('Generate failed:', err);
            ToastService.show('Failed to generate content', 'error');
        } finally {
            this.generating = false;
        }
    }

    private async _handleSave() {
        this.saving = true;
        try {
            const result = await PIMService.updateContent(this.productId, {
                short_description: this.shortDesc,
                long_description: this.longDesc,
                marketing_copy: this.marketingCopy,
                attributes: this._productAttributes,
            });
            this.dispatchEvent(new CustomEvent('content-update', { detail: result, bubbles: true, composed: true }));
        } catch (err) {
            console.error('Save failed:', err);
            ToastService.show('Failed to save content changes', 'error');
        } finally {
            this.saving = false;
        }
    }

    private _renderTextArea(label: string, value: string, onChange: (v: string) => void, rows = 3, maxLength?: number) {
        return html`
            <div class="bg-zinc-900 border border-white/10 rounded-xl p-4">
                <div class="flex items-center justify-between mb-2">
                    <label class="text-sm font-medium text-zinc-400">${label}</label>
                    ${maxLength ? html`
                        <span class="text-xs ${value.length > maxLength ? 'text-rose-400' : 'text-zinc-500'}">
                            ${value.length}/${maxLength}
                        </span>
                    ` : nothing}
                </div>
                <textarea
                    .value=${value}
                    @input=${(e: InputEvent) => onChange((e.target as HTMLTextAreaElement).value)}
                    rows="${rows}"
                    class="w-full bg-zinc-800 border border-white/10 rounded-lg px-3 py-2 text-sm text-white placeholder-zinc-600 resize-none focus:outline-none focus:border-gable-green/50"
                    placeholder="Enter ${label.toLowerCase()}..."
                ></textarea>
            </div>
        `;
    }

    render() {
        return html`
            <div class="space-y-6">
                <!-- Generation Controls -->
                <div class="bg-zinc-900 border border-white/10 rounded-xl p-5">
                    <div class="flex items-center justify-between mb-4">
                        <h3 class="text-sm font-medium text-zinc-300 flex items-center gap-2">
                            ${icon(Sparkles, 16, 'w-4 h-4 text-amber-400')}
                            AI Content Generation
                        </h3>
                        ${this.content?.last_gen_at ? html`
                            <span class="text-xs text-zinc-500">
                                Last generated: ${new Date(this.content.last_gen_at).toLocaleString()}
                            </span>
                        ` : nothing}
                    </div>
                    <div class="flex flex-wrap items-end gap-4">
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
                </div>

                <!-- Editable Descriptions -->
                <div class="space-y-4">
                    ${this._renderTextArea('Short Description', this.shortDesc, (v) => this.shortDesc = v, 2, 160)}
                    ${this._renderTextArea('Long Description', this.longDesc, (v) => this.longDesc = v, 5)}
                    ${this._renderTextArea('Marketing Copy', this.marketingCopy, (v) => this.marketingCopy = v, 5)}
                </div>

                <!-- Attributes -->
                ${Object.keys(this._productAttributes).length > 0 ? html`
                    <div class="bg-zinc-900 border border-white/10 rounded-xl p-5">
                        <h3 class="text-sm font-medium text-zinc-300 mb-3">Extracted Attributes</h3>
                        <div class="flex flex-wrap gap-2">
                            ${Object.entries(this._productAttributes).map(([key, value]) =>
                                value ? html`
                                    <span class="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs bg-white/5 border border-white/10 text-zinc-300">
                                        <span class="text-zinc-500">${key}:</span> ${value}
                                    </span>
                                ` : nothing
                            )}
                        </div>
                    </div>
                ` : nothing}

                <!-- Save Button -->
                <div class="flex justify-end">
                    <button
                        @click=${this._handleSave}
                        ?disabled=${this.saving}
                        class="flex items-center gap-2 px-5 py-2.5 bg-gable-green/20 text-gable-green border border-gable-green/30 rounded-lg hover:bg-gable-green/30 transition-colors disabled:opacity-50"
                    >
                        ${this.saving ? icon(Loader2, 16, 'w-4 h-4 animate-spin') : icon(Save, 16, 'w-4 h-4')}
                        ${this.saving ? 'Saving...' : 'Save Changes'}
                    </button>
                </div>
            </div>
        `;
    }
}
