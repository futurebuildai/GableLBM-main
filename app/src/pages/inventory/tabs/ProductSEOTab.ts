import { LitElement, html, nothing } from 'lit';
import { customElement, property, state } from 'lit/decorators.js';
import { icon } from '../../../lib/icons.ts';
import { Sparkles, Save, Loader2, Search, X, Globe } from 'lucide';
import { PIMService } from '../../../services/PIMService.ts';
import { ToastService } from '../../../lib/toast-service.ts';
import type { PIMContent } from '../../../types/pim.ts';

@customElement('gable-product-seo-tab')
export class GableProductSEOTab extends LitElement {
    createRenderRoot() { return this; }

    @property({ type: String }) productId = '';
    @property({ attribute: false }) content: PIMContent | null = null;

    @state() private generating = false;
    @state() private saving = false;
    @state() private _seoTitle = '';
    @state() private _seoDescription = '';
    @state() private keywords: string[] = [];
    @state() private slug = '';
    @state() private keywordInput = '';

    private _lastContentRef: PIMContent | null = null;

    willUpdate(changedProperties: Map<string, unknown>) {
        if (changedProperties.has('content') && this.content !== this._lastContentRef) {
            this._lastContentRef = this.content;
            this._seoTitle = this.content?.seo_title || '';
            this._seoDescription = this.content?.seo_description || '';
            this.keywords = this.content?.seo_keywords || [];
            this.slug = this.content?.seo_slug || '';
        }
    }

    private async _handleGenerate() {
        this.generating = true;
        try {
            const result = await PIMService.generateSEO(this.productId, { target_keywords: this.keywords.length > 0 ? this.keywords : [] });
            this.dispatchEvent(new CustomEvent('content-update', { detail: result, bubbles: true, composed: true }));
        } catch (err) {
            console.error('Generate SEO failed:', err);
            ToastService.show('Failed to generate SEO content', 'error');
        } finally {
            this.generating = false;
        }
    }

    private async _handleSave() {
        this.saving = true;
        try {
            const result = await PIMService.updateContent(this.productId, {
                seo_title: this._seoTitle,
                seo_description: this._seoDescription,
                seo_keywords: this.keywords,
                seo_slug: this.slug,
            });
            this.dispatchEvent(new CustomEvent('content-update', { detail: result, bubbles: true, composed: true }));
        } catch (err) {
            console.error('Save SEO failed:', err);
            ToastService.show('Failed to save SEO changes', 'error');
        } finally {
            this.saving = false;
        }
    }

    private _addKeyword() {
        const kw = this.keywordInput.trim().toLowerCase();
        if (kw && !this.keywords.includes(kw)) {
            this.keywords = [...this.keywords, kw];
        }
        this.keywordInput = '';
    }

    private _removeKeyword(kw: string) {
        this.keywords = this.keywords.filter(k => k !== kw);
    }

    render() {
        return html`
            <div class="space-y-6">
                <!-- Generate Button -->
                <div class="bg-zinc-900 border border-white/10 rounded-xl p-5">
                    <div class="flex items-center justify-between">
                        <h3 class="text-sm font-medium text-zinc-300 flex items-center gap-2">
                            ${icon(Sparkles, 16, 'w-4 h-4 text-amber-400')}
                            AI SEO Generation
                        </h3>
                        <button
                            @click=${this._handleGenerate}
                            ?disabled=${this.generating}
                            class="flex items-center gap-2 px-4 py-2 bg-amber-500/20 text-amber-400 border border-amber-500/30 rounded-lg hover:bg-amber-500/30 transition-colors disabled:opacity-50"
                        >
                            ${this.generating ? icon(Loader2, 16, 'w-4 h-4 animate-spin') : icon(Sparkles, 16, 'w-4 h-4')}
                            ${this.generating ? 'Generating...' : 'Generate SEO'}
                        </button>
                    </div>
                </div>

                <!-- Meta Title -->
                <div class="bg-zinc-900 border border-white/10 rounded-xl p-4">
                    <div class="flex items-center justify-between mb-2">
                        <label class="text-sm font-medium text-zinc-400">Meta Title</label>
                        <span class="text-xs ${this._seoTitle.length > 60 ? 'text-rose-400' : 'text-zinc-500'}">
                            ${this._seoTitle.length}/60
                        </span>
                    </div>
                    <input
                        type="text"
                        .value=${this._seoTitle}
                        @input=${(e: InputEvent) => this._seoTitle = (e.target as HTMLInputElement).value}
                        placeholder="SEO page title..."
                        class="w-full bg-zinc-800 border border-white/10 rounded-lg px-3 py-2 text-sm text-white placeholder-zinc-600 focus:outline-none focus:border-gable-green/50"
                    />
                </div>

                <!-- Meta Description -->
                <div class="bg-zinc-900 border border-white/10 rounded-xl p-4">
                    <div class="flex items-center justify-between mb-2">
                        <label class="text-sm font-medium text-zinc-400">Meta Description</label>
                        <span class="text-xs ${this._seoDescription.length > 160 ? 'text-rose-400' : 'text-zinc-500'}">
                            ${this._seoDescription.length}/160
                        </span>
                    </div>
                    <textarea
                        .value=${this._seoDescription}
                        @input=${(e: InputEvent) => this._seoDescription = (e.target as HTMLTextAreaElement).value}
                        rows="3"
                        placeholder="SEO meta description..."
                        class="w-full bg-zinc-800 border border-white/10 rounded-lg px-3 py-2 text-sm text-white placeholder-zinc-600 resize-none focus:outline-none focus:border-gable-green/50"
                    ></textarea>
                </div>

                <!-- Keywords -->
                <div class="bg-zinc-900 border border-white/10 rounded-xl p-4">
                    <label class="text-sm font-medium text-zinc-400 mb-2 block">Keywords</label>
                    <div class="flex flex-wrap gap-2 mb-3">
                        ${this.keywords.map(kw => html`
                            <span class="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs bg-gable-green/10 border border-gable-green/20 text-gable-green">
                                ${kw}
                                <button @click=${() => this._removeKeyword(kw)} class="hover:text-white">
                                    ${icon(X, 12, 'w-3 h-3')}
                                </button>
                            </span>
                        `)}
                    </div>
                    <div class="flex gap-2">
                        <input
                            type="text"
                            .value=${this.keywordInput}
                            @input=${(e: InputEvent) => this.keywordInput = (e.target as HTMLInputElement).value}
                            @keydown=${(e: KeyboardEvent) => { if (e.key === 'Enter') { e.preventDefault(); this._addKeyword(); } }}
                            placeholder="Add keyword..."
                            class="flex-1 bg-zinc-800 border border-white/10 rounded-lg px-3 py-2 text-sm text-white placeholder-zinc-600 focus:outline-none focus:border-gable-green/50"
                        />
                        <button @click=${this._addKeyword} class="px-3 py-2 bg-white/5 border border-white/10 rounded-lg text-sm text-zinc-300 hover:bg-white/10">
                            Add
                        </button>
                    </div>
                </div>

                <!-- URL Slug -->
                <div class="bg-zinc-900 border border-white/10 rounded-xl p-4">
                    <label class="text-sm font-medium text-zinc-400 mb-2 block">URL Slug</label>
                    <div class="flex items-center gap-2">
                        <span class="text-zinc-500 text-sm">/products/</span>
                        <input
                            type="text"
                            .value=${this.slug}
                            @input=${(e: InputEvent) => this.slug = (e.target as HTMLInputElement).value}
                            placeholder="url-friendly-slug"
                            class="flex-1 bg-zinc-800 border border-white/10 rounded-lg px-3 py-2 text-sm text-white font-mono placeholder-zinc-600 focus:outline-none focus:border-gable-green/50"
                        />
                    </div>
                </div>

                <!-- Google Preview -->
                ${(this._seoTitle || this._seoDescription) ? html`
                    <div class="bg-zinc-900 border border-white/10 rounded-xl p-5">
                        <h3 class="text-sm font-medium text-zinc-400 flex items-center gap-2 mb-4">
                            ${icon(Globe, 16, 'w-4 h-4')}
                            Google Search Preview
                        </h3>
                        <div class="bg-white rounded-lg p-4 max-w-[600px]">
                            <div class="flex items-center gap-2 text-xs text-gray-500 mb-1">
                                ${icon(Search, 12, 'w-3 h-3')}
                                www.example.com/products/${this.slug || '...'}
                            </div>
                            <div class="text-blue-700 text-lg hover:underline cursor-pointer leading-snug">
                                ${this._seoTitle || 'Page Title'}
                            </div>
                            <div class="text-gray-600 text-sm mt-1 line-clamp-2">
                                ${this._seoDescription || 'Meta description will appear here...'}
                            </div>
                        </div>
                    </div>
                ` : nothing}

                <!-- Save -->
                <div class="flex justify-end">
                    <button
                        @click=${this._handleSave}
                        ?disabled=${this.saving}
                        class="flex items-center gap-2 px-5 py-2.5 bg-gable-green/20 text-gable-green border border-gable-green/30 rounded-lg hover:bg-gable-green/30 transition-colors disabled:opacity-50"
                    >
                        ${this.saving ? icon(Loader2, 16, 'w-4 h-4 animate-spin') : icon(Save, 16, 'w-4 h-4')}
                        ${this.saving ? 'Saving...' : 'Save SEO'}
                    </button>
                </div>
            </div>
        `;
    }
}
