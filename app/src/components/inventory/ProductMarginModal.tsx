import React, { useState, useEffect } from 'react';
import type { Product } from '../../types/product';
import { X, Percent } from 'lucide-react';
import { Button } from '../ui/Button';

interface ProductMarginModalProps {
    isOpen: boolean;
    onClose: () => void;
    product: Product | null;
    onSuccess: () => void;
}

export const ProductMarginModal: React.FC<ProductMarginModalProps> = ({ isOpen, onClose, product, onSuccess }) => {
    const [targetMargin, setTargetMargin] = useState(0);
    const [commissionRate, setCommissionRate] = useState(0);
    const [isSaving, setIsSaving] = useState(false);
    const [error, setError] = useState('');

    useEffect(() => {
        if (product) {
            setTargetMargin(product.target_margin || 0);
            setCommissionRate(product.commission_rate || 0);
        }
    }, [product]);

    if (!isOpen || !product) return null;

    const projectedPrice = product.average_unit_cost > 0 && targetMargin > 0
        ? product.average_unit_cost / (1 - (targetMargin / 100))
        : product.base_price;

    const projectedCommission = projectedPrice * (commissionRate / 100);

    const handleSave = async () => {
        setIsSaving(true);
        setError('');
        try {
            const res = await fetch(`/api/products/${product.id}/margins`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    target_margin: targetMargin,
                    commission_rate: commissionRate
                })
            });

            if (!res.ok) {
                const text = await res.text();
                throw new Error(text || 'Failed to update margins');
            }

            onSuccess();
            onClose();
        } catch (err: any) {
            setError(err.message || 'An error occurred while saving.');
        } finally {
            setIsSaving(false);
        }
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
            <div className="bg-[#0A0B10] border border-white/10 rounded-xl shadow-2xl w-full max-w-md overflow-hidden relative">
                <div className="flex items-center justify-between p-6 border-b border-white/10">
                    <div>
                        <h2 className="text-xl font-bold text-white">Pricing Controls</h2>
                        <p className="text-sm text-zinc-400 mt-1">{product.sku}</p>
                    </div>
                    <button onClick={onClose} className="p-2 text-zinc-400 hover:text-white hover:bg-white/10 rounded-full transition-colors">
                        <X className="w-5 h-5" />
                    </button>
                </div>

                <div className="p-6 space-y-6 flex-1 overflow-y-auto">
                    {error && (
                        <div className="p-3 bg-rose-500/10 border border-rose-500/20 rounded-lg text-rose-400 text-sm">
                            {error}
                        </div>
                    )}

                    <div className="bg-black/20 rounded-lg p-4 border border-white/5 space-y-2">
                        <div className="flex justify-between text-sm">
                            <span className="text-zinc-400">Current Cost (Weighted Avg)</span>
                            <span className="text-white font-mono font-medium">${(product.average_unit_cost || 0).toFixed(2)}</span>
                        </div>
                        <div className="flex justify-between text-sm">
                            <span className="text-zinc-400">Current Base Price</span>
                            <span className="text-white font-mono font-medium">${(product.base_price || 0).toFixed(2)}</span>
                        </div>
                    </div>

                    <div className="space-y-4">
                        <div>
                            <label className="block text-sm font-medium text-zinc-300 mb-1.5 flex justify-between">
                                Target Margin
                                <span className="text-zinc-500 text-xs font-mono">{(targetMargin).toFixed(1)}%</span>
                            </label>
                            <div className="relative">
                                <Percent className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500" />
                                <input
                                    type="number"
                                    min="0"
                                    max="99"
                                    step="0.1"
                                    value={targetMargin}
                                    onChange={(e) => setTargetMargin(Number(e.target.value))}
                                    className="w-full bg-black/40 border border-white/10 rounded-lg pl-10 pr-4 py-2 text-white font-mono focus:border-gable-green/50 focus:outline-none transition-colors"
                                />
                            </div>
                            <p className="text-xs text-zinc-500 mt-1">Suggested Price: <span className="text-emerald-400 font-mono">${projectedPrice.toFixed(2)}</span></p>
                        </div>

                        <div>
                            <label className="block text-sm font-medium text-zinc-300 mb-1.5 flex justify-between">
                                Sales Commission Rate
                                <span className="text-zinc-500 text-xs font-mono">{(commissionRate).toFixed(1)}%</span>
                            </label>
                            <div className="relative">
                                <Percent className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500" />
                                <input
                                    type="number"
                                    min="0"
                                    max="100"
                                    step="0.1"
                                    value={commissionRate}
                                    onChange={(e) => setCommissionRate(Number(e.target.value))}
                                    className="w-full bg-black/40 border border-white/10 rounded-lg pl-10 pr-4 py-2 text-white font-mono focus:border-gable-green/50 focus:outline-none transition-colors"
                                />
                            </div>
                            <p className="text-xs text-zinc-500 mt-1">Projected Commission: <span className="text-emerald-400 font-mono">${projectedCommission.toFixed(2)}</span></p>
                        </div>
                    </div>
                </div>

                <div className="p-6 border-t border-white/10 bg-black/20 flex justify-end gap-3">
                    <Button variant="ghost" onClick={onClose}>
                        Cancel
                    </Button>
                    <Button onClick={handleSave} disabled={isSaving} className="shadow-glow">
                        {isSaving ? 'Saving...' : 'Save Controls'}
                    </Button>
                </div>
            </div>
        </div>
    );
};
