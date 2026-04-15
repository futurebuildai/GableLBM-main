import { useState, useEffect, useCallback } from 'react';
import { ShoppingCart, X, Minus, Plus, Trash2, ArrowRight } from 'lucide-react';
import { Link } from 'react-router-dom';
import { PortalService } from '../../services/PortalService';
import type { Cart } from '../../types/portal';
import { useToast } from '../../components/ui/ToastContext';

const formatCurrency = (val: number): string =>
    new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(val);

interface CartSidebarProps {
    isOpen: boolean;
    onClose: () => void;
    refreshKey?: number; // increment to trigger refresh
}

export const CartSidebar = ({ isOpen, onClose, refreshKey }: CartSidebarProps) => {
    const { showToast } = useToast();
    const [cart, setCart] = useState<Cart | null>(null);
    const [loading, setLoading] = useState(false);

    const fetchCart = useCallback(() => {
        setLoading(true);
        PortalService.getCart()
            .then(setCart)
            .catch(() => setCart(null))
            .finally(() => setLoading(false));
    }, []);

    useEffect(() => {
        if (isOpen) fetchCart();
    }, [isOpen, fetchCart, refreshKey]);

    const handleUpdateQty = async (itemId: string, qty: number) => {
        try {
            if (qty <= 0) {
                const updated = await PortalService.removeCartItem(itemId);
                setCart(updated);
            } else {
                const updated = await PortalService.updateCartItem(itemId, qty);
                setCart(updated);
            }
        } catch {
            showToast('Failed to update cart quantity', 'error');
        }
    };

    const handleRemove = async (itemId: string) => {
        try {
            const updated = await PortalService.removeCartItem(itemId);
            setCart(updated);
        } catch {
            showToast('Failed to remove item from cart', 'error');
        }
    };

    return (
        <>
            {/* Backdrop */}
            {isOpen && (
                <div
                    className="fixed inset-0 bg-black/60 backdrop-blur-sm z-40"
                    onClick={onClose}
                />
            )}

            {/* Sidebar */}
            <div
                className={`fixed right-0 top-0 h-full w-96 max-w-full bg-zinc-900 border-l border-white/10 z-50 transform transition-transform duration-300 ${isOpen ? 'translate-x-0' : 'translate-x-full'
                    }`}
            >
                {/* Header */}
                <div className="flex items-center justify-between p-4 border-b border-white/10">
                    <div className="flex items-center gap-2">
                        <ShoppingCart className="w-5 h-5 text-gable-green" />
                        <h2 className="text-lg font-semibold text-white">Cart</h2>
                        {cart && cart.item_count > 0 && (
                            <span className="px-2 py-0.5 rounded-full text-xs font-bold bg-gable-green/20 text-gable-green">
                                {cart.item_count}
                            </span>
                        )}
                    </div>
                    <button
                        onClick={onClose}
                        className="p-2 rounded-lg hover:bg-white/5 text-zinc-400 hover:text-white transition-colors"
                    >
                        <X className="w-5 h-5" />
                    </button>
                </div>

                {/* Content */}
                <div className="flex-1 overflow-y-auto p-4 space-y-3" style={{ maxHeight: 'calc(100vh - 180px)' }}>
                    {loading ? (
                        <div className="space-y-3">
                            {[1, 2, 3].map(i => (
                                <div key={i} className="h-20 bg-white/5 rounded-xl animate-pulse" />
                            ))}
                        </div>
                    ) : !cart || cart.items.length === 0 ? (
                        <div className="flex flex-col items-center justify-center py-12 text-center">
                            <ShoppingCart className="w-12 h-12 text-zinc-600 mb-3" />
                            <p className="text-zinc-500 text-sm">Your cart is empty</p>
                            <Link
                                to="/portal/catalog"
                                onClick={onClose}
                                className="mt-3 text-sm text-gable-green hover:underline"
                            >
                                Browse Catalog
                            </Link>
                        </div>
                    ) : (
                        cart.items.map(item => (
                            <div
                                key={item.id}
                                className="flex gap-3 p-3 rounded-xl bg-white/[0.03] border border-white/[0.06]"
                            >
                                <div className="flex-1 min-w-0">
                                    <p className="text-sm font-medium text-white truncate">
                                        {item.product_name}
                                    </p>
                                    <p className="text-xs text-zinc-500 font-mono">{item.product_sku}</p>
                                    <p className="text-sm font-mono text-zinc-300 mt-1">
                                        {formatCurrency(item.unit_price)} x {item.quantity}
                                    </p>
                                </div>
                                <div className="flex flex-col items-end gap-2">
                                    <p className="text-sm font-bold text-white font-mono">
                                        {formatCurrency(item.line_total)}
                                    </p>
                                    <div className="flex items-center gap-1">
                                        <button
                                            onClick={() => handleUpdateQty(item.id, item.quantity - 1)}
                                            className="p-1 rounded hover:bg-white/10 text-zinc-400 hover:text-white transition-colors"
                                        >
                                            <Minus className="w-3.5 h-3.5" />
                                        </button>
                                        <span className="text-xs text-zinc-300 w-6 text-center font-mono">
                                            {item.quantity}
                                        </span>
                                        <button
                                            onClick={() => handleUpdateQty(item.id, item.quantity + 1)}
                                            className="p-1 rounded hover:bg-white/10 text-zinc-400 hover:text-white transition-colors"
                                        >
                                            <Plus className="w-3.5 h-3.5" />
                                        </button>
                                        <button
                                            onClick={() => handleRemove(item.id)}
                                            className="p-1 rounded hover:bg-red-500/10 text-zinc-500 hover:text-red-400 transition-colors ml-1"
                                        >
                                            <Trash2 className="w-3.5 h-3.5" />
                                        </button>
                                    </div>
                                </div>
                            </div>
                        ))
                    )}
                </div>

                {/* Footer */}
                {cart && cart.items.length > 0 && (
                    <div className="absolute bottom-0 left-0 right-0 p-4 border-t border-white/10 bg-zinc-900/95 backdrop-blur-lg space-y-3">
                        <div className="flex justify-between items-center">
                            <span className="text-sm text-zinc-400">Subtotal</span>
                            <span className="text-xl font-bold text-white font-mono">
                                {formatCurrency(cart.subtotal)}
                            </span>
                        </div>
                        <div className="grid grid-cols-2 gap-2">
                            <Link
                                to="/portal/cart"
                                onClick={onClose}
                                className="flex items-center justify-center gap-1 py-2.5 rounded-xl text-sm font-semibold bg-white/5 border border-white/10 text-white hover:bg-white/10 transition-colors"
                            >
                                View Cart
                            </Link>
                            <Link
                                to="/portal/checkout"
                                onClick={onClose}
                                className="flex items-center justify-center gap-1 py-2.5 rounded-xl text-sm font-semibold bg-gable-green text-black hover:bg-gable-green/90 transition-colors"
                            >
                                Checkout <ArrowRight className="w-4 h-4" />
                            </Link>
                        </div>
                    </div>
                )}
            </div>
        </>
    );
};
