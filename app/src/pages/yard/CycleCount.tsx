import { useEffect, useState } from "react";
import { PageTransition } from "../../components/ui/PageTransition";
import { Card, CardContent } from "../../components/ui/Card";
import { ClipboardCheck, MapPin, ChevronRight, Check, AlertTriangle, Loader2, ScanLine } from "lucide-react";
import type { Product } from "../../types/product";
import { InventoryService } from "../../services/InventoryService";
import { fetchWithAuth } from "../../services/fetchClient";
import { BarcodeScanner } from "../../components/BarcodeScanner";
import { useToast } from "../../components/ui/ToastContext";

const API_URL = import.meta.env.VITE_API_URL || '';

interface CountItem {
    product: Product;
    expected: number;
    counted: string; // string for input control
    submitted: boolean;
}

const ZONES = [
    { code: "MAIN-A", label: "Lumber Storage A" },
    { code: "MAIN-B", label: "Sheet Goods B" },
    { code: "MAIN-C", label: "Hardware C" },
    { code: "MAIN-D", label: "Roofing & Insulation D" },
    { code: "SAT1-A", label: "Treated Lumber (Satellite)" },
    { code: "SAT1-B", label: "Millwork (Satellite)" },
];

export function CycleCount() {
    const [selectedZone, setSelectedZone] = useState<string | null>(null);
    const [items, setItems] = useState<CountItem[]>([]);
    const [loading, setLoading] = useState(false);
    const [submitting, setSubmitting] = useState(false);
    const [submitted, setSubmitted] = useState(false);
    const [isScanning, setIsScanning] = useState(false);
    const { showToast } = useToast();

    const handleScan = (barcode: string) => {
        // Find item by ID or SKU
        const index = items.findIndex(i =>
            i.product.id === barcode ||
            i.product.sku.toLowerCase() === barcode.toLowerCase()
        );

        if (index >= 0) {
            setItems(prev => {
                const next = [...prev];
                const currentCount = parseFloat(next[index].counted);
                const newCount = isNaN(currentCount) ? 1 : currentCount + 1;
                next[index] = { ...next[index], counted: newCount.toString() };
                return next;
            });
            showToast(`Scanned: ${items[index].product.description} (+1)`, 'success');
        } else {
            showToast(`Item not found in current zone: ${barcode}`, 'error');
        }
    };

    useEffect(() => {
        if (!selectedZone) return;
        setLoading(true);
        setSubmitted(false);
        // Fetch products to count - in practice would filter by zone, here we sample
        fetchWithAuth(`${API_URL}/api/v1/products`)
            .then(r => { if (!r.ok) throw new Error('Failed to fetch products'); return r.json(); })
            .then((data: Product[]) => {
                // Simulate zone-filtered subset
                const zoneIndex = ZONES.findIndex(z => z.code === selectedZone);
                const subset = data.slice(zoneIndex * 7, zoneIndex * 7 + 7);
                setItems(subset.map(p => ({
                    product: p,
                    expected: p.total_quantity ?? 0,
                    counted: "",
                    submitted: false,
                })));
            })
            .catch(() => setItems([]))
            .finally(() => setLoading(false));
    }, [selectedZone]);

    const updateCount = (idx: number, value: string) => {
        setItems(prev => {
            const next = [...prev];
            next[idx] = { ...next[idx], counted: value };
            return next;
        });
    };

    const handleSubmit = async () => {
        setSubmitting(true);
        let failCount = 0;
        for (const item of items) {
            const counted = parseFloat(item.counted);
            if (isNaN(counted)) continue;
            if (counted !== item.expected) {
                try {
                    await InventoryService.adjustStock({
                        product_id: item.product.id,
                        quantity: counted,
                        reason: `Cycle count - Zone ${selectedZone}`,
                        is_delta: false,
                    });
                } catch {
                    failCount++;
                    console.error('Failed to adjust stock');
                }
            }
        }
        if (failCount > 0) {
            console.error(`${failCount} adjustment(s) failed to save`);
            showToast(`${failCount} adjustment(s) failed to save`, 'error');
        }
        setSubmitting(false);
        setSubmitted(true);
    };

    const countedCount = items.filter(i => i.counted !== "").length;
    const discrepancies = items.filter(i => {
        const c = parseFloat(i.counted);
        return !isNaN(c) && c !== i.expected;
    }).length;

    return (
        <PageTransition>
            <div className="flex flex-col space-y-4 p-4 max-w-md mx-auto">
                <h1 className="text-xl font-bold text-white tracking-tight flex items-center gap-2">
                    <ClipboardCheck className="w-5 h-5 text-amber-400" />
                    Cycle Count
                </h1>

                {/* Zone Selection */}
                {!selectedZone && (
                    <div className="space-y-2">
                        <p className="text-sm text-zinc-400">Select a zone to count:</p>
                        {ZONES.map(z => (
                            <Card
                                key={z.code}
                                variant="glass"
                                className="active:scale-[0.98] transition-all cursor-pointer border-white/5 hover:border-amber-400/30"
                                onClick={() => setSelectedZone(z.code)}
                            >
                                <CardContent className="p-4 flex items-center justify-between">
                                    <div className="flex items-center gap-3">
                                        <MapPin className="w-4 h-4 text-amber-400" />
                                        <div>
                                            <div className="font-medium text-white text-sm">{z.label}</div>
                                            <div className="text-xs text-zinc-500 font-mono">{z.code}</div>
                                        </div>
                                    </div>
                                    <ChevronRight className="w-4 h-4 text-zinc-600" />
                                </CardContent>
                            </Card>
                        ))}
                    </div>
                )}

                {/* Count Interface */}
                {selectedZone && (
                    <>
                        <div className="flex items-center justify-between">
                            <button
                                onClick={() => { setSelectedZone(null); setItems([]); }}
                                aria-label="Change zone"
                                className="text-xs text-amber-400 hover:underline"
                            >
                                ← Change Zone
                            </button>

                            <div className="flex items-center gap-3">
                                <button
                                    onClick={() => setIsScanning(true)}
                                    aria-label="Scan item barcode"
                                    className="flex items-center gap-1.5 text-xs bg-zinc-800 hover:bg-zinc-700 text-amber-400 py-1.5 px-3 rounded-lg border border-white/10 transition-colors"
                                >
                                    <ScanLine className="w-3.5 h-3.5" />
                                    Scan Item
                                </button>
                                <span className="text-xs font-mono text-zinc-500">
                                    {ZONES.find(z => z.code === selectedZone)?.label}
                                </span>
                            </div>
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

                        {loading ? (
                            <div className="flex justify-center py-12">
                                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-amber-400"></div>
                            </div>
                        ) : submitted ? (
                            <div className="text-center py-16 flex flex-col items-center gap-4">
                                <div className="w-16 h-16 rounded-full bg-emerald-500/10 flex items-center justify-center">
                                    <Check className="w-8 h-8 text-emerald-400" />
                                </div>
                                <p className="text-white font-medium text-lg">Count Submitted</p>
                                <p className="text-zinc-500 text-sm">{discrepancies} discrepancies adjusted</p>
                                <button
                                    onClick={() => { setSelectedZone(null); setItems([]); }}
                                    className="mt-4 px-6 py-2 bg-white/5 border border-white/10 text-white rounded-lg text-sm hover:bg-white/10 transition-colors"
                                >
                                    Count Another Zone
                                </button>
                            </div>
                        ) : (
                            <>
                                {/* Progress */}
                                <div className="flex items-center gap-3 text-xs text-zinc-500">
                                    <span>{countedCount}/{items.length} counted</span>
                                    {discrepancies > 0 && (
                                        <span className="flex items-center gap-1 text-amber-400">
                                            <AlertTriangle className="w-3 h-3" />
                                            {discrepancies} discrepancies
                                        </span>
                                    )}
                                </div>

                                <div className="space-y-2">
                                    {items.map((item, idx) => {
                                        const counted = parseFloat(item.counted);
                                        const hasDiscrep = !isNaN(counted) && counted !== item.expected;
                                        return (
                                            <Card
                                                key={item.product.id}
                                                variant="glass"
                                                className={`transition-all ${hasDiscrep ? "border-amber-400/30" : "border-white/5"}`}
                                            >
                                                <CardContent className="p-4">
                                                    <div className="flex items-center gap-3">
                                                        <div className="flex-1 min-w-0">
                                                            <div className="font-medium text-white text-sm truncate">{item.product.description}</div>
                                                            <div className="text-xs text-zinc-500 font-mono">{item.product.sku}</div>
                                                        </div>
                                                        <div className="text-right shrink-0 mr-2">
                                                            <div className="text-[10px] text-zinc-500 font-mono">Expected</div>
                                                            <div className="font-mono text-sm text-zinc-300">{item.expected}</div>
                                                        </div>
                                                        <input
                                                            type="number"
                                                            inputMode="numeric"
                                                            value={item.counted}
                                                            onChange={e => updateCount(idx, e.target.value)}
                                                            placeholder="—"
                                                            className={`w-20 text-center bg-black/20 border rounded-lg py-2 font-mono text-sm focus:outline-none transition-colors ${hasDiscrep
                                                                ? "border-amber-400/50 text-amber-400 focus:border-amber-400"
                                                                : item.counted !== ""
                                                                    ? "border-emerald-500/30 text-emerald-400"
                                                                    : "border-white/10 text-white focus:border-amber-400/50"
                                                                }`}
                                                        />
                                                    </div>
                                                </CardContent>
                                            </Card>
                                        );
                                    })}
                                </div>

                                {/* Submit */}
                                <div className="sticky bottom-20 pt-4">
                                    <button
                                        onClick={handleSubmit}
                                        disabled={countedCount === 0 || submitting}
                                        className={`w-full py-4 rounded-xl font-bold text-lg font-mono uppercase tracking-wider transition-all ${countedCount > 0
                                            ? "bg-amber-400 text-black hover:bg-amber-300 active:scale-[0.98] shadow-lg shadow-amber-400/20"
                                            : "bg-white/5 text-zinc-600 border border-white/10 cursor-not-allowed"
                                            }`}
                                    >
                                        {submitting ? (
                                            <span className="flex items-center justify-center gap-2">
                                                <Loader2 className="w-5 h-5 animate-spin" /> Submitting...
                                            </span>
                                        ) : (
                                            `Submit Count (${countedCount} items)`
                                        )}
                                    </button>
                                </div>
                            </>
                        )}
                    </>
                )}
            </div>
        </PageTransition>
    );
}
