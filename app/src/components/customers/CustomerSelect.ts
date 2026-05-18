import { LitElement, html, nothing } from 'lit';
import { customElement, property, state } from 'lit/decorators.js';
import { icon } from '../../lib/icons';
import { Search } from 'lucide';
import type { Customer } from '../../types/customer';
import { CustomerService } from '../../services/CustomerService';
import { ToastService } from '../../lib/toast-service';

@customElement('gable-customer-select')
export class GableCustomerSelect extends LitElement {
  createRenderRoot() { return this; }

  @property({ type: String, attribute: 'selected-customer-id' }) selectedCustomerId?: string;

  @state() private _customers: Customer[] = [];
  @state() private _loading = true;
  @state() private _searchTerm = '';
  @state() private _isOpen = false;

  connectedCallback() {
    super.connectedCallback();
    this._fetchCustomers();
  }

  private async _fetchCustomers() {
    try {
      const data = await CustomerService.listCustomers();
      this._customers = data;
    } catch (error) {
      console.error('Failed to load customers', error);
      ToastService.show('Failed to load customers', 'error');
    } finally {
      this._loading = false;
    }
  }

  private get _filteredCustomers(): Customer[] {
    return this._customers.filter(c =>
      c.name.toLowerCase().includes(this._searchTerm.toLowerCase()) ||
      c.account_number.includes(this._searchTerm)
    );
  }

  private get _selectedCustomer(): Customer | undefined {
    return this._customers.find(c => c.id === this.selectedCustomerId);
  }

  private _selectCustomer(customer: Customer) {
    this.dispatchEvent(new CustomEvent('customer-select', { detail: customer, bubbles: true, composed: true }));
    this._searchTerm = '';
    this._isOpen = false;
  }

  render() {
    return html`
      <div class="relative w-full max-w-sm">
        <label class="block text-sm font-medium text-gray-400 mb-1">Customer</label>

        <div class="relative">
          <div
            @click=${() => this._isOpen = !this._isOpen}
            class="flex items-center w-full px-4 py-2 bg-[#161821] border border-white/10 rounded-md cursor-pointer hover:border-[#00FFA3] transition-colors"
          >
            ${icon(Search, 16, 'text-gray-400 mr-2')}
            <input
              type="text"
              class="bg-transparent border-none outline-none text-white w-full placeholder-gray-600 cursor-pointer"
              placeholder="Select Customer..."
              .value=${this._isOpen ? this._searchTerm : (this._selectedCustomer?.name || '')}
              @input=${(e: InputEvent) => {
                this._searchTerm = (e.target as HTMLInputElement).value;
                this._isOpen = true;
              }}
              @focus=${() => this._isOpen = true}
            />
          </div>

          ${this._isOpen ? html`
            <div class="absolute z-50 w-full mt-1 bg-[#161821] border border-white/10 rounded-md shadow-xl max-h-60 overflow-auto">
              ${this._loading ? html`
                <div class="p-4 text-center text-gray-500 text-sm">Loading...</div>
              ` : nothing}

              ${!this._loading && this._filteredCustomers.length === 0 ? html`
                <div class="p-4 text-center text-gray-500 text-sm">No results found</div>
              ` : nothing}

              ${!this._loading ? this._filteredCustomers.map(customer => html`
                <div
                  class="px-4 py-2 hover:bg-[#00FFA3]/10 cursor-pointer flex justify-between items-center group"
                  @click=${() => this._selectCustomer(customer)}
                >
                  <div>
                    <div class="text-white font-medium group-hover:text-[#00FFA3] transition-colors">${customer.name}</div>
                    <div class="text-xs text-gray-500">#${customer.account_number}</div>
                  </div>
                  <div class="text-xs text-right text-gray-500">
                    ${customer.price_level?.name || 'Retail'}
                  </div>
                </div>
              `) : nothing}
            </div>
          ` : nothing}
        </div>

        ${this._isOpen ? html`<div class="fixed inset-0 z-40" @click=${() => this._isOpen = false}></div>` : nothing}
      </div>
    `;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'gable-customer-select': GableCustomerSelect;
  }
}
