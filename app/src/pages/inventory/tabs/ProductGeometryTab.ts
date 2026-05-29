import { LitElement, html } from 'lit';
import { customElement, property, state } from 'lit/decorators.js';
import { icon } from '../../../lib/icons.ts';
import { Save, Loader2, Box } from 'lucide';
import { PIMService } from '../../../services/PIMService.ts';
import { ToastService } from '../../../lib/toast-service.ts';
import type { ProductDetail } from '../../../types/pim.ts';
import '../../../components/product/ProductTwin3D.ts';

/**
 * <gable-product-geometry-tab> — the PIM editor for a product's canonical
 * parametric 3D geometry. L/W/H (inches) + a stackable toggle drive a live
 * <gable-product-twin-3d> preview that uses the same 1in=1/12 scaling as AI_LM's
 * Load Builder, so what the merchandiser sees here matches the loaded truck.
 */
@customElement('gable-product-geometry-tab')
export class GableProductGeometryTab extends LitElement {
    createRenderRoot() { return this; }

    @property({ attribute: false }) product: ProductDetail | null = null;

    @state() private lengthIn: number | null = null;
    @state() private widthIn: number | null = null;
    @state() private heightIn: number | null = null;
    @state() private stackable = true;
    @state() private saving = false;

    private _lastProductRef: ProductDetail | null = null;

    willUpdate(changed: Map<string, unknown>) {
        if (changed.has('product') && this.product !== this._lastProductRef) {
            this._lastProductRef = this.product;
            this.lengthIn = this.product?.length_in ?? null;
            this.widthIn = this.product?.width_in ?? null;
            this.heightIn = this.product?.height_in ?? null;
            this.stackable = this.product?.stackable ?? true;
        }
    }

    private _parse(v: string): number | null {
        const n = parseFloat(v);
        return v.trim() === '' || isNaN(n) ? null : n;
    }

    private async _handleSave() {
        if (!this.product) return;
        this.saving = true;
        try {
            await PIMService.updateDimensions(this.product.id, {
                length_in: this.lengthIn,
                width_in: this.widthIn,
                height_in: this.heightIn,
                stackable: this.stackable,
                geometry_source: this.product.geometry_source || 'parametric',
            });
            ToastService.show('Dimensions saved', 'success');
            this.dispatchEvent(new CustomEvent('dimensions-update', { bubbles: true, composed: true }));
        } catch (err) {
            console.error('Save dimensions failed:', err);
            ToastService.show('Failed to save dimensions', 'error');
        } finally {
            this.saving = false;
        }
    }

    private _renderNumberInput(label: string, value: number | null, onChange: (v: number | null) => void) {
        return html`
            <div>
                <label class="block text-xs text-zinc-500 mb-1">${label} <span class="text-zinc-600">(in)</span></label>
                <input
                    type="number"
                    min="0"
                    step="0.25"
                    .value=${value === null ? '' : String(value)}
                    @input=${(e: InputEvent) => onChange(this._parse((e.target as HTMLInputElement).value))}
                    class="w-full bg-zinc-800 border border-white/10 rounded-lg px-3 py-2 text-sm text-white font-mono placeholder-zinc-600 focus:outline-none focus:border-gable-green/50"
                    placeholder="—"
                />
            </div>
        `;
    }

    render() {
        return html`
            <div class="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <!-- Editor -->
                <div class="space-y-5">
                    <div class="bg-zinc-900 border border-white/10 rounded-xl p-5">
                        <h3 class="text-sm font-medium text-zinc-300 flex items-center gap-2 mb-4">
                            ${icon(Box, 16, 'w-4 h-4 text-gable-green')}
                            Parametric Dimensions
                        </h3>
                        <p class="text-xs text-zinc-500 mb-4">
                            The PIM is the canonical source of per-product geometry. These dimensions feed
                            AI_LM's Load Builder so each product loads as a scaled digital twin
                            (1 in = 1/12 world unit).
                        </p>
                        <div class="grid grid-cols-3 gap-3">
                            ${this._renderNumberInput('Length', this.lengthIn, (v) => this.lengthIn = v)}
                            ${this._renderNumberInput('Width', this.widthIn, (v) => this.widthIn = v)}
                            ${this._renderNumberInput('Height', this.heightIn, (v) => this.heightIn = v)}
                        </div>

                        <label class="flex items-center gap-3 mt-5 cursor-pointer">
                            <input
                                type="checkbox"
                                .checked=${this.stackable}
                                @change=${(e: Event) => this.stackable = (e.target as HTMLInputElement).checked}
                                class="w-4 h-4 rounded border-white/20 bg-zinc-800 text-gable-green focus:ring-gable-green/50"
                            />
                            <span class="text-sm text-zinc-300">Stackable in a load</span>
                        </label>
                    </div>

                    <div class="flex justify-end">
                        <button
                            @click=${this._handleSave}
                            ?disabled=${this.saving}
                            class="flex items-center gap-2 px-5 py-2.5 bg-gable-green/20 text-gable-green border border-gable-green/30 rounded-lg hover:bg-gable-green/30 transition-colors disabled:opacity-50"
                        >
                            ${this.saving ? icon(Loader2, 16, 'w-4 h-4 animate-spin') : icon(Save, 16, 'w-4 h-4')}
                            ${this.saving ? 'Saving...' : 'Save Dimensions'}
                        </button>
                    </div>
                </div>

                <!-- Live 3D Twin -->
                <div>
                    <h3 class="text-sm font-medium text-zinc-300 mb-3">Digital Twin Preview</h3>
                    <gable-product-twin-3d
                        .lengthIn=${this.lengthIn}
                        .widthIn=${this.widthIn}
                        .heightIn=${this.heightIn}
                    ></gable-product-twin-3d>
                </div>
            </div>
        `;
    }
}
