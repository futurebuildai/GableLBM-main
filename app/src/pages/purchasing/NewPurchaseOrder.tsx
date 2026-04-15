import { useState, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { PurchaseOrderService } from '../../services/PurchaseOrderService';
import { ProductService } from '../../services/product.service';
import type { Product } from '../../types/product';
import type { CreatePOLine } from '../../types/purchaseOrder';
import { useToast } from '../../components/ui/ToastContext';
import { PageTransition } from '../../components/ui/PageTransition';
import { Card, CardContent } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';
import { ArrowLeft, Plus, Trash2, Save } from 'lucide-react';

export function NewPurchaseOrder() {
    const navigate = useNavigate();
    const [searchParams] = useSearchParams();
    const { showToast } = useToast();
    const [vendorId, setVendorId] = useState('');
    const [lines, setLines] = useState<(CreatePOLine & { key: number })[]>([]);
    const [products, setProducts] = useState<Product[]>([]);
    const [loading, setLoading] = useState(false);
    const isFromRecommendation = searchParams.get('from') === 'recommendation';

    useEffect(() => {
        ProductService.getProducts().then(setProducts).catch(() => showToast('Failed to load products', 'error'));
    }, [showToast]);

    // Pre-fill from recommendation URL params
    useEffect(() => {
        if (isFromRecommendation) {
            const vendorName = searchParams.get('vendor_name') || '';
            if (vendorName) setVendorId(vendorName);

            const productId = searchParams.get('product_id') || '';
            const description = searchParams.get('description') || '';
            const qty = Number(searchParams.get('qty') || 1);
            const cost = Number(searchParams.get('cost') || 0);

            if (productId || description) {
                setLines([{
                    key: Date.now(),
                    product_id: productId,
                    description,
                    quantity: qty,
                    cost: Math.round(cost * 100) / 100,
                }]);
            }
        }
    }, [isFromRecommendation, searchParams]);

    const addLine = () => {
        setLines([...lines, { key: Date.now(), product_id: '', description: '', quantity: 1, cost: 0 }]);
    };

    const updateLine = (key: number, field: string, value: string | number) => {
        setLines(lines.map(l => {
            if (l.key !== key) return l;
            const updated = { ...l, [field]: value };
            // Auto-fill description from product
            if (field === 'product_id') {
                const product = products.find(p => p.id === value);
                if (product) {
                    updated.description = `${product.sku} - ${product.description}`;
                    if (updated.cost === 0) updated.cost = product.base_price * 0.6; // Rough vendor cost estimate
                }
            }
            return updated;
        }));
    };

    const removeLine = (key: number) => {
        setLines(lines.filter(l => l.key !== key));
    };

    const handleSave = async () => {
        if (!vendorId.trim()) {
            showToast('Enter a vendor ID', 'error');
            return;
        }
        if (lines.length === 0) {
            showToast('Add at least one line item', 'error');
            return;
        }

        setLoading(true);
        try {
            const po = await PurchaseOrderService.createPO({
                vendor_id: vendorId,
                lines: lines.map(({ product_id, description, quantity, cost }) => ({
                    product_id,
                    description,
                    quantity,
                    cost,
                })),
            });
            showToast('Purchase order created', 'success');
            navigate(`/purchasing/${po.id}`);
        } catch (err) {
            console.error(err);
            showToast('Failed to create purchase order', 'error');
        } finally {
            setLoading(false);
        }
    };

    const total = lines.reduce((sum, l) => sum + l.quantity * l.cost, 0);

    return (
        <PageTransition>
            <div className="flex items-center gap-4 mb-6">
                <button onClick={() => navigate('/purchasing')} className="p-2 rounded-full bg-white/5 hover:bg-white/10 text-zinc-400 transition-colors">
                    <ArrowLeft className="w-5 h-5" />
                </button>
                <div className="flex-1">
                    <h1 className="text-2xl font-bold text-white">New Purchase Order</h1>
                    <p className="text-sm text-zinc-400">Create a PO for vendor replenishment</p>
                </div>
                <Button onClick={handleSave} disabled={loading} isLoading={loading} className="shadow-glow">
                    <Save className="w-4 h-4 mr-2" />
                    Create PO
                </Button>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
                <div className="lg:col-span-4">
                    <Card variant="glass">
                        <CardContent className="p-6">
                            <h2 className="text-lg font-medium text-white mb-4">Vendor</h2>
                            <input
                                type="text"
                                placeholder="Vendor UUID"
                                value={vendorId}
                                onChange={(e) => setVendorId(e.target.value)}
                                className="w-full bg-black/20 border border-white/10 rounded px-3 py-2 text-white focus:border-[#00FFA3] outline-none font-mono"
                            />
                            <div className="mt-6 flex justify-between items-baseline">
                                <span className="text-zinc-400">Total Cost</span>
                                <span className="text-2xl font-mono font-bold text-white">${total.toFixed(2)}</span>
                            </div>
                        </CardContent>
                    </Card>
                </div>

                <div className="lg:col-span-8">
                    <Card variant="glass">
                        <CardContent className="p-6">
                            <div className="flex justify-between items-center mb-4">
                                <h2 className="text-lg font-medium text-white">Line Items</h2>
                                <button
                                    onClick={addLine}
                                    className="flex items-center gap-1 text-sm text-[#00FFA3] hover:text-white transition-colors"
                                >
                                    <Plus className="w-4 h-4" />
                                    Add Line
                                </button>
                            </div>

                            {lines.length === 0 ? (
                                <div className="text-center text-zinc-500 py-12 italic">
                                    No items added yet. Click "Add Line" to start.
                                </div>
                            ) : (
                                <div className="space-y-4">
                                    {lines.map((line) => (
                                        <div key={line.key} className="bg-black/20 rounded-lg p-4 border border-white/5 space-y-3">
                                            <div className="flex gap-3">
                                                <div className="flex-1">
                                                    <label className="text-xs text-zinc-500">Product</label>
                                                    <select
                                                        value={line.product_id}
                                                        onChange={(e) => updateLine(line.key, 'product_id', e.target.value)}
                                                        className="w-full bg-[#0A0B10] border border-white/10 rounded px-3 py-2 text-white focus:border-[#00FFA3] outline-none mt-1"
                                                    >
                                                        <option value="">Select product...</option>
                                                        {products.map(p => (
                                                            <option key={p.id} value={p.id}>{p.sku} - {p.description}</option>
                                                        ))}
                                                    </select>
                                                </div>
                                                <button onClick={() => removeLine(line.key)} className="text-rose-400 hover:text-rose-300 self-end pb-2">
                                                    <Trash2 className="w-4 h-4" />
                                                </button>
                                            </div>
                                            <div>
                                                <label className="text-xs text-zinc-500">Description</label>
                                                <input
                                                    type="text"
                                                    value={line.description}
                                                    onChange={(e) => updateLine(line.key, 'description', e.target.value)}
                                                    className="w-full bg-[#0A0B10] border border-white/10 rounded px-3 py-2 text-white focus:border-[#00FFA3] outline-none mt-1"
                                                />
                                            </div>
                                            <div className="grid grid-cols-2 gap-3">
                                                <div>
                                                    <label className="text-xs text-zinc-500">Quantity</label>
                                                    <input
                                                        type="number"
                                                        min="0.001"
                                                        step="any"
                                                        value={line.quantity}
                                                        onChange={(e) => updateLine(line.key, 'quantity', Number(e.target.value))}
                                                        className="w-full bg-[#0A0B10] border border-white/10 rounded px-3 py-2 text-white font-mono focus:border-[#00FFA3] outline-none mt-1"
                                                    />
                                                </div>
                                                <div>
                                                    <label className="text-xs text-zinc-500">Unit Cost</label>
                                                    <input
                                                        type="number"
                                                        min="0"
                                                        step="0.01"
                                                        value={line.cost}
                                                        onChange={(e) => updateLine(line.key, 'cost', Number(e.target.value))}
                                                        className="w-full bg-[#0A0B10] border border-white/10 rounded px-3 py-2 text-white font-mono focus:border-[#00FFA3] outline-none mt-1"
                                                    />
                                                </div>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </CardContent>
                    </Card>
                </div>
            </div>
        </PageTransition>
    );
}
