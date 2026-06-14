import { LitElement, html, nothing } from 'lit';
import { customElement, property, state } from 'lit/decorators.js';
import { icon } from '../../../lib/icons.ts';
import { ToastService } from '../../../lib/toast-service.ts';
import { Box, Save, Loader2, Ruler } from 'lucide';
import type { ProductDetail } from '../../../types/pim.ts';
import { PIMService } from '../../../services/PIMService.ts';
import '../../../components/product/ProductTwin3D.ts';

/**
 * Digital Modeler tab — edits the product's canonical parametric geometry
 * (actual inches) with a live true-scale 3D preview. These dimensions feed
 * AI_LM's load builder, where every order line renders as a bundle of these
 * exact boxes on the truck bed.
 */
@customElement('gable-product-twin-tab')
export class ProductTwinTab extends LitElement {
    createRenderRoot() { return this; }

    @property({ attribute: false }) product: ProductDetail | null = null;

    @state() private lengthIn = 0;
    @state() private widthIn = 0;
    @state() private heightIn = 0;
    @state() private stackable = true;
    @state() private saving = false;

    connectedCallback() {
        super.connectedCallback();
        this._syncFromProduct();
    }

    updated(changed: Map<string, unknown>) {
        if (changed.has('product')) this._syncFromProduct();
    }

    private _syncFromProduct() {
        const p = this.product;
        if (!p) return;
        this.lengthIn = p.length_in ?? 0;
        this.widthIn = p.width_in ?? 0;
        this.heightIn = p.height_in ?? 0;
        this.stackable = p.stackable ?? true;
    }

    private async _save() {
        if (!this.product) return;
        if (this.lengthIn <= 0 || this.widthIn <= 0 || this.heightIn <= 0) {
            ToastService.show('All three dimensions must be positive', 'error');
            return;
        }
        this.saving = true;
        try {
            await PIMService.updateDimensions(this.product.id, {
                length_in: this.lengthIn,
                width_in: this.widthIn,
                height_in: this.heightIn,
                stackable: this.stackable,
            });
            ToastService.show('Digital twin saved', 'success');
            this.dispatchEvent(new CustomEvent('twin-update', { bubbles: true }));
        } catch {
            ToastService.show('Failed to save dimensions', 'error');
        } finally {
            this.saving = false;
        }
    }

    private _dim(label: string, value: number, set: (v: number) => void) {
        return html`
            <label class="flex flex-col gap-1.5">
                <span class="text-xs text-zinc-400 uppercase tracking-wide">${label}</span>
                <input
                    type="number"
                    min="0"
                    step="0.125"
                    .value=${String(value || '')}
                    @input=${(e: Event) => set(Number((e.target as HTMLInputElement).value))}
                    class="bg-[#0A0B10] border border-white/10 rounded-lg px-3 py-2 text-sm font-mono text-white text-right focus:outline-none focus:ring-1 focus:ring-gable-green/50 w-full"
                />
            </label>
        `;
    }

    render() {
        const p = this.product;
        if (!p) return nothing;
        const ft = (v: number) => (v > 0 ? `${(v / 12).toFixed(v % 12 === 0 ? 0 : 2)} ft` : '—');
        return html`
            <div class="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <div class="space-y-5">
                    <div class="rounded-xl border border-white/5 bg-[#161821] p-5 space-y-4">
                        <h3 class="text-sm font-semibold text-white flex items-center gap-2">
                            ${icon(Ruler, 16, 'text-gable-green')} Actual Dimensions
                        </h3>
                        <p class="text-xs text-zinc-500">
                            True physical size per unit (e.g. a nominal 2×4×8 is 1.5″ × 3.5″ × 96″).
                            These feed the AI Load Manager's truck packing as this product's digital twin.
                        </p>
                        <div class="grid grid-cols-3 gap-3">
                            ${this._dim('Length (in)', this.lengthIn, (v) => { this.lengthIn = v; })}
                            ${this._dim('Width (in)', this.widthIn, (v) => { this.widthIn = v; })}
                            ${this._dim('Height (in)', this.heightIn, (v) => { this.heightIn = v; })}
                        </div>
                        <div class="grid grid-cols-3 gap-3 text-center text-[11px] font-mono text-zinc-500">
                            <span>${ft(this.lengthIn)}</span><span>${ft(this.widthIn)}</span><span>${ft(this.heightIn)}</span>
                        </div>
                        <label class="flex items-center gap-2 text-sm text-zinc-300 cursor-pointer">
                            <input
                                type="checkbox"
                                .checked=${this.stackable}
                                @change=${(e: Event) => { this.stackable = (e.target as HTMLInputElement).checked; }}
                                class="accent-[#00FFA3]"
                            />
                            Stackable (other material may be loaded on top)
                        </label>
                        <div class="flex items-center justify-between pt-2 border-t border-white/5">
                            <span class="text-xs font-mono px-2 py-1 rounded border ${p.geometry_source === 'MANUAL'
                                ? 'text-gable-green border-gable-green/40 bg-gable-green/10'
                                : 'text-zinc-500 border-white/10'}">
                                ${p.geometry_source === 'MANUAL' ? 'MODELED' : p.geometry_source || 'NOT MODELED'}
                            </span>
                            <button
                                @click=${this._save}
                                ?disabled=${this.saving}
                                class="flex items-center gap-2 bg-gable-green text-black font-semibold px-4 py-2 rounded-lg hover:opacity-90 transition-all disabled:opacity-50 text-sm"
                            >
                                ${this.saving ? icon(Loader2, 16, 'animate-spin') : icon(Save, 16)} Save digital twin
                            </button>
                        </div>
                    </div>

                    <div class="rounded-xl border border-white/5 bg-[#161821] p-5">
                        <h3 class="text-sm font-semibold text-white flex items-center gap-2 mb-3">
                            ${icon(Box, 16, 'text-blueprint-blue')} Derived
                        </h3>
                        <dl class="grid grid-cols-2 gap-y-2 text-sm">
                            <dt class="text-zinc-400">Volume / unit</dt>
                            <dd class="font-mono text-right text-zinc-200">
                                ${this.lengthIn > 0 && this.widthIn > 0 && this.heightIn > 0
                                    ? `${((this.lengthIn * this.widthIn * this.heightIn) / 1728).toFixed(2)} ft³`
                                    : '—'}
                            </dd>
                            <dt class="text-zinc-400">Weight / unit</dt>
                            <dd class="font-mono text-right text-zinc-200">${(p.weight_lbs || 0).toFixed(1)} lb</dd>
                        </dl>
                    </div>
                </div>

                <gable-product-twin-3d
                    .lengthIn=${this.lengthIn}
                    .widthIn=${this.widthIn}
                    .heightIn=${this.heightIn}
                    .sku=${p.sku}
                ></gable-product-twin-3d>
            </div>
        `;
    }
}
