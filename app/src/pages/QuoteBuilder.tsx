import { useState, useEffect, useCallback } from 'react';
import { CustomerSelect } from '../components/customers/CustomerSelect';
import { LineItemEditor } from '../components/quotes/LineItemEditor';
import { EscalatorToggle } from '../components/quotes/EscalatorToggle';
import { MaterialListUpload } from '../components/quotes/MaterialListUpload';
import { ParsedResultsPanel } from '../components/quotes/ParsedResultsPanel';
import { QuoteService } from '../services/QuoteService';
import { ProductService } from '../services/product.service';
import type { Customer } from '../types/customer';
import type { Product } from '../types/product';
import type { CreateQuoteRequest } from '../types/quote';
import type { QuoteLineEscalator } from '../types/pricing';
import type { ParseResponse, ParsedItem } from '../types/parsing';
import { Save, FileText, Calculator, CreditCard, AlertCircle, TrendingUp, Truck, Package } from 'lucide-react';
import { useNavigate, useParams } from 'react-router-dom';
import { PageTransition } from '../components/ui/PageTransition';
import { Card, CardContent } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { useToast } from '../components/ui/ToastContext';
import { CustomerService } from '../services/CustomerService';
import { deliveryService } from '../services/deliveryService';
import type { Vehicle } from '../types/delivery';
import { QuoteViewTabs } from './quotes/QuoteList';

interface LineWithEscalator {
    product_id: string;
    sku: string;
    description: string;
    quantity: number;
    uom: string;
    unit_price: number;
    escalator: QuoteLineEscalator;
}

const defaultEscalator = (): QuoteLineEscalator => ({
    enabled: false,
    escalation_type: 'PERCENTAGE',
    escalation_rate: 5,
    effective_date: new Date().toISOString().split('T')[0],
    target_date: new Date(Date.now() + 90 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
});

export const QuoteBuilder = () => {
    const navigate = useNavigate();
    const { id: editId } = useParams<{ id?: string }>();
    const isEditing = !!editId;
    const { showToast } = useToast();
    const [customer, setCustomer] = useState<Customer | null>(null);
    const [products, setProducts] = useState<Product[]>([]);
    const [lines, setLines] = useState<LineWithEscalator[]>([]);
    const [loading, setLoading] = useState(false);
    const [initialLoading, setInitialLoading] = useState(!!editId);

    // Delivery state
    const [deliveryType, setDeliveryType] = useState<'PICKUP' | 'DELIVERY'>('PICKUP');
    const [freightAmount, setFreightAmount] = useState(0);
    const [selectedVehicleId, setSelectedVehicleId] = useState<string | undefined>();
    const [vehicles, setVehicles] = useState<Vehicle[]>([]);

    // AI Parsing state
    const [parseResult, setParseResult] = useState<ParseResponse | null>(null);
    const [showParsePanel, setShowParsePanel] = useState(false);
    const [aiSource, setAiSource] = useState(false);
    const [lastParseResult, setLastParseResult] = useState<ParseResponse | null>(null);

    useEffect(() => {
        const loadProducts = async () => {
            try {
                const data = await ProductService.getProducts();
                setProducts(data);
            } catch (err) {
                console.error("Failed to load products", err);
            }
        };
        loadProducts();
    }, []);

    useEffect(() => {
        const loadVehicles = async () => {
            try {
                const data = await deliveryService.listVehicles();
                setVehicles(data || []);
            } catch (err) {
                console.error("Failed to load vehicles", err);
            }
        };
        loadVehicles();
    }, []);

    // Load existing quote when editing
    useEffect(() => {
        if (!editId) return;
        const loadQuote = async () => {
            try {
                const quote = await QuoteService.getQuote(editId);
                if (quote.state !== 'DRAFT') {
                    showToast('Only draft quotes can be edited', 'error');
                    navigate(`/quotes/${editId}`);
                    return;
                }
                // Load customer
                try {
                    const c = await CustomerService.getCustomer(quote.customer_id);
                    setCustomer(c);
                } catch { /* customer might not load, that's ok */ }

                // Load lines
                if (quote.lines) {
                    setLines(quote.lines.map(l => ({
                        product_id: l.product_id,
                        sku: l.sku,
                        description: l.description,
                        quantity: l.quantity,
                        uom: l.uom,
                        unit_price: l.unit_price,
                        escalator: defaultEscalator(),
                    })));
                }
                if (quote.source === 'ai') setAiSource(true);
                if (quote.delivery_type) setDeliveryType(quote.delivery_type);
                if (quote.freight_amount) setFreightAmount(quote.freight_amount);
                if (quote.vehicle_id) setSelectedVehicleId(quote.vehicle_id);
            } catch (err) {
                console.error('Failed to load quote for editing', err);
                showToast('Failed to load quote', 'error');
                navigate('/quotes');
            } finally {
                setInitialLoading(false);
            }
        };
        loadQuote();
    }, [editId, showToast, navigate]);

    const handleAddLine = (product: Product, quantity: number, unitPrice: number) => {
        setLines([...lines, {
            product_id: product.id,
            sku: product.sku,
            description: product.description,
            uom: product.uom_primary,
            quantity,
            unit_price: unitPrice,
            escalator: defaultEscalator(),
        }]);
    };

    const handleEscalatorChange = (idx: number, escalator: QuoteLineEscalator) => {
        const updated = [...lines];
        updated[idx] = { ...updated[idx], escalator };
        setLines(updated);
    };

    // --- AI Parsing Handlers ---
    const handleParseComplete = useCallback((result: ParseResponse) => {
        setParseResult(result);
        setShowParsePanel(true);
    }, []);

    const handleAcceptParsed = useCallback((parsedItems: ParsedItem[]) => {
        const newLines: LineWithEscalator[] = parsedItems.map(item => ({
            product_id: item.matched_product?.product_id || '',
            sku: item.matched_product?.sku || 'SPECIAL-ORDER',
            description: item.matched_product?.description || item.raw_text,
            quantity: item.quantity,
            uom: item.matched_product?.uom || item.uom,
            unit_price: item.matched_product?.base_price || 0,
            escalator: defaultEscalator(),
        }));
        setLines(prev => [...prev, ...newLines]);
        setAiSource(true);
        setLastParseResult(parseResult);
        setShowParsePanel(false);
        setParseResult(null);
        showToast(`${parsedItems.length} items added from material list`, 'success');
    }, [showToast, parseResult]);

    const handleSave = async () => {
        if (!customer) return;
        setLoading(true);
        try {
            const payload: CreateQuoteRequest = {
                customer_id: customer.id,
                source: aiSource ? 'ai' : 'manual',
                delivery_type: deliveryType,
                freight_amount: deliveryType === 'DELIVERY' ? freightAmount : 0,
                vehicle_id: deliveryType === 'DELIVERY' ? selectedVehicleId : undefined,
                lines: lines.map(l => ({
                    product_id: l.product_id,
                    sku: l.sku,
                    description: l.description,
                    quantity: l.quantity,
                    uom: l.uom as import('../types/product').UOM,
                    unit_price: l.unit_price,
                })),
            };

            // Attach AI parse data if available
            if (aiSource && lastParseResult) {
                payload.parse_map = lastParseResult.items;
                if (lastParseResult.source_image) {
                    const [header, data] = lastParseResult.source_image.split(',');
                    const contentType = header?.match(/data:([^;]+)/)?.[1] || 'application/octet-stream';
                    payload.original_file = data;
                    payload.original_content_type = contentType;
                    payload.original_filename = 'material-list-upload';
                }
            }

            let quote;
            if (isEditing && editId) {
                quote = await QuoteService.updateQuote(editId, payload);
                showToast('Quote updated', 'success');
            } else {
                quote = await QuoteService.createQuote(payload);
                showToast('Draft quote created', 'success');
            }
            navigate(`/quotes/${quote.id}`);
        } catch (err) {
            console.error(err);
            showToast('Failed to save quote', 'error');
        } finally {
            setLoading(false);
        }
    };

    const subtotalAmount = lines.reduce((sum, line) => sum + (line.quantity * line.unit_price), 0);
    const effectiveFreight = deliveryType === 'DELIVERY' ? freightAmount : 0;
    const totalAmount = subtotalAmount + effectiveFreight;
    const escalatedTotal = lines.reduce((sum, line) => {
        if (line.escalator.enabled && line.escalator.result) {
            return sum + (line.quantity * line.escalator.result.future_price);
        }
        return sum + (line.quantity * line.unit_price);
    }, 0);
    const hasEscalators = lines.some(l => l.escalator.enabled && l.escalator.result);
    const hasStaleLines = lines.some(l => l.escalator.result?.is_stale);
    const isOverLimit = customer ? (customer.balance_due + totalAmount) > customer.credit_limit : false;

    if (initialLoading) {
        return (
            <PageTransition>
                <QuoteViewTabs active="new" />
                <div className="text-slate-400 p-12 text-center">Loading quote...</div>
            </PageTransition>
        );
    }

    return (
        <PageTransition>
            {!isEditing && <QuoteViewTabs active="new" />}

            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-8">
                <div>
                    <h1 className="text-display-large text-white flex items-center gap-3">
                        <FileText className="w-10 h-10 text-gable-green" />
                        {isEditing ? 'Edit Quote' : 'New Quote'}
                    </h1>
                    <p className="text-zinc-500 mt-1 max-w-2xl text-lg">
                        {isEditing ? 'Update this draft quote.' : 'Draft a new pricing proposal.'}
                    </p>
                </div>
                <Button
                    onClick={handleSave}
                    disabled={!customer || lines.length === 0 || loading}
                    isLoading={loading}
                    className="shadow-glow"
                >
                    <Save className="w-4 h-4 mr-2" />
                    {isEditing ? 'Save Changes' : 'Create Quote'}
                </Button>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
                {/* Left Column: Customer & Details */}
                <div className="lg:col-span-4 space-y-6">
                    <Card variant="glass">
                        <CardContent className="p-6">
                            <h2 className="text-lg font-medium text-white mb-4 flex items-center gap-2">
                                <CreditCard className="w-5 h-5 text-zinc-400" />
                                Customer Details
                            </h2>
                            <CustomerSelect
                                onSelect={setCustomer}
                                selectedCustomerId={customer?.id}
                            />

                            {customer && (
                                <div className="mt-6 space-y-4 text-sm border-t border-white/5 pt-6">
                                    <div className="flex justify-between items-center bg-white/5 p-3 rounded-lg">
                                        <span className="text-zinc-400">Account #</span>
                                        <span className="font-mono text-white font-bold">{customer.account_number}</span>
                                    </div>
                                    <div className="flex justify-between items-center">
                                        <span className="text-zinc-400">Price Level</span>
                                        <span className="text-gable-green font-medium px-2 py-0.5 rounded bg-gable-green/10 border border-gable-green/20">
                                            {customer.price_level?.name || 'Retail'}
                                        </span>
                                    </div>
                                    <div className="space-y-2 pt-2">
                                        <div className="flex justify-between">
                                            <span className="text-zinc-400">Credit Limit</span>
                                            <span className="font-mono text-zinc-200">${customer.credit_limit?.toLocaleString() || '0.00'}</span>
                                        </div>
                                        <div className="flex justify-between">
                                            <span className="text-zinc-400">Balance Due</span>
                                            <span className={`font-mono ${customer.balance_due > customer.credit_limit ? 'text-rose-500 font-bold' : 'text-zinc-200'}`}>
                                                ${customer.balance_due.toLocaleString()}
                                            </span>
                                        </div>
                                        <div className="flex justify-between border-t border-white/5 pt-2">
                                            <span className="text-zinc-400">Available</span>
                                            <span className={`font-mono font-bold ${(customer.credit_limit - customer.balance_due) < 0 ? 'text-rose-500' : 'text-emerald-400'}`}>
                                                ${(customer.credit_limit - customer.balance_due).toLocaleString()}
                                            </span>
                                        </div>
                                    </div>
                                    {isOverLimit && (
                                        <div className="flex items-start gap-3 bg-rose-500/10 border border-rose-500/20 text-rose-400 text-xs p-3 rounded-lg">
                                            <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                                            <p>This quote exceeds the customer's credit limit. Approval will be required.</p>
                                        </div>
                                    )}
                                </div>
                            )}
                        </CardContent>
                    </Card>

                    <Card variant="glass">
                        <CardContent className="p-6">
                            <h2 className="text-lg font-medium text-white mb-4 flex items-center gap-2">
                                <Truck className="w-5 h-5 text-zinc-400" />
                                Fulfillment
                            </h2>

                            {/* Delivery Type Toggle */}
                            <div className="flex gap-1 bg-white/5 rounded-lg p-1 border border-white/10 mb-4">
                                <button
                                    onClick={() => { setDeliveryType('PICKUP'); setFreightAmount(0); setSelectedVehicleId(undefined); }}
                                    className={`flex-1 flex items-center justify-center gap-2 px-3 py-2 rounded-md text-sm font-medium transition-all ${
                                        deliveryType === 'PICKUP'
                                            ? 'bg-gable-green/10 text-gable-green border border-gable-green/20'
                                            : 'text-zinc-400 hover:text-white'
                                    }`}
                                >
                                    <Package size={14} /> Pickup
                                </button>
                                <button
                                    onClick={() => setDeliveryType('DELIVERY')}
                                    className={`flex-1 flex items-center justify-center gap-2 px-3 py-2 rounded-md text-sm font-medium transition-all ${
                                        deliveryType === 'DELIVERY'
                                            ? 'bg-blue-500/10 text-blue-400 border border-blue-500/20'
                                            : 'text-zinc-400 hover:text-white'
                                    }`}
                                >
                                    <Truck size={14} /> Delivery
                                </button>
                            </div>

                            {deliveryType === 'DELIVERY' && (
                                <div className="space-y-4">
                                    {/* Vehicle Selector */}
                                    <div>
                                        <label className="block text-xs text-zinc-500 mb-1.5">Assign Truck</label>
                                        <select
                                            value={selectedVehicleId || ''}
                                            onChange={e => setSelectedVehicleId(e.target.value || undefined)}
                                            className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:ring-1 focus:ring-blue-500/50"
                                        >
                                            <option value="">Select a truck...</option>
                                            {vehicles.map(v => (
                                                <option key={v.id} value={v.id}>
                                                    {v.name} — {v.vehicle_type.replace(/_/g, ' ')} ({v.license_plate})
                                                </option>
                                            ))}
                                        </select>
                                        {vehicles.length === 0 && (
                                            <p className="text-xs text-zinc-500 mt-1">No vehicles in fleet. Add vehicles in Fleet Management.</p>
                                        )}
                                    </div>

                                    {/* Freight Charge */}
                                    <div>
                                        <label className="block text-xs text-zinc-500 mb-1.5">Freight Charge ($)</label>
                                        <input
                                            type="number"
                                            min="0"
                                            step="0.01"
                                            value={freightAmount || ''}
                                            onChange={e => setFreightAmount(parseFloat(e.target.value) || 0)}
                                            placeholder="0.00"
                                            className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-white font-mono focus:outline-none focus:ring-1 focus:ring-blue-500/50"
                                        />
                                    </div>
                                </div>
                            )}
                        </CardContent>
                    </Card>

                    <Card variant="glass" className="bg-gradient-to-br from-gable-green/5 to-emerald-900/5 border-gable-green/20">
                        <CardContent className="p-6">
                            <h2 className="text-lg font-medium text-white mb-4 flex items-center gap-2">
                                <Calculator className="w-5 h-5 text-gable-green" />
                                Quote Summary
                            </h2>
                            <div className="flex items-baseline justify-between">
                                <span className="text-zinc-400">Subtotal</span>
                                <span className={`font-mono font-bold ${effectiveFreight > 0 ? 'text-lg text-zinc-300' : 'text-2xl text-white'}`}>${subtotalAmount.toFixed(2)}</span>
                            </div>

                            {effectiveFreight > 0 && (
                                <div className="flex items-baseline justify-between mt-2">
                                    <span className="text-zinc-400 flex items-center gap-1.5 text-sm">
                                        <Truck className="w-3.5 h-3.5 text-blue-400" />
                                        Freight
                                    </span>
                                    <span className="font-mono font-bold text-lg text-blue-400">${effectiveFreight.toFixed(2)}</span>
                                </div>
                            )}

                            {effectiveFreight > 0 && (
                                <div className="flex items-baseline justify-between mt-2 pt-2 border-t border-white/5">
                                    <span className="text-zinc-400 font-medium">Total</span>
                                    <span className="text-2xl font-mono font-bold text-white">${totalAmount.toFixed(2)}</span>
                                </div>
                            )}

                            {/* Escalated Total */}
                            {hasEscalators && (
                                <div className="mt-3 pt-3 border-t border-white/5">
                                    <div className="flex items-baseline justify-between">
                                        <span className="text-zinc-400 flex items-center gap-1.5 text-sm">
                                            <TrendingUp className="w-3.5 h-3.5 text-gable-green" />
                                            Escalated Total
                                        </span>
                                        <span className="text-xl font-mono font-bold text-emerald-400">
                                            ${escalatedTotal.toFixed(2)}
                                        </span>
                                    </div>
                                    <div className="text-[10px] text-zinc-500 text-right mt-1">
                                        +${(escalatedTotal - totalAmount).toFixed(2)} from escalators
                                    </div>
                                </div>
                            )}

                            {/* Stale Lines Warning */}
                            {hasStaleLines && (
                                <div className="mt-3 flex items-center gap-2 bg-amber-500/10 border border-amber-500/20 text-amber-400 text-xs p-2.5 rounded-lg">
                                    <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                                    Some lines have stale pricing
                                </div>
                            )}

                            <div className="text-xs text-zinc-500 text-right mt-1">Tax calculated at invoicing</div>
                        </CardContent>
                    </Card>
                </div>

                {/* Right Column: Lines */}
                <div className="lg:col-span-8 space-y-6">
                    <Card variant="glass" className="h-full">
                        <CardContent className="p-6">
                            <div className="flex items-center justify-between mb-6">
                                <h2 className="text-lg font-medium text-white">Line Items</h2>
                                <MaterialListUpload
                                    onParseComplete={handleParseComplete}
                                    disabled={loading}
                                />
                            </div>

                            <LineItemEditor products={products} customerId={customer?.id} onAddLine={handleAddLine} />

                            {/* Lines Table */}
                            <div className="mt-8 rounded-lg overflow-hidden border border-white/5 bg-black/20">
                                <table className="w-full text-sm text-left">
                                    <thead className="bg-white/5 text-zinc-400 uppercase tracking-wider text-xs font-semibold">
                                        <tr>
                                            <th className="px-6 py-4">SKU / Description</th>
                                            <th className="px-6 py-4 text-right">Qty</th>
                                            <th className="px-6 py-4 text-right">Unit Price</th>
                                            <th className="px-6 py-4 text-right">Total</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-white/5">
                                        {lines.length === 0 && (
                                            <tr>
                                                <td colSpan={4} className="px-6 py-12 text-center text-zinc-500 italic">
                                                    No items added yet. Start building the quote above.
                                                </td>
                                            </tr>
                                        )}
                                        {lines.map((line, idx) => (
                                            <tr key={idx} className="group hover:bg-white/5 transition-colors">
                                                <td className="px-6 py-4">
                                                    <div className="font-mono text-white mb-0.5 group-hover:text-gable-green transition-colors">{line.sku}</div>
                                                    <div className="text-zinc-400 text-xs">{line.description}</div>

                                                    {/* Escalator Toggle */}
                                                    <EscalatorToggle
                                                        basePrice={line.unit_price}
                                                        escalator={line.escalator}
                                                        onChange={(esc) => handleEscalatorChange(idx, esc)}
                                                    />
                                                </td>
                                                <td className="px-6 py-4 text-right font-mono text-zinc-300 align-top">
                                                    {line.quantity} <span className="text-zinc-600 text-[10px] ml-1">{line.uom}</span>
                                                </td>
                                                <td className="px-6 py-4 text-right font-mono text-zinc-300 align-top">
                                                    ${line.unit_price.toFixed(2)}
                                                    {line.escalator.result && (
                                                        <div className="text-xs text-emerald-400 mt-1">
                                                            → ${line.escalator.result.future_price.toFixed(2)}
                                                        </div>
                                                    )}
                                                </td>
                                                <td className="px-6 py-4 text-right font-mono font-bold text-emerald-400 align-top">
                                                    ${(line.quantity * line.unit_price).toFixed(2)}
                                                    {line.escalator.result && (
                                                        <div className="text-xs text-emerald-300/70 mt-1">
                                                            → ${(line.quantity * line.escalator.result.future_price).toFixed(2)}
                                                        </div>
                                                    )}
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                    {lines.length > 0 && (
                                        <tfoot className="bg-white/5 border-t border-white/10">
                                            <tr>
                                                <td colSpan={3} className="px-6 py-4 text-right font-medium text-zinc-400 uppercase tracking-wider text-xs">
                                                    {effectiveFreight > 0 ? 'Lines Subtotal' : 'Total Amount'}
                                                </td>
                                                <td className="px-6 py-4 text-right font-mono text-xl font-bold text-gable-green">${subtotalAmount.toFixed(2)}</td>
                                            </tr>
                                            {effectiveFreight > 0 && (
                                                <>
                                                    <tr className="border-t border-white/5">
                                                        <td colSpan={3} className="px-6 py-2 text-right text-zinc-400 text-xs flex items-center justify-end gap-1.5">
                                                            <Truck className="w-3 h-3 text-blue-400" /> Freight
                                                        </td>
                                                        <td className="px-6 py-2 text-right font-mono text-sm text-blue-400">${effectiveFreight.toFixed(2)}</td>
                                                    </tr>
                                                    <tr className="border-t border-white/5">
                                                        <td colSpan={3} className="px-6 py-4 text-right font-medium text-zinc-400 uppercase tracking-wider text-xs">Total Amount</td>
                                                        <td className="px-6 py-4 text-right font-mono text-xl font-bold text-gable-green">${totalAmount.toFixed(2)}</td>
                                                    </tr>
                                                </>
                                            )}
                                        </tfoot>
                                    )}
                                </table>
                            </div>
                        </CardContent>
                    </Card>
                </div>
            </div>

            {/* AI Parse Results Overlay */}
            {showParsePanel && parseResult && (
                <ParsedResultsPanel
                    result={parseResult}
                    onAccept={handleAcceptParsed}
                    onClose={() => {
                        setShowParsePanel(false);
                        setParseResult(null);
                    }}
                />
            )}
        </PageTransition>
    );
};
