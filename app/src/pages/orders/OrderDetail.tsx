import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { Truck, Check, Printer, User, DollarSign, Mail, Phone } from 'lucide-react';
import { OrderService } from '../../services/OrderService';
import { SalesTeamService } from '../../services/SalesTeamService';
import { type Order, getStatusColor } from '../../types/order';
import type { SalesPerson } from '../../types/salesteam';
import { useToast } from '../../components/ui/ToastContext';

const API_URL = import.meta.env.VITE_API_URL || '';

export default function OrderDetail() {
    const { id } = useParams();
    const { showToast } = useToast();
    const [order, setOrder] = useState<Order | null>(null);
    const [salesperson, setSalesperson] = useState<SalesPerson | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(false);
    const [processing, setProcessing] = useState(false);

    useEffect(() => {
        if (id) loadOrder(id);
    }, [id]);

    async function loadOrder(orderId: string) {
        try {
            const data = await OrderService.getOrder(orderId);
            setOrder(data);
            if (data.salesperson_id) {
                try {
                    const sp = await SalesTeamService.getSalesPerson(data.salesperson_id);
                    setSalesperson(sp);
                } catch {
                    // Salesperson lookup failed, not critical
                }
            }
        } catch (err) {
            console.error(err);
            setError(true);
            showToast('Failed to load order details', 'error');
        } finally {
            setLoading(false);
        }
    }

    async function handleConfirm() {
        if (!order) return;
        if (!confirm("Confirming this order will allocate stock. Proceed?")) return;

        setProcessing(true);
        try {
            await OrderService.confirmOrder(order.id);
            await loadOrder(order.id);
        } catch (error) {
            showToast("Failed to confirm order: " + (error instanceof Error ? error.message : error), 'error');
        } finally {
            setProcessing(false);
        }
    }

    async function handleFulfill() {
        if (!order) return;
        if (!confirm("Fulfilling this order will reduce stock and create an invoice. Proceed?")) return;

        setProcessing(true);
        try {
            await OrderService.fulfillOrder(order.id);
            await loadOrder(order.id);
        } catch (error) {
            showToast("Failed to fulfill order: " + (error instanceof Error ? error.message : error), 'error');
        } finally {
            setProcessing(false);
        }
    }

    if (loading) {
        return <div className="text-white">Loading order details...</div>;
    }
    if (error || !order) {
        return <div className="text-white">Failed to load order details.</div>;
    }

    const marginColor = order.margin_percent >= 20 ? 'text-emerald-400' :
        order.margin_percent >= 10 ? 'text-amber-400' : 'text-red-400';

    return (
        <div className="space-y-6 max-w-5xl mx-auto">
            {/* Header */}
            <div className="flex items-center justify-between pb-6 border-b border-white/10">
                <div>
                    <div className="flex items-center gap-4 mb-2">
                        <h1 className="text-3xl font-bold font-mono text-white">Order #{order.id.slice(0, 8)}</h1>
                        <StatusBadge status={order.status} />
                    </div>
                    <p className="text-muted-foreground">Created on {new Date(order.created_at).toLocaleString()}</p>
                </div>
                <div className="flex gap-3">
                    {(order.status === 'DRAFT' || order.status === 'ON_HOLD') && (
                        <button
                            onClick={handleConfirm}
                            disabled={processing}
                            className="bg-gable-green text-black font-bold px-4 py-2 rounded hover:bg-gable-green/90 transition-colors flex items-center gap-2"
                        >
                            {processing ? 'Processing...' : <><Check size={18} /> {order.status === 'ON_HOLD' ? 'Retry Confirmation' : 'Confirm Order'}</>}
                        </button>
                    )}
                    {order.status === 'CONFIRMED' && (
                        <button
                            onClick={handleFulfill}
                            disabled={processing}
                            className="bg-blue-500 text-white font-bold px-4 py-2 rounded hover:bg-blue-600 transition-colors flex items-center gap-2"
                        >
                            {processing ? 'Processing...' : <><Truck size={18} /> Fulfill & Invoice</>}
                        </button>
                    )}
                    {(order.status === 'CONFIRMED' || order.status === 'FULFILLED') && (
                        <button
                            onClick={() => window.open(`${API_URL}/documents/print/pickticket/${order.id}`, '_blank')}
                            className="bg-white/10 text-white font-bold px-4 py-2 rounded hover:bg-white/20 transition-colors flex items-center gap-2"
                        >
                            <Printer size={18} /> Pick Ticket
                        </button>
                    )}
                </div>
            </div>

            <div className="grid grid-cols-3 gap-6">
                {/* Main Content: Lines */}
                <div className="col-span-2 space-y-6">
                    <div className="bg-slate-steel rounded-lg border border-white/10 overflow-hidden">
                        <div className="px-6 py-4 border-b border-white/10">
                            <h2 className="font-semibold text-white">Line Items</h2>
                        </div>
                        <table className="w-full text-left text-sm" aria-label="Order line items">
                            <thead className="bg-white/5">
                                <tr>
                                    <th className="p-4 text-muted-foreground font-medium">Product</th>
                                    <th className="p-4 text-muted-foreground font-medium text-right">Qty</th>
                                    <th className="p-4 text-muted-foreground font-medium text-right">Price</th>
                                    <th className="p-4 text-muted-foreground font-medium text-right">Total</th>
                                    <th className="p-4 text-muted-foreground font-medium text-right">Cost</th>
                                    <th className="p-4 text-muted-foreground font-medium text-right">Margin</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-white/5">
                                {order.lines?.map((line) => {
                                    const lineTotal = line.quantity * line.price_each;
                                    const lineCost = line.quantity * line.unit_cost;
                                    const lineMargin = lineTotal - lineCost;
                                    const lineMarginPct = lineTotal > 0 ? (lineMargin / lineTotal) * 100 : 0;
                                    const lmColor = lineMarginPct >= 20 ? 'text-emerald-400' :
                                        lineMarginPct >= 10 ? 'text-amber-400' : 'text-red-400';
                                    return (
                                        <tr key={line.id}>
                                            <td className="p-4 text-white">
                                                <div className="font-mono text-sm">{line.product_sku || line.product_id.slice(0, 8)}</div>
                                                {line.product_name && <div className="text-xs text-muted-foreground">{line.product_name}</div>}
                                            </td>
                                            <td className="p-4 text-white font-mono text-right">{line.quantity}</td>
                                            <td className="p-4 text-white font-mono text-right">${line.price_each.toFixed(2)}</td>
                                            <td className="p-4 text-gable-green font-mono text-right font-medium">
                                                ${lineTotal.toFixed(2)}
                                            </td>
                                            <td className="p-4 text-zinc-400 font-mono text-right">${lineCost.toFixed(2)}</td>
                                            <td className={`p-4 font-mono text-right ${lmColor}`}>
                                                ${lineMargin.toFixed(2)}
                                                <span className="text-xs ml-1">({lineMarginPct.toFixed(1)}%)</span>
                                            </td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                            <tfoot className="bg-white/5">
                                <tr>
                                    <td colSpan={3} className="p-4 text-right font-bold text-white uppercase">Grand Total</td>
                                    <td className="p-4 text-right font-bold text-gable-green font-mono text-lg">
                                        ${order.total_amount.toFixed(2)}
                                    </td>
                                    <td className="p-4 text-right font-mono text-zinc-400">
                                        ${order.total_cost.toFixed(2)}
                                    </td>
                                    <td className={`p-4 text-right font-mono font-bold ${marginColor}`}>
                                        ${order.total_margin.toFixed(2)}
                                    </td>
                                </tr>
                            </tfoot>
                        </table>
                    </div>
                </div>

                {/* Sidebar */}
                <div className="space-y-6">
                    {/* Customer Details */}
                    <div className="bg-slate-steel rounded-lg border border-white/10 p-6">
                        <h3 className="font-semibold text-white mb-4">Customer Details</h3>
                        <div className="space-y-2 text-sm">
                            {order.customer_name && <p className="text-white font-medium text-base">{order.customer_name}</p>}
                            <p className="text-muted-foreground">Account: <span className="text-white font-mono">{order.customer_id.slice(0, 8)}</span></p>
                        </div>
                    </div>

                    {/* Salesperson Card */}
                    <div className="bg-slate-steel rounded-lg border border-white/10 p-6">
                        <h3 className="font-semibold text-white mb-4 flex items-center gap-2">
                            <User size={16} className="text-blue-400" /> Salesperson
                        </h3>
                        {salesperson ? (
                            <div className="space-y-3 text-sm">
                                <p className="text-white font-medium text-base">{salesperson.name}</p>
                                <p className="text-muted-foreground">
                                    <span className="px-2 py-0.5 rounded text-xs font-medium bg-blue-500/10 text-blue-400">{salesperson.role}</span>
                                </p>
                                <div className="space-y-1.5 pt-1">
                                    <p className="text-zinc-400 flex items-center gap-2">
                                        <Mail size={14} /> {salesperson.email}
                                    </p>
                                    <p className="text-zinc-400 flex items-center gap-2">
                                        <Phone size={14} /> {salesperson.phone}
                                    </p>
                                </div>
                            </div>
                        ) : (
                            <p className="text-sm text-zinc-500">No salesperson assigned</p>
                        )}
                    </div>

                    {/* Margin & Commission Card */}
                    <div className="bg-slate-steel rounded-lg border border-white/10 p-6">
                        <h3 className="font-semibold text-white mb-4 flex items-center gap-2">
                            <DollarSign size={16} className="text-emerald-400" /> Margin & Commission
                        </h3>
                        <div className="space-y-3 text-sm">
                            <div className="flex justify-between">
                                <span className="text-zinc-400">Revenue</span>
                                <span className="text-white font-mono font-medium">${order.total_amount.toFixed(2)}</span>
                            </div>
                            <div className="flex justify-between">
                                <span className="text-zinc-400">Cost</span>
                                <span className="text-white font-mono">${order.total_cost.toFixed(2)}</span>
                            </div>
                            <div className="border-t border-white/10 pt-3 flex justify-between">
                                <span className="text-zinc-400">Margin</span>
                                <span className={`font-mono font-bold ${marginColor}`}>
                                    ${order.total_margin.toFixed(2)} ({order.margin_percent.toFixed(1)}%)
                                </span>
                            </div>
                            <div className="flex justify-between">
                                <span className="text-zinc-400">Commission</span>
                                <span className="text-white font-mono">${order.total_commission.toFixed(2)}</span>
                            </div>
                        </div>
                    </div>

                    {/* Payment Info */}
                    <div className="bg-slate-steel rounded-lg border border-white/10 p-6">
                        <h3 className="font-semibold text-white mb-4">Payment</h3>
                        <div className="p-3 bg-white/5 rounded text-sm text-muted-foreground text-center">
                            No payment recorded
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}

function StatusBadge({ status }: { status: import('../../types/order').OrderStatus }) {
    const color = getStatusColor(status);
    let bg = "bg-white/10 text-white";
    if (color === 'info') bg = "bg-blue-500/20 text-blue-400 border-blue-500/50";
    if (color === 'success') bg = "bg-gable-green/20 text-gable-green border-gable-green/50";
    return (
        <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium border border-transparent ${bg}`}>
            {status}
        </span>
    );
}
