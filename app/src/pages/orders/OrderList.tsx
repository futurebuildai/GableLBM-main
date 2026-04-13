import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowRight } from 'lucide-react';
import { OrderService } from '../../services/OrderService';
import { type Order, getStatusColor } from '../../types/order';

export default function OrderList() {
    const navigate = useNavigate();
    const [orders, setOrders] = useState<Order[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        loadOrders();
    }, []);

    async function loadOrders() {
        try {
            const data = await OrderService.listOrders();
            setOrders(data);
        } catch (error) {
            console.error(error);
        } finally {
            setLoading(false);
        }
    }

    if (loading) {
        return <div className="text-white">Loading orders...</div>;
    }

    return (
        <div className="space-y-6">
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-3xl font-bold tracking-tight text-white font-mono">Orders</h1>
                    <p className="text-muted-foreground mt-2">Manage customer orders and fulfillment.</p>
                </div>
                {/* Orders are typically created from Quotes, but direct entry could be allowed later */}
                {/* <button className="industrial-button-primary flex items-center gap-2">
                    <Plus size={16} /> New Order
                </button> */}
            </div>

            <div className="bg-slate-steel border border-white/10 rounded-lg overflow-hidden">
                <table className="w-full text-left text-sm">
                    <thead>
                        <tr className="border-b border-white/10 bg-white/5">
                            <th className="p-4 font-medium text-muted-foreground">Order ID</th>
                            <th className="p-4 font-medium text-muted-foreground">Date</th>
                            <th className="p-4 font-medium text-muted-foreground">Customer</th>
                            <th className="p-4 font-medium text-muted-foreground">Status</th>
                            <th className="p-4 font-medium text-muted-foreground text-right">Total</th>
                            <th className="p-4 font-medium text-muted-foreground text-right">Action</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-white/5">
                        {orders.length === 0 ? (
                            <tr>
                                <td colSpan={6} className="p-8 text-center text-muted-foreground">
                                    No active orders found. Create a quote and convert it to start.
                                </td>
                            </tr>
                        ) : (
                            orders.map((order) => (
                                <tr key={order.id} className="hover:bg-white/5 transition-colors">
                                    <td className="p-4 font-mono text-white/80">#{order.id.slice(0, 8)}</td>
                                    <td className="p-4 text-white/80">{new Date(order.created_at).toLocaleDateString()}</td>
                                    <td className="p-4 text-white font-medium">{order.customer_name || order.customer_id.slice(0, 8)}</td>
                                    <td className="p-4">
                                        <StatusBadge status={order.status} />
                                    </td>
                                    <td className="p-4 font-mono text-right text-gable-green">
                                        ${order.total_amount.toFixed(2)}
                                    </td>
                                    <td className="p-4 text-right">
                                        <button
                                            onClick={() => navigate(`/orders/${order.id}`)}
                                            className="text-white/50 hover:text-white transition-colors"
                                        >
                                            <ArrowRight size={18} />
                                        </button>
                                    </td>
                                </tr>
                            ))
                        )}
                    </tbody>
                </table>
            </div>
        </div>
    );
}

function StatusBadge({ status }: { status: import('../../types/order').OrderStatus }) {
    const color = getStatusColor(status);

    let bg = "bg-white/10 text-white";
    if (color === 'info') bg = "bg-blue-500/20 text-blue-400 border-blue-500/50";
    if (color === 'success') bg = "bg-gable-green/20 text-gable-green border-gable-green/50";
    if (color === 'warning') bg = "bg-amber-500/20 text-amber-400 border-amber-500/50";
    if (color === 'error') bg = "bg-red-500/20 text-red-400 border-red-500/50";

    return (
        <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium border border-transparent ${bg}`}>
            {status}
        </span>
    );
}
