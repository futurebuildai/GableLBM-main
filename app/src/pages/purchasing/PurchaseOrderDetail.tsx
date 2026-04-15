import { useEffect, useState, useCallback, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { PurchaseOrderService } from '../../services/PurchaseOrderService';
import { LocationService } from '../../services/LocationService';
import type { PurchaseOrder, PurchaseOrderLine, FreightCharge, FreightUploadResponse } from '../../types/purchaseOrder';
import type { Location } from '../../types/location';
import { useToast } from '../../components/ui/ToastContext';
import { PageTransition } from '../../components/ui/PageTransition';
import { Card, CardContent } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';
import { ArrowLeft, Send, PackageCheck, Upload, Truck, CheckCircle, ChevronDown, ChevronUp } from 'lucide-react';

export function PurchaseOrderDetail() {
    const { id } = useParams<{ id: string }>();
    const navigate = useNavigate();
    const { showToast } = useToast();
    const [po, setPO] = useState<PurchaseOrder | null>(null);
    const [locations, setLocations] = useState<Location[]>([]);
    const [receiving, setReceiving] = useState(false);
    const [receiveData, setReceiveData] = useState<Record<string, { qty: number; locationId: string }>>({});
    const [isSubmitting, setIsSubmitting] = useState(false);

    // Freight state
    const [freightCharges, setFreightCharges] = useState<FreightCharge[]>([]);
    const [freightUploading, setFreightUploading] = useState(false);
    const [freightPreview, setFreightPreview] = useState<FreightUploadResponse | null>(null);
    const [applyingFreight, setApplyingFreight] = useState(false);
    const [expandedFreight, setExpandedFreight] = useState<string | null>(null);
    const freightFileRef = useRef<HTMLInputElement>(null);

    const loadPO = useCallback(async (poId: string) => {
        try {
            const data = await PurchaseOrderService.getPO(poId);
            setPO(data);
            // Initialize receive data
            const initial: Record<string, { qty: number; locationId: string }> = {};
            (data.lines || []).forEach((line: PurchaseOrderLine) => {
                initial[line.id] = { qty: line.quantity - line.qty_received, locationId: '' };
            });
            setReceiveData(initial);
        } catch (err) {
            console.error(err);
            showToast('Failed to load purchase order', 'error');
        }
    }, [showToast]);

    const loadFreightCharges = useCallback(async (poId: string) => {
        try {
            const charges = await PurchaseOrderService.getFreightCharges(poId);
            setFreightCharges(charges);
        } catch {
            // Freight charges may not exist yet
        }
    }, []);

    useEffect(() => {
        if (id) {
            loadPO(id);
            loadFreightCharges(id);
            LocationService.listLocations().then(setLocations).catch(() => setLocations([]));
        }
    }, [id, loadPO, loadFreightCharges]);

    const handleSubmitPO = async () => {
        if (!po) return;
        setIsSubmitting(true);
        try {
            await PurchaseOrderService.submitPO(po.id);
            showToast('Purchase order submitted to vendor', 'success');
            loadPO(po.id);
        } catch (err) {
            console.error(err);
            showToast('Failed to submit PO', 'error');
        } finally {
            setIsSubmitting(false);
        }
    };

    const handleReceive = async () => {
        if (!po) return;
        setIsSubmitting(true);
        try {
            const lines = Object.entries(receiveData)
                .filter(([, v]) => v.qty > 0 && v.locationId)
                .map(([lineId, v]) => ({
                    line_id: lineId,
                    qty_received: v.qty,
                    location_id: v.locationId,
                }));

            if (lines.length === 0) {
                showToast('Enter quantities and select locations to receive', 'error');
                setIsSubmitting(false);
                return;
            }

            await PurchaseOrderService.receivePO(po.id, { lines });
            showToast('Items received into inventory', 'success');
            setReceiving(false);
            loadPO(po.id);
        } catch (err) {
            console.error(err);
            showToast('Failed to receive items', 'error');
        } finally {
            setIsSubmitting(false);
        }
    };

    const handleFreightUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file || !po) return;

        setFreightUploading(true);
        try {
            const result = await PurchaseOrderService.uploadFreightInvoice(po.id, file);
            setFreightPreview(result);
            showToast('Freight invoice processed', 'success');
        } catch (err) {
            console.error(err);
            showToast(err instanceof Error ? err.message : 'Failed to process freight invoice', 'error');
        } finally {
            setFreightUploading(false);
            if (freightFileRef.current) freightFileRef.current.value = '';
        }
    };

    const handleApplyFreight = async () => {
        if (!po || !freightPreview) return;
        setApplyingFreight(true);
        try {
            await PurchaseOrderService.applyFreight(po.id, freightPreview.freight_charge.id);
            showToast('Freight costs applied to inventory', 'success');
            setFreightPreview(null);
            loadFreightCharges(po.id);
        } catch (err) {
            console.error(err);
            showToast('Failed to apply freight charge', 'error');
        } finally {
            setApplyingFreight(false);
        }
    };

    if (!po) {
        return (
            <div className="p-12 flex justify-center">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-gable-green"></div>
            </div>
        );
    }

    const canSubmit = po.status === 'DRAFT';
    const canReceive = po.status === 'SENT' || po.status === 'PARTIAL';
    const canUploadFreight = po.status === 'RECEIVED' || po.status === 'PARTIAL';

    const formatCents = (cents: number) => `$${(cents / 100).toFixed(2)}`;

    return (
        <PageTransition>
            <div className="flex items-center gap-4 mb-6">
                <button onClick={() => navigate('/purchasing')} className="p-2 rounded-full bg-white/5 hover:bg-white/10 text-zinc-400 transition-colors">
                    <ArrowLeft className="w-5 h-5" />
                </button>
                <div className="flex-1">
                    <h1 className="text-2xl font-bold text-white">PO #{po.id.slice(0, 8)}</h1>
                    <p className="text-sm text-zinc-400">Status: <span className="font-bold uppercase">{po.status}</span></p>
                </div>
                <div className="flex gap-3">
                    {canSubmit && (
                        <Button onClick={handleSubmitPO} disabled={isSubmitting} isLoading={isSubmitting}>
                            <Send className="w-4 h-4 mr-2" />
                            Submit to Vendor
                        </Button>
                    )}
                    {canReceive && !receiving && (
                        <Button onClick={() => setReceiving(true)}>
                            <PackageCheck className="w-4 h-4 mr-2" />
                            Receive Items
                        </Button>
                    )}
                </div>
            </div>

            <Card variant="glass">
                <CardContent className="p-0">
                    <table className="w-full text-sm text-left">
                        <thead className="bg-white/5 text-zinc-400 uppercase tracking-wider text-xs font-semibold">
                            <tr>
                                <th className="px-6 py-4">Description</th>
                                <th className="px-6 py-4 text-right">Ordered</th>
                                <th className="px-6 py-4 text-right">Received</th>
                                <th className="px-6 py-4 text-right">Unit Cost</th>
                                <th className="px-6 py-4 text-right">Line Total</th>
                                {receiving && <th className="px-6 py-4 text-right">Receive Qty</th>}
                                {receiving && <th className="px-6 py-4">Location</th>}
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-white/5">
                            {(po.lines || []).map((line) => {
                                const remaining = line.quantity - line.qty_received;
                                return (
                                    <tr key={line.id} className="hover:bg-white/5 transition-colors">
                                        <td className="px-6 py-4">
                                            <span className="text-white">{line.description}</span>
                                            {line.product_id && (
                                                <span className="text-zinc-500 text-xs ml-2">({line.product_id.slice(0, 8)})</span>
                                            )}
                                        </td>
                                        <td className="px-6 py-4 text-right font-mono text-zinc-300">{line.quantity}</td>
                                        <td className="px-6 py-4 text-right font-mono">
                                            <span className={line.qty_received >= line.quantity ? 'text-emerald-400' : 'text-amber-400'}>
                                                {line.qty_received}
                                            </span>
                                        </td>
                                        <td className="px-6 py-4 text-right font-mono text-zinc-300">${line.cost.toFixed(2)}</td>
                                        <td className="px-6 py-4 text-right font-mono text-emerald-400 font-bold">
                                            ${(line.quantity * line.cost).toFixed(2)}
                                        </td>
                                        {receiving && (
                                            <td className="px-6 py-4 text-right">
                                                <input
                                                    type="number"
                                                    min="0"
                                                    max={remaining}
                                                    step="any"
                                                    value={receiveData[line.id]?.qty || 0}
                                                    onChange={(e) => setReceiveData(prev => ({
                                                        ...prev,
                                                        [line.id]: { ...prev[line.id], qty: Number(e.target.value) },
                                                    }))}
                                                    className="w-24 bg-black/20 border border-white/10 rounded px-2 py-1 text-white font-mono text-right focus:border-[#00FFA3] outline-none"
                                                    disabled={remaining <= 0}
                                                />
                                            </td>
                                        )}
                                        {receiving && (
                                            <td className="px-6 py-4">
                                                <select
                                                    value={receiveData[line.id]?.locationId || ''}
                                                    onChange={(e) => setReceiveData(prev => ({
                                                        ...prev,
                                                        [line.id]: { ...prev[line.id], locationId: e.target.value },
                                                    }))}
                                                    className="w-40 bg-black/20 border border-white/10 rounded px-2 py-1 text-white focus:border-[#00FFA3] outline-none"
                                                    disabled={remaining <= 0}
                                                >
                                                    <option value="">Select...</option>
                                                    {locations.map(loc => (
                                                        <option key={loc.id} value={loc.id}>
                                                            {loc.path || loc.code}
                                                        </option>
                                                    ))}
                                                </select>
                                            </td>
                                        )}
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                </CardContent>
            </Card>

            {receiving && (
                <div className="flex justify-end gap-3 mt-4">
                    <button
                        onClick={() => setReceiving(false)}
                        className="px-4 py-2 text-gray-400 hover:text-white transition-colors"
                    >
                        Cancel
                    </button>
                    <Button onClick={handleReceive} disabled={isSubmitting} isLoading={isSubmitting} className="shadow-glow">
                        <PackageCheck className="w-4 h-4 mr-2" />
                        Confirm Receipt
                    </Button>
                </div>
            )}

            {/* Freight Invoice Section */}
            {canUploadFreight && (
                <div className="mt-6 space-y-4">
                    <h2 className="text-lg font-semibold text-white flex items-center gap-2">
                        <Truck className="w-5 h-5 text-zinc-400" />
                        Freight Invoices
                    </h2>

                    {/* Applied freight charges */}
                    {freightCharges.filter(fc => fc.status === 'APPLIED').map(fc => (
                        <Card key={fc.id} variant="glass">
                            <CardContent className="p-4">
                                <div className="flex items-center justify-between">
                                    <div className="flex items-center gap-3">
                                        <CheckCircle className="w-5 h-5 text-emerald-400" />
                                        <div>
                                            <span className="text-emerald-400 font-semibold">
                                                Freight Applied — {formatCents(fc.total_amount_cents)}
                                            </span>
                                            {fc.carrier_name && (
                                                <span className="text-zinc-400 ml-2">from {fc.carrier_name}</span>
                                            )}
                                            {fc.invoice_number && (
                                                <span className="text-zinc-500 text-xs ml-2">(#{fc.invoice_number})</span>
                                            )}
                                        </div>
                                    </div>
                                    <button
                                        onClick={() => setExpandedFreight(expandedFreight === fc.id ? null : fc.id)}
                                        className="text-zinc-400 hover:text-white transition-colors"
                                    >
                                        {expandedFreight === fc.id ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                                    </button>
                                </div>
                                {expandedFreight === fc.id && fc.allocations && fc.allocations.length > 0 && (
                                    <table className="w-full text-sm mt-3">
                                        <thead className="text-zinc-500 text-xs uppercase">
                                            <tr>
                                                <th className="text-left py-2">Line Item</th>
                                                <th className="text-right py-2">Allocated</th>
                                                <th className="text-right py-2">Per Unit</th>
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y divide-white/5">
                                            {fc.allocations.map(a => (
                                                <tr key={a.id}>
                                                    <td className="py-2 text-zinc-300">{a.description || a.po_line_id.slice(0, 8)}</td>
                                                    <td className="py-2 text-right font-mono text-zinc-300">{formatCents(a.allocated_cents)}</td>
                                                    <td className="py-2 text-right font-mono text-zinc-300">{formatCents(a.per_unit_cents)}</td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                )}
                            </CardContent>
                        </Card>
                    ))}

                    {/* Freight preview (after upload, before apply) */}
                    {freightPreview && (
                        <Card variant="glass">
                            <CardContent className="p-4 space-y-4">
                                <div className="flex items-center gap-3">
                                    <Truck className="w-5 h-5 text-amber-400" />
                                    <div>
                                        <span className="text-white font-semibold">Freight Invoice Preview</span>
                                        <span className="text-zinc-400 text-sm ml-2">— Review before applying</span>
                                    </div>
                                </div>

                                <div className="grid grid-cols-3 gap-4">
                                    <div>
                                        <p className="text-xs text-zinc-500 uppercase">Carrier</p>
                                        <p className="text-white font-medium">{freightPreview.freight_charge.carrier_name || '—'}</p>
                                    </div>
                                    <div>
                                        <p className="text-xs text-zinc-500 uppercase">Invoice #</p>
                                        <p className="text-white font-medium">{freightPreview.freight_charge.invoice_number || '—'}</p>
                                    </div>
                                    <div>
                                        <p className="text-xs text-zinc-500 uppercase">Total Freight</p>
                                        <p className="text-emerald-400 font-bold text-lg">{formatCents(freightPreview.freight_charge.total_amount_cents)}</p>
                                    </div>
                                </div>

                                {freightPreview.allocations.length > 0 && (
                                    <table className="w-full text-sm">
                                        <thead className="text-zinc-500 text-xs uppercase bg-white/5">
                                            <tr>
                                                <th className="text-left px-4 py-2">Description</th>
                                                <th className="text-right px-4 py-2">Allocated Freight</th>
                                                <th className="text-right px-4 py-2">Per Unit Freight</th>
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y divide-white/5">
                                            {freightPreview.allocations.map(a => (
                                                <tr key={a.id}>
                                                    <td className="px-4 py-2 text-zinc-300">{a.description || a.po_line_id.slice(0, 8)}</td>
                                                    <td className="px-4 py-2 text-right font-mono text-amber-400">{formatCents(a.allocated_cents)}</td>
                                                    <td className="px-4 py-2 text-right font-mono text-zinc-300">{formatCents(a.per_unit_cents)}</td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                )}

                                <div className="flex justify-end gap-3 pt-2">
                                    <button
                                        onClick={() => setFreightPreview(null)}
                                        className="px-4 py-2 text-gray-400 hover:text-white transition-colors"
                                    >
                                        Cancel
                                    </button>
                                    <Button onClick={handleApplyFreight} disabled={applyingFreight} isLoading={applyingFreight} className="shadow-glow">
                                        <CheckCircle className="w-4 h-4 mr-2" />
                                        Apply to Inventory Costs
                                    </Button>
                                </div>
                            </CardContent>
                        </Card>
                    )}

                    {/* Upload button (show when no preview is active) */}
                    {!freightPreview && (
                        <Card variant="glass">
                            <CardContent className="p-4">
                                <input
                                    ref={freightFileRef}
                                    type="file"
                                    accept=".pdf,.png,.jpg,.jpeg,.webp"
                                    onChange={handleFreightUpload}
                                    className="hidden"
                                />
                                <button
                                    onClick={() => freightFileRef.current?.click()}
                                    disabled={freightUploading}
                                    className="w-full flex items-center justify-center gap-2 py-4 border-2 border-dashed border-white/10 rounded-lg text-zinc-400 hover:text-white hover:border-white/20 transition-colors disabled:opacity-50"
                                >
                                    {freightUploading ? (
                                        <>
                                            <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-gable-green"></div>
                                            Processing freight invoice...
                                        </>
                                    ) : (
                                        <>
                                            <Upload className="w-4 h-4" />
                                            Upload Freight Invoice
                                            <span className="text-xs text-zinc-500">(PDF, PNG, JPG)</span>
                                        </>
                                    )}
                                </button>
                            </CardContent>
                        </Card>
                    )}
                </div>
            )}
        </PageTransition>
    );
}
