import { LitElement, html, nothing } from 'lit';
import { customElement, property, state } from 'lit/decorators.js';
import { icon } from '../../lib/icons';
import { Check, AlertTriangle, ChevronDown, X, Sparkles, Package, ShieldAlert } from 'lucide';
import type { ParseResponse, ParsedItem, MatchedProduct } from '../../types/parsing';

@customElement('gable-parsed-results-panel')
export class GableParsedResultsPanel extends LitElement {
  createRenderRoot() { return this; }

  @property({ type: Object }) result!: ParseResponse;

  @state() private _items: ParsedItem[] = [];
  @state() private _selectedIndices: Set<number> = new Set();
  @state() private _showAltsMap: Map<number, boolean> = new Map();

  updated(changed: Map<string, unknown>) {
    if (changed.has('result') && this.result) {
      this._items = [...this.result.items];
      this._selectedIndices = new Set(this.result.items.map((_, i) => i));
      this._showAltsMap = new Map();
    }
  }

  private _toggleSelect(index: number) {
    const next = new Set(this._selectedIndices);
    if (next.has(index)) {
      next.delete(index);
    } else {
      next.add(index);
    }
    this._selectedIndices = next;
  }

  private _handleSwapSku(itemIndex: number, alt: MatchedProduct) {
    const updated = [...this._items];
    const item = { ...updated[itemIndex] };
    const currentAlts = [...(item.alternatives || [])];
    if (item.matched_product) {
      currentAlts.push(item.matched_product);
    }
    item.matched_product = alt;
    item.alternatives = currentAlts.filter(a => a.product_id !== alt.product_id);
    item.confidence = 0.95;
    item.is_special_order = false;
    updated[itemIndex] = item;
    this._items = updated;
  }

  private _handleAcceptAll() {
    this.dispatchEvent(new CustomEvent('accept', { detail: this._items, bubbles: true, composed: true }));
  }

  private _handleAcceptSelected() {
    const selected = this._items.filter((_, i) => this._selectedIndices.has(i));
    this.dispatchEvent(new CustomEvent('accept', { detail: selected, bubbles: true, composed: true }));
  }

  private _close() {
    this.dispatchEvent(new CustomEvent('close', { bubbles: true, composed: true }));
  }

  private _toggleAlts(index: number) {
    const map = new Map(this._showAltsMap);
    map.set(index, !map.get(index));
    this._showAltsMap = map;
  }

  private _renderConfidenceBadge(confidence: number, isSpecialOrder: boolean) {
    if (isSpecialOrder) {
      return html`
        <span class="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider bg-rose-500/15 text-rose-400 border border-rose-500/20">
          ${icon(AlertTriangle, 10)} Special
        </span>
      `;
    }
    const pct = Math.round(confidence * 100);
    if (confidence >= 0.9) {
      return html`
        <span class="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider bg-emerald-500/15 text-emerald-400 border border-emerald-500/20">
          ${icon(Check, 10)} ${pct}%
        </span>
      `;
    }
    return html`
      <span class="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider bg-amber-500/15 text-amber-400 border border-amber-500/20">
        ${icon(AlertTriangle, 10)} ${pct}%
      </span>
    `;
  }

  render() {
    if (!this.result) return nothing;

    const highConfCount = this._items.filter(i => i.confidence >= 0.9 && !i.is_special_order).length;
    const lowConfCount = this._items.filter(i => i.confidence < 0.9 && i.confidence >= 0.5 && !i.is_special_order).length;
    const specialOrderCount = this._items.filter(i => i.is_special_order).length;

    return html`
      <div class="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center p-4" id="parsed-results-overlay">
        <div class="bg-slate-steel rounded-2xl border border-white/10 w-full max-w-6xl max-h-[90vh] flex flex-col shadow-2xl">
          <!-- Header -->
          <div class="flex items-center justify-between p-6 border-b border-white/5">
            <div class="flex items-center gap-3">
              <div class="w-10 h-10 rounded-xl bg-gable-green/10 border border-gable-green/20 flex items-center justify-center">
                ${icon(Sparkles, 20, 'text-gable-green')}
              </div>
              <div>
                <h2 class="text-lg font-semibold text-white">AI Parse Results</h2>
                <p class="text-xs text-zinc-500">
                  ${this.result.item_count} items parsed in ${this.result.parse_time_ms}ms
                  <span class="mx-2">&bull;</span>
                  <span class="text-emerald-400">${highConfCount} auto-matched</span>
                  ${lowConfCount > 0 ? html`<span class="text-amber-400 ml-2">${lowConfCount} review needed</span>` : nothing}
                  ${specialOrderCount > 0 ? html`<span class="text-rose-400 ml-2">${specialOrderCount} special order</span>` : nothing}
                </p>
              </div>
            </div>
            <button @click=${this._close} class="text-zinc-500 hover:text-white transition-colors p-2 rounded-lg hover:bg-white/5" id="close-parse-results-btn">
              ${icon(X, 20)}
            </button>
          </div>

          <!-- Content: Side by Side -->
          <div class="flex-1 overflow-hidden grid grid-cols-1 lg:grid-cols-2 gap-0 min-h-0">
            <!-- Left: Original Image -->
            <div class="border-r border-white/5 p-6 overflow-auto">
              <h3 class="text-sm font-medium text-zinc-400 uppercase tracking-wider mb-4">Original Document</h3>
              ${this.result.source_image ? html`
                <div class="rounded-xl overflow-hidden border border-white/10 bg-black/30">
                  <img src="${this.result.source_image}" alt="Uploaded material list" class="w-full h-auto object-contain max-h-[60vh]" />
                </div>
              ` : html`
                <div class="rounded-xl border border-white/10 bg-black/30 p-12 text-center text-zinc-500">
                  No preview available
                </div>
              `}
            </div>

            <!-- Right: Parsed Items -->
            <div class="p-6 overflow-auto">
              <h3 class="text-sm font-medium text-zinc-400 uppercase tracking-wider mb-4">Parsed Line Items</h3>
              <div class="space-y-3">
                ${this._items.map((item, idx) => this._renderItemCard(item, idx))}
              </div>
            </div>
          </div>

          <!-- Footer: Actions -->
          <div class="flex items-center justify-between p-6 border-t border-white/5 bg-black/20">
            <div class="text-sm text-zinc-500">
              ${this._selectedIndices.size} of ${this._items.length} items selected
            </div>
            <div class="flex items-center gap-3">
              <button @click=${this._close} class="bg-slate-steel text-white hover:bg-slate-steel/80 border border-white/5 inline-flex items-center justify-center rounded-lg text-sm font-medium transition-all h-10 py-2 px-4">
                Cancel
              </button>
              ${this._selectedIndices.size < this._items.length ? html`
                <button @click=${this._handleAcceptSelected} class="bg-slate-steel text-white hover:bg-slate-steel/80 border border-white/5 inline-flex items-center justify-center rounded-lg text-sm font-medium transition-all h-10 py-2 px-4" id="accept-selected-btn">
                  ${icon(Check, 16, 'mr-2')} Accept Selected (${this._selectedIndices.size})
                </button>
              ` : nothing}
              <button @click=${this._handleAcceptAll} class="bg-gable-green text-deep-space hover:shadow-glow font-bold inline-flex items-center justify-center rounded-lg text-sm transition-all h-10 py-2 px-4 shadow-glow" id="accept-all-btn">
                ${icon(Check, 16, 'mr-2')} Accept All (${this._items.length})
              </button>
            </div>
          </div>
        </div>
      </div>
    `;
  }

  private _renderItemCard(item: ParsedItem, idx: number) {
    const selected = this._selectedIndices.has(idx);
    const showAlts = this._showAltsMap.get(idx) || false;

    return html`
      <div class="rounded-2xl overflow-hidden transition-all duration-200 ${selected
        ? 'bg-slate-steel/60 backdrop-blur-xl border border-gable-green/30 bg-gable-green/5 shadow-elevation-1'
        : 'bg-slate-steel/60 backdrop-blur-xl border border-white/5 opacity-50 shadow-elevation-1'
      }">
        <div class="p-4">
          <div class="flex items-start gap-3">
            <button
              @click=${() => this._toggleSelect(idx)}
              class="mt-0.5 w-5 h-5 rounded border flex items-center justify-center shrink-0 transition-all ${selected
                ? 'bg-gable-green border-gable-green text-black'
                : 'border-white/20 hover:border-white/40'
              }"
              id="toggle-item-${idx}"
            >
              ${selected ? icon(Check, 12) : nothing}
            </button>

            <div class="flex-1 min-w-0">
              <div class="flex items-center gap-2 mb-2">
                ${this._renderConfidenceBadge(item.confidence, item.is_special_order)}
                <span class="text-xs text-zinc-500 font-mono truncate">${item.raw_text}</span>
              </div>

              ${item.matched_product ? html`
                <div class="flex items-center gap-3">
                  ${icon(Package, 16, 'text-zinc-500 shrink-0')}
                  <div class="flex-1 min-w-0">
                    <div class="font-mono text-white text-sm">${item.matched_product.sku}</div>
                    <div class="text-xs text-zinc-400 truncate">${item.matched_product.description}</div>
                  </div>
                  <div class="text-right shrink-0">
                    <div class="font-mono text-white text-sm">
                      ${item.quantity} <span class="text-zinc-500 text-[10px]">${item.uom}</span>
                    </div>
                    <div class="font-mono text-emerald-400 text-xs">
                      $${item.matched_product.base_price.toFixed(2)}
                    </div>
                  </div>
                </div>
              ` : html`
                <div class="flex items-center gap-3">
                  ${icon(ShieldAlert, 16, 'text-rose-400 shrink-0')}
                  <div class="flex-1">
                    <div class="text-sm text-rose-300">Special Order</div>
                    <div class="text-xs text-zinc-500">${item.raw_text}</div>
                  </div>
                  <div class="text-right shrink-0">
                    <div class="font-mono text-white text-sm">
                      ${item.quantity} <span class="text-zinc-500 text-[10px]">${item.uom}</span>
                    </div>
                  </div>
                </div>
              `}

              ${item.alternatives && item.alternatives.length > 0 ? html`
                <div class="mt-2">
                  <button
                    @click=${() => this._toggleAlts(idx)}
                    class="text-xs text-blueprint-blue hover:text-blue-300 flex items-center gap-1 transition-colors"
                    id="swap-sku-toggle-${idx}"
                  >
                    <span class="transition-transform ${showAlts ? 'rotate-180' : ''} inline-block">${icon(ChevronDown, 12)}</span>
                    Swap SKU (${item.alternatives.length} alternatives)
                  </button>

                  ${showAlts ? html`
                    <div class="mt-2 space-y-1.5 pl-4 border-l-2 border-blueprint-blue/20">
                      ${item.alternatives.map(alt => html`
                        <button
                          @click=${() => { this._handleSwapSku(idx, alt); this._toggleAlts(idx); }}
                          class="w-full text-left p-2 rounded-lg bg-white/5 hover:bg-white/10 transition-colors group"
                        >
                          <div class="flex items-center justify-between">
                            <div>
                              <span class="font-mono text-xs text-zinc-300 group-hover:text-white">${alt.sku}</span>
                              <span class="text-xs text-zinc-500 ml-2">${alt.description}</span>
                            </div>
                            <span class="font-mono text-xs text-emerald-400">$${alt.base_price.toFixed(2)}</span>
                          </div>
                        </button>
                      `)}
                    </div>
                  ` : nothing}
                </div>
              ` : nothing}
            </div>
          </div>
        </div>
      </div>
    `;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'gable-parsed-results-panel': GableParsedResultsPanel;
  }
}
