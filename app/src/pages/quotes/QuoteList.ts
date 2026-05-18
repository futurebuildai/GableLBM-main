import { LitElement, html, nothing } from 'lit';
import { customElement, state, property } from 'lit/decorators.js';
import { icon } from '../../lib/icons.ts';
import { router } from '../../lib/router.ts';
import { ToastService } from '../../lib/toast-service.ts';
import { ArrowRight, ShoppingCart, BarChart3, Sparkles, Send, Check, X, List, FilePlus, Pencil, Truck, Package } from 'lucide';
import { QuoteService } from '../../services/QuoteService.ts';
import { OrderService } from '../../services/OrderService.ts';
import type { Quote, QuoteState } from '../../types/quote.ts';
import { onBranchChanged } from '../../lib/branch-listener.ts';

@customElement('gable-quote-view-tabs')
export class GableQuoteViewTabs extends LitElement {
    createRenderRoot() { return this; }

    @property({ type: String }) active: 'list' | 'new' = 'list';

    render() {
        return html`
            <div class="flex gap-1 mb-6 border-b border-white/10">
                <a
                    href="/quotes"
                    class="flex items-center gap-2 px-5 py-3 text-sm font-medium transition-colors relative ${
                        this.active === 'list' ? 'text-gable-green' : 'text-zinc-400 hover:text-white'
                    }"
                >
                    ${icon(List, 16)} All Quotes
                    ${this.active === 'list' ? html`<span class="absolute bottom-0 left-0 right-0 h-0.5 bg-gable-green"></span>` : nothing}
                </a>
                <a
                    href="/quotes/new"
                    class="flex items-center gap-2 px-5 py-3 text-sm font-medium transition-colors relative ${
                        this.active === 'new' ? 'text-gable-green' : 'text-zinc-400 hover:text-white'
                    }"
                >
                    ${icon(FilePlus, 16)} New Quote
                    ${this.active === 'new' ? html`<span class="absolute bottom-0 left-0 right-0 h-0.5 bg-gable-green"></span>` : nothing}
                </a>
            </div>
        `;
    }
}

@customElement('gable-quote-list')
export class GableQuoteList extends LitElement {
    createRenderRoot() { return this; }

    @state() private quotes: Quote[] = [];
    @state() private loading = true;
    @state() private error: string | null = null;
    @state() private converting: string | null = null;
    @state() private updatingState: string | null = null;

    private stateColors: Record<string, string> = {
        DRAFT: 'bg-zinc-500/20 text-zinc-400 border-zinc-500/30',
        SENT: 'bg-blue-500/20 text-blue-400 border-blue-500/30',
        ACCEPTED: 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30',
        REJECTED: 'bg-red-500/20 text-red-400 border-red-500/30',
        EXPIRED: 'bg-amber-500/20 text-amber-400 border-amber-500/30',
    };

    private _unsubBranch: (() => void) | null = null;

    connectedCallback() {
        super.connectedCallback();
        this.loadQuotes();
        this._unsubBranch = onBranchChanged(() => {
            this.loading = true;
            this.loadQuotes();
        });
    }

    disconnectedCallback() {
        super.disconnectedCallback();
        if (this._unsubBranch) {
            this._unsubBranch();
            this._unsubBranch = null;
        }
    }

    private async loadQuotes() {
        try {
            this.error = null;
            const data = await QuoteService.listQuotes();
            this.quotes = data || [];
        } catch (err) {
            console.error('Failed to load quotes:', err);
            this.error = err instanceof Error ? err.message : 'Failed to load quotes';
        } finally {
            this.loading = false;
        }
    }

    private async handleConvert(quoteId: string) {
        this.converting = quoteId;
        try {
            const orderPayload = await QuoteService.convertToOrder(quoteId);
            const order = await OrderService.createOrder(orderPayload);
            ToastService.show('Quote converted to order successfully', 'success');
            router.navigate(`/orders/${order.id}`);
        } catch (error) {
            ToastService.show(`Failed to convert: ${error instanceof Error ? error.message : 'Unknown error'}`, 'error');
        } finally {
            this.converting = null;
        }
    }

    private async handleStateChange(quoteId: string, state: QuoteState) {
        this.updatingState = quoteId;
        try {
            await QuoteService.updateQuoteState(quoteId, state);
            await this.loadQuotes();
            ToastService.show(`Quote marked as ${state.toLowerCase()}`, 'success');
        } catch (error) {
            ToastService.show(`Failed: ${error instanceof Error ? error.message : 'Unknown error'}`, 'error');
        } finally {
            this.updatingState = null;
        }
    }

    render() {
        if (this.error) {
            return html`
                <div class="space-y-6">
                    <gable-quote-view-tabs active="list"></gable-quote-view-tabs>
                    <div class="flex flex-col items-center justify-center min-h-[400px] p-8">
                        <p class="text-rose-400 text-lg font-semibold mb-2">Failed to load</p>
                        <p class="text-gray-400 text-sm mb-4">${this.error}</p>
                        <button
                            @click=${() => { this.error = null; this.loadQuotes(); }}
                            class="px-4 py-2 bg-[#00FFA3] text-[#0A0B10] rounded font-medium hover:opacity-90"
                        >
                            Retry
                        </button>
                    </div>
                </div>
            `;
        }

        return html`
            <div class="space-y-6">
                <gable-quote-view-tabs active="list"></gable-quote-view-tabs>

                <div class="flex items-center justify-between">
                    <div>
                        <h1 class="text-3xl font-bold tracking-tight text-white font-mono">Quotes</h1>
                        <p class="text-muted-foreground mt-2">Manage sales quotes and convert to orders.</p>
                    </div>
                    <div class="flex items-center gap-3">
                        <button
                            @click=${() => router.navigate('/quotes/analytics')}
                            class="border border-white/10 text-zinc-400 hover:text-white hover:border-white/20 font-medium px-4 py-2 rounded transition-colors flex items-center gap-2 text-sm"
                        >
                            ${icon(BarChart3, 16)} Analytics
                        </button>
                    </div>
                </div>

                <div class="bg-slate-steel border border-white/10 rounded-lg overflow-hidden">
                    <table class="w-full text-left text-sm" aria-label="Quotes list">
                        <thead>
                            <tr class="border-b border-white/10 bg-white/5">
                                <th class="p-4 font-medium text-muted-foreground">Quote ID</th>
                                <th class="p-4 font-medium text-muted-foreground">Date</th>
                                <th class="p-4 font-medium text-muted-foreground">Customer</th>
                                <th class="p-4 font-medium text-muted-foreground">Source</th>
                                <th class="p-4 font-medium text-muted-foreground">Fulfillment</th>
                                <th class="p-4 font-medium text-muted-foreground">State</th>
                                <th class="p-4 font-medium text-muted-foreground text-right">Total</th>
                                <th class="p-4 font-medium text-muted-foreground text-right">Actions</th>
                            </tr>
                        </thead>
                        <tbody class="divide-y divide-white/5">
                            ${this.loading ? html`
                                <tr>
                                    <td colspan="8" class="p-8 text-center text-muted-foreground">Loading quotes...</td>
                                </tr>
                            ` : this.quotes.length === 0 ? html`
                                <tr>
                                    <td colspan="8" class="p-8 text-center text-muted-foreground">
                                        No quotes found. Create your first quote to get started.
                                    </td>
                                </tr>
                            ` : this.quotes.map(quote => {
                                const isBusy = this.converting === quote.id || this.updatingState === quote.id;
                                return html`
                                    <tr class="hover:bg-white/5 transition-colors cursor-pointer" @click=${() => router.navigate(`/quotes/${quote.id}`)}>
                                        <td class="p-4 font-mono text-white/80">#${quote.id.slice(0, 8)}</td>
                                        <td class="p-4 text-white/80">${new Date(quote.created_at).toLocaleDateString()}</td>
                                        <td class="p-4 text-white font-medium">${quote.customer_name || quote.customer_id.slice(0, 8)}</td>
                                        <td class="p-4">
                                            ${quote.source === 'ai' ? html`
                                                <span class="inline-flex items-center gap-1 text-xs text-violet-400">
                                                    ${icon(Sparkles, 12)} AI
                                                </span>
                                            ` : html`
                                                <span class="text-xs text-zinc-500">Manual</span>
                                            `}
                                        </td>
                                        <td class="p-4">
                                            ${quote.delivery_type === 'DELIVERY' ? html`
                                                <span class="inline-flex items-center gap-1 text-xs text-blue-400">
                                                    ${icon(Truck, 12)} Delivery
                                                </span>
                                            ` : html`
                                                <span class="inline-flex items-center gap-1 text-xs text-zinc-500">
                                                    ${icon(Package, 12)} Pickup
                                                </span>
                                            `}
                                        </td>
                                        <td class="p-4">
                                            <span class="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium border ${this.stateColors[quote.state] || ''}">
                                                ${quote.state}
                                            </span>
                                        </td>
                                        <td class="p-4 font-mono text-right text-gable-green">
                                            $${quote.total_amount.toFixed(2)}
                                        </td>
                                        <td class="p-4 text-right" @click=${(e: Event) => e.stopPropagation()}>
                                            <div class="flex items-center justify-end gap-1.5">
                                                ${quote.state === 'DRAFT' ? html`
                                                    <button @click=${() => router.navigate(`/quotes/${quote.id}/edit`)} ?disabled=${isBusy}
                                                        class="text-amber-400 hover:text-amber-300 transition-colors p-1 rounded hover:bg-white/5 disabled:opacity-50" title="Edit Draft" aria-label="Edit draft">
                                                        ${icon(Pencil, 14)}
                                                    </button>
                                                ` : nothing}
                                                ${quote.state === 'DRAFT' ? html`
                                                    <button @click=${() => this.handleStateChange(quote.id, 'SENT')} ?disabled=${isBusy}
                                                        class="text-blue-400 hover:text-blue-300 transition-colors p-1 rounded hover:bg-white/5 disabled:opacity-50" title="Mark Sent" aria-label="Mark sent">
                                                        ${icon(Send, 14)}
                                                    </button>
                                                ` : nothing}
                                                ${(quote.state === 'DRAFT' || quote.state === 'SENT') ? html`
                                                    <button @click=${() => this.handleStateChange(quote.id, 'ACCEPTED')} ?disabled=${isBusy}
                                                        class="text-emerald-400 hover:text-emerald-300 transition-colors p-1 rounded hover:bg-white/5 disabled:opacity-50" title="Accept" aria-label="Accept quote">
                                                        ${icon(Check, 14)}
                                                    </button>
                                                    <button @click=${() => this.handleStateChange(quote.id, 'REJECTED')} ?disabled=${isBusy}
                                                        class="text-red-400 hover:text-red-300 transition-colors p-1 rounded hover:bg-white/5 disabled:opacity-50" title="Reject" aria-label="Reject quote">
                                                        ${icon(X, 14)}
                                                    </button>
                                                ` : nothing}
                                                ${(quote.state === 'DRAFT' || quote.state === 'SENT' || quote.state === 'ACCEPTED') ? html`
                                                    <button @click=${() => this.handleConvert(quote.id)} ?disabled=${isBusy}
                                                        class="text-gable-green hover:text-gable-green/80 transition-colors flex items-center gap-1 text-xs font-medium disabled:opacity-50 p-1 rounded hover:bg-white/5"
                                                        title="Convert to Order" aria-label="Convert to order">
                                                        ${icon(ShoppingCart, 14)}
                                                    </button>
                                                ` : nothing}
                                                <button @click=${() => router.navigate(`/quotes/${quote.id}`)}
                                                    class="text-white/50 hover:text-white transition-colors p-1 rounded hover:bg-white/5" aria-label="View quote details">
                                                    ${icon(ArrowRight, 14)}
                                                </button>
                                            </div>
                                        </td>
                                    </tr>
                                `;
                            })}
                        </tbody>
                    </table>
                </div>
            </div>
        `;
    }
}
