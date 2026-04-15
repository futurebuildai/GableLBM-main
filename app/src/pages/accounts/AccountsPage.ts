import { LitElement, html, nothing } from 'lit';
import { customElement, state } from 'lit/decorators.js';
import { icon } from '../../lib/icons.ts';
import { ToastService } from '../../lib/toast-service.ts';
import { CustomerService } from '../../services/CustomerService.ts';
import type { Customer } from '../../types/customer.ts';
import { Search, DollarSign, Building2, User } from 'lucide';

@customElement('gable-accounts-page')
export class GableAccountsPage extends LitElement {
    createRenderRoot() { return this; }

    @state() private customers: Customer[] = [];
    @state() private loading = true;
    @state() private filter: 'all' | 'credit' | 'cash' = 'all';
    @state() private search = '';

    connectedCallback() {
        super.connectedCallback();
        this.loadCustomers();
    }

    private async loadCustomers() {
        try {
            const data = await CustomerService.listCustomers();
            this.customers = data;
        } catch (error) {
            console.error('Failed to load customers:', error);
            ToastService.show('Failed to load customers', 'error');
        } finally {
            this.loading = false;
        }
    }

    private get filteredCustomers(): Customer[] {
        return this.customers.filter(c => {
            const matchesSearch = c.name.toLowerCase().includes(this.search.toLowerCase()) ||
                c.account_number.toLowerCase().includes(this.search.toLowerCase());

            if (!matchesSearch) return false;

            if (this.filter === 'credit') return c.credit_limit > 0;
            if (this.filter === 'cash') return c.credit_limit === 0;

            return true;
        });
    }

    private renderFilterButton(filterValue: 'all' | 'credit' | 'cash', label: string, iconData?: typeof Building2) {
        const active = this.filter === filterValue;
        return html`
            <button
                @click=${() => { this.filter = filterValue; }}
                class="px-3 py-1.5 rounded-md text-sm font-medium transition-all flex items-center gap-2 ${
                    active
                        ? 'bg-zinc-700 text-white shadow-sm'
                        : 'text-zinc-400 hover:text-white hover:bg-white/5'
                }"
            >
                ${iconData ? icon(iconData, 14) : nothing}
                ${label}
            </button>
        `;
    }

    private renderBadge(active: boolean) {
        return html`
            <span class="px-2 py-0.5 rounded-full text-xs font-medium border ${
                active
                    ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20'
                    : 'bg-red-500/10 text-red-400 border-red-500/20'
            }">
                ${active ? 'Active' : 'Inactive'}
            </span>
        `;
    }

    render() {
        if (this.loading) {
            return html`<div class="text-white p-8">Loading accounts...</div>`;
        }

        const filtered = this.filteredCustomers;

        return html`
            <div class="space-y-6">
                <div class="flex flex-col md:flex-row md:items-center justify-between gap-4">
                    <div>
                        <h1 class="text-2xl font-bold bg-gradient-to-r from-white to-zinc-400 bg-clip-text text-transparent">Accounts</h1>
                        <p class="text-zinc-400 text-sm mt-1">Manage customer accounts, balances, and credit limits.</p>
                    </div>

                    <div class="flex items-center gap-3">
                        <div class="relative">
                            <span class="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500">
                                ${icon(Search, 16)}
                            </span>
                            <input
                                type="text"
                                placeholder="Search accounts..."
                                .value=${this.search}
                                @input=${(e: Event) => { this.search = (e.target as HTMLInputElement).value; }}
                                class="bg-slate-steel/50 border border-white/5 rounded-full py-2 pl-10 pr-4 text-sm text-white focus:outline-none focus:ring-1 focus:ring-gable-green/50 w-64"
                            />
                        </div>

                        <div class="bg-slate-steel/50 p-1 rounded-lg flex items-center border border-white/5">
                            ${this.renderFilterButton('all', 'All')}
                            ${this.renderFilterButton('credit', 'Credit', Building2)}
                            ${this.renderFilterButton('cash', 'Cash', DollarSign)}
                        </div>
                    </div>
                </div>

                <div class="grid grid-cols-1 gap-4">
                    <!-- Table Header -->
                    <div class="grid grid-cols-12 gap-4 px-6 py-3 text-xs font-medium text-zinc-500 uppercase tracking-wider border-b border-white/5">
                        <div class="col-span-4">Customer</div>
                        <div class="col-span-2">Account #</div>
                        <div class="col-span-2 text-right">Balance Due</div>
                        <div class="col-span-2 text-right">Credit Limit</div>
                        <div class="col-span-2 text-right">Status</div>
                    </div>

                    ${filtered.map(customer => html`
                        <a href="/accounts/${customer.id}" class="block">
                            <div class="grid grid-cols-12 gap-4 px-6 py-4 items-center hover:bg-white/5 transition-colors border border-white/5 hover:border-gable-green/30 rounded-lg bg-slate-steel group">
                                <div class="col-span-4 flex items-center gap-3">
                                    <div class="w-10 h-10 rounded-full flex items-center justify-center text-xs font-bold shrink-0 ${
                                        customer.credit_limit > 0
                                            ? 'bg-blue-500/10 text-blue-400 border border-blue-500/20'
                                            : 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                                    }">
                                        ${customer.credit_limit > 0 ? icon(Building2, 18) : icon(User, 18)}
                                    </div>
                                    <div>
                                        <div class="font-medium text-white group-hover:text-gable-green transition-colors">${customer.name}</div>
                                        <div class="text-xs text-zinc-500 truncate">${customer.email || 'No email'}</div>
                                    </div>
                                </div>
                                <div class="col-span-2 text-sm text-zinc-400 font-mono">${customer.account_number}</div>
                                <div class="col-span-2 text-right font-mono font-medium text-white">
                                    $${Number(customer.balance_due).toLocaleString('en-US', { minimumFractionDigits: 2 })}
                                </div>
                                <div class="col-span-2 text-right font-mono text-zinc-400 text-sm">
                                    ${customer.credit_limit > 0
                                        ? `$${Number(customer.credit_limit).toLocaleString('en-US', { minimumFractionDigits: 2 })}`
                                        : html`<span class="text-zinc-600">-</span>`
                                    }
                                </div>
                                <div class="col-span-2 flex justify-end">
                                    ${this.renderBadge(customer.is_active)}
                                </div>
                            </div>
                        </a>
                    `)}

                    ${filtered.length === 0 ? html`
                        <div class="text-center py-20 text-zinc-500">
                            No accounts found matching your filters.
                        </div>
                    ` : nothing}
                </div>
            </div>
        `;
    }
}
