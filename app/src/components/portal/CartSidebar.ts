import { LitElement, html, nothing } from 'lit';
import { customElement, property, state } from 'lit/decorators.js';
import { icon } from '../../lib/icons';
import { ShoppingCart, X, Minus, Plus, Trash2, ArrowRight } from 'lucide';
import { PortalService } from '../../services/PortalService';
import { ToastService } from '../../lib/toast-service';
import { router } from '../../lib/router';
import type { Cart } from '../../types/portal';

const formatCurrency = (val: number): string =>
  new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(val);

@customElement('gable-cart-sidebar')
export class GableCartSidebar extends LitElement {
  createRenderRoot() { return this; }

  @property({ type: Boolean, attribute: 'is-open' }) isOpen = false;
  @property({ type: Number, attribute: 'refresh-key' }) refreshKey = 0;

  @state() private _cart: Cart | null = null;
  @state() private _loading = false;

  updated(changed: Map<string, unknown>) {
    if ((changed.has('isOpen') || changed.has('refreshKey')) && this.isOpen) {
      this._fetchCart();
    }
  }

  private async _fetchCart() {
    this._loading = true;
    try {
      this._cart = await PortalService.getCart();
    } catch {
      this._cart = null;
    } finally {
      this._loading = false;
    }
  }

  private async _handleUpdateQty(itemId: string, qty: number) {
    try {
      if (qty <= 0) {
        this._cart = await PortalService.removeCartItem(itemId);
      } else {
        this._cart = await PortalService.updateCartItem(itemId, qty);
      }
    } catch {
      ToastService.show('Failed to update cart quantity', 'error');
    }
  }

  private async _handleRemove(itemId: string) {
    try {
      this._cart = await PortalService.removeCartItem(itemId);
    } catch {
      ToastService.show('Failed to remove item from cart', 'error');
    }
  }

  private _close() {
    this.dispatchEvent(new CustomEvent('close', { bubbles: true, composed: true }));
  }

  private _navigate(path: string) {
    this._close();
    router.navigate(path);
  }

  render() {
    return html`
      <!-- Backdrop -->
      ${this.isOpen ? html`
        <div class="fixed inset-0 bg-black/60 backdrop-blur-sm z-40" @click=${this._close}></div>
      ` : nothing}

      <!-- Sidebar -->
      <div class="fixed right-0 top-0 h-full w-96 max-w-full bg-zinc-900 border-l border-white/10 z-50 transform transition-transform duration-300 ${this.isOpen ? 'translate-x-0' : 'translate-x-full'}">
        <!-- Header -->
        <div class="flex items-center justify-between p-4 border-b border-white/10">
          <div class="flex items-center gap-2">
            ${icon(ShoppingCart, 20, 'text-gable-green')}
            <h2 class="text-lg font-semibold text-white">Cart</h2>
            ${this._cart && this._cart.item_count > 0 ? html`
              <span class="px-2 py-0.5 rounded-full text-xs font-bold bg-gable-green/20 text-gable-green">
                ${this._cart.item_count}
              </span>
            ` : nothing}
          </div>
          <button @click=${this._close} class="p-2 rounded-lg hover:bg-white/5 text-zinc-400 hover:text-white transition-colors">
            ${icon(X, 20)}
          </button>
        </div>

        <!-- Content -->
        <div class="flex-1 overflow-y-auto p-4 space-y-3" style="max-height:calc(100vh - 180px)">
          ${this._loading ? html`
            <div class="space-y-3">
              ${[1, 2, 3].map(() => html`
                <div class="h-20 bg-white/5 rounded-xl animate-pulse"></div>
              `)}
            </div>
          ` : !this._cart || this._cart.items.length === 0 ? html`
            <div class="flex flex-col items-center justify-center py-12 text-center">
              ${icon(ShoppingCart, 48, 'text-zinc-600 mb-3')}
              <p class="text-zinc-500 text-sm">Your cart is empty</p>
              <a href="/portal/catalog" @click=${(e: Event) => { e.preventDefault(); this._navigate('/portal/catalog'); }}
                class="mt-3 text-sm text-gable-green hover:underline">
                Browse Catalog
              </a>
            </div>
          ` : html`
            ${this._cart.items.map(item => html`
              <div class="flex gap-3 p-3 rounded-xl bg-white/[0.03] border border-white/[0.06]">
                <div class="flex-1 min-w-0">
                  <p class="text-sm font-medium text-white truncate">${item.product_name}</p>
                  <p class="text-xs text-zinc-500 font-mono">${item.product_sku}</p>
                  <p class="text-sm font-mono text-zinc-300 mt-1">
                    ${formatCurrency(item.unit_price)} x ${item.quantity}
                  </p>
                </div>
                <div class="flex flex-col items-end gap-2">
                  <p class="text-sm font-bold text-white font-mono">${formatCurrency(item.line_total)}</p>
                  <div class="flex items-center gap-1">
                    <button @click=${() => this._handleUpdateQty(item.id, item.quantity - 1)}
                      class="p-1 rounded hover:bg-white/10 text-zinc-400 hover:text-white transition-colors">
                      ${icon(Minus, 14)}
                    </button>
                    <span class="text-xs text-zinc-300 w-6 text-center font-mono">${item.quantity}</span>
                    <button @click=${() => this._handleUpdateQty(item.id, item.quantity + 1)}
                      class="p-1 rounded hover:bg-white/10 text-zinc-400 hover:text-white transition-colors">
                      ${icon(Plus, 14)}
                    </button>
                    <button @click=${() => this._handleRemove(item.id)}
                      class="p-1 rounded hover:bg-red-500/10 text-zinc-500 hover:text-red-400 transition-colors ml-1">
                      ${icon(Trash2, 14)}
                    </button>
                  </div>
                </div>
              </div>
            `)}
          `}
        </div>

        <!-- Footer -->
        ${this._cart && this._cart.items.length > 0 ? html`
          <div class="absolute bottom-0 left-0 right-0 p-4 border-t border-white/10 bg-zinc-900/95 backdrop-blur-lg space-y-3">
            <div class="flex justify-between items-center">
              <span class="text-sm text-zinc-400">Subtotal</span>
              <span class="text-xl font-bold text-white font-mono">${formatCurrency(this._cart.subtotal)}</span>
            </div>
            <div class="grid grid-cols-2 gap-2">
              <a href="/portal/cart" @click=${(e: Event) => { e.preventDefault(); this._navigate('/portal/cart'); }}
                class="flex items-center justify-center gap-1 py-2.5 rounded-xl text-sm font-semibold bg-white/5 border border-white/10 text-white hover:bg-white/10 transition-colors">
                View Cart
              </a>
              <a href="/portal/checkout" @click=${(e: Event) => { e.preventDefault(); this._navigate('/portal/checkout'); }}
                class="flex items-center justify-center gap-1 py-2.5 rounded-xl text-sm font-semibold bg-gable-green text-black hover:bg-gable-green/90 transition-colors">
                Checkout ${icon(ArrowRight, 16)}
              </a>
            </div>
          </div>
        ` : nothing}
      </div>
    `;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'gable-cart-sidebar': GableCartSidebar;
  }
}
