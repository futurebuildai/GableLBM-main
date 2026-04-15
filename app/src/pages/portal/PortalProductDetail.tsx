import { useState, useEffect, useCallback } from 'react';
import { useParams, Link } from 'react-router-dom';
import { ArrowLeft, Package, Plus, Minus, CheckCircle, XCircle, ShoppingCart } from 'lucide-react';
import { Card, CardContent } from '../../components/ui/Card';
import { PortalService } from '../../services/PortalService';
import { CartSidebar } from '../../components/portal/CartSidebar';
import { useToast } from '../../components/ui/ToastContext';
import type { CatalogDetail } from '../../types/portal';

const formatCurrency = (val: number): string =>
    new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(val);

export const PortalProductDetail = () => {
    const { id } = useParams<{ id: string }>();
    const [product, setProduct] = useState<CatalogDetail | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const [quantity, setQuantity] = useState(1);
    const [adding, setAdding] = useState(false);
    const [cartOpen, setCartOpen] = useState(false);
    const [cartRefresh, setCartRefresh] = useState(0);
    const { showToast } = useToast();

    const fetchProduct = useCallback(() => {
        if (!id) return;
        setLoading(true);
        PortalService.getCatalogProduct(id)
            .then(setProduct)
            .catch(err => setError(err instanceof Error ? err.message : 'Failed to load product'))
            .finally(() => setLoading(false));
    }, [id]);

    useEffect(() => { fetchProduct(); }, [fetchProduct]);

    const handleAddToCart = async () => {
        if (!id || quantity <= 0) return;
        setAdding(true);
        try {
            await PortalService.addToCart(id, quantity);
            setCartRefresh(prev => prev + 1);
            setCartOpen(true);
        } catch (err) {
            console.error('Add to cart failed:', err);
            showToast('Failed to add to cart', 'error');
        } finally {
            setAdding(false);
        }
    };

    if (loading) {
        return (
            <div className="space-y-4">
                <div className="h-8 w-32 bg-white/5 rounded animate-pulse" />
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                    <div className="aspect-square bg-white/5 rounded-2xl animate-pulse" />
                    <div className="space-y-4">
                        <div className="h-10 w-3/4 bg-white/5 rounded animate-pulse" />
                        <div className="h-6 w-1/3 bg-white/5 rounded animate-pulse" />
                        <div className="h-48 bg-white/5 rounded-xl animate-pulse" />
                    </div>
                </div>
            </div>
        );
    }

    if (error || !product) {
        return (
            <div className="text-center py-16">
                <p className="text-zinc-400">{error || 'Product not found'}</p>
                <Link to="/portal/catalog" className="text-gable-green hover:underline mt-4 inline-block">
                    Back to Catalog
                </Link>
            </div>
        );
    }

    const specs = [
        { label: 'SKU', value: product.sku },
        { label: 'Category', value: product.category },
        { label: 'Species', value: product.species },
        { label: 'Grade', value: product.grade },
        { label: 'UOM', value: product.uom },
        { label: 'Weight', value: product.weight_lbs ? `${product.weight_lbs} lbs` : 'N/A' },
        { label: 'UPC', value: product.upc || 'N/A' },
        { label: 'Vendor', value: product.vendor || 'N/A' },
    ].filter(s => s.value && s.value !== 'N/A' && s.value !== '');

    return (
        <div>
            {/* Back Link */}
            <Link
                to="/portal/catalog"
                className="inline-flex items-center gap-1.5 text-sm text-zinc-400 hover:text-white transition-colors mb-6"
            >
                <ArrowLeft className="w-4 h-4" /> Back to Catalog
            </Link>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                {/* Image */}
                <div className="aspect-square bg-gradient-to-br from-zinc-800/50 to-zinc-900/50 rounded-2xl flex items-center justify-center border border-white/[0.06]">
                    {product.image_url ? (
                        <img src={product.image_url} alt={product.name} className="w-full h-full object-contain p-8" />
                    ) : (
                        <Package className="w-24 h-24 text-zinc-600" />
                    )}
                </div>

                {/* Details */}
                <div className="space-y-6">
                    {/* Category */}
                    {product.category && (
                        <span className="inline-block px-2.5 py-1 rounded-full text-xs uppercase tracking-wider font-semibold bg-gable-green/10 text-gable-green border border-gable-green/20">
                            {product.category}
                        </span>
                    )}

                    <h1 className="text-3xl font-bold text-white">{product.name}</h1>
                    <p className="text-sm text-zinc-500 font-mono">{product.sku}</p>

                    {/* Pricing */}
                    <Card variant="glass">
                        <CardContent className="p-5">
                            <div className="flex items-baseline gap-3 mb-3">
                                <span className="text-3xl font-bold text-white font-mono">
                                    {formatCurrency(product.customer_price)}
                                </span>
                                {product.customer_price < product.base_price && (
                                    <span className="text-lg text-zinc-500 line-through font-mono">
                                        {formatCurrency(product.base_price)}
                                    </span>
                                )}
                                <span className="text-sm text-zinc-500">/{product.uom}</span>
                            </div>
                            {product.price_source !== 'retail' && (
                                <p className="text-xs text-gable-green">
                                    Your {product.price_source} pricing applied
                                </p>
                            )}
                        </CardContent>
                    </Card>

                    {/* Availability */}
                    <div className="flex items-center gap-2">
                        {product.in_stock ? (
                            <>
                                <CheckCircle className="w-5 h-5 text-emerald-400" />
                                <span className="text-emerald-400 font-medium">
                                    {Math.floor(product.available)} available
                                </span>
                            </>
                        ) : (
                            <>
                                <XCircle className="w-5 h-5 text-red-400" />
                                <span className="text-red-400 font-medium">Out of Stock</span>
                            </>
                        )}
                    </div>

                    {/* Quantity + Add to Cart */}
                    <div className="flex items-center gap-3">
                        <div className="flex items-center border border-white/10 rounded-xl overflow-hidden">
                            <button
                                onClick={() => setQuantity(q => Math.max(1, q - 1))}
                                className="px-3 py-2.5 hover:bg-white/5 text-zinc-400 hover:text-white transition-colors"
                            >
                                <Minus className="w-4 h-4" />
                            </button>
                            <input
                                type="number"
                                min={1}
                                value={quantity}
                                onChange={e => setQuantity(Math.max(1, Number(e.target.value)))}
                                className="w-16 text-center py-2.5 bg-transparent border-x border-white/10 text-white font-mono text-sm focus:outline-none"
                            />
                            <button
                                onClick={() => setQuantity(q => q + 1)}
                                className="px-3 py-2.5 hover:bg-white/5 text-zinc-400 hover:text-white transition-colors"
                            >
                                <Plus className="w-4 h-4" />
                            </button>
                        </div>
                        <button
                            onClick={handleAddToCart}
                            disabled={adding || !product.in_stock}
                            className="flex-1 flex items-center justify-center gap-2 py-3 rounded-xl text-sm font-semibold transition-all
                                bg-gable-green text-black hover:bg-gable-green/90
                                disabled:opacity-40 disabled:cursor-not-allowed active:scale-[0.98]"
                        >
                            <ShoppingCart className="w-4 h-4" />
                            {adding ? 'Adding...' : 'Add to Cart'}
                        </button>
                    </div>

                    {/* Specs Table */}
                    {specs.length > 0 && (
                        <Card variant="glass">
                            <CardContent className="p-0">
                                <table className="w-full text-sm">
                                    <tbody>
                                        {specs.map((spec, i) => (
                                            <tr key={spec.label} className={i > 0 ? 'border-t border-white/5' : ''}>
                                                <td className="px-4 py-2.5 text-zinc-500 font-medium w-1/3">{spec.label}</td>
                                                <td className="px-4 py-2.5 text-white font-mono">{spec.value}</td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </CardContent>
                        </Card>
                    )}
                </div>
            </div>

            <CartSidebar isOpen={cartOpen} onClose={() => setCartOpen(false)} refreshKey={cartRefresh} />
        </div>
    );
};
