import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { PurchaseOrderService } from '../../services/PurchaseOrderService';
import type { PurchaseRecommendation, RecommendationSummary, UrgencyLevel } from '../../types/purchaseOrder';
import { PageTransition } from '../../components/ui/PageTransition';
import { Card, CardContent } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';
import { ArrowLeft, TrendingUp, AlertTriangle, ShoppingCart, RefreshCw, Package } from 'lucide-react';
import { useToast } from '../../components/ui/ToastContext';

const urgencyConfig: Record<UrgencyLevel, { label: string; color: string; bg: string; border: string }> = {
    CRITICAL: { label: 'Critical', color: 'text-rose-400', bg: 'bg-rose-500/10', border: 'border-rose-500/30' },
    HIGH: { label: 'High', color: 'text-amber-400', bg: 'bg-amber-500/10', border: 'border-amber-500/30' },
    MEDIUM: { label: 'Medium', color: 'text-blue-400', bg: 'bg-blue-500/10', border: 'border-blue-500/30' },
    LOW: { label: 'Low', color: 'text-emerald-400', bg: 'bg-emerald-500/10', border: 'border-emerald-500/30' },
};

export function PurchasingRecommendations() {
    const navigate = useNavigate();
    const { showToast } = useToast();
    const [summary, setSummary] = useState<RecommendationSummary | null>(null);
    const [loading, setLoading] = useState(true);
    const [filter, setFilter] = useState<UrgencyLevel | 'ALL'>('ALL');

    const fetchRecommendations = async () => {
        setLoading(true);
        try {
            const data = await PurchaseOrderService.getRecommendations();
            setSummary(data);
        } catch (err) {
            console.error('Failed to load recommendations:', err);
            showToast('Failed to load purchasing recommendations', 'error');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchRecommendations();
    }, [showToast]);

    const filteredItems = summary?.items.filter(
        (item) => filter === 'ALL' || item.urgency === filter
    ) ?? [];

    const handleCreatePO = (rec: PurchaseRecommendation) => {
        const params = new URLSearchParams({
            from: 'recommendation',
            product_id: rec.product_id,
            description: `${rec.product_sku} - ${rec.product_name}`,
            qty: String(rec.suggested_qty),
            cost: String(rec.estimated_cost / rec.suggested_qty),
        });
        if (rec.vendor_name) params.set('vendor_name', rec.vendor_name);
        navigate(`/purchasing/new?${params.toString()}`);
    };

    return (
        <PageTransition>
            <div className="flex items-center gap-4 mb-6">
                <button
                    onClick={() => navigate('/purchasing')}
                    className="p-2 rounded-full bg-white/5 hover:bg-white/10 text-zinc-400 transition-colors"
                >
                    <ArrowLeft className="w-5 h-5" />
                </button>
                <div className="flex-1">
                    <h1 className="text-2xl font-bold text-white">Purchasing Recommendations</h1>
                    <p className="text-sm text-zinc-400">AI-driven reorder suggestions based on sales velocity and stock levels</p>
                </div>
                <Button onClick={fetchRecommendations} disabled={loading} variant="outline">
                    <RefreshCw className={`w-4 h-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
                    Refresh
                </Button>
            </div>

            {/* Summary Cards */}
            {summary && (
                <div className="grid grid-cols-2 md:grid-cols-5 gap-4 mb-6">
                    <Card variant="glass">
                        <CardContent className="p-4 text-center">
                            <Package className="w-5 h-5 mx-auto mb-1 text-zinc-400" />
                            <div className="text-2xl font-bold text-white font-mono">{summary.total_items}</div>
                            <div className="text-xs text-zinc-500">Total Items</div>
                        </CardContent>
                    </Card>
                    <Card variant="glass">
                        <CardContent className="p-4 text-center">
                            <AlertTriangle className="w-5 h-5 mx-auto mb-1 text-rose-400" />
                            <div className="text-2xl font-bold text-rose-400 font-mono">{summary.critical_count}</div>
                            <div className="text-xs text-zinc-500">Critical</div>
                        </CardContent>
                    </Card>
                    <Card variant="glass">
                        <CardContent className="p-4 text-center">
                            <TrendingUp className="w-5 h-5 mx-auto mb-1 text-amber-400" />
                            <div className="text-2xl font-bold text-amber-400 font-mono">{summary.high_count}</div>
                            <div className="text-xs text-zinc-500">High</div>
                        </CardContent>
                    </Card>
                    <Card variant="glass">
                        <CardContent className="p-4 text-center">
                            <div className="text-2xl font-bold text-blue-400 font-mono">{summary.medium_count}</div>
                            <div className="text-xs text-zinc-500">Medium</div>
                        </CardContent>
                    </Card>
                    <Card variant="glass">
                        <CardContent className="p-4 text-center">
                            <ShoppingCart className="w-5 h-5 mx-auto mb-1 text-[#00FFA3]" />
                            <div className="text-2xl font-bold text-[#00FFA3] font-mono">
                                ${summary.total_estimated_cost.toLocaleString('en-US', { minimumFractionDigits: 0 })}
                            </div>
                            <div className="text-xs text-zinc-500">Est. Total Cost</div>
                        </CardContent>
                    </Card>
                </div>
            )}

            {/* Filter Tabs */}
            <div className="flex gap-2 mb-4">
                {(['ALL', 'CRITICAL', 'HIGH', 'MEDIUM', 'LOW'] as const).map((level) => (
                    <button
                        key={level}
                        onClick={() => setFilter(level)}
                        className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${filter === level
                                ? 'bg-[#00FFA3]/20 text-[#00FFA3] border border-[#00FFA3]/30'
                                : 'bg-white/5 text-zinc-400 hover:bg-white/10 border border-transparent'
                            }`}
                    >
                        {level === 'ALL' ? 'All' : urgencyConfig[level].label}
                        {level !== 'ALL' && summary && (
                            <span className="ml-1 opacity-60">
                                ({level === 'CRITICAL' ? summary.critical_count
                                    : level === 'HIGH' ? summary.high_count
                                        : level === 'MEDIUM' ? summary.medium_count
                                            : summary.low_count})
                            </span>
                        )}
                    </button>
                ))}
            </div>

            {/* Recommendations Table */}
            <Card variant="glass">
                <CardContent className="p-0">
                    {loading ? (
                        <div className="text-center text-zinc-500 py-16">
                            <RefreshCw className="w-8 h-8 mx-auto mb-3 animate-spin text-zinc-600" />
                            Analyzing inventory and sales data...
                        </div>
                    ) : filteredItems.length === 0 ? (
                        <div className="text-center text-zinc-500 py-16 italic">
                            No recommendations found for the selected filter.
                        </div>
                    ) : (
                        <div className="overflow-x-auto">
                            <table className="w-full">
                                <thead>
                                    <tr className="border-b border-white/5">
                                        <th className="text-left text-xs text-zinc-500 font-medium py-3 px-4">Urgency</th>
                                        <th className="text-left text-xs text-zinc-500 font-medium py-3 px-4">Product</th>
                                        <th className="text-left text-xs text-zinc-500 font-medium py-3 px-4">Vendor</th>
                                        <th className="text-right text-xs text-zinc-500 font-medium py-3 px-4">Stock</th>
                                        <th className="text-right text-xs text-zinc-500 font-medium py-3 px-4">Reorder Pt</th>
                                        <th className="text-right text-xs text-zinc-500 font-medium py-3 px-4">Avg/Day</th>
                                        <th className="text-right text-xs text-zinc-500 font-medium py-3 px-4">Days Left</th>
                                        <th className="text-right text-xs text-zinc-500 font-medium py-3 px-4">Suggested Qty</th>
                                        <th className="text-right text-xs text-zinc-500 font-medium py-3 px-4">Est. Cost</th>
                                        <th className="text-right text-xs text-zinc-500 font-medium py-3 px-4"></th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {filteredItems.map((rec) => {
                                        const cfg = urgencyConfig[rec.urgency];
                                        return (
                                            <tr
                                                key={rec.product_id}
                                                className="border-b border-white/5 hover:bg-white/[0.02] transition-colors"
                                            >
                                                <td className="py-3 px-4">
                                                    <span className={`inline-flex px-2 py-0.5 rounded text-xs font-medium ${cfg.bg} ${cfg.color} border ${cfg.border}`}>
                                                        {cfg.label}
                                                    </span>
                                                </td>
                                                <td className="py-3 px-4">
                                                    <div className="text-sm text-white font-medium">{rec.product_sku}</div>
                                                    <div className="text-xs text-zinc-500 truncate max-w-[200px]">{rec.product_name}</div>
                                                </td>
                                                <td className="py-3 px-4 text-sm text-zinc-400">{rec.vendor_name || '-'}</td>
                                                <td className="py-3 px-4 text-right text-sm font-mono text-white">{rec.current_stock.toFixed(0)}</td>
                                                <td className="py-3 px-4 text-right text-sm font-mono text-zinc-400">{rec.reorder_point.toFixed(0)}</td>
                                                <td className="py-3 px-4 text-right text-sm font-mono text-zinc-400">{rec.avg_daily_sales.toFixed(1)}</td>
                                                <td className="py-3 px-4 text-right">
                                                    <span className={`text-sm font-mono ${rec.days_until_out < 7 ? 'text-rose-400' : rec.days_until_out < 14 ? 'text-amber-400' : 'text-zinc-400'}`}>
                                                        {rec.days_until_out >= 999 ? '999+' : rec.days_until_out.toFixed(0)}d
                                                    </span>
                                                </td>
                                                <td className="py-3 px-4 text-right text-sm font-mono font-medium text-[#00FFA3]">{rec.suggested_qty.toFixed(0)}</td>
                                                <td className="py-3 px-4 text-right text-sm font-mono text-zinc-300">${rec.estimated_cost.toFixed(2)}</td>
                                                <td className="py-3 px-4 text-right">
                                                    <Button
                                                        onClick={() => handleCreatePO(rec)}
                                                        size="sm"
                                                        className="text-xs"
                                                    >
                                                        Create PO
                                                    </Button>
                                                </td>
                                            </tr>
                                        );
                                    })}
                                </tbody>
                            </table>
                        </div>
                    )}
                </CardContent>
            </Card>
        </PageTransition>
    );
}
