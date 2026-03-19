import { useEffect, useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { ArrowRight, ShoppingCart, BarChart3, Sparkles, Send, Check, X, List, FilePlus, Pencil, Truck, Package } from 'lucide-react';
import { QuoteService } from '../../services/QuoteService';
import { OrderService } from '../../services/OrderService';
import type { Quote, QuoteState } from '../../types/quote';
import { useToast } from '../../components/ui/ToastContext';
import { cn } from '../../lib/utils';

export function QuoteViewTabs({ active }: { active: 'list' | 'new' }) {
    return (
        <div className="flex gap-1 mb-6 border-b border-white/10">
            <Link
                to="/erp/quotes"
                className={cn(
                    "flex items-center gap-2 px-5 py-3 text-sm font-medium transition-colors relative",
                    active === 'list' ? "text-gable-green" : "text-zinc-400 hover:text-white"
                )}
            >
                <List size={16} /> All Quotes
                {active === 'list' && <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-gable-green" />}
            </Link>
            <Link
                to="/erp/quotes/new"
                className={cn(
                    "flex items-center gap-2 px-5 py-3 text-sm font-medium transition-colors relative",
                    active === 'new' ? "text-gable-green" : "text-zinc-400 hover:text-white"
                )}
            >
                <FilePlus size={16} /> New Quote
                {active === 'new' && <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-gable-green" />}
            </Link>
        </div>
    );
}

export default function QuoteList() {
    const navigate = useNavigate();
    const { showToast } = useToast();
    const [quotes, setQuotes] = useState<Quote[]>([]);
    const [loading, setLoading] = useState(true);
    const [converting, setConverting] = useState<string | null>(null);
    const [updatingState, setUpdatingState] = useState<string | null>(null);

    useEffect(() => {
        loadQuotes();
    }, []);

    async function loadQuotes() {
        try {
            const data = await QuoteService.listQuotes();
            setQuotes(data || []);
        } catch (error) {
            console.error('Failed to load quotes:', error);
        } finally {
            setLoading(false);
        }
    }

    async function handleConvert(quoteId: string) {
        setConverting(quoteId);
        try {
            const orderPayload = await QuoteService.convertToOrder(quoteId);
            const order = await OrderService.createOrder(orderPayload);
            showToast('Quote converted to order successfully', 'success');
            navigate(`/erp/orders/${order.id}`);
        } catch (error) {
            showToast(`Failed to convert: ${error instanceof Error ? error.message : 'Unknown error'}`, 'error');
        } finally {
            setConverting(null);
        }
    }

    async function handleStateChange(quoteId: string, state: QuoteState) {
        setUpdatingState(quoteId);
        try {
            await QuoteService.updateQuoteState(quoteId, state);
            await loadQuotes();
            showToast(`Quote marked as ${state.toLowerCase()}`, 'success');
        } catch (error) {
            showToast(`Failed: ${error instanceof Error ? error.message : 'Unknown error'}`, 'error');
        } finally {
            setUpdatingState(null);
        }
    }

    const stateColors: Record<string, string> = {
        DRAFT: 'bg-zinc-500/20 text-zinc-400 border-zinc-500/30',
        SENT: 'bg-blue-500/20 text-blue-400 border-blue-500/30',
        ACCEPTED: 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30',
        REJECTED: 'bg-red-500/20 text-red-400 border-red-500/30',
        EXPIRED: 'bg-amber-500/20 text-amber-400 border-amber-500/30',
    };

    return (
        <div className="space-y-6">
            <QuoteViewTabs active="list" />

            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-3xl font-bold tracking-tight text-white font-mono">Quotes</h1>
                    <p className="text-muted-foreground mt-2">Manage sales quotes and convert to orders.</p>
                </div>
                <div className="flex items-center gap-3">
                    <button
                        onClick={() => navigate('/erp/quotes/analytics')}
                        className="border border-white/10 text-zinc-400 hover:text-white hover:border-white/20 font-medium px-4 py-2 rounded transition-colors flex items-center gap-2 text-sm"
                    >
                        <BarChart3 size={16} /> Analytics
                    </button>
                </div>
            </div>

            <div className="bg-slate-steel border border-white/10 rounded-lg overflow-hidden">
                <table className="w-full text-left text-sm">
                    <thead>
                        <tr className="border-b border-white/10 bg-white/5">
                            <th className="p-4 font-medium text-muted-foreground">Quote ID</th>
                            <th className="p-4 font-medium text-muted-foreground">Date</th>
                            <th className="p-4 font-medium text-muted-foreground">Customer</th>
                            <th className="p-4 font-medium text-muted-foreground">Source</th>
                            <th className="p-4 font-medium text-muted-foreground">Fulfillment</th>
                            <th className="p-4 font-medium text-muted-foreground">State</th>
                            <th className="p-4 font-medium text-muted-foreground text-right">Total</th>
                            <th className="p-4 font-medium text-muted-foreground text-right">Actions</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-white/5">
                        {loading ? (
                            <tr>
                                <td colSpan={8} className="p-8 text-center text-muted-foreground">Loading quotes...</td>
                            </tr>
                        ) : quotes.length === 0 ? (
                            <tr>
                                <td colSpan={8} className="p-8 text-center text-muted-foreground">
                                    No quotes found. Create your first quote to get started.
                                </td>
                            </tr>
                        ) : (
                            quotes.map((quote) => {
                                const isBusy = converting === quote.id || updatingState === quote.id;
                                return (
                                    <tr key={quote.id} className="hover:bg-white/5 transition-colors cursor-pointer" onClick={() => navigate(`/erp/quotes/${quote.id}`)}>
                                        <td className="p-4 font-mono text-white/80">#{quote.id.slice(0, 8)}</td>
                                        <td className="p-4 text-white/80">{new Date(quote.created_at).toLocaleDateString()}</td>
                                        <td className="p-4 text-white font-medium">{quote.customer_name || quote.customer_id.slice(0, 8)}</td>
                                        <td className="p-4">
                                            {quote.source === 'ai' ? (
                                                <span className="inline-flex items-center gap-1 text-xs text-violet-400">
                                                    <Sparkles size={12} /> AI
                                                </span>
                                            ) : (
                                                <span className="text-xs text-zinc-500">Manual</span>
                                            )}
                                        </td>
                                        <td className="p-4">
                                            {quote.delivery_type === 'DELIVERY' ? (
                                                <span className="inline-flex items-center gap-1 text-xs text-blue-400">
                                                    <Truck size={12} /> Delivery
                                                </span>
                                            ) : (
                                                <span className="inline-flex items-center gap-1 text-xs text-zinc-500">
                                                    <Package size={12} /> Pickup
                                                </span>
                                            )}
                                        </td>
                                        <td className="p-4">
                                            <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium border ${stateColors[quote.state] || ''}`}>
                                                {quote.state}
                                            </span>
                                        </td>
                                        <td className="p-4 font-mono text-right text-gable-green">
                                            ${quote.total_amount.toFixed(2)}
                                        </td>
                                        <td className="p-4 text-right" onClick={(e) => e.stopPropagation()}>
                                            <div className="flex items-center justify-end gap-1.5">
                                                {quote.state === 'DRAFT' && (
                                                    <button onClick={() => navigate(`/erp/quotes/${quote.id}/edit`)} disabled={isBusy}
                                                        className="text-amber-400 hover:text-amber-300 transition-colors p-1 rounded hover:bg-white/5 disabled:opacity-50" title="Edit Draft">
                                                        <Pencil size={14} />
                                                    </button>
                                                )}
                                                {quote.state === 'DRAFT' && (
                                                    <button onClick={() => handleStateChange(quote.id, 'SENT')} disabled={isBusy}
                                                        className="text-blue-400 hover:text-blue-300 transition-colors p-1 rounded hover:bg-white/5 disabled:opacity-50" title="Mark Sent">
                                                        <Send size={14} />
                                                    </button>
                                                )}
                                                {(quote.state === 'DRAFT' || quote.state === 'SENT') && (
                                                    <>
                                                        <button onClick={() => handleStateChange(quote.id, 'ACCEPTED')} disabled={isBusy}
                                                            className="text-emerald-400 hover:text-emerald-300 transition-colors p-1 rounded hover:bg-white/5 disabled:opacity-50" title="Accept">
                                                            <Check size={14} />
                                                        </button>
                                                        <button onClick={() => handleStateChange(quote.id, 'REJECTED')} disabled={isBusy}
                                                            className="text-red-400 hover:text-red-300 transition-colors p-1 rounded hover:bg-white/5 disabled:opacity-50" title="Reject">
                                                            <X size={14} />
                                                        </button>
                                                    </>
                                                )}
                                                {(quote.state === 'DRAFT' || quote.state === 'SENT' || quote.state === 'ACCEPTED') && (
                                                    <button onClick={() => handleConvert(quote.id)} disabled={isBusy}
                                                        className="text-gable-green hover:text-gable-green/80 transition-colors flex items-center gap-1 text-xs font-medium disabled:opacity-50 p-1 rounded hover:bg-white/5"
                                                        title="Convert to Order">
                                                        <ShoppingCart size={14} />
                                                    </button>
                                                )}
                                                <button onClick={() => navigate(`/erp/quotes/${quote.id}`)}
                                                    className="text-white/50 hover:text-white transition-colors p-1 rounded hover:bg-white/5">
                                                    <ArrowRight size={14} />
                                                </button>
                                            </div>
                                        </td>
                                    </tr>
                                );
                            })
                        )}
                    </tbody>
                </table>
            </div>
        </div>
    );
}
