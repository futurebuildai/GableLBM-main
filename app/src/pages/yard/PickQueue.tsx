import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { OrderService } from "../../services/OrderService";
import type { Order } from "../../types/order";
import { PageTransition } from "../../components/ui/PageTransition";
import { Card, CardContent } from "../../components/ui/Card";
import { ClipboardList, ChevronRight, Package, Clock, User } from "lucide-react";
import { useToast } from "../../components/ui/ToastContext";

export function PickQueue() {
    const [orders, setOrders] = useState<Order[]>([]);
    const [loading, setLoading] = useState(true);
    const navigate = useNavigate();
    const { showToast } = useToast();

    useEffect(() => {
        OrderService.listOrders()
            .then(data => {
                const confirmed = data.filter(o => o.status === "CONFIRMED");
                confirmed.sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());
                setOrders(confirmed);
            })
            .catch(() => { setOrders([]); showToast('Failed to load pick queue', 'error'); })
            .finally(() => setLoading(false));
    }, [showToast]);

    if (loading) {
        return (
            <div className="flex justify-center items-center h-64">
                <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-amber-400"></div>
            </div>
        );
    }

    return (
        <PageTransition>
            <div className="flex flex-col space-y-4 p-4 max-w-md mx-auto">
                <div className="flex items-center justify-between mb-2">
                    <h1 className="text-xl font-bold text-white tracking-tight flex items-center gap-2">
                        <ClipboardList className="w-5 h-5 text-amber-400" />
                        Pick Queue
                    </h1>
                    <span className="text-xs font-mono px-2 py-1 rounded bg-amber-400/10 text-amber-400 border border-amber-400/20">
                        {orders.length} Orders
                    </span>
                </div>

                {orders.length === 0 && (
                    <div className="text-center py-16 flex flex-col items-center gap-4 opacity-50">
                        <Package className="w-14 h-14 text-zinc-600" />
                        <p className="text-zinc-400 text-lg">All caught up!</p>
                        <p className="text-zinc-500 text-sm">No orders waiting to be picked.</p>
                    </div>
                )}

                <div className="space-y-3">
                    {orders.map((order, idx) => (
                        <Card
                            key={order.id}
                            variant="glass"
                            className="active:scale-[0.98] transition-all cursor-pointer border-white/5 hover:border-amber-400/30"
                            onClick={() => navigate(`/yard/pick/${order.id}`)}
                        >
                            <CardContent className="p-4">
                                <div className="flex justify-between items-start mb-3">
                                    <div className="flex items-center gap-2">
                                        {idx === 0 && (
                                            <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-amber-400 text-black uppercase tracking-wide font-bold">
                                                Next
                                            </span>
                                        )}
                                        <span className="text-xs font-mono text-zinc-500">
                                            #{order.id.slice(-6).toUpperCase()}
                                        </span>
                                    </div>
                                    <ChevronRight className="w-4 h-4 text-zinc-600" />
                                </div>

                                <div className="mb-3">
                                    <h3 className="text-lg font-bold text-white flex items-center gap-2">
                                        <User className="w-4 h-4 text-zinc-500" />
                                        {order.customer_name || "Walk-in"}
                                    </h3>
                                </div>

                                <div className="flex items-center justify-between pt-3 border-t border-white/5">
                                    <div className="flex items-center gap-3">
                                        <div className="flex items-center gap-1.5 text-xs text-zinc-300 font-mono bg-white/5 px-2 py-1 rounded">
                                            <Package className="w-3 h-3 text-amber-400" />
                                            {order.lines?.length || "?"} items
                                        </div>
                                        <div className="text-xs font-mono text-zinc-400">
                                            ${order.total_amount.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                                        </div>
                                    </div>
                                    <div className="flex items-center gap-1 text-[10px] text-zinc-500">
                                        <Clock className="w-3 h-3" />
                                        {new Date(order.created_at).toLocaleDateString(undefined, { month: "short", day: "numeric" })}
                                    </div>
                                </div>
                            </CardContent>
                        </Card>
                    ))}
                </div>
            </div>
        </PageTransition>
    );
}
