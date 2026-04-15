import { LitElement, html, nothing } from 'lit';
import { customElement, state } from 'lit/decorators.js';
import { router } from '../../lib/router.ts';
import { ProductService } from '../../services/product.service.ts';
import { CustomerService } from '../../services/CustomerService.ts';
import type { Product } from '../../types/product.ts';
import type { Customer } from '../../types/customer.ts';

@customElement('gable-omnibar')
export class GableOmnibar extends LitElement {
  createRenderRoot() { return this; }

  @state() private _open = false;
  @state() private _query = '';
  @state() private _products: Product[] = [];
  @state() private _customers: Customer[] = [];


  private _boundKeyDown = this._handleKeyDown.bind(this);

  connectedCallback() {
    super.connectedCallback();
    document.addEventListener('keydown', this._boundKeyDown);

    // Pre-fetch data
    Promise.all([
      ProductService.getProducts(),
      CustomerService.listCustomers(),
    ]).then(([p, c]) => {
      this._products = p;
      this._customers = c;
    }).catch(err => {
      console.error('Omnibar prefetch failed:', err);
    });
  }

  disconnectedCallback() {
    super.disconnectedCallback();
    document.removeEventListener('keydown', this._boundKeyDown);
  }

  private _handleKeyDown(e: KeyboardEvent) {
    if (e.key === 'k' && (e.metaKey || e.ctrlKey)) {
      e.preventDefault();
      this._open = !this._open;
      this._query = '';

    }
    if (this._open && e.key === 'Escape') {
      this._open = false;
    }
  }

  private _filteredCustomers(): Customer[] {
    if (!this._query) return this._customers.slice(0, 5);
    const q = this._query.toLowerCase();
    return this._customers.filter(c =>
      c.name.toLowerCase().includes(q) || c.account_number?.toLowerCase().includes(q)
    ).slice(0, 5);
  }

  private _filteredProducts(): Product[] {
    if (!this._query) return this._products.slice(0, 5);
    const q = this._query.toLowerCase();
    return this._products.filter(p =>
      p.sku.toLowerCase().includes(q) || p.description.toLowerCase().includes(q)
    ).slice(0, 5);
  }

  private _select(path: string) {
    this._open = false;
    router.navigate(path);
  }

  render() {
    if (!this._open) return nothing;

    const customers = this._filteredCustomers();
    const products = this._filteredProducts();

    return html`
      <div class="fixed inset-0 z-50" style="pointer-events: auto;">
        <div class="fixed inset-0 bg-black/50 backdrop-blur-sm" @click=${() => { this._open = false; }}></div>
        <div class="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[640px] max-w-[calc(100%-2rem)] bg-[#161821] border border-white/10 rounded-lg shadow-2xl overflow-hidden p-2 z-10">
          <!-- Input -->
          <div class="flex items-center px-4 border-b border-white/5">
            <input
              type="text"
              .value=${this._query}
              @input=${(e: Event) => { this._query = (e.target as HTMLInputElement).value; }}
              class="w-full bg-transparent border-none outline-none py-4 text-white placeholder-white/50 font-mono"
              placeholder="Search customers, products, or commands... (cmd+k)"
              autofocus
            />
          </div>

          <!-- Results -->
          <div class="max-h-[400px] overflow-y-auto p-2">
            <!-- Actions -->
            <div class="text-white/50 text-xs font-bold uppercase tracking-wider mb-2 px-2">Actions</div>
            <div class="flex items-center gap-3 px-3 py-2 rounded-md text-sm text-white hover:bg-white/5 cursor-pointer"
                 @click=${() => this._select('/quotes/new')}>
              Create Quote
            </div>
            <div class="flex items-center gap-3 px-3 py-2 rounded-md text-sm text-white hover:bg-white/5 cursor-pointer"
                 @click=${() => this._select('/orders')}>
              View Orders
            </div>

            <!-- Customers -->
            ${customers.length > 0 ? html`
              <div class="text-white/50 text-xs font-bold uppercase tracking-wider mb-2 px-2 mt-4">Customers</div>
              ${customers.map(c => html`
                <div class="flex items-center justify-between px-3 py-2 rounded-md text-sm text-white hover:bg-white/5 cursor-pointer"
                     @click=${() => { this._open = false; }}>
                  <div class="flex items-center gap-2">
                    <span>${c.name}</span>
                    ${c.credit_limit > 0 && c.balance_due > c.credit_limit ? html`
                      <span class="text-red-500 text-[10px] border border-red-500 px-1 rounded uppercase font-bold">Hold</span>
                    ` : nothing}
                  </div>
                  <span class="opacity-50 text-xs">${c.account_number}</span>
                </div>
              `)}
            ` : nothing}

            <!-- Products -->
            ${products.length > 0 ? html`
              <div class="text-white/50 text-xs font-bold uppercase tracking-wider mb-2 px-2 mt-4">Products</div>
              ${products.map(p => html`
                <div class="flex items-center justify-between px-3 py-2 rounded-md text-sm text-white hover:bg-white/5 cursor-pointer"
                     @click=${() => { this._open = false; }}>
                  <span class="font-mono mr-2">${p.sku}</span>
                  <span class="truncate">${p.description}</span>
                </div>
              `)}
            ` : nothing}

            ${customers.length === 0 && products.length === 0 && this._query ? html`
              <div class="py-6 text-center text-white/50">No results found.</div>
            ` : nothing}
          </div>
        </div>
      </div>
    `;
  }
}
