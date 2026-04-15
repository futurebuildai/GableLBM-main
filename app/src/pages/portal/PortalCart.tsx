import { useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { ShoppingCart, Trash2, Minus, Plus, ArrowLeft, ArrowRight, RefreshCw } from 'lucide-react';
import { Card, CardContent } from '../../components/ui/Card';
import { PortalService } from '../../services/PortalService';
import type { Cart } from '../../types/portal';
import { useToast } from '../../components/ui/ToastContext';

const formatCurrency = (val: number): string =>
    new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(val);

export const PortalCart = () => {
    const { showToast } = useToast();
    const [cart, setCart] = useState<Cart | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');

    const fetchCart = useCallback(() => {
        setLoading(true);
        setError('');
        PortalService.getCart()
            .then(setCart)
            .catch(err => setError(err instanceof Error ? err.message : 'Failed to load cart'))
            .finally(() => setLoading(false));
    }, []);

    useEffect(() => { fetchCart(); }, [fetchCart]);

    const handleUpdateQty = async (itemId: string, qty: number) => {
        try {
            if (qty <= 0) {
                const updated = await PortalService.removeCartItem(itemId);
                setCart(updated);
            } else {
                const updated = await PortalService.updateCartItem(itemId, qty);
                setCart(updated);
            }
        } catch (err) {
            console.error('Update cart failed:', err);
            showToast('Failed to update cart quantity', 'error');
        }
    };

    const handleRemove = async (itemId: string) => {
        try {
            const updated = await PortalService.removeCartItem(itemId);
            setCart(updated);
        } catch (err) {
            console.error('Remove item failed:', err);
            showToast('Failed to remove item from cart', 'error');
        }
    };

    if (loading) {
        return (
            <div className="space-y-4">
                <div className="h-10 w-48 bg-white/5 rounded-lg animate-pulse" />
                {[1, 2, 3].map(i => (
                    <div key={i} className="h-24 bg-white/5 rounded-2xl animate-pulse" />
                ))}
            </div>
        );
    }

    if (error) {
        return (
            <div className="flex flex-col items-center justify-center py-16 text-center">
                <p className="text-zinc-400 mb-4">{error}</p>
                <button onClick={fetchCart} className="flex items-center gap-2 px-4 py-2 rounded-lg bg-white/5 border border-white/10 text-white hover:bg-white/10 transition-colors">
                    <RefreshCw size={16} /> Retry
                </button>
            </div>
        );
    }

    return (
        <div>
            {/* Header */}
            <div className="flex items-center justify-between mb-8">
                <div>
                    <h1 className="text-display-large text-white">Shopping Cart</h1>
                    <p className="text-zinc-400 mt-2">
                        {cart?.item_count || 0} item{(cart?.item_count || 0) !== 1 ? 's' : ''} in your cart
                    </p>
                </div>
                <Link
                    to="/portal/catalog"
                    className="flex items-center gap-1.5 text-sm text-zinc-400 hover:text-white transition-colors"
                >
                    <ArrowLeft className="w-4 h-4" /> Continue Shopping
                </Link>
            </div>

            {!cart || cart.items.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-16 text-center">
                    <ShoppingCart className="w-16 h-16 text-zinc-600 mb-4" />
                    <h3 className="text-xl font-semibold text-white mb-2">Your cart is empty</h3>
                    <p className="text-zinc-500 mb-6">Add products from the catalog to get started.</p>
                    <Link
                        to="/portal/catalog"
                        className="px-6 py-3 rounded-xl bg-gable-green text-black font-semibold hover:bg-gable-green/90 transition-colors"
                    >
                        Browse Catalog
                    </Link>
                </div>
            ) : (
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                    {/* Cart Items */}
                    <div className="lg:col-span-2 space-y-3">
                        {cart.items.map(item => (
                            <Card key={item.id} variant="glass">
                                <CardContent className="p-4">
                                    <div className="flex items-start gap-4">
                                        <Link
                                            to={`/portal/catalog/${item.product_id}`}
                                            className="flex-1 min-w-0"
                                        >
                                            <h3 className="text-sm font-semibold text-white hover:text-gable-green transition-colors">
                                                {item.product_name}
                                            </h3>
                                            <p className="text-xs text-zinc-500 font-mono mt-0.5">{item.product_sku}</p>
                                            <p className="text-sm text-zinc-400 mt-1 font-mono">
                                                {formatCurrency(item.unit_price)} each
                                            </p>
                                        </Link>

                                        {/* Quantity Controls */}
                                        <div className="flex items-center border border-white/10 rounded-lg overflow-hidden">
                                            <button
                                                onClick={() => handleUpdateQty(item.id, item.quantity - 1)}
                                                className="px-2.5 py-1.5 hover:bg-white/5 text-zinc-400 hover:text-white transition-colors"
                                            >
                                                <Minus className="w-3.5 h-3.5" />
                                            </button>
                                            <span className="px-3 py-1.5 text-sm text-white font-mono border-x border-white/10 min-w-[40px] text-center">
                                                {item.quantity}
                                            </span>
                                            <button
                                                onClick={() => handleUpdateQty(item.id, item.quantity + 1)}
                                                className="px-2.5 py-1.5 hover:bg-white/5 text-zinc-400 hover:text-white transition-colors"
                                            >
                                                <Plus className="w-3.5 h-3.5" />
                                            </button>
                                        </div>

                                        {/* Line Total + Remove */}
                                        <div className="text-right">
                                            <p className="text-sm font-bold text-white font-mono">
                                                {formatCurrency(item.line_total)}
                                            </p>
                                            <button
                                                onClick={() => handleRemove(item.id)}
                                                className="mt-1 flex items-center gap-1 text-xs text-zinc-500 hover:text-red-400 transition-colors"
                                            >
                                                <Trash2 className="w-3 h-3" /> Remove
                                            </button>
                                        </div>
                                    </div>
                                </CardContent>
                            </Card>
                        ))}
                    </div>

                    {/* Order Summary */}
                    <div>
                        <Card variant="glass" className="sticky top-6">
                            <CardContent className="p-5 space-y-4">
                                <h3 className="text-lg font-semibold text-white">Order Summary</h3>

                                <div className="space-y-2 text-sm">
                                    <div className="flex justify-between text-zinc-400">
                                        <span>Subtotal ({cart.item_count} items)</span>
                                        <span className="font-mono text-white">{formatCurrency(cart.subtotal)}</span>
                                    </div>
                                    <div className="flex justify-between text-zinc-500">
                                        <span>Tax</span>
                                        <span className="font-mono">Calculated at checkout</span>
                                    </div>
                                    <div className="flex justify-between text-zinc-500">
                                        <span>Delivery</span>
                                        <span className="font-mono">TBD</span>
                                    </div>
                                </div>

                                <div className="border-t border-white/10 pt-4 flex justify-between items-center">
                                    <span className="text-sm font-medium text-zinc-400">Estimated Total</span>
                                    <span className="text-2xl font-bold text-white font-mono">
                                        {formatCurrency(cart.subtotal)}
                                    </span>
                                </div>

                                <Link
                                    to="/portal/checkout"
                                    className="flex items-center justify-center gap-2 w-full py-3 rounded-xl text-sm font-semibold bg-gable-green text-black hover:bg-gable-green/90 transition-colors"
                                >
                                    Proceed to Checkout <ArrowRight className="w-4 h-4" />
                                </Link>
                            </CardContent>
                        </Card>
                    </div>
                </div>
            )}
        </div>
    );
};
