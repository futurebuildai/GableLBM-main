import React, { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import type { ProductDetail as ProductDetailType, PIMContent } from '../../types/pim';
import { PIMService } from '../../services/PIMService';
import { ProductOverviewTab } from './tabs/ProductOverviewTab';
import { ProductContentTab } from './tabs/ProductContentTab';
import { ProductMediaTab } from './tabs/ProductMediaTab';
import { ProductCollateralTab } from './tabs/ProductCollateralTab';
import { ProductSEOTab } from './tabs/ProductSEOTab';
import { ProductStockTab } from './tabs/ProductStockTab';
import { ArrowLeft, Loader2, Package, FileText, Image, Megaphone, Search, Warehouse } from 'lucide-react';
import { useToast } from '../../components/ui/ToastContext';

type TabId = 'overview' | 'content' | 'media' | 'collateral' | 'seo' | 'stock';

const TABS: { id: TabId; label: string; icon: React.ReactNode }[] = [
    { id: 'overview', label: 'Overview', icon: <Package className="w-4 h-4" /> },
    { id: 'content', label: 'PIM / Content', icon: <FileText className="w-4 h-4" /> },
    { id: 'media', label: 'Media', icon: <Image className="w-4 h-4" /> },
    { id: 'collateral', label: 'Collateral', icon: <Megaphone className="w-4 h-4" /> },
    { id: 'seo', label: 'SEO', icon: <Search className="w-4 h-4" /> },
    { id: 'stock', label: 'Stock & Locations', icon: <Warehouse className="w-4 h-4" /> },
];

export const ProductDetail: React.FC = () => {
    const { id } = useParams<{ id: string }>();
    const navigate = useNavigate();
    const { showToast } = useToast();
    const [product, setProduct] = useState<ProductDetailType | null>(null);
    const [loading, setLoading] = useState(true);
    const [activeTab, setActiveTab] = useState<TabId>('overview');

    const loadProduct = useCallback(async () => {
        if (!id) return;
        try {
            const data = await PIMService.getProductDetail(id);
            setProduct(data);
        } catch (err) {
            console.error('Failed to load product:', err);
            showToast('Failed to load product', 'error');
        } finally {
            setLoading(false);
        }
    }, [id]);

    useEffect(() => {
        loadProduct();
    }, [loadProduct]);

    const handleContentUpdate = useCallback((content: PIMContent) => {
        setProduct(prev => prev ? { ...prev, content } : prev);
    }, []);

    const handleMediaUpdate = useCallback(() => {
        loadProduct();
    }, [loadProduct]);

    const handleCollateralUpdate = useCallback(() => {
        loadProduct();
    }, [loadProduct]);

    if (loading) {
        return (
            <div className="flex items-center justify-center h-96">
                <Loader2 className="w-8 h-8 text-zinc-500 animate-spin" />
            </div>
        );
    }

    if (!product) {
        return (
            <div className="flex flex-col items-center justify-center h-96 gap-4">
                <Package className="w-16 h-16 text-zinc-600" />
                <p className="text-zinc-500">Product not found</p>
                <button onClick={() => navigate('/inventory')} className="text-gable-green hover:underline text-sm">
                    Back to Inventory
                </button>
            </div>
        );
    }

    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="flex items-center gap-4">
                <button
                    onClick={() => navigate('/inventory')}
                    className="p-2 rounded-lg hover:bg-white/5 text-zinc-400 hover:text-white transition-colors"
                    aria-label="Back to inventory"
                >
                    <ArrowLeft className="w-5 h-5" />
                </button>
                <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-3 mb-1">
                        <h1 className="text-xl font-bold text-white truncate">{product.description}</h1>
                        <span className="px-2 py-0.5 bg-white/5 border border-white/10 rounded text-xs font-mono text-zinc-400 shrink-0">
                            {product.sku}
                        </span>
                    </div>
                    <div className="flex items-center gap-3 text-sm text-zinc-500">
                        {product.vendor && <span>{product.vendor}</span>}
                        <span>{product.uom_primary}</span>
                        <span className="font-mono text-emerald-400">${(product.base_price || 0).toFixed(2)}</span>
                    </div>
                </div>
            </div>

            {/* Tabs */}
            <div className="border-b border-white/10">
                <div className="flex gap-1 overflow-x-auto">
                    {TABS.map(tab => (
                        <button
                            key={tab.id}
                            onClick={() => setActiveTab(tab.id)}
                            className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium whitespace-nowrap border-b-2 transition-colors ${
                                activeTab === tab.id
                                    ? 'border-gable-green text-gable-green'
                                    : 'border-transparent text-zinc-400 hover:text-white hover:border-white/20'
                            }`}
                        >
                            {tab.icon}
                            {tab.label}
                        </button>
                    ))}
                </div>
            </div>

            {/* Tab Content */}
            <div>
                {activeTab === 'overview' && <ProductOverviewTab product={product} onProductUpdate={loadProduct} />}
                {activeTab === 'content' && (
                    <ProductContentTab productId={product.id} content={product.content} onContentUpdate={handleContentUpdate} />
                )}
                {activeTab === 'media' && (
                    <ProductMediaTab productId={product.id} media={product.media} onMediaUpdate={handleMediaUpdate} />
                )}
                {activeTab === 'collateral' && (
                    <ProductCollateralTab productId={product.id} collateral={product.collateral} onCollateralUpdate={handleCollateralUpdate} />
                )}
                {activeTab === 'seo' && (
                    <ProductSEOTab productId={product.id} content={product.content} onContentUpdate={handleContentUpdate} />
                )}
                {activeTab === 'stock' && (
                    <ProductStockTab productId={product.id} productDescription={product.description} />
                )}
            </div>
        </div>
    );
};

export default ProductDetail;
