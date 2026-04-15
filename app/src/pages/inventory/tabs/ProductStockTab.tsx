import React, { useState, useEffect, useCallback } from 'react';
import type { Inventory } from '../../../types/product';
import { InventoryService } from '../../../services/InventoryService';
import { MapPin, Plus, Minus, ArrowRightLeft, Loader2, Warehouse } from 'lucide-react';
import { useToast } from '../../../components/ui/ToastContext';

interface Props {
    productId: string;
    productDescription: string;
}

export const ProductStockTab: React.FC<Props> = ({ productId, productDescription }) => {
    const { showToast } = useToast();
    const [inventory, setInventory] = useState<Inventory[]>([]);
    const [loading, setLoading] = useState(true);
    const [adjustModal, setAdjustModal] = useState<{ locationId: string; locationName: string } | null>(null);
    const [adjustQty, setAdjustQty] = useState('');
    const [adjustReason, setAdjustReason] = useState('');
    const [adjusting, setAdjusting] = useState(false);

    const loadInventory = useCallback(async () => {
        try {
            const data = await InventoryService.getInventoryByProduct(productId);
            setInventory(data || []);
        } catch (err) {
            console.error('Failed to load inventory:', err);
            showToast('Failed to load inventory data', 'error');
        } finally {
            setLoading(false);
        }
    }, [productId, showToast]);

    useEffect(() => {
        loadInventory();
    }, [loadInventory]);

    const handleAdjust = useCallback(async (delta: number) => {
        if (!adjustModal || !adjustQty) return;
        setAdjusting(true);
        try {
            await InventoryService.adjustStock({
                product_id: productId,
                location_id: adjustModal.locationId,
                quantity: delta * Number(adjustQty),
                reason: adjustReason || 'Manual adjustment',
                is_delta: true,
            });
            setAdjustModal(null);
            setAdjustQty('');
            setAdjustReason('');
            loadInventory();
        } catch (err) {
            console.error('Adjust failed:', err);
            showToast('Failed to adjust stock', 'error');
        } finally {
            setAdjusting(false);
        }
    }, [adjustModal, adjustQty, adjustReason, productId, loadInventory]);

    const totalQty = inventory.reduce((sum, i) => sum + (i.quantity || 0), 0);
    const totalAlloc = inventory.reduce((sum, i) => sum + (i.allocated || 0), 0);

    if (loading) {
        return (
            <div className="flex items-center justify-center py-12">
                <Loader2 className="w-6 h-6 text-zinc-500 animate-spin" />
            </div>
        );
    }

    return (
        <div className="space-y-6">
            {/* Summary */}
            <div className="grid grid-cols-3 gap-4">
                <SummaryCard label="Total On Hand" value={totalQty} />
                <SummaryCard label="Total Allocated" value={totalAlloc} color="amber" />
                <SummaryCard label="Total Available" value={totalQty - totalAlloc} color={totalQty - totalAlloc < 100 ? 'rose' : 'emerald'} />
            </div>

            {/* Location Table */}
            {inventory.length === 0 ? (
                <div className="bg-zinc-900 border border-white/10 rounded-xl p-12 text-center">
                    <Warehouse className="w-12 h-12 text-zinc-600 mx-auto mb-3" />
                    <p className="text-zinc-500 text-sm">No inventory records for this product.</p>
                </div>
            ) : (
                <div className="bg-zinc-900 border border-white/10 rounded-xl overflow-hidden">
                    <table className="w-full text-left text-sm">
                        <thead>
                            <tr className="border-b border-white/5 text-zinc-400 text-xs uppercase tracking-wider">
                                <th className="px-5 py-3">Location</th>
                                <th className="px-5 py-3 text-right">Quantity</th>
                                <th className="px-5 py-3 text-right">Allocated</th>
                                <th className="px-5 py-3 text-right">Available</th>
                                <th className="px-5 py-3 text-right">Actions</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-white/5">
                            {inventory.map(inv => {
                                const avail = (inv.quantity || 0) - (inv.allocated || 0);
                                return (
                                    <tr key={inv.id} className="hover:bg-white/5 transition-colors">
                                        <td className="px-5 py-3">
                                            <div className="flex items-center gap-2">
                                                <MapPin className="w-4 h-4 text-zinc-500" />
                                                <span className="text-white">{inv.location_name || inv.location || 'Unknown'}</span>
                                            </div>
                                        </td>
                                        <td className="px-5 py-3 text-right font-mono text-white">{inv.quantity.toLocaleString()}</td>
                                        <td className="px-5 py-3 text-right font-mono text-amber-400">{(inv.allocated || 0).toLocaleString()}</td>
                                        <td className={`px-5 py-3 text-right font-mono font-bold ${avail < 0 ? 'text-rose-500' : 'text-emerald-400'}`}>
                                            {avail.toLocaleString()}
                                        </td>
                                        <td className="px-5 py-3 text-right">
                                            <div className="flex items-center justify-end gap-1">
                                                <button
                                                    onClick={() => setAdjustModal({ locationId: inv.location_id || inv.id, locationName: inv.location_name || inv.location })}
                                                    className="p-1.5 rounded-md hover:bg-white/10 text-zinc-400 hover:text-white transition-colors"
                                                    title="Adjust Stock"
                                                >
                                                    <ArrowRightLeft className="w-4 h-4" />
                                                </button>
                                            </div>
                                        </td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                </div>
            )}

            {/* Adjust Modal */}
            {adjustModal && (
                <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50" onClick={() => setAdjustModal(null)}>
                    <div className="bg-zinc-900 border border-white/10 rounded-xl p-6 w-full max-w-sm" onClick={e => e.stopPropagation()}>
                        <h3 className="text-white font-medium mb-1">Adjust Stock</h3>
                        <p className="text-zinc-500 text-sm mb-4">{productDescription} @ {adjustModal.locationName}</p>
                        <div className="space-y-3">
                            <div>
                                <label className="block text-xs text-zinc-500 mb-1">Quantity</label>
                                <input
                                    type="number"
                                    value={adjustQty}
                                    onChange={e => setAdjustQty(e.target.value)}
                                    className="w-full bg-zinc-800 border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-gable-green/50"
                                    min="1"
                                    placeholder="Enter quantity..."
                                />
                            </div>
                            <div>
                                <label className="block text-xs text-zinc-500 mb-1">Reason</label>
                                <input
                                    type="text"
                                    value={adjustReason}
                                    onChange={e => setAdjustReason(e.target.value)}
                                    className="w-full bg-zinc-800 border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-gable-green/50"
                                    placeholder="Reason for adjustment..."
                                />
                            </div>
                            <div className="flex gap-2 pt-2">
                                <button
                                    onClick={() => handleAdjust(1)}
                                    disabled={adjusting || !adjustQty}
                                    className="flex-1 flex items-center justify-center gap-2 px-4 py-2 bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 rounded-lg hover:bg-emerald-500/30 disabled:opacity-50"
                                >
                                    {adjusting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
                                    Add
                                </button>
                                <button
                                    onClick={() => handleAdjust(-1)}
                                    disabled={adjusting || !adjustQty}
                                    className="flex-1 flex items-center justify-center gap-2 px-4 py-2 bg-rose-500/20 text-rose-400 border border-rose-500/30 rounded-lg hover:bg-rose-500/30 disabled:opacity-50"
                                >
                                    {adjusting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Minus className="w-4 h-4" />}
                                    Remove
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

const SummaryCard: React.FC<{ label: string; value: number; color?: string }> = ({ label, value, color = 'white' }) => (
    <div className="bg-zinc-900 border border-white/10 rounded-xl p-4 text-center">
        <div className="text-xs text-zinc-500 mb-1">{label}</div>
        <div className={`text-2xl font-mono font-bold ${
            color === 'emerald' ? 'text-emerald-400' :
            color === 'amber' ? 'text-amber-400' :
            color === 'rose' ? 'text-rose-500' :
            'text-white'
        }`}>
            {value.toLocaleString()}
        </div>
    </div>
);
