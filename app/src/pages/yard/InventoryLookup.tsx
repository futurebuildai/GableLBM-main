import { useEffect, useState, useCallback } from "react";
import { PageTransition } from "../../components/ui/PageTransition";
import { Card, CardContent } from "../../components/ui/Card";
import { Search, Package, MapPin, Minus, Plus, ArrowRightLeft, X, Loader2, ScanLine } from "lucide-react";
import type { Product, Inventory } from "../../types/product";
import { InventoryService } from "../../services/InventoryService";
import { fetchWithAuth } from "../../services/fetchClient";
import { BarcodeScanner } from "../../components/BarcodeScanner";
import { useToast } from "../../components/ui/ToastContext";

const API_URL = import.meta.env.VITE_API_URL || '';

export function InventoryLookup() {
    const { showToast } = useToast();
    const [query, setQuery] = useState("");
    const [isScanning, setIsScanning] = useState(false);
    const [products, setProducts] = useState<Product[]>([]);
    const [loading, setLoading] = useState(false);
    const [expanded, setExpanded] = useState<string | null>(null);
    const [inventory, setInventory] = useState<Inventory[]>([]);
    const [adjustQty, setAdjustQty] = useState(0);
    const [adjusting, setAdjusting] = useState(false);

    const search = useCallback(async () => {
        if (!query.trim()) {
            setProducts([]);
            return;
        }
        setLoading(true);
        try {
            const res = await fetchWithAuth(`${API_URL}/api/v1/products?q=${encodeURIComponent(query)}`);
            if (res.ok) {
                const data = await res.json();
                setProducts(Array.isArray(data) ? data : []);
            }
        } catch {
            setProducts([]);
            showToast('Failed to search products', 'error');
        } finally {
            setLoading(false);
        }
    }, [query, showToast]);

    useEffect(() => {
        const timer = setTimeout(search, 300);
        return () => clearTimeout(timer);
    }, [search]);

    const expandProduct = async (productId: string) => {
        if (expanded === productId) {
            setExpanded(null);
            return;
        }
        setExpanded(productId);
        setAdjustQty(0);
        try {
            const inv = await InventoryService.getInventoryByProduct(productId);
            setInventory(inv);
        } catch {
            setInventory([]);
            showToast('Failed to load inventory details', 'error');
        }
    };

    const handleAdjust = async (productId: string, delta: number) => {
        if (delta === 0) return;
        setAdjusting(true);
        try {
            await InventoryService.adjustStock({
                product_id: productId,
                quantity: delta,
                reason: "Yard mobile adjustment",
                is_delta: true,
            });
            const inv = await InventoryService.getInventoryByProduct(productId);
            setInventory(inv);
            setAdjustQty(0);
        } catch (err) {
            console.error('Failed to adjust inventory:', err);
            showToast('Failed to adjust inventory', 'error');
        }
        setAdjusting(false);
    };

    return (
        <PageTransition>
            <div className="flex flex-col space-y-4 p-4 max-w-md mx-auto">
                <h1 className="text-xl font-bold text-white tracking-tight flex items-center gap-2">
                    <Package className="w-5 h-5 text-amber-400" />
                    Inventory
                </h1>

                {/* Search */}
                <div className="flex gap-2">
                    <div className="relative flex-1">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500" />
                        <input
                            type="text"
                            value={query}
                            onChange={e => setQuery(e.target.value)}
                            placeholder="Search SKU or description..."
                            className="w-full bg-white/5 border border-white/10 text-white rounded-xl pl-10 pr-10 py-3 text-sm focus:outline-none focus:border-amber-400/50 transition-colors placeholder:text-zinc-600"
                        />
                        {query && (
                            <button onClick={() => setQuery("")} className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-500 hover:text-zinc-300" aria-label="Clear search">
                                <X className="w-4 h-4" />
                            </button>
                        )}
                    </div>
                    <button
                        onClick={() => setIsScanning(true)}
                        className="bg-zinc-800 hover:bg-zinc-700 text-amber-400 p-3 rounded-xl border border-white/10 transition-colors flex items-center justify-center isolate"
                        title="Scan Barcode"
                        aria-label="Scan barcode"
                    >
                        <ScanLine className="w-5 h-5" />
                    </button>
                </div>

                {isScanning && (
                    <BarcodeScanner
                        onScan={(barcode) => {
                            setIsScanning(false);
                            setQuery(barcode);
                        }}
                        onClose={() => setIsScanning(false)}
                    />
                )}

                {loading && (
                    <div className="flex justify-center py-8">
                        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-amber-400"></div>
                    </div>
                )}

                {/* Results */}
                <div className="space-y-2">
                    {products.map(p => (
                        <div key={p.id}>
                            <Card
                                variant="glass"
                                className={`active:scale-[0.98] transition-all cursor-pointer ${expanded === p.id ? "border-amber-400/30" : "border-white/5"
                                    }`}
                                onClick={() => expandProduct(p.id)}
                            >
                                <CardContent className="p-4">
                                    <div className="flex justify-between items-start">
                                        <div className="min-w-0 flex-1">
                                            <div className="font-medium text-white text-sm truncate">{p.description}</div>
                                            <div className="text-xs text-zinc-500 font-mono mt-0.5">{p.sku}</div>
                                        </div>
                                        <div className="text-right shrink-0 ml-3">
                                            <div className="font-mono text-amber-400 font-bold text-sm">
                                                {p.total_quantity ?? "—"}
                                            </div>
                                            <div className="text-[10px] text-zinc-500 font-mono">{p.uom_primary}</div>
                                        </div>
                                    </div>
                                    {p.total_allocated && p.total_allocated > 0 ? (
                                        <div className="mt-2 flex items-center gap-2 text-[10px] text-zinc-500">
                                            <ArrowRightLeft className="w-3 h-3" />
                                            {p.total_allocated} allocated
                                        </div>
                                    ) : null}
                                </CardContent>
                            </Card>

                            {/* Expanded: inventory detail + adjust */}
                            {expanded === p.id && (
                                <div className="mt-1 ml-4 space-y-2 animate-in slide-in-from-top-2 duration-200">
                                    {/* Location breakdown */}
                                    {inventory.map(inv => (
                                        <div key={inv.id} className="flex items-center gap-3 p-3 rounded-lg bg-white/[0.02] border border-white/5">
                                            <MapPin className="w-3.5 h-3.5 text-zinc-600 shrink-0" />
                                            <div className="flex-1 text-xs">
                                                <span className="text-zinc-300">{inv.location_name || inv.location}</span>
                                            </div>
                                            <span className="font-mono text-xs text-zinc-300">{inv.quantity}</span>
                                        </div>
                                    ))}

                                    {/* Quick Adjust */}
                                    <div className="flex items-center gap-2 p-3 rounded-lg bg-white/[0.02] border border-white/5">
                                        <span className="text-xs text-zinc-400 flex-1">Quick Adjust</span>
                                        <button
                                            onClick={(e) => { e.stopPropagation(); setAdjustQty(q => q - 1); }}
                                            className="w-8 h-8 rounded-lg bg-white/5 flex items-center justify-center text-zinc-400 hover:bg-white/10 active:scale-90 transition-all"
                                            aria-label="Decrease adjustment quantity"
                                        >
                                            <Minus className="w-4 h-4" />
                                        </button>
                                        <span className={`font-mono text-sm w-12 text-center font-bold ${adjustQty > 0 ? "text-emerald-400" : adjustQty < 0 ? "text-rose-400" : "text-zinc-400"
                                            }`}>
                                            {adjustQty > 0 ? `+${adjustQty}` : adjustQty}
                                        </span>
                                        <button
                                            onClick={(e) => { e.stopPropagation(); setAdjustQty(q => q + 1); }}
                                            className="w-8 h-8 rounded-lg bg-white/5 flex items-center justify-center text-zinc-400 hover:bg-white/10 active:scale-90 transition-all"
                                            aria-label="Increase adjustment quantity"
                                        >
                                            <Plus className="w-4 h-4" />
                                        </button>
                                        <button
                                            onClick={(e) => { e.stopPropagation(); handleAdjust(p.id, adjustQty); }}
                                            disabled={adjustQty === 0 || adjusting}
                                            className={`px-3 py-1.5 rounded-lg text-xs font-mono font-bold transition-all ${adjustQty !== 0
                                                ? "bg-amber-400 text-black hover:bg-amber-300 active:scale-95"
                                                : "bg-white/5 text-zinc-600 cursor-not-allowed"
                                                }`}
                                        >
                                            {adjusting ? <Loader2 className="w-3 h-3 animate-spin" /> : "Apply"}
                                        </button>
                                    </div>
                                </div>
                            )}
                        </div>
                    ))}
                </div>

                {!loading && query && products.length === 0 && (
                    <div className="text-center py-12 opacity-50">
                        <Search className="w-10 h-10 text-zinc-600 mx-auto mb-3" />
                        <p className="text-zinc-400">No products match "{query}"</p>
                    </div>
                )}

                {!query && (
                    <div className="text-center py-16 opacity-40">
                        <Search className="w-12 h-12 text-zinc-600 mx-auto mb-3" />
                        <p className="text-zinc-500">Search by SKU or product name</p>
                    </div>
                )}
            </div>
        </PageTransition>
    );
}
