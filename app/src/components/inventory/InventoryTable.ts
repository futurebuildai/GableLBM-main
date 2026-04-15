import { LitElement, html, nothing } from 'lit';
import { customElement, property } from 'lit/decorators.js';
import { icon } from '../../lib/icons';
import { Edit2, ArrowRightLeft, Package } from 'lucide';
import { router } from '../../lib/router';
import type { Product } from '../../types/product';

@customElement('gable-inventory-table')
export class GableInventoryTable extends LitElement {
  createRenderRoot() { return this; }

  @property({ type: Array }) products: Product[] = [];

  private _onAdjustStock(product: Product, e: Event) {
    e.stopPropagation();
    this.dispatchEvent(new CustomEvent('adjust-stock', { detail: product, bubbles: true, composed: true }));
  }

  private _onTransferStock(product: Product, e: Event) {
    e.stopPropagation();
    this.dispatchEvent(new CustomEvent('transfer-stock', { detail: product, bubbles: true, composed: true }));
  }

  private _onEditMargins(product: Product, e: Event) {
    e.stopPropagation();
    this.dispatchEvent(new CustomEvent('edit-margins', { detail: product, bubbles: true, composed: true }));
  }

  private _navigateToProduct(id: string) {
    router.navigate(`/inventory/${id}`);
  }

  render() {
    return html`
      <div class="w-full overflow-hidden">
        <div class="overflow-x-auto">
          <table class="w-full text-left text-sm" aria-label="Inventory products">
            <thead>
              <tr class="border-b border-white/5 text-zinc-400 text-xs uppercase tracking-wider font-medium">
                <th class="px-6 py-4">SKU / UPC</th>
                <th class="px-6 py-4">Category / Desc</th>
                <th class="px-6 py-4">Vendor</th>
                <th class="px-6 py-4 text-center">UOM</th>
                <th class="px-6 py-4 text-right">Avg Cost</th>
                <th class="px-6 py-4 text-right">Target Margin</th>
                <th class="px-6 py-4 text-right">Visible Price</th>
                <th class="px-6 py-4 text-right">Available</th>
                <th class="px-6 py-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody class="divide-y divide-white/5">
              ${this.products.length === 0
                ? html`
                  <tr>
                    <td colspan="8" class="px-6 py-12 text-center text-zinc-500">
                      <div class="flex flex-col items-center gap-3">
                        <div class="h-12 w-12 rounded-full bg-zinc-800/50 flex items-center justify-center">
                          ${icon(Package, 24, 'text-zinc-600')}
                        </div>
                        <p>No products found in the pile.</p>
                      </div>
                    </td>
                  </tr>
                `
                : this.products.map((p) => {
                    const available = (p.total_quantity || 0) - (p.total_allocated || 0);
                    const isLowStock = available < 100;

                    return html`
                      <tr class="group hover:bg-white/5 transition-colors cursor-pointer" @click=${() => this._navigateToProduct(p.id)}>
                        <td class="px-6 py-4">
                          <div class="flex flex-col">
                            <span class="font-mono font-bold text-white group-hover:text-gable-green transition-colors">
                              ${p.sku}
                            </span>
                            ${p.upc ? html`<span class="text-xs text-zinc-500 font-mono mt-0.5">${p.upc}</span>` : nothing}
                          </div>
                        </td>
                        <td class="px-6 py-4">
                          <div class="text-zinc-300 font-medium">${p.description}</div>
                          <div class="text-xs text-zinc-500 font-mono mt-0.5">ID: ${p.id.substring(0, 8)}</div>
                        </td>
                        <td class="px-6 py-4">
                          <div class="text-zinc-400 text-sm truncate max-w-[150px]">${p.vendor || '-'}</div>
                        </td>
                        <td class="px-6 py-4 text-center">
                          <span class="inline-flex items-center px-2 py-1 rounded text-xs font-mono font-medium bg-white/5 text-zinc-400 border border-white/10">
                            ${p.uom_primary}
                          </span>
                        </td>
                        <td class="px-6 py-4 text-right font-mono text-emerald-400">
                          $${(p.average_unit_cost || 0).toFixed(2)}
                        </td>
                        <td class="px-6 py-4 text-right font-mono text-zinc-300">
                          ${(p.target_margin || 0).toFixed(1)}% <br />
                          <span class="text-xs text-zinc-500">${(p.commission_rate || 0).toFixed(1)}% Comm</span>
                        </td>
                        <td class="px-6 py-4 text-right">
                          <span class="font-mono text-white group-hover:text-gable-green transition-colors">
                            $${(p.base_price || 0).toFixed(2)}
                          </span>
                        </td>
                        <td class="px-6 py-4 text-right">
                          <span class="font-mono font-bold ${isLowStock ? 'text-rose-500' : 'text-emerald-400'}">
                            ${available.toLocaleString()}
                          </span>
                        </td>
                        <td class="px-6 py-4 text-right">
                          <div class="flex items-center justify-end gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                            <button
                              @click=${(e: Event) => this._onAdjustStock(p, e)}
                              class="p-1.5 rounded-md hover:bg-white/10 text-zinc-400 hover:text-white transition-colors"
                              title="Adjust Stock"
                              aria-label="Adjust stock for ${p.sku}"
                            >
                              ${icon(Edit2, 16)}
                            </button>
                            <button
                              @click=${(e: Event) => this._onTransferStock(p, e)}
                              class="p-1.5 rounded-md hover:bg-white/10 text-zinc-400 hover:text-white transition-colors"
                              title="Transfer Stock"
                              aria-label="Transfer stock for ${p.sku}"
                            >
                              ${icon(ArrowRightLeft, 16)}
                            </button>
                            <button
                              @click=${(e: Event) => this._onEditMargins(p, e)}
                              class="p-1.5 rounded-md hover:bg-white/10 text-zinc-400 hover:text-white transition-colors"
                              title="Edit Margins and Commissions"
                              aria-label="Edit margins for ${p.sku}"
                            >
                              <span class="text-xs font-bold leading-none px-1 py-0.5 rounded bg-zinc-800 text-gable-green border border-gable-green/30">$</span>
                            </button>
                          </div>
                        </td>
                      </tr>
                    `;
                  })
              }
            </tbody>
          </table>
        </div>
      </div>
    `;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'gable-inventory-table': GableInventoryTable;
  }
}
