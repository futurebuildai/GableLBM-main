import { useState } from 'react';
import { Plus } from 'lucide-react';
import type { Product } from '../../types/product';

import { PricingService } from '../../services/pricing.service';
import type { CalculatedPrice } from '../../types/pricing';
import { useToast } from '../ui/ToastContext';

interface LineItemEditorProps {
    products: Product[];
    customerId?: string;
    onAddLine: (product: Product, quantity: number, unitPrice: number) => void;
}

export const LineItemEditor = ({ products, customerId, onAddLine }: LineItemEditorProps) => {
    const { showToast } = useToast();
    const [searchTerm, setSearchTerm] = useState('');
    const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
    const [quantity, setQuantity] = useState<number>(1);
    const [price, setPrice] = useState<number>(0);
    const [isSearchOpen, setIsSearchOpen] = useState(false);

    const [priceDetails, setPriceDetails] = useState<CalculatedPrice | null>(null);

    const filteredProducts = products.filter(p =>
        p.sku.toLowerCase().includes(searchTerm.toLowerCase()) ||
        p.description.toLowerCase().includes(searchTerm.toLowerCase())
    );

    const handleSelectProduct = async (p: Product) => {
        setSelectedProduct(p);
        setSearchTerm(p.sku);
        setIsSearchOpen(false);

        if (customerId) {
            try {
                const pricing = await PricingService.calculatePrice(customerId, p.id);
                setPrice(pricing.final_price);
                setPriceDetails(pricing);
            } catch (err) {
                console.error("Failed to fetch price", err);
                showToast('Resolved price failed, using fallback base price', 'error');
                setPrice(p.base_price || 0);
                setPriceDetails(null);
            }
        } else {
            setPrice(p.base_price || 0);
            setPriceDetails(null);
        }
    };

    const handleAdd = () => {
        if (selectedProduct && quantity > 0) {
            onAddLine(selectedProduct, quantity, price);
            // Reset
            setSelectedProduct(null);
            setSearchTerm('');
            setQuantity(1);
            setPrice(0);
            setPriceDetails(null);
        }
    };

    return (
        <div className="bg-[#161821] border border-white/10 p-4 rounded-lg mb-4">
            <h3 className="text-sm font-medium text-gray-400 mb-3 uppercase tracking-wider">Add Line Item</h3>
            <div className="grid grid-cols-12 gap-4 items-end">
                {/* Product Search */}
                <div className="col-span-6 relative">
                    <label className="block text-xs font-medium text-gray-500 mb-1">Product</label>
                    <div className="relative">
                        <input
                            type="text"
                            className="w-full bg-[#0A0B10] border border-white/10 rounded px-3 py-2 text-white focus:border-[#00FFA3] outline-none"
                            placeholder="Search SKU or Desc..."
                            value={searchTerm}
                            onChange={(e) => {
                                setSearchTerm(e.target.value);
                                setIsSearchOpen(true);
                                setSelectedProduct(null);
                            }}
                            onFocus={() => setIsSearchOpen(true)}
                        />
                        {isSearchOpen && searchTerm && (
                            <div className="absolute z-50 w-full mt-1 bg-[#0A0B10] border border-white/10 rounded shadow-xl max-h-48 overflow-auto">
                                {filteredProducts.map(p => (
                                    <div
                                        key={p.id}
                                        className="px-3 py-2 hover:bg-[#00FFA3]/10 cursor-pointer text-sm"
                                        onClick={() => handleSelectProduct(p)}
                                    >
                                        <div className="flex justify-between">
                                            <span className="text-white font-mono">{p.sku}</span>
                                            <span className="text-gray-500 text-xs">{p.uom_primary}</span>
                                        </div>
                                        <div className="text-gray-400 text-xs truncate">{p.description}</div>
                                    </div>
                                ))}
                            </div>
                        )}
                        {/* Overlay to close */}
                        {isSearchOpen && <div className="fixed inset-0 z-40" onClick={() => setIsSearchOpen(false)} />}
                    </div>
                </div>

                {/* Quantity */}
                <div className="col-span-2">
                    <label className="block text-xs font-medium text-gray-500 mb-1">Qty</label>
                    <input
                        type="number"
                        className="w-full bg-[#0A0B10] border border-white/10 rounded px-3 py-2 text-white text-right font-mono focus:border-[#00FFA3] outline-none"
                        value={quantity}
                        onChange={(e) => setQuantity(Number(e.target.value))}
                        min="1"
                    />
                </div>

                {/* Price */}
                <div className="col-span-2">
                    <label className="block text-xs font-medium text-gray-500 mb-1">Price</label>
                    <input
                        type="number"
                        className="w-full bg-[#0A0B10] border border-white/10 rounded px-3 py-2 text-white text-right font-mono focus:border-[#00FFA3] outline-none"
                        value={price}
                        onChange={(e) => setPrice(Number(e.target.value))}
                        step="0.01"
                    />
                    {priceDetails && priceDetails.source !== 'RETAIL' && (
                        <div className="absolute right-0 -bottom-5 text-[10px] text-[#00FFA3] whitespace-nowrap">
                            {priceDetails.details}
                        </div>
                    )}
                </div>

                {/* Add Button */}
                <div className="col-span-2">
                    <button
                        onClick={handleAdd}
                        disabled={!selectedProduct || quantity <= 0}
                        className="w-full flex items-center justify-center bg-[#00FFA3] text-black font-medium py-2 rounded hover:bg-[#00FFA3]/80 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                    >
                        <Plus className="w-4 h-4 mr-1" />
                        Add
                    </button>
                </div>
            </div>
        </div>
    );
};
