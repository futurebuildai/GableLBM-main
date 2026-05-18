import { LitElement, html, nothing } from 'lit';
import { customElement, property, state } from 'lit/decorators.js';
import { icon } from '../../lib/icons.ts';
import { ToastService } from '../../lib/toast-service.ts';
import { OrderService } from '../../services/OrderService.ts';
import { SalesTeamService } from '../../services/SalesTeamService.ts';
import { type Order, getStatusColor } from '../../types/order.ts';
import type { OrderStatus } from '../../types/order.ts';
import type { SalesPerson } from '../../types/salesteam.ts';
import { Truck, Check, Printer, User, DollarSign, Mail, Phone } from 'lucide';

const API_URL = import.meta.env.VITE_API_URL || '';

@customElement('gable-order-detail')
export class GableOrderDetail extends LitElement {
    createRenderRoot() { return this; }

    @property({ attribute: 'route-id' }) routeId = '';

    @state() private order: Order | null = null;
    @state() private salesperson: SalesPerson | null = null;
    @state() private loading = true;
    @state() private error = false;
    @state() private processing = false;

    connectedCallback() {
        super.connectedCallback();
        if (this.routeId) this.loadOrder(this.routeId);
    }

    updated(changed: Map<string, unknown>) {
        if (changed.has('routeId') && changed.get('routeId') !== undefined && this.routeId) {
            this.loading = true;
            this.loadOrder(this.routeId);
        }
    }

    private async loadOrder(orderId: string) {
        try {
            const data = await OrderService.getOrder(orderId);
            this.order = data;
            if (data.salesperson_id) {
                try {
                    const sp = await SalesTeamService.getSalesPerson(data.salesperson_id);
                    this.salesperson = sp;
                } catch {
                    // Salesperson lookup failed, not critical
                }
            }
        } catch (err) {
            console.error(err);
            this.error = true;
            ToastService.show('Failed to load order details', 'error');
        } finally {
            this.loading = false;
        }
    }

    private async handleConfirm() {
        if (!this.order) return;
        if (!confirm('Confirming this order will allocate stock. Proceed?')) return;

        this.processing = true;
        try {
            await OrderService.confirmOrder(this.order.id);
            await this.loadOrder(this.order.id);
        } catch (error) {
            ToastService.show('Failed to confirm order: ' + (error instanceof Error ? error.message : error), 'error');
        } finally {
            this.processing = false;
        }
    }

    private async handleFulfill() {
        if (!this.order) return;
        if (!confirm('Fulfilling this order will reduce stock and create an invoice. Proceed?')) return;

        this.processing = true;
        try {
            await OrderService.fulfillOrder(this.order.id);
            await this.loadOrder(this.order.id);
        } catch (error) {
            ToastService.show('Failed to fulfill order: ' + (error instanceof Error ? error.message : error), 'error');
        } finally {
            this.processing = false;
        }
    }

    private getStatusBadgeClass(status: OrderStatus): string {
        const color = getStatusColor(status);
        let bg = 'bg-white/10 text-white';
        if (color === 'info') bg = 'bg-blue-500/20 text-blue-400 border-blue-500/50';
        if (color === 'success') bg = 'bg-gable-green/20 text-gable-green border-gable-green/50';
        return bg;
    }

    render() {
        if (this.loading) {
            return html`<div class="text-white">Loading order details...</div>`;
        }
        if (this.error || !this.order) {
            return html`<div class="text-white">Failed to load order details.</div>`;
        }

        const order = this.order;
        const marginColor = order.margin_percent >= 20 ? 'text-emerald-400' :
            order.margin_percent >= 10 ? 'text-amber-400' : 'text-red-400';

        return html`
            <div class="space-y-6 max-w-5xl mx-auto">
                <!-- Header -->
                <div class="flex items-center justify-between pb-6 border-b border-white/10">
                    <div>
                        <div class="flex items-center gap-4 mb-2">
                            <h1 class="text-3xl font-bold font-mono text-white">Order #${order.id.slice(0, 8)}</h1>
                            <span class="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium border border-transparent ${this.getStatusBadgeClass(order.status)}">
                                ${order.status}
                            </span>
                        </div>
                        <p class="text-muted-foreground">Created on ${new Date(order.created_at).toLocaleString()}</p>
                    </div>
                    <div class="flex gap-3">
                        ${(order.status === 'DRAFT' || order.status === 'ON_HOLD') ? html`
                            <button
                                @click=${() => this.handleConfirm()}
                                ?disabled=${this.processing}
                                class="bg-gable-green text-black font-bold px-4 py-2 rounded hover:bg-gable-green/90 transition-colors flex items-center gap-2"
                            >
                                ${this.processing ? 'Processing...' : html`${icon(Check, 18)} ${order.status === 'ON_HOLD' ? 'Retry Confirmation' : 'Confirm Order'}`}
                            </button>
                        ` : nothing}
                        ${order.status === 'CONFIRMED' ? html`
                            <button
                                @click=${() => this.handleFulfill()}
                                ?disabled=${this.processing}
                                class="bg-blue-500 text-white font-bold px-4 py-2 rounded hover:bg-blue-600 transition-colors flex items-center gap-2"
                            >
                                ${this.processing ? 'Processing...' : html`${icon(Truck, 18)} Fulfill & Invoice`}
                            </button>
                        ` : nothing}
                        ${(order.status === 'CONFIRMED' || order.status === 'FULFILLED') ? html`
                            <button
                                @click=${() => window.open(`${API_URL}/api/v1/documents/print/pickticket/${order.id}`, '_blank')}
                                class="bg-white/10 text-white font-bold px-4 py-2 rounded hover:bg-white/20 transition-colors flex items-center gap-2"
                            >
                                ${icon(Printer, 18)} Pick Ticket
                            </button>
                        ` : nothing}
                    </div>
                </div>

                <div class="grid grid-cols-3 gap-6">
                    <!-- Main Content: Lines -->
                    <div class="col-span-2 space-y-6">
                        <div class="bg-slate-steel rounded-lg border border-white/10 overflow-hidden">
                            <div class="px-6 py-4 border-b border-white/10">
                                <h2 class="font-semibold text-white">Line Items</h2>
                            </div>
                            <table class="w-full text-left text-sm" aria-label="Order line items">
                                <thead class="bg-white/5">
                                    <tr>
                                        <th class="p-4 text-muted-foreground font-medium">Product</th>
                                        <th class="p-4 text-muted-foreground font-medium text-right">Qty</th>
                                        <th class="p-4 text-muted-foreground font-medium text-right">Price</th>
                                        <th class="p-4 text-muted-foreground font-medium text-right">Total</th>
                                        <th class="p-4 text-muted-foreground font-medium text-right">Cost</th>
                                        <th class="p-4 text-muted-foreground font-medium text-right">Margin</th>
                                    </tr>
                                </thead>
                                <tbody class="divide-y divide-white/5">
                                    ${order.lines?.map(line => {
                                        const lineTotal = line.quantity * line.price_each;
                                        const lineCost = line.quantity * line.unit_cost;
                                        const lineMargin = lineTotal - lineCost;
                                        const lineMarginPct = lineTotal > 0 ? (lineMargin / lineTotal) * 100 : 0;
                                        const lmColor = lineMarginPct >= 20 ? 'text-emerald-400' :
                                            lineMarginPct >= 10 ? 'text-amber-400' : 'text-red-400';
                                        return html`
                                            <tr>
                                                <td class="p-4 text-white">
                                                    <div class="font-mono text-sm">${line.product_sku || line.product_id.slice(0, 8)}</div>
                                                    ${line.product_name ? html`<div class="text-xs text-muted-foreground">${line.product_name}</div>` : nothing}
                                                </td>
                                                <td class="p-4 text-white font-mono text-right">${line.quantity}</td>
                                                <td class="p-4 text-white font-mono text-right">$${line.price_each.toFixed(2)}</td>
                                                <td class="p-4 text-gable-green font-mono text-right font-medium">
                                                    $${lineTotal.toFixed(2)}
                                                </td>
                                                <td class="p-4 text-zinc-400 font-mono text-right">$${lineCost.toFixed(2)}</td>
                                                <td class="p-4 font-mono text-right ${lmColor}">
                                                    $${lineMargin.toFixed(2)}
                                                    <span class="text-xs ml-1">(${lineMarginPct.toFixed(1)}%)</span>
                                                </td>
                                            </tr>
                                        `;
                                    })}
                                </tbody>
                                <tfoot class="bg-white/5">
                                    <tr>
                                        <td colspan="3" class="p-4 text-right font-bold text-white uppercase">Grand Total</td>
                                        <td class="p-4 text-right font-bold text-gable-green font-mono text-lg">
                                            $${order.total_amount.toFixed(2)}
                                        </td>
                                        <td class="p-4 text-right font-mono text-zinc-400">
                                            $${order.total_cost.toFixed(2)}
                                        </td>
                                        <td class="p-4 text-right font-mono font-bold ${marginColor}">
                                            $${order.total_margin.toFixed(2)}
                                        </td>
                                    </tr>
                                </tfoot>
                            </table>
                        </div>
                    </div>

                    <!-- Sidebar -->
                    <div class="space-y-6">
                        <!-- Customer Details -->
                        <div class="bg-slate-steel rounded-lg border border-white/10 p-6">
                            <h3 class="font-semibold text-white mb-4">Customer Details</h3>
                            <div class="space-y-2 text-sm">
                                ${order.customer_name ? html`<p class="text-white font-medium text-base">${order.customer_name}</p>` : nothing}
                                <p class="text-muted-foreground">Account: <span class="text-white font-mono">${order.customer_id.slice(0, 8)}</span></p>
                            </div>
                        </div>

                        <!-- Salesperson Card -->
                        <div class="bg-slate-steel rounded-lg border border-white/10 p-6">
                            <h3 class="font-semibold text-white mb-4 flex items-center gap-2">
                                ${icon(User, 16, 'text-blue-400')} Salesperson
                            </h3>
                            ${this.salesperson ? html`
                                <div class="space-y-3 text-sm">
                                    <p class="text-white font-medium text-base">${this.salesperson.name}</p>
                                    <p class="text-muted-foreground">
                                        <span class="px-2 py-0.5 rounded text-xs font-medium bg-blue-500/10 text-blue-400">${this.salesperson.role}</span>
                                    </p>
                                    <div class="space-y-1.5 pt-1">
                                        <p class="text-zinc-400 flex items-center gap-2">
                                            ${icon(Mail, 14)} ${this.salesperson.email}
                                        </p>
                                        <p class="text-zinc-400 flex items-center gap-2">
                                            ${icon(Phone, 14)} ${this.salesperson.phone}
                                        </p>
                                    </div>
                                </div>
                            ` : html`
                                <p class="text-sm text-zinc-500">No salesperson assigned</p>
                            `}
                        </div>

                        <!-- Margin & Commission Card -->
                        <div class="bg-slate-steel rounded-lg border border-white/10 p-6">
                            <h3 class="font-semibold text-white mb-4 flex items-center gap-2">
                                ${icon(DollarSign, 16, 'text-emerald-400')} Margin & Commission
                            </h3>
                            <div class="space-y-3 text-sm">
                                <div class="flex justify-between">
                                    <span class="text-zinc-400">Revenue</span>
                                    <span class="text-white font-mono font-medium">$${order.total_amount.toFixed(2)}</span>
                                </div>
                                <div class="flex justify-between">
                                    <span class="text-zinc-400">Cost</span>
                                    <span class="text-white font-mono">$${order.total_cost.toFixed(2)}</span>
                                </div>
                                <div class="border-t border-white/10 pt-3 flex justify-between">
                                    <span class="text-zinc-400">Margin</span>
                                    <span class="font-mono font-bold ${marginColor}">
                                        $${order.total_margin.toFixed(2)} (${order.margin_percent.toFixed(1)}%)
                                    </span>
                                </div>
                                <div class="flex justify-between">
                                    <span class="text-zinc-400">Commission</span>
                                    <span class="text-white font-mono">$${order.total_commission.toFixed(2)}</span>
                                </div>
                            </div>
                        </div>

                        <!-- Payment Info -->
                        <div class="bg-slate-steel rounded-lg border border-white/10 p-6">
                            <h3 class="font-semibold text-white mb-4">Payment</h3>
                            <div class="p-3 bg-white/5 rounded text-sm text-muted-foreground text-center">
                                No payment recorded
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        `;
    }
}
