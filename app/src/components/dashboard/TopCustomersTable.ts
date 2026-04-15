import { LitElement, html } from 'lit';
import { customElement, property } from 'lit/decorators.js';
import type { TopCustomer } from '../../types/dashboard.ts';

@customElement('gable-top-customers-table')
export class GableTopCustomersTable extends LitElement {
    createRenderRoot() { return this; }

    @property({ attribute: false }) customers: TopCustomer[] = [];
    @property({ type: Boolean }) loading = false;

    render() {
        if (this.loading) {
            return html`
                <div class="rounded-xl border border-white/10 bg-slate-steel/30 backdrop-blur-sm h-full">
                    <div class="p-4 border-b border-white/5">
                        <div class="h-6 w-32 bg-white/10 rounded animate-pulse"></div>
                    </div>
                    <div class="p-4">
                        <div class="space-y-4">
                            ${[1, 2, 3, 4, 5].map(() => html`
                                <div class="flex justify-between items-center">
                                    <div class="flex items-center gap-3">
                                        <div class="h-8 w-8 rounded-full bg-white/10 animate-pulse"></div>
                                        <div class="h-4 w-40 bg-white/10 rounded animate-pulse"></div>
                                    </div>
                                    <div class="h-4 w-20 bg-white/10 rounded animate-pulse"></div>
                                </div>
                            `)}
                        </div>
                    </div>
                </div>
            `;
        }

        return html`
            <div class="rounded-xl border border-white/10 bg-slate-steel/30 backdrop-blur-sm h-full">
                <div class="p-4 border-b border-white/5">
                    <h3 class="text-base font-semibold text-white">Top Customers</h3>
                </div>
                <div class="p-0">
                    <div class="overflow-x-auto">
                        <table class="w-full text-sm text-left">
                            <thead class="text-zinc-400 font-medium border-b border-white/5 bg-white/5">
                                <tr>
                                    <th class="px-6 py-3">Customer</th>
                                    <th class="px-6 py-3 text-right">Orders</th>
                                    <th class="px-6 py-3 text-right">Revenue</th>
                                </tr>
                            </thead>
                            <tbody class="divide-y divide-white/5">
                                ${this.customers.length === 0
                                    ? html`
                                        <tr>
                                            <td colspan="3" class="px-6 py-8 text-center text-zinc-500">
                                                No customer data available
                                            </td>
                                        </tr>
                                    `
                                    : this.customers.map((customer) => html`
                                        <tr class="group hover:bg-white/5 transition-colors">
                                            <td class="px-6 py-3 font-medium text-white">
                                                <div class="flex items-center gap-3">
                                                    <div class="h-8 w-8 rounded-full bg-gradient-to-br from-zinc-700 to-zinc-800 flex items-center justify-center text-xs font-bold text-white border border-white/10 shadow-sm group-hover:scale-105 transition-transform">
                                                        ${customer.customer_name.substring(0, 2).toUpperCase()}
                                                    </div>
                                                    ${customer.customer_name}
                                                </div>
                                            </td>
                                            <td class="px-6 py-3 text-right font-mono text-zinc-400">
                                                ${customer.order_count}
                                            </td>
                                            <td class="px-6 py-3 text-right font-mono font-bold text-gable-green">
                                                $${(customer.total_revenue / 100).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                                            </td>
                                        </tr>
                                    `)
                                }
                            </tbody>
                        </table>
                    </div>
                </div>
            </div>
        `;
    }
}
