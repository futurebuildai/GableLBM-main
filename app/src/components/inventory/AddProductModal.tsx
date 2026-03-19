import React, { useState } from 'react';
import type { Product, UOM } from '../../types/product';

interface AddProductModalProps {
    isOpen: boolean;
    onClose: () => void;
    onSave: (product: Omit<Product, 'id' | 'created_at' | 'updated_at'>) => Promise<void>;
}

const UOM_OPTIONS: UOM[] = [
    'PCS', 'EA', 'LF', 'SF', 'BF', 'MBF', 'SQ',
    'BOX', 'CTN', 'RL', 'GAL', 'LBS',
    'BAG', 'BUNDLE', 'PAIR', 'SET'
];

export const AddProductModal: React.FC<AddProductModalProps> = ({ isOpen, onClose, onSave }) => {
    const [sku, setSku] = useState('');
    const [description, setDescription] = useState('');
    const [uom, setUom] = useState<UOM>('PCS');
    const [basePrice, setBasePrice] = useState<number>(0);
    const [vendor, setVendor] = useState('');
    const [upc, setUpc] = useState('');
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [error, setError] = useState('');

    if (!isOpen) return null;

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setIsSubmitting(true);
        setError('');

        try {
            await onSave({ sku, description, uom_primary: uom, base_price: basePrice, vendor, upc, average_unit_cost: 0, target_margin: 0.30, commission_rate: 0.05 });
            onClose();
            // Reset form
            setSku('');
            setDescription('');
            setUom('PCS');
            setBasePrice(0);
            setVendor('');
            setUpc('');
        } catch (err) {

            setError(err instanceof Error ? err.message : 'Failed to save product');
        } finally {
            setIsSubmitting(false);
        }
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm">
            <div className="w-full max-w-md bg-zinc-900 border border-zinc-700 rounded-lg shadow-2xl p-6">
                <div className="mb-6">
                    <h2 className="text-xl font-bold text-zinc-100">Add Product to Pile</h2>
                    <p className="text-zinc-400 text-sm mt-1">Create a new SKU in the master catalog.</p>
                </div>

                {error && (
                    <div className="mb-4 p-3 bg-red-900/30 border border-red-800 text-red-200 rounded text-sm">
                        {error}
                    </div>
                )}

                <form onSubmit={handleSubmit} className="space-y-4">
                    <div>
                        <label className="block text-sm font-medium text-zinc-400 mb-1">SKU</label>
                        <input
                            type="text"
                            required
                            value={sku}
                            onChange={(e) => setSku(e.target.value)}
                            className="w-full bg-zinc-950 border border-zinc-700 rounded px-3 py-2 text-zinc-100 focus:outline-none focus:ring-2 focus:ring-amber-600 focus:border-transparent font-mono"
                            placeholder="e.g. 2x4x8-SPF"
                        />
                    </div>

                    <div>
                        <label className="block text-sm font-medium text-zinc-400 mb-1">Description</label>
                        <input
                            type="text"
                            required
                            value={description}
                            onChange={(e) => setDescription(e.target.value)}
                            className="w-full bg-zinc-950 border border-zinc-700 rounded px-3 py-2 text-zinc-100 focus:outline-none focus:ring-2 focus:ring-amber-600 focus:border-transparent"
                            placeholder="e.g. 2x4x8 SPF Premium Stud"
                        />
                    </div>

                    <div>
                        <label className="block text-sm font-medium text-zinc-400 mb-1">Primary UOM</label>
                        <select
                            value={uom}
                            onChange={(e) => setUom(e.target.value as UOM)}
                            className="w-full bg-zinc-950 border border-zinc-700 rounded px-3 py-2 text-zinc-100 focus:outline-none focus:ring-2 focus:ring-amber-600 focus:border-transparent"
                        >
                            {UOM_OPTIONS.map((opt) => (
                                <option key={opt} value={opt}>{opt}</option>
                            ))}
                        </select>
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                        <div>
                            <label className="block text-sm font-medium text-zinc-400 mb-1">UPC Code</label>
                            <input
                                type="text"
                                value={upc}
                                onChange={(e) => setUpc(e.target.value)}
                                className="w-full bg-zinc-950 border border-zinc-700 rounded px-3 py-2 text-zinc-100 focus:outline-none focus:ring-2 focus:ring-amber-600 focus:border-transparent font-mono"
                                placeholder="123456789012"
                            />
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-zinc-400 mb-1">Vendor / Manufacturer</label>
                            <input
                                type="text"
                                value={vendor}
                                onChange={(e) => setVendor(e.target.value)}
                                className="w-full bg-zinc-950 border border-zinc-700 rounded px-3 py-2 text-zinc-100 focus:outline-none focus:ring-2 focus:ring-amber-600 focus:border-transparent"
                                placeholder="e.g. Weyerhaeuser"
                            />
                        </div>
                    </div>

                    <div>
                        <label className="block text-sm font-medium text-zinc-400 mb-1">Base Price</label>
                        <input
                            type="number"
                            min="0"
                            step="0.01"
                            value={basePrice}
                            onChange={(e) => setBasePrice(parseFloat(e.target.value))}
                            className="w-full bg-zinc-950 border border-zinc-700 rounded px-3 py-2 text-zinc-100 focus:outline-none focus:ring-2 focus:ring-amber-600 focus:border-transparent font-mono"
                        />
                    </div>

                    <div className="mt-8 flex justify-end gap-3">
                        <button
                            type="button"
                            onClick={onClose}
                            className="px-4 py-2 text-sm text-zinc-300 hover:text-white transition-colors"
                        >
                            Cancel
                        </button>
                        <button
                            type="submit"
                            disabled={isSubmitting}
                            className="px-4 py-2 bg-amber-600 hover:bg-amber-500 text-white rounded text-sm font-medium transition-colors disabled:opacity-50"
                        >
                            {isSubmitting ? 'Saving...' : 'Create Product'}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
};
