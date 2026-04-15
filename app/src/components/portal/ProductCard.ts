import { LitElement, html, nothing } from 'lit';
import { customElement, property } from 'lit/decorators.js';
import { icon } from '../../lib/icons';
import { Package, Plus, CheckCircle, XCircle } from 'lucide';
import type { CatalogProduct } from '../../types/portal';
import { router } from '../../lib/router';

const formatCurrency = (val: number): string =>
  new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(val);

@customElement('gable-portal-product-card')
export class GablePortalProductCard extends LitElement {
  createRenderRoot() { return this; }

  @property({ type: Object }) product!: CatalogProduct;
  @property({ type: Boolean }) adding = false;

  private _handleAddToCart() {
    this.dispatchEvent(new CustomEvent('add-to-cart', {
      bubbles: true, composed: true,
      detail: { productId: this.product.id, quantity: 1 },
    }));
  }

  private _navigate() {
    router.navigate(`/portal/catalog/${this.product.id}`);
  }

  render() {
    const p = this.product;
    if (!p) return nothing;

    return html`
      <div class="group relative bg-white/[0.03] border border-white/[0.06] rounded-2xl overflow-hidden hover:border-white/10 hover:-translate-y-1 transition-all duration-300">
        <!-- Image Area -->
        <a @click=${(e: Event) => { e.preventDefault(); this._navigate(); }} href="/portal/catalog/${p.id}" class="block">
          <div class="aspect-square bg-gradient-to-br from-zinc-800/50 to-zinc-900/50 flex items-center justify-center p-6">
            ${p.image_url ? html`
              <img src=${p.image_url} alt=${p.name} class="w-full h-full object-contain" />
            ` : html`
              ${icon(Package, 64, 'text-zinc-600 group-hover:text-zinc-500 transition-colors')}
            `}
          </div>
        </a>

        <!-- Content -->
        <div class="p-4 space-y-3">
          ${p.category ? html`
            <span class="inline-block px-2 py-0.5 rounded-full text-[10px] uppercase tracking-wider font-semibold bg-gable-green/10 text-gable-green border border-gable-green/20">
              ${p.category}
            </span>
          ` : nothing}

          <a @click=${(e: Event) => { e.preventDefault(); this._navigate(); }} href="/portal/catalog/${p.id}" class="block">
            <h3 class="text-sm font-semibold text-white leading-tight group-hover:text-gable-green transition-colors line-clamp-2">
              ${p.name}
            </h3>
            <p class="text-xs text-zinc-500 font-mono mt-1">${p.sku}</p>
          </a>

          <!-- Pricing -->
          <div class="flex items-baseline gap-2">
            <span class="text-lg font-bold text-white font-mono">
              ${formatCurrency(p.customer_price)}
            </span>
            ${p.customer_price < p.base_price ? html`
              <span class="text-xs text-zinc-500 line-through font-mono">
                ${formatCurrency(p.base_price)}
              </span>
            ` : nothing}
            <span class="text-[10px] text-zinc-600">/${p.uom}</span>
          </div>

          <!-- Availability -->
          <div class="flex items-center gap-1.5">
            ${p.in_stock ? html`
              ${icon(CheckCircle, 14, 'text-emerald-400')}
              <span class="text-xs text-emerald-400">
                ${p.available > 0 ? `${Math.floor(p.available)} in stock` : 'In Stock'}
              </span>
            ` : html`
              ${icon(XCircle, 14, 'text-red-400')}
              <span class="text-xs text-red-400">Out of Stock</span>
            `}
          </div>

          <!-- Add to Cart -->
          <button
            @click=${() => this._handleAddToCart()}
            ?disabled=${this.adding || !p.in_stock}
            class="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-semibold transition-all duration-200
              bg-gable-green/10 text-gable-green border border-gable-green/20
              hover:bg-gable-green/20 hover:border-gable-green/30
              disabled:opacity-40 disabled:cursor-not-allowed
              active:scale-[0.98]"
          >
            ${icon(Plus, 16)} ${this.adding ? 'Adding...' : 'Add to Cart'}
          </button>
        </div>
      </div>
    `;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'gable-portal-product-card': GablePortalProductCard;
  }
}
