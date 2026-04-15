import { useEffect, useState } from 'react';
import type { Product } from '../../types/product';
import { ProductService } from '../../services/product.service';
import { Search } from 'lucide-react';
import { useToast } from '../ui/ToastContext';

interface ProductSelectProps {
    onSelect: (product: Product) => void;
    selectedProductId?: string;
}

export const ProductSelect = ({ onSelect, selectedProductId }: ProductSelectProps) => {
    const { showToast } = useToast();
    const [products, setProducts] = useState<Product[]>([]);
    const [loading, setLoading] = useState(true);
    const [searchTerm, setSearchTerm] = useState('');
    const [isOpen, setIsOpen] = useState(false);

    useEffect(() => {
        const fetchProducts = async () => {
            try {
                const data = await ProductService.getProducts();
                setProducts(data);
            } catch (error) {
                console.error('Failed to load products', error);
                showToast('Failed to load products', 'error');
            } finally {
                setLoading(false);
            }
        };
        fetchProducts();
    }, [showToast]);

    const filteredProducts = products.filter(p =>
        p.sku.toLowerCase().includes(searchTerm.toLowerCase()) ||
        p.description.toLowerCase().includes(searchTerm.toLowerCase())
    );

    const selectedProduct = products.find(p => p.id === selectedProductId);

    return (
        <div className="relative w-full">
            <label className="block text-sm font-medium text-gray-400 mb-1">Product</label>

            <div className="relative">
                <div
                    onClick={() => setIsOpen(!isOpen)}
                    className="flex items-center w-full px-4 py-2 bg-[#161821] border border-white/10 rounded-md cursor-pointer hover:border-[#00FFA3] transition-colors"
                >
                    <Search className="w-4 h-4 text-gray-400 mr-2" />
                    <input
                        type="text"
                        className="bg-transparent border-none outline-none text-white w-full placeholder-gray-600 cursor-pointer"
                        placeholder="Search by SKU or description..."
                        value={isOpen ? searchTerm : (selectedProduct ? `${selectedProduct.sku} — ${selectedProduct.description}` : '')}
                        onChange={(e) => {
                            setSearchTerm(e.target.value);
                            setIsOpen(true);
                        }}
                        onFocus={() => setIsOpen(true)}
                    />
                </div>

                {isOpen && (
                    <div className="absolute z-50 w-full mt-1 bg-[#161821] border border-white/10 rounded-md shadow-xl max-h-60 overflow-auto">
                        {loading && (
                            <div className="p-4 text-center text-gray-500 text-sm">Loading...</div>
                        )}

                        {!loading && filteredProducts.length === 0 && (
                            <div className="p-4 text-center text-gray-500 text-sm">No products found</div>
                        )}

                        {!loading && filteredProducts.slice(0, 50).map(product => (
                            <div
                                key={product.id}
                                className="px-4 py-2 hover:bg-[#00FFA3]/10 cursor-pointer flex justify-between items-center group"
                                onClick={() => {
                                    onSelect(product);
                                    setSearchTerm('');
                                    setIsOpen(false);
                                }}
                            >
                                <div>
                                    <div className="text-white font-mono text-sm group-hover:text-[#00FFA3] transition-colors">
                                        {product.sku}
                                    </div>
                                    <div className="text-xs text-gray-500 truncate max-w-[300px]">{product.description}</div>
                                </div>
                                <div className="text-xs text-right text-gray-500 font-mono">
                                    ${product.base_price.toFixed(2)}
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </div>

            {isOpen && (
                <div className="fixed inset-0 z-40" onClick={() => setIsOpen(false)} />
            )}
        </div>
    );
};
