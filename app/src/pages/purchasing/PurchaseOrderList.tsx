import { useEffect, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { PurchaseOrderService } from '../../services/PurchaseOrderService';
import type { PurchaseOrder } from '../../types/purchaseOrder';
import type { ReorderAlert } from '../../types/product';
import { useToast } from '../../components/ui/ToastContext';
import { PageTransition } from '../../components/ui/PageTransition';
import { Card, CardContent } from '../../components/ui/Card';
import { Package, AlertTriangle, Plus, Truck } from 'lucide-react';

const statusColors: Record<string, string> = {
    DRAFT: 'text-zinc-400 bg-zinc-500/10 border-zinc-500/20',
    SENT: 'text-blue-400 bg-blue-500/10 border-blue-500/20',
    PARTIAL: 'text-amber-400 bg-amber-500/10 border-amber-500/20',
    RECEIVED: 'text-emerald-400 bg-emerald-500/10 border-emerald-500/20',
    CANCELLED: 'text-rose-400 bg-rose-500/10 border-rose-500/20',
};

export function PurchaseOrderList() {
    const navigate = useNavigate();
    const { showToast } = useToast();
    const [pos, setPOs] = useState<PurchaseOrder[]>([]);
    const [alerts, setAlerts] = useState<ReorderAlert[]>([]);
    const [loading, setLoading] = useState(true);

    const loadData = useCallback(async () => {
        try {
            const [poData, alertData] = await Promise.all([
                PurchaseOrderService.listPOs(),
                PurchaseOrderService.getReorderAlerts(),
            ]);
            setPOs(poData || []);
            setAlerts(alertData || []);
        } catch (err) {
            console.error(err);
            showToast('Failed to load purchasing data', 'error');
        } finally {
            setLoading(false);
        }
    }, [showToast]);

    useEffect(() => {
        loadData();
    }, [loadData]);

    return (
        <PageTransition>
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-8">
                <div>
                    <h1 className="text-3xl font-bold text-white flex items-center gap-3">
                        <Truck className="w-8 h-8 text-gable-green" />
                        Purchasing
                    </h1>
                    <p className="text-zinc-500 mt-1">Purchase orders, receiving, and reorder alerts</p>
                </div>
                <button
                    onClick={() => navigate('/purchasing/new')}
                    className="flex items-center gap-2 bg-[#00FFA3] text-black font-semibold px-4 py-2 rounded hover:shadow-[0_0_10px_rgba(0,255,163,0.3)] transition-all"
                >
                    <Plus className="w-4 h-4" />
                    New Purchase Order
                </button>
            </div>

            {/* Reorder Alerts */}
            {alerts.length > 0 && (
                <Card variant="glass" className="mb-6 border-amber-500/20">
                    <CardContent className="p-4">
                        <div className="flex justify-between items-center mb-3">
                            <h2 className="text-sm font-bold text-amber-400 uppercase tracking-wider flex items-center gap-2">
                                <AlertTriangle className="w-4 h-4" />
                                Reorder Alerts ({alerts.length})
                            </h2>
                            <button
                                onClick={async () => {
                                    setLoading(true);
                                    try {
                                        const res = await PurchaseOrderService.generateReorders();
                                        showToast(`Generated ${res.count} draft purchase orders`, 'success');
                                        loadData();
                                    } catch (err) {
                                        console.error(err);
                                        showToast('Failed to generate reorders', 'error');
                                        setLoading(false);
                                    }
                                }}
                                className="text-xs bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 px-3 py-1.5 rounded transition-colors uppercase font-bold tracking-wide"
                            >
                                Generate Replenishment POs
                            </button>
                        </div>
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                            {alerts.map((alert) => (
                                <div key={alert.product_id} className="bg-amber-500/5 border border-amber-500/10 rounded-lg p-3">
                                    <div className="flex justify-between items-start">
                                        <div>
                                            <span className="font-mono text-white text-sm">{alert.sku}</span>
                                            <p className="text-xs text-zinc-400 mt-0.5">{alert.description}</p>
                                        </div>
                                        <span className="text-amber-400 font-mono text-sm font-bold">
                                            -{alert.deficit.toFixed(0)}
                                        </span>
                                    </div>
                                    <div className="flex justify-between text-xs text-zinc-500 mt-2">
                                        <span>Stock: {alert.current_stock}</span>
                                        <span>Reorder at: {alert.reorder_point}</span>
                                        <span>Order: {alert.reorder_qty}</span>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </CardContent>
                </Card>
            )}

            {/* PO List */}
            <Card variant="glass">
                <CardContent className="p-0">
                    {loading ? (
                        <div className="p-12 flex justify-center">
                            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-gable-green"></div>
                        </div>
                    ) : pos.length === 0 ? (
                        <div className="p-12 text-center text-zinc-500">
                            <Package className="w-12 h-12 mx-auto mb-3 opacity-30" />
                            <p>No purchase orders yet</p>
                        </div>
                    ) : (
                        <table className="w-full text-sm text-left">
                            <thead className="bg-white/5 text-zinc-400 uppercase tracking-wider text-xs font-semibold">
                                <tr>
                                    <th className="px-6 py-4">PO #</th>
                                    <th className="px-6 py-4">Status</th>
                                    <th className="px-6 py-4 text-right">Lines</th>
                                    <th className="px-6 py-4 text-right">Total Cost</th>
                                    <th className="px-6 py-4">Created</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-white/5">
                                {pos.map((po) => (
                                    <tr
                                        key={po.id}
                                        onClick={() => navigate(`/purchasing/${po.id}`)}
                                        className="hover:bg-white/5 cursor-pointer transition-colors"
                                    >
                                        <td className="px-6 py-4 font-mono text-white">
                                            {po.id.slice(0, 8)}...
                                        </td>
                                        <td className="px-6 py-4">
                                            <span className={`px-2 py-0.5 rounded text-xs font-bold uppercase border ${statusColors[po.status] || statusColors.DRAFT}`}>
                                                {po.status}
                                            </span>
                                        </td>
                                        <td className="px-6 py-4 text-right font-mono text-zinc-300">
                                            {po.line_count || 0}
                                        </td>
                                        <td className="px-6 py-4 text-right font-mono text-emerald-400">
                                            ${(po.total_cost || 0).toFixed(2)}
                                        </td>
                                        <td className="px-6 py-4 text-zinc-400">
                                            {new Date(po.created_at).toLocaleDateString()}
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    )}
                </CardContent>
            </Card>
        </PageTransition>
    );
}
