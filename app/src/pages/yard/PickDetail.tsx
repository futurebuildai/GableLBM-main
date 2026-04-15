import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { OrderService } from "../../services/OrderService";
import type { Order, OrderLine } from "../../types/order";
import { PageTransition } from "../../components/ui/PageTransition";
import { Card, CardContent } from "../../components/ui/Card";
import { ArrowLeft, CheckCircle, Circle, Package, Loader2 } from "lucide-react";
import { useToast } from "../../components/ui/ToastContext";

export function PickDetail() {
    const { id } = useParams<{ id: string }>();
    const navigate = useNavigate();
    const { showToast } = useToast();
    const [order, setOrder] = useState<Order | null>(null);
    const [loading, setLoading] = useState(true);
    const [pickedItems, setPickedItems] = useState<Set<string>>(new Set());
    const [fulfilling, setFulfilling] = useState(false);

    useEffect(() => {
        if (id) {
            OrderService.getOrder(id)
                .then(setOrder)
                .catch(() => { setOrder(null); showToast('Failed to load order details', 'error'); })
                .finally(() => setLoading(false));
        }
    }, [id, showToast]);

    const togglePicked = (lineId: string) => {
        setPickedItems(prev => {
            const next = new Set(prev);
            if (next.has(lineId)) {
                next.delete(lineId);
            } else {
                next.add(lineId);
            }
            return next;
        });
    };

    const lines: OrderLine[] = order?.lines || [];
    const progress = lines.length > 0 ? (pickedItems.size / lines.length) * 100 : 0;
    const allPicked = lines.length > 0 && pickedItems.size === lines.length;

    const handleFulfill = async () => {
        if (!id || !allPicked) return;
        setFulfilling(true);
        try {
            await OrderService.fulfillOrder(id);
            navigate("/yard", { replace: true });
        } catch {
            showToast('Failed to fulfill order', 'error');
            setFulfilling(false);
        }
    };

    if (loading) {
        return (
            <div className="flex justify-center items-center h-64">
                <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-amber-400"></div>
            </div>
        );
    }

    if (!order) {
        return (
            <div className="p-4 text-center text-zinc-400">
                <p>Order not found.</p>
                <button onClick={() => navigate("/yard")} className="text-amber-400 mt-4 underline">Back to Queue</button>
            </div>
        );
    }

    return (
        <PageTransition>
            <div className="flex flex-col space-y-4 p-4 max-w-md mx-auto min-h-screen">
                {/* Header */}
                <div className="flex items-center gap-3 mb-1">
                    <button
                        onClick={() => navigate("/yard")}
                        className="p-2 rounded-full bg-white/5 hover:bg-white/10 text-zinc-400 transition-colors"
                        aria-label="Go back"
                    >
                        <ArrowLeft className="w-5 h-5" />
                    </button>
                    <div className="flex-1">
                        <div className="font-bold text-lg text-white">{order.customer_name || "Order"}</div>
                        <div className="text-xs text-zinc-500 font-mono">
                            #{order.id.slice(-6).toUpperCase()} &middot; {pickedItems.size}/{lines.length} picked
                        </div>
                    </div>
                </div>

                {/* Progress Bar */}
                <div className="h-1.5 bg-white/10 rounded-full overflow-hidden">
                    <div
                        className={`h-full transition-all duration-500 ease-out rounded-full ${allPicked ? "bg-emerald-400" : "bg-amber-400"}`}
                        style={{ width: `${progress}%` }}
                    />
                </div>

                {/* Pick List */}
                <div className="space-y-2">
                    {lines.map((line) => {
                        const isPicked = pickedItems.has(line.id);
                        return (
                            <Card
                                key={line.id}
                                variant="glass"
                                className={`active:scale-[0.98] transition-all cursor-pointer ${isPicked
                                        ? "border-emerald-500/30 bg-emerald-500/5 opacity-70"
                                        : "border-white/5 hover:border-amber-400/30"
                                    }`}
                                onClick={() => togglePicked(line.id)}
                            >
                                <CardContent className="p-4 flex items-center gap-4">
                                    {/* Check Circle */}
                                    <div className="shrink-0">
                                        {isPicked ? (
                                            <CheckCircle className="w-6 h-6 text-emerald-400" />
                                        ) : (
                                            <Circle className="w-6 h-6 text-zinc-600" />
                                        )}
                                    </div>

                                    {/* Item Info */}
                                    <div className="flex-1 min-w-0">
                                        <div className={`font-medium text-sm ${isPicked ? "text-zinc-400 line-through" : "text-white"}`}>
                                            {line.product_name || "Product"}
                                        </div>
                                        <div className="text-xs text-zinc-500 font-mono mt-0.5">
                                            {line.product_sku || "—"}
                                        </div>
                                    </div>

                                    {/* Quantity Badge */}
                                    <div className={`shrink-0 text-right px-3 py-1.5 rounded-lg font-mono text-sm font-bold ${isPicked
                                            ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20"
                                            : "bg-amber-400/10 text-amber-400 border border-amber-400/20"
                                        }`}>
                                        x{line.quantity}
                                    </div>
                                </CardContent>
                            </Card>
                        );
                    })}
                </div>

                {/* Complete Button */}
                {lines.length > 0 && (
                    <div className="sticky bottom-20 pt-4">
                        <button
                            onClick={handleFulfill}
                            disabled={!allPicked || fulfilling}
                            className={`w-full py-4 rounded-xl font-bold text-lg font-mono uppercase tracking-wider transition-all ${allPicked
                                    ? "bg-emerald-500 text-black hover:bg-emerald-400 active:scale-[0.98] shadow-lg shadow-emerald-500/20"
                                    : "bg-white/5 text-zinc-600 border border-white/10 cursor-not-allowed"
                                }`}
                        >
                            {fulfilling ? (
                                <span className="flex items-center justify-center gap-2">
                                    <Loader2 className="w-5 h-5 animate-spin" /> Completing...
                                </span>
                            ) : allPicked ? (
                                <span className="flex items-center justify-center gap-2">
                                    <CheckCircle className="w-5 h-5" /> Complete Pick
                                </span>
                            ) : (
                                <span className="flex items-center justify-center gap-2">
                                    <Package className="w-5 h-5" /> Pick All Items First
                                </span>
                            )}
                        </button>
                    </div>
                )}
            </div>
        </PageTransition>
    );
}
