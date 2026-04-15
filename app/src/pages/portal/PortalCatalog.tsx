import { useState, useEffect, useCallback } from 'react';
import { Search, Filter, ShoppingCart, RefreshCw, Package } from 'lucide-react';
import { PortalService } from '../../services/PortalService';
import { ProductCard } from '../../components/portal/ProductCard';
import { CartSidebar } from '../../components/portal/CartSidebar';
import type { CatalogProduct } from '../../types/portal';
import { useToast } from '../../components/ui/ToastContext';

export const PortalCatalog = () => {
    const { showToast } = useToast();
    const [products, setProducts] = useState<CatalogProduct[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const [search, setSearch] = useState('');
    const [category, setCategory] = useState('');
    const [species, setSpecies] = useState('');
    const [grade, setGrade] = useState('');
    const [cartOpen, setCartOpen] = useState(false);
    const [cartRefresh, setCartRefresh] = useState(0);
    const [addingId, setAddingId] = useState<string | null>(null);

    const categories = [...new Set(products.map(p => p.category).filter(Boolean))].sort();
    const speciesList = [...new Set(products.map(p => p.species).filter(Boolean))].sort();
    const grades = [...new Set(products.map(p => p.grade).filter(Boolean))].sort();

    const fetchCatalog = useCallback(() => {
        setLoading(true);
        setError('');
        PortalService.getCatalog({
            q: search || undefined,
            category: category || undefined,
            species: species || undefined,
            grade: grade || undefined,
        })
            .then(setProducts)
            .catch(err => setError(err instanceof Error ? err.message : 'Failed to load catalog'))
            .finally(() => setLoading(false));
    }, [search, category, species, grade]);

    useEffect(() => {
        const timer = setTimeout(fetchCatalog, 300); // debounce search
        return () => clearTimeout(timer);
    }, [fetchCatalog]);

    const handleAddToCart = async (productId: string, quantity: number) => {
        setAddingId(productId);
        try {
            await PortalService.addToCart(productId, quantity);
            setCartRefresh(prev => prev + 1);
            setCartOpen(true);
        } catch (err) {
            console.error('Add to cart failed:', err);
            showToast('Failed to add item to cart', 'error');
        } finally {
            setAddingId(null);
        }
    };

    return (
        <div>
            {/* Header */}
            <div className="flex items-center justify-between mb-8">
                <div>
                    <h1 className="text-display-large text-white">Product Catalog</h1>
                    <p className="text-zinc-400 mt-2 text-lg">
                        Browse products with your custom pricing.
                    </p>
                </div>
                <button
                    onClick={() => setCartOpen(true)}
                    className="relative p-3 rounded-xl bg-white/5 border border-white/10 text-white hover:bg-white/10 transition-colors"
                >
                    <ShoppingCart className="w-6 h-6" />
                </button>
            </div>

            {/* Search & Filters */}
            <div className="grid grid-cols-1 md:grid-cols-5 gap-3 mb-6">
                <div className="md:col-span-2 relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500" />
                    <input
                        type="text"
                        placeholder="Search by SKU or description..."
                        value={search}
                        onChange={e => setSearch(e.target.value)}
                        className="w-full pl-10 pr-4 py-2.5 rounded-xl bg-white/5 border border-white/10 text-white placeholder-zinc-500 focus:outline-none focus:border-gable-green/50 transition-colors text-sm"
                    />
                </div>
                <select
                    value={category}
                    onChange={e => setCategory(e.target.value)}
                    className="px-3 py-2.5 rounded-xl bg-white/5 border border-white/10 text-white text-sm focus:outline-none focus:border-gable-green/50 transition-colors appearance-none"
                >
                    <option value="">All Categories</option>
                    {categories.map(c => (
                        <option key={c} value={c}>{c}</option>
                    ))}
                </select>
                <select
                    value={species}
                    onChange={e => setSpecies(e.target.value)}
                    className="px-3 py-2.5 rounded-xl bg-white/5 border border-white/10 text-white text-sm focus:outline-none focus:border-gable-green/50 transition-colors appearance-none"
                >
                    <option value="">All Species</option>
                    {speciesList.map(s => (
                        <option key={s} value={s}>{s}</option>
                    ))}
                </select>
                <select
                    value={grade}
                    onChange={e => setGrade(e.target.value)}
                    className="px-3 py-2.5 rounded-xl bg-white/5 border border-white/10 text-white text-sm focus:outline-none focus:border-gable-green/50 transition-colors appearance-none"
                >
                    <option value="">All Grades</option>
                    {grades.map(g => (
                        <option key={g} value={g}>{g}</option>
                    ))}
                </select>
            </div>

            {/* Filter summary */}
            {(category || species || grade) && (
                <div className="flex items-center gap-2 mb-4">
                    <Filter className="w-4 h-4 text-zinc-500" />
                    <div className="flex gap-2">
                        {[category, species, grade].filter(Boolean).map(f => (
                            <span
                                key={f}
                                className="px-2 py-0.5 rounded-full text-xs bg-gable-green/10 text-gable-green border border-gable-green/20"
                            >
                                {f}
                            </span>
                        ))}
                    </div>
                    <button
                        onClick={() => { setCategory(''); setSpecies(''); setGrade(''); }}
                        className="text-xs text-zinc-500 hover:text-white transition-colors ml-2"
                    >
                        Clear filters
                    </button>
                </div>
            )}

            {/* Product Grid */}
            {loading ? (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                    {Array.from({ length: 8 }).map((_, i) => (
                        <div key={i} className="aspect-[3/4] bg-white/5 rounded-2xl animate-pulse" />
                    ))}
                </div>
            ) : error ? (
                <div className="flex flex-col items-center justify-center py-16 text-center">
                    <Package className="w-12 h-12 text-zinc-600 mb-4" />
                    <p className="text-zinc-400 mb-4">{error}</p>
                    <button
                        onClick={fetchCatalog}
                        className="flex items-center gap-2 px-4 py-2 rounded-lg bg-white/5 border border-white/10 text-white hover:bg-white/10 transition-colors"
                    >
                        <RefreshCw size={16} /> Retry
                    </button>
                </div>
            ) : products.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-16 text-center">
                    <Package className="w-12 h-12 text-zinc-600 mb-4" />
                    <p className="text-zinc-400">No products found matching your criteria.</p>
                </div>
            ) : (
                <>
                    <p className="text-xs text-zinc-500 mb-4">{products.length} product{products.length !== 1 ? 's' : ''}</p>
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                        {products.map(product => (
                            <ProductCard
                                key={product.id}
                                product={product}
                                onAddToCart={handleAddToCart}
                                adding={addingId === product.id}
                            />
                        ))}
                    </div>
                </>
            )}

            {/* Cart Sidebar */}
            <CartSidebar
                isOpen={cartOpen}
                onClose={() => setCartOpen(false)}
                refreshKey={cartRefresh}
            />
        </div>
    );
};
