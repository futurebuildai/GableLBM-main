import { LitElement, html, nothing } from 'lit';
import { customElement, property, state } from 'lit/decorators.js';
import { icon } from '../lib/icons.ts';
import { router } from '../lib/router.ts';
import { ToastService } from '../lib/toast-service.ts';
import { QuoteService } from '../services/QuoteService.ts';
import { ProductService } from '../services/product.service.ts';
import { CustomerService } from '../services/CustomerService.ts';
import { deliveryService } from '../services/deliveryService.ts';
import type { Customer } from '../types/customer.ts';
import type { Product } from '../types/product.ts';
import type { CreateQuoteRequest } from '../types/quote.ts';
import type { QuoteLineEscalator } from '../types/pricing.ts';
import type { ParseResponse, ParsedItem } from '../types/parsing.ts';
import type { Vehicle } from '../types/delivery.ts';
import { Save, FileText, Calculator, CreditCard, AlertCircle, TrendingUp, Truck, Package } from 'lucide';

// Side-effect imports: register child custom elements
import './quotes/QuoteList.ts';
import '../components/customers/CustomerSelect.ts';
import '../components/quotes/MaterialListUpload.ts';
import '../components/quotes/LineItemEditor.ts';
import '../components/quotes/EscalatorToggle.ts';
import '../components/quotes/ParsedResultsPanel.ts';

interface LineWithEscalator {
    product_id: string;
    sku: string;
    description: string;
    quantity: number;
    uom: string;
    unit_price: number;
    escalator: QuoteLineEscalator;
}

const defaultEscalator = (): QuoteLineEscalator => ({
    enabled: false,
    escalation_type: 'PERCENTAGE',
    escalation_rate: 5,
    effective_date: new Date().toISOString().split('T')[0],
    target_date: new Date(Date.now() + 90 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
});

@customElement('gable-quote-builder')
export class GableQuoteBuilder extends LitElement {
    createRenderRoot() { return this; }

    @property({ attribute: 'route-id' }) routeId = '';

    @state() private customer: Customer | null = null;
    @state() private products: Product[] = [];
    @state() private lines: LineWithEscalator[] = [];
    @state() private loading = false;
    @state() private initialLoading = false;

    // Delivery state
    @state() private deliveryType: 'PICKUP' | 'DELIVERY' = 'PICKUP';
    @state() private freightAmount = 0;
    @state() private selectedVehicleId: string | undefined;
    @state() private vehicles: Vehicle[] = [];

    // AI Parsing state
    @state() private parseResult: ParseResponse | null = null;
    @state() private showParsePanel = false;
    @state() private aiSource = false;
    @state() private lastParseResult: ParseResponse | null = null;

    private get isEditing() { return !!this.routeId; }

    connectedCallback() {
        super.connectedCallback();
        if (this.routeId) this.initialLoading = true;
        this.loadProducts();
        this.loadVehicles();
        if (this.routeId) this.loadExistingQuote(this.routeId);
    }

    private async loadProducts() {
        try {
            const data = await ProductService.getProducts();
            this.products = data;
        } catch (err) {
            console.error('Failed to load products', err);
        }
    }

    private async loadVehicles() {
        try {
            const data = await deliveryService.listVehicles();
            this.vehicles = data || [];
        } catch (err) {
            console.error('Failed to load vehicles', err);
        }
    }

    private async loadExistingQuote(editId: string) {
        try {
            const quote = await QuoteService.getQuote(editId);
            if (quote.state !== 'DRAFT') {
                ToastService.show('Only draft quotes can be edited', 'error');
                router.navigate(`/quotes/${editId}`);
                return;
            }
            try {
                const c = await CustomerService.getCustomer(quote.customer_id);
                this.customer = c;
            } catch { /* customer might not load, that's ok */ }

            if (quote.lines) {
                this.lines = quote.lines.map(l => ({
                    product_id: l.product_id,
                    sku: l.sku,
                    description: l.description,
                    quantity: l.quantity,
                    uom: l.uom,
                    unit_price: l.unit_price,
                    escalator: defaultEscalator(),
                }));
            }
            if (quote.source === 'ai') this.aiSource = true;
            if (quote.delivery_type) this.deliveryType = quote.delivery_type;
            if (quote.freight_amount) this.freightAmount = quote.freight_amount;
            if (quote.vehicle_id) this.selectedVehicleId = quote.vehicle_id;
        } catch (err) {
            console.error('Failed to load quote for editing', err);
            ToastService.show('Failed to load quote', 'error');
            router.navigate('/quotes');
        } finally {
            this.initialLoading = false;
        }
    }

    private handleAddLine(product: Product, quantity: number, unitPrice: number) {
        this.lines = [...this.lines, {
            product_id: product.id,
            sku: product.sku,
            description: product.description,
            uom: product.uom_primary,
            quantity,
            unit_price: unitPrice,
            escalator: defaultEscalator(),
        }];
    }

    private handleEscalatorChange(idx: number, escalator: QuoteLineEscalator) {
        const updated = [...this.lines];
        updated[idx] = { ...updated[idx], escalator };
        this.lines = updated;
    }

    private handleParseComplete(result: ParseResponse) {
        this.parseResult = result;
        this.showParsePanel = true;
    }

    private handleAcceptParsed(parsedItems: ParsedItem[]) {
        const newLines: LineWithEscalator[] = parsedItems.map(item => ({
            product_id: item.matched_product?.product_id || '',
            sku: item.matched_product?.sku || 'SPECIAL-ORDER',
            description: item.matched_product?.description || item.raw_text,
            quantity: item.quantity,
            uom: item.matched_product?.uom || item.uom,
            unit_price: item.matched_product?.base_price || 0,
            escalator: defaultEscalator(),
        }));
        this.lines = [...this.lines, ...newLines];
        this.aiSource = true;
        this.lastParseResult = this.parseResult;
        this.showParsePanel = false;
        this.parseResult = null;
        ToastService.show(`${parsedItems.length} items added from material list`, 'success');
    }

    private async handleSave() {
        if (!this.customer) return;
        this.loading = true;
        try {
            const payload: CreateQuoteRequest = {
                customer_id: this.customer.id,
                source: this.aiSource ? 'ai' : 'manual',
                delivery_type: this.deliveryType,
                freight_amount: this.deliveryType === 'DELIVERY' ? this.freightAmount : 0,
                vehicle_id: this.deliveryType === 'DELIVERY' ? this.selectedVehicleId : undefined,
                lines: this.lines.map(l => ({
                    product_id: l.product_id,
                    sku: l.sku,
                    description: l.description,
                    quantity: l.quantity,
                    uom: l.uom as import('../types/product.ts').UOM,
                    unit_price: l.unit_price,
                })),
            };

            // Attach AI parse data if available
            if (this.aiSource && this.lastParseResult) {
                payload.parse_map = this.lastParseResult.items;
                if (this.lastParseResult.source_image) {
                    const [header, data] = this.lastParseResult.source_image.split(',');
                    const contentType = header?.match(/data:([^;]+)/)?.[1] || 'application/octet-stream';
                    payload.original_file = data;
                    payload.original_content_type = contentType;
                    payload.original_filename = 'material-list-upload';
                }
            }

            let quote;
            if (this.isEditing && this.routeId) {
                quote = await QuoteService.updateQuote(this.routeId, payload);
                ToastService.show('Quote updated', 'success');
            } else {
                quote = await QuoteService.createQuote(payload);
                ToastService.show('Draft quote created', 'success');
            }
            router.navigate(`/quotes/${quote.id}`);
        } catch (err) {
            console.error(err);
            ToastService.show('Failed to save quote', 'error');
        } finally {
            this.loading = false;
        }
    }

    private get subtotalAmount() {
        return this.lines.reduce((sum, line) => sum + (line.quantity * line.unit_price), 0);
    }

    private get effectiveFreight() {
        return this.deliveryType === 'DELIVERY' ? this.freightAmount : 0;
    }

    private get totalAmount() {
        return this.subtotalAmount + this.effectiveFreight;
    }

    private get escalatedTotal() {
        return this.lines.reduce((sum, line) => {
            if (line.escalator.enabled && line.escalator.result) {
                return sum + (line.quantity * line.escalator.result.future_price);
            }
            return sum + (line.quantity * line.unit_price);
        }, 0);
    }

    private get hasEscalators() {
        return this.lines.some(l => l.escalator.enabled && l.escalator.result);
    }

    private get hasStaleLines() {
        return this.lines.some(l => l.escalator.result?.is_stale);
    }

    private get isOverLimit() {
        return this.customer ? (this.customer.balance_due + this.totalAmount) > this.customer.credit_limit : false;
    }

    render() {
        if (this.initialLoading) {
            return html`
                <div>
                    <gable-quote-view-tabs active="new"></gable-quote-view-tabs>
                    <div class="text-slate-400 p-12 text-center">Loading quote...</div>
                </div>
            `;
        }

        return html`
            <div>
                ${!this.isEditing ? html`<gable-quote-view-tabs active="new"></gable-quote-view-tabs>` : nothing}

                <div class="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-8">
                    <div>
                        <h1 class="text-display-large text-white flex items-center gap-3">
                            ${icon(FileText, 40, 'w-10 h-10 text-gable-green')}
                            ${this.isEditing ? 'Edit Quote' : 'New Quote'}
                        </h1>
                        <p class="text-zinc-500 mt-1 max-w-2xl text-lg">
                            ${this.isEditing ? 'Update this draft quote.' : 'Draft a new pricing proposal.'}
                        </p>
                    </div>
                    <button
                        @click=${() => this.handleSave()}
                        ?disabled=${!this.customer || this.lines.length === 0 || this.loading}
                        class="inline-flex items-center justify-center rounded-lg text-sm font-medium transition-colors bg-gable-green text-deep-space hover:bg-gable-green/90 px-4 py-2 shadow-glow disabled:opacity-50"
                    >
                        ${this.loading ? html`<span class="animate-spin mr-2">...</span>` : icon(Save, 16, 'w-4 h-4 mr-2')}
                        ${this.isEditing ? 'Save Changes' : 'Create Quote'}
                    </button>
                </div>

                <div class="grid grid-cols-1 lg:grid-cols-12 gap-8">
                    <!-- Left Column: Customer & Details -->
                    <div class="lg:col-span-4 space-y-6">
                        <div class="bg-slate-steel/50 backdrop-blur border border-white/10 rounded-xl overflow-hidden">
                            <div class="p-6">
                                <h2 class="text-lg font-medium text-white mb-4 flex items-center gap-2">
                                    ${icon(CreditCard, 20, 'w-5 h-5 text-zinc-400')}
                                    Customer Details
                                </h2>
                                <gable-customer-select
                                    @customer-select=${(e: CustomEvent) => { this.customer = e.detail; }}
                                    .selectedCustomerId=${this.customer?.id}
                                ></gable-customer-select>

                                ${this.customer ? html`
                                    <div class="mt-6 space-y-4 text-sm border-t border-white/5 pt-6">
                                        <div class="flex justify-between items-center bg-white/5 p-3 rounded-lg">
                                            <span class="text-zinc-400">Account #</span>
                                            <span class="font-mono text-white font-bold">${this.customer.account_number}</span>
                                        </div>
                                        <div class="flex justify-between items-center">
                                            <span class="text-zinc-400">Price Level</span>
                                            <span class="text-gable-green font-medium px-2 py-0.5 rounded bg-gable-green/10 border border-gable-green/20">
                                                ${this.customer.price_level?.name || 'Retail'}
                                            </span>
                                        </div>
                                        <div class="space-y-2 pt-2">
                                            <div class="flex justify-between">
                                                <span class="text-zinc-400">Credit Limit</span>
                                                <span class="font-mono text-zinc-200">$${this.customer.credit_limit?.toLocaleString() || '0.00'}</span>
                                            </div>
                                            <div class="flex justify-between">
                                                <span class="text-zinc-400">Balance Due</span>
                                                <span class="font-mono ${this.customer.balance_due > this.customer.credit_limit ? 'text-rose-500 font-bold' : 'text-zinc-200'}">
                                                    $${this.customer.balance_due.toLocaleString()}
                                                </span>
                                            </div>
                                            <div class="flex justify-between border-t border-white/5 pt-2">
                                                <span class="text-zinc-400">Available</span>
                                                <span class="font-mono font-bold ${(this.customer.credit_limit - this.customer.balance_due) < 0 ? 'text-rose-500' : 'text-emerald-400'}">
                                                    $${(this.customer.credit_limit - this.customer.balance_due).toLocaleString()}
                                                </span>
                                            </div>
                                        </div>
                                        ${this.isOverLimit ? html`
                                            <div class="flex items-start gap-3 bg-rose-500/10 border border-rose-500/20 text-rose-400 text-xs p-3 rounded-lg">
                                                ${icon(AlertCircle, 16, 'w-4 h-4 shrink-0 mt-0.5')}
                                                <p>This quote exceeds the customer's credit limit. Approval will be required.</p>
                                            </div>
                                        ` : nothing}
                                    </div>
                                ` : nothing}
                            </div>
                        </div>

                        <div class="bg-slate-steel/50 backdrop-blur border border-white/10 rounded-xl overflow-hidden">
                            <div class="p-6">
                                <h2 class="text-lg font-medium text-white mb-4 flex items-center gap-2">
                                    ${icon(Truck, 20, 'w-5 h-5 text-zinc-400')}
                                    Fulfillment
                                </h2>

                                <!-- Delivery Type Toggle -->
                                <div class="flex gap-1 bg-white/5 rounded-lg p-1 border border-white/10 mb-4">
                                    <button
                                        @click=${() => { this.deliveryType = 'PICKUP'; this.freightAmount = 0; this.selectedVehicleId = undefined; }}
                                        class="flex-1 flex items-center justify-center gap-2 px-3 py-2 rounded-md text-sm font-medium transition-all ${
                                            this.deliveryType === 'PICKUP'
                                                ? 'bg-gable-green/10 text-gable-green border border-gable-green/20'
                                                : 'text-zinc-400 hover:text-white'
                                        }"
                                    >
                                        ${icon(Package, 14)} Pickup
                                    </button>
                                    <button
                                        @click=${() => { this.deliveryType = 'DELIVERY'; }}
                                        class="flex-1 flex items-center justify-center gap-2 px-3 py-2 rounded-md text-sm font-medium transition-all ${
                                            this.deliveryType === 'DELIVERY'
                                                ? 'bg-blue-500/10 text-blue-400 border border-blue-500/20'
                                                : 'text-zinc-400 hover:text-white'
                                        }"
                                    >
                                        ${icon(Truck, 14)} Delivery
                                    </button>
                                </div>

                                ${this.deliveryType === 'DELIVERY' ? html`
                                    <div class="space-y-4">
                                        <div>
                                            <label class="block text-xs text-zinc-500 mb-1.5">Assign Truck</label>
                                            <select
                                                .value=${this.selectedVehicleId || ''}
                                                @change=${(e: Event) => { this.selectedVehicleId = (e.target as HTMLSelectElement).value || undefined; }}
                                                class="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:ring-1 focus:ring-blue-500/50"
                                            >
                                                <option value="">Select a truck...</option>
                                                ${this.vehicles.map(v => html`
                                                    <option value="${v.id}">
                                                        ${v.name} \u2014 ${v.vehicle_type.replace(/_/g, ' ')} (${v.license_plate})
                                                    </option>
                                                `)}
                                            </select>
                                            ${this.vehicles.length === 0 ? html`
                                                <p class="text-xs text-zinc-500 mt-1">No vehicles in fleet. Add vehicles in Fleet Management.</p>
                                            ` : nothing}
                                        </div>
                                        <div>
                                            <label class="block text-xs text-zinc-500 mb-1.5">Freight Charge ($)</label>
                                            <input
                                                type="number"
                                                min="0"
                                                step="0.01"
                                                .value=${String(this.freightAmount || '')}
                                                @input=${(e: Event) => { this.freightAmount = parseFloat((e.target as HTMLInputElement).value) || 0; }}
                                                placeholder="0.00"
                                                class="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-white font-mono focus:outline-none focus:ring-1 focus:ring-blue-500/50"
                                            />
                                        </div>
                                    </div>
                                ` : nothing}
                            </div>
                        </div>

                        <div class="bg-slate-steel/50 backdrop-blur border border-white/10 rounded-xl overflow-hidden bg-gradient-to-br from-gable-green/5 to-emerald-900/5 border-gable-green/20">
                            <div class="p-6">
                                <h2 class="text-lg font-medium text-white mb-4 flex items-center gap-2">
                                    ${icon(Calculator, 20, 'w-5 h-5 text-gable-green')}
                                    Quote Summary
                                </h2>
                                <div class="flex items-baseline justify-between">
                                    <span class="text-zinc-400">Subtotal</span>
                                    <span class="font-mono font-bold ${this.effectiveFreight > 0 ? 'text-lg text-zinc-300' : 'text-2xl text-white'}">$${this.subtotalAmount.toFixed(2)}</span>
                                </div>

                                ${this.effectiveFreight > 0 ? html`
                                    <div class="flex items-baseline justify-between mt-2">
                                        <span class="text-zinc-400 flex items-center gap-1.5 text-sm">
                                            ${icon(Truck, 14, 'w-3.5 h-3.5 text-blue-400')}
                                            Freight
                                        </span>
                                        <span class="font-mono font-bold text-lg text-blue-400">$${this.effectiveFreight.toFixed(2)}</span>
                                    </div>
                                ` : nothing}

                                ${this.effectiveFreight > 0 ? html`
                                    <div class="flex items-baseline justify-between mt-2 pt-2 border-t border-white/5">
                                        <span class="text-zinc-400 font-medium">Total</span>
                                        <span class="text-2xl font-mono font-bold text-white">$${this.totalAmount.toFixed(2)}</span>
                                    </div>
                                ` : nothing}

                                ${this.hasEscalators ? html`
                                    <div class="mt-3 pt-3 border-t border-white/5">
                                        <div class="flex items-baseline justify-between">
                                            <span class="text-zinc-400 flex items-center gap-1.5 text-sm">
                                                ${icon(TrendingUp, 14, 'w-3.5 h-3.5 text-gable-green')}
                                                Escalated Total
                                            </span>
                                            <span class="text-xl font-mono font-bold text-emerald-400">
                                                $${this.escalatedTotal.toFixed(2)}
                                            </span>
                                        </div>
                                        <div class="text-[10px] text-zinc-500 text-right mt-1">
                                            +$${(this.escalatedTotal - this.totalAmount).toFixed(2)} from escalators
                                        </div>
                                    </div>
                                ` : nothing}

                                ${this.hasStaleLines ? html`
                                    <div class="mt-3 flex items-center gap-2 bg-amber-500/10 border border-amber-500/20 text-amber-400 text-xs p-2.5 rounded-lg">
                                        ${icon(AlertCircle, 14, 'w-3.5 h-3.5 shrink-0')}
                                        Some lines have stale pricing
                                    </div>
                                ` : nothing}

                                <div class="text-xs text-zinc-500 text-right mt-1">Tax calculated at invoicing</div>
                            </div>
                        </div>
                    </div>

                    <!-- Right Column: Lines -->
                    <div class="lg:col-span-8 space-y-6">
                        <div class="bg-slate-steel/50 backdrop-blur border border-white/10 rounded-xl overflow-hidden h-full">
                            <div class="p-6">
                                <div class="flex items-center justify-between mb-6">
                                    <h2 class="text-lg font-medium text-white">Line Items</h2>
                                    <gable-material-list-upload
                                        @parse-complete=${(e: CustomEvent) => this.handleParseComplete(e.detail)}
                                        ?disabled=${this.loading}
                                    ></gable-material-list-upload>
                                </div>

                                <gable-line-item-editor
                                    .products=${this.products}
                                    .customerId=${this.customer?.id}
                                    @add-line=${(e: CustomEvent) => this.handleAddLine(e.detail.product, e.detail.quantity, e.detail.unitPrice)}
                                ></gable-line-item-editor>

                                <!-- Lines Table -->
                                <div class="mt-8 rounded-lg overflow-hidden border border-white/5 bg-black/20">
                                    <table class="w-full text-sm text-left">
                                        <thead class="bg-white/5 text-zinc-400 uppercase tracking-wider text-xs font-semibold">
                                            <tr>
                                                <th class="px-6 py-4">SKU / Description</th>
                                                <th class="px-6 py-4 text-right">Qty</th>
                                                <th class="px-6 py-4 text-right">Unit Price</th>
                                                <th class="px-6 py-4 text-right">Total</th>
                                            </tr>
                                        </thead>
                                        <tbody class="divide-y divide-white/5">
                                            ${this.lines.length === 0 ? html`
                                                <tr>
                                                    <td colspan="4" class="px-6 py-12 text-center text-zinc-500 italic">
                                                        No items added yet. Start building the quote above.
                                                    </td>
                                                </tr>
                                            ` : nothing}
                                            ${this.lines.map((line, idx) => html`
                                                <tr class="group hover:bg-white/5 transition-colors">
                                                    <td class="px-6 py-4">
                                                        <div class="font-mono text-white mb-0.5 group-hover:text-gable-green transition-colors">${line.sku}</div>
                                                        <div class="text-zinc-400 text-xs">${line.description}</div>

                                                        <gable-escalator-toggle
                                                            .basePrice=${line.unit_price}
                                                            .escalator=${line.escalator}
                                                            @escalator-change=${(e: CustomEvent<QuoteLineEscalator>) => this.handleEscalatorChange(idx, e.detail)}
                                                        ></gable-escalator-toggle>
                                                    </td>
                                                    <td class="px-6 py-4 text-right font-mono text-zinc-300 align-top">
                                                        ${line.quantity} <span class="text-zinc-600 text-[10px] ml-1">${line.uom}</span>
                                                    </td>
                                                    <td class="px-6 py-4 text-right font-mono text-zinc-300 align-top">
                                                        $${line.unit_price.toFixed(2)}
                                                        ${line.escalator.result ? html`
                                                            <div class="text-xs text-emerald-400 mt-1">
                                                                \u2192 $${line.escalator.result.future_price.toFixed(2)}
                                                            </div>
                                                        ` : nothing}
                                                    </td>
                                                    <td class="px-6 py-4 text-right font-mono font-bold text-emerald-400 align-top">
                                                        $${(line.quantity * line.unit_price).toFixed(2)}
                                                        ${line.escalator.result ? html`
                                                            <div class="text-xs text-emerald-300/70 mt-1">
                                                                \u2192 $${(line.quantity * line.escalator.result.future_price).toFixed(2)}
                                                            </div>
                                                        ` : nothing}
                                                    </td>
                                                </tr>
                                            `)}
                                        </tbody>
                                        ${this.lines.length > 0 ? html`
                                            <tfoot class="bg-white/5 border-t border-white/10">
                                                <tr>
                                                    <td colspan="3" class="px-6 py-4 text-right font-medium text-zinc-400 uppercase tracking-wider text-xs">
                                                        ${this.effectiveFreight > 0 ? 'Lines Subtotal' : 'Total Amount'}
                                                    </td>
                                                    <td class="px-6 py-4 text-right font-mono text-xl font-bold text-gable-green">$${this.subtotalAmount.toFixed(2)}</td>
                                                </tr>
                                                ${this.effectiveFreight > 0 ? html`
                                                    <tr class="border-t border-white/5">
                                                        <td colspan="3" class="px-6 py-2 text-right text-zinc-400 text-xs">
                                                            <span class="flex items-center justify-end gap-1.5">
                                                                ${icon(Truck, 12, 'w-3 h-3 text-blue-400')} Freight
                                                            </span>
                                                        </td>
                                                        <td class="px-6 py-2 text-right font-mono text-sm text-blue-400">$${this.effectiveFreight.toFixed(2)}</td>
                                                    </tr>
                                                    <tr class="border-t border-white/5">
                                                        <td colspan="3" class="px-6 py-4 text-right font-medium text-zinc-400 uppercase tracking-wider text-xs">Total Amount</td>
                                                        <td class="px-6 py-4 text-right font-mono text-xl font-bold text-gable-green">$${this.totalAmount.toFixed(2)}</td>
                                                    </tr>
                                                ` : nothing}
                                            </tfoot>
                                        ` : nothing}
                                    </table>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>

                <!-- AI Parse Results Overlay -->
                ${this.showParsePanel && this.parseResult ? html`
                    <gable-parsed-results-panel
                        .result=${this.parseResult}
                        @accept=${(e: CustomEvent) => this.handleAcceptParsed(e.detail)}
                        @close=${() => {
                            this.showParsePanel = false;
                            this.parseResult = null;
                        }}
                    ></gable-parsed-results-panel>
                ` : nothing}
            </div>
        `;
    }
}
