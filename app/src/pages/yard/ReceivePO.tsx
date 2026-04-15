import { useEffect, useState } from "react";
import { PageTransition } from "../../components/ui/PageTransition";
import { Card, CardContent } from "../../components/ui/Card";
import { PurchaseOrderService } from "../../services/PurchaseOrderService";
import type { PurchaseOrder } from "../../types/purchaseOrder";
import { ScanBarcode, ChevronRight, ArrowLeft, Check, Package, Loader2, ScanLine } from "lucide-react";
import { BarcodeScanner } from "../../components/BarcodeScanner";
import { useToast } from "../../components/ui/ToastContext";

export function ReceivePO() {
    const [pos, setPOs] = useState<PurchaseOrder[]>([]);
    const [loading, setLoading] = useState(true);
    const [selectedPO, setSelectedPO] = useState<PurchaseOrder | null>(null);
    const [receivedQtys, setReceivedQtys] = useState<Record<string, string>>({});
    const [submitting, setSubmitting] = useState(false);
    const [submitted, setSubmitted] = useState(false);
    const [isScanning, setIsScanning] = useState(false);
    const { showToast } = useToast();

    const handleScan = (barcode: string) => {
        if (!selectedPO || !selectedPO.lines) return;

        // Find the line item by product id/sku (assuming product_id is what barcode returns for now)
        const lineItem = selectedPO.lines.find(l =>
            l.product_id === barcode ||
            (l.description && l.description.toLowerCase().includes(barcode.toLowerCase()))
        );

        if (lineItem) {
            setReceivedQtys(prev => {
                const currentQty = parseFloat(prev[lineItem.id] || "0");
                const newQty = currentQty + 1;

                // Don't exceed ordered quantity
                if (newQty > lineItem.quantity) {
                    showToast(`Cannot receive more than ordered for: ${lineItem.description}`, 'error');
                    return prev;
                }

                showToast(`Scanned: ${lineItem.description} (+1)`, 'success');
                return { ...prev, [lineItem.id]: String(newQty) };
            });
        } else {
            showToast(`Item not found on this PO: ${barcode}`, 'error');
        }
    };

    useEffect(() => {
        PurchaseOrderService.listPOs()
            .then(data => {
                setPOs(data.filter(po => po.status === "SENT" || po.status === "PARTIAL"));
            })
            .catch(() => { setPOs([]); showToast('Failed to load purchase orders', 'error'); })
            .finally(() => setLoading(false));
    }, [showToast]);

    const selectPO = async (po: PurchaseOrder) => {
        try {
            const detail = await PurchaseOrderService.getPO(po.id);
            setSelectedPO(detail);
            setReceivedQtys({});
            setSubmitted(false);
        } catch (err) {
            console.error('Failed to load PO:', err);
            showToast('Failed to load purchase order details', 'error');
        }
    };

    const handleReceive = async () => {
        if (!selectedPO) return;
        setSubmitting(true);
        try {
            const lines = (selectedPO.lines || []).map(line => ({
                line_id: line.id,
                qty_received: parseFloat(receivedQtys[line.id] || "0"),
                location_id: "", // Default location
            })).filter(l => l.qty_received > 0);

            if (lines.length > 0) {
                await PurchaseOrderService.receivePO(selectedPO.id, { lines });
            }
            setSubmitted(true);
        } catch (err) {
            console.error('Failed to receive PO:', err);
            showToast('Failed to receive purchase order', 'error');
        }
        setSubmitting(false);
    };

    const statusConfig = (status: string) => {
        switch (status) {
            case "SENT": return "text-blue-400 bg-blue-500/10 border-blue-500/20";
            case "PARTIAL": return "text-amber-400 bg-amber-500/10 border-amber-500/20";
            default: return "text-zinc-400 bg-zinc-500/10 border-zinc-500/20";
        }
    };

    if (loading) {
        return (
            <div className="flex justify-center items-center h-64">
                <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-amber-400"></div>
            </div>
        );
    }

    return (
        <PageTransition>
            <div className="flex flex-col space-y-4 p-4 max-w-md mx-auto">
                {!selectedPO ? (
                    <>
                        <h1 className="text-xl font-bold text-white tracking-tight flex items-center gap-2">
                            <ScanBarcode className="w-5 h-5 text-amber-400" />
                            Receiving
                        </h1>
                        <p className="text-sm text-zinc-400">
                            {pos.length} purchase order{pos.length !== 1 ? "s" : ""} awaiting receiving
                        </p>

                        {pos.length === 0 && (
                            <div className="text-center py-16 flex flex-col items-center gap-4 opacity-50">
                                <Package className="w-14 h-14 text-zinc-600" />
                                <p className="text-zinc-400 text-lg">No POs to receive</p>
                            </div>
                        )}

                        <div className="space-y-2">
                            {pos.map(po => (
                                <Card
                                    key={po.id}
                                    variant="glass"
                                    className="active:scale-[0.98] transition-all cursor-pointer border-white/5 hover:border-amber-400/30"
                                    onClick={() => selectPO(po)}
                                >
                                    <CardContent className="p-4">
                                        <div className="flex justify-between items-start mb-2">
                                            <div>
                                                <div className="font-medium text-white text-sm">
                                                    {po.vendor_name || "Vendor"}
                                                </div>
                                                <div className="text-xs text-zinc-500 font-mono mt-0.5">
                                                    PO #{po.id.slice(-6).toUpperCase()}
                                                </div>
                                            </div>
                                            <div className="flex items-center gap-2">
                                                <span className={`text-[10px] font-mono px-2 py-0.5 rounded border uppercase tracking-wide ${statusConfig(po.status)}`}>
                                                    {po.status}
                                                </span>
                                                <ChevronRight className="w-4 h-4 text-zinc-600" />
                                            </div>
                                        </div>
                                        <div className="text-xs text-zinc-500">
                                            {po.lines?.length || "?"} line items &middot; {new Date(po.created_at).toLocaleDateString(undefined, { month: "short", day: "numeric" })}
                                        </div>
                                    </CardContent>
                                </Card>
                            ))}
                        </div>
                    </>
                ) : submitted ? (
                    <div className="text-center py-16 flex flex-col items-center gap-4 min-h-[60vh] justify-center">
                        <div className="w-16 h-16 rounded-full bg-emerald-500/10 flex items-center justify-center">
                            <Check className="w-8 h-8 text-emerald-400" />
                        </div>
                        <p className="text-white font-medium text-lg">Receiving Complete</p>
                        <p className="text-zinc-500 text-sm">PO #{selectedPO.id.slice(-6).toUpperCase()} updated</p>
                        <button
                            onClick={() => { setSelectedPO(null); setSubmitted(false); }}
                            className="mt-4 px-6 py-2 bg-white/5 border border-white/10 text-white rounded-lg text-sm hover:bg-white/10 transition-colors"
                        >
                            Back to List
                        </button>
                    </div>
                ) : (
                    <>
                        {/* PO Detail */}
                        <div className="flex justify-between items-center mb-4">
                            <div className="flex items-center gap-3">
                                <button
                                    onClick={() => setSelectedPO(null)}
                                    className="p-2 rounded-full bg-white/5 hover:bg-white/10 text-zinc-400 transition-colors"
                                    aria-label="Go back"
                                >
                                    <ArrowLeft className="w-5 h-5" />
                                </button>
                                <div>
                                    <div className="font-bold text-lg text-white">{selectedPO.vendor_name || "Vendor"}</div>
                                    <div className="text-xs text-zinc-500 font-mono">
                                        PO #{selectedPO.id.slice(-6).toUpperCase()}
                                    </div>
                                </div>
                            </div>
                            <button
                                onClick={() => setIsScanning(true)}
                                className="flex items-center gap-1.5 text-xs bg-zinc-800 hover:bg-zinc-700 text-amber-400 py-1.5 px-3 rounded-lg border border-white/10 transition-colors"
                            >
                                <ScanLine className="w-4 h-4" />
                                Scan Line
                            </button>
                        </div>

                        {isScanning && (
                            <BarcodeScanner
                                onScan={(barcode) => {
                                    setIsScanning(false);
                                    handleScan(barcode);
                                }}
                                onClose={() => setIsScanning(false)}
                            />
                        )}

                        <div className="space-y-2">
                            {(selectedPO.lines || []).map(line => {
                                const remaining = line.quantity - (line.qty_received || 0);
                                return (
                                    <Card key={line.id} variant="glass" className="border-white/5">
                                        <CardContent className="p-4">
                                            <div className="flex items-center gap-3">
                                                <div className="flex-1 min-w-0">
                                                    <div className="font-medium text-white text-sm truncate">{line.description}</div>
                                                    <div className="text-xs text-zinc-500 mt-0.5 flex gap-3">
                                                        <span className="font-mono">Ordered: {line.quantity}</span>
                                                        {(line.qty_received || 0) > 0 && (
                                                            <span className="font-mono text-emerald-400">Rcvd: {line.qty_received}</span>
                                                        )}
                                                    </div>
                                                </div>
                                                <div className="shrink-0 flex flex-col items-end gap-1">
                                                    <div className="text-[10px] text-zinc-500">Receiving</div>
                                                    <input
                                                        type="number"
                                                        inputMode="numeric"
                                                        value={receivedQtys[line.id] || ""}
                                                        onChange={e => setReceivedQtys(prev => ({ ...prev, [line.id]: e.target.value }))}
                                                        placeholder={String(remaining)}
                                                        className="w-20 text-center bg-black/20 border border-white/10 rounded-lg py-2 font-mono text-sm text-white focus:outline-none focus:border-amber-400/50 transition-colors"
                                                    />
                                                </div>
                                            </div>
                                        </CardContent>
                                    </Card>
                                );
                            })}
                        </div>

                        {/* Receive Button */}
                        <div className="sticky bottom-20 pt-4">
                            <button
                                onClick={handleReceive}
                                disabled={submitting}
                                className="w-full py-4 rounded-xl font-bold text-lg font-mono uppercase tracking-wider bg-amber-400 text-black hover:bg-amber-300 active:scale-[0.98] shadow-lg shadow-amber-400/20 transition-all"
                            >
                                {submitting ? (
                                    <span className="flex items-center justify-center gap-2">
                                        <Loader2 className="w-5 h-5 animate-spin" /> Receiving...
                                    </span>
                                ) : (
                                    <span className="flex items-center justify-center gap-2">
                                        <ScanBarcode className="w-5 h-5" /> Confirm Received
                                    </span>
                                )}
                            </button>
                        </div>
                    </>
                )}
            </div>
        </PageTransition>
    );
}
