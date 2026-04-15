import React, { useEffect, useState } from 'react';
import type { Product } from '../../types/product';
import type { Location } from '../../types/location';
import { LocationService } from '../../services/LocationService';
import { InventoryService } from '../../services/InventoryService';
import { useToast } from '../ui/ToastContext';

interface StockAdjustmentModalProps {
    isOpen: boolean;
    onClose: () => void;
    product: Product | null;
    onSuccess: () => void;
}

export const StockAdjustmentModal: React.FC<StockAdjustmentModalProps> = ({ isOpen, onClose, product, onSuccess }) => {
    const { showToast } = useToast();
    const [locations, setLocations] = useState<Location[]>([]);
    const [selectedLocationId, setSelectedLocationId] = useState('');
    const [quantity, setQuantity] = useState(0);
    const [reason, setReason] = useState('Receipt');
    const [isSubmitting, setIsSubmitting] = useState(false);

    useEffect(() => {
        if (isOpen) {
            loadLocations();
            setQuantity(0);
            setReason('Receipt');
        }
    }, [isOpen]);

    const loadLocations = async () => {
        try {
            const data = await LocationService.listLocations();
            setLocations(data);
            if (data.length > 0) setSelectedLocationId(data[0].id);
        } catch (error) {
            console.error('Failed to load locations', error);
            showToast('Failed to load locations', 'error');
        }
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!product || !selectedLocationId) return;

        setIsSubmitting(true);
        try {
            await InventoryService.adjustStock({
                product_id: product.id,
                location_id: selectedLocationId,
                quantity: Number(quantity),
                reason,
                is_delta: true // Always add/subtract for now
            });
            onSuccess();
            onClose();
        } catch (error) {
            showToast('Failed to adjust stock', 'error');
            console.error(error);
        } finally {
            setIsSubmitting(false);
        }
    };

    if (!isOpen || !product) return null;

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm" role="dialog" aria-modal="true" aria-labelledby="stock-adjustment-modal-title">
            <div className="bg-[#161821] w-full max-w-md rounded-lg shadow-2xl border border-white/10 p-6">
                <h2 id="stock-adjustment-modal-title" className="text-xl font-bold text-white mb-1">Adjust Stock</h2>
                <p className="text-sm text-gray-400 mb-6">{product.sku} - {product.description}</p>

                <form onSubmit={handleSubmit} className="space-y-4">
                    <div>
                        <label className="block text-xs uppercase tracking-wider text-gray-500 mb-1">Location</label>
                        <select
                            className="w-full bg-black/20 border border-white/10 rounded px-3 py-2 text-white focus:border-[#00FFA3] outline-none"
                            value={selectedLocationId}
                            onChange={(e) => setSelectedLocationId(e.target.value)}
                        >
                            {locations.map(loc => (
                                <option key={loc.id} value={loc.id}>
                                    {loc.path || loc.code} ({loc.type})
                                </option>
                            ))}
                        </select>
                    </div>

                    <div>
                        <label className="block text-xs uppercase tracking-wider text-gray-500 mb-1">Quantity ({product.uom_primary})</label>
                        <input
                            type="number"
                            step="any"
                            className="w-full bg-black/20 border border-white/10 rounded px-3 py-2 text-white focus:border-[#00FFA3] outline-none font-mono"
                            value={quantity}
                            onChange={(e) => setQuantity(Number(e.target.value))}
                        />
                        <p className="text-xs text-gray-500 mt-1">Positive to add, negative to remove.</p>
                    </div>

                    <div>
                        <label className="block text-xs uppercase tracking-wider text-gray-500 mb-1">Reason Code</label>
                        <select
                            className="w-full bg-black/20 border border-white/10 rounded px-3 py-2 text-white focus:border-[#00FFA3] outline-none"
                            value={reason}
                            onChange={(e) => setReason(e.target.value)}
                        >
                            <option>Receipt</option>
                            <option>Cycle Count</option>
                            <option>Damaged</option>
                            <option>Return</option>
                            <option>Found</option>
                        </select>
                    </div>

                    <div className="flex justify-end gap-3 mt-8">
                        <button
                            type="button"
                            onClick={onClose}
                            className="px-4 py-2 text-gray-400 hover:text-white transition-colors"
                        >
                            Cancel
                        </button>
                        <button
                            type="submit"
                            disabled={isSubmitting}
                            className="bg-[#00FFA3] text-black font-semibold px-4 py-2 rounded hover:shadow-[0_0_10px_rgba(0,255,163,0.3)] transition-all disabled:opacity-50"
                        >
                            {isSubmitting ? 'Saving...' : 'Confirm Adjustment'}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
};
