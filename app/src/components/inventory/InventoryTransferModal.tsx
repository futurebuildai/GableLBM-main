import { useEffect, useState } from "react";
import { X } from "lucide-react";
import { InventoryService } from "../../services/InventoryService";
import { LocationService } from "../../services/LocationService";
import type { Product, Inventory } from "../../types/product";
import type { Location } from "../../types/location";
import { useToast } from "../ui/ToastContext";

interface InventoryTransferModalProps {
    isOpen: boolean;
    onClose: () => void;
    product: Product | null;
    onSuccess: () => void;
}

export function InventoryTransferModal({ isOpen, onClose, product, onSuccess }: InventoryTransferModalProps) {
    const { showToast } = useToast();
    const [fromLoc, setFromLoc] = useState("");
    const [toLoc, setToLoc] = useState("");
    const [quantity, setQuantity] = useState("");
    const [reason, setReason] = useState("");
    const [isSubmitting, setIsSubmitting] = useState(false);

    const [inventory, setInventory] = useState<Inventory[]>([]);
    const [locations, setLocations] = useState<Location[]>([]);

    useEffect(() => {
        if (isOpen && product) {
            // Load current inventory for source options
            InventoryService.getInventoryByProduct(product.id).then((data) => {
                setInventory(data);
                if (data.length > 0) {
                    // Fallback to location if location_id missing
                    setFromLoc(data[0].location_id || data[0].location || "");
                }
            }).catch(() => showToast('Failed to load data', 'error'));

            // Load all locations for dest options
            LocationService.listLocations().then((data: Location[]) => {
                setLocations(data);
            }).catch(() => showToast('Failed to load data', 'error'));

            setQuantity("");
            setReason("");
            setToLoc("");
        }
    }, [isOpen, product]);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!product || !fromLoc || !toLoc || !quantity) return;

        setIsSubmitting(true);
        try {
            await InventoryService.transferStock({
                product_id: product.id,
                from_location_id: fromLoc,
                to_location_id: toLoc,
                quantity: Number(quantity),
                reason: reason || "Manual Transfer"
            });
            onSuccess();
            onClose();
        } catch {
            showToast("Transfer failed", "error");
        } finally {
            setIsSubmitting(false);
        }
    };

    if (!isOpen || !product) return null;

    // Find max quantity for selected source
    const sourceItem = inventory.find(i => (i.location_id || i.location) === fromLoc);
    const maxQty = sourceItem ? sourceItem.quantity : 0;

    return (
        <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4" role="dialog" aria-modal="true" aria-labelledby="transfer-stock-modal-title">
            <div className="bg-[#161821] w-full max-w-lg rounded-xl border border-white/10 shadow-2xl">
                <div className="flex justify-between items-center p-6 border-b border-white/10">
                    <h2 id="transfer-stock-modal-title" className="text-xl font-bold">Transfer Stock</h2>
                    <button onClick={onClose} className="text-gray-400 hover:text-white" aria-label="Close transfer dialog">
                        <X className="w-6 h-6" />
                    </button>
                </div>

                <form onSubmit={handleSubmit} className="p-6 space-y-6">
                    <div className="text-sm text-gray-400 mb-4">
                        Moving <span className="text-white font-bold">{product.sku}</span> - {product.description}
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                        <div>
                            <label className="block text-sm text-gray-400 mb-2">From Location</label>
                            <select
                                value={fromLoc}
                                onChange={e => setFromLoc(e.target.value)}
                                className="w-full bg-[#0A0B10] border border-white/20 rounded p-3 text-white"
                                required
                            >
                                <option value="">Select Source...</option>
                                {inventory.map(i => (
                                    <option key={i.id} value={i.location_id || i.location}>
                                        {i.location_name || i.location} ({i.quantity})
                                    </option>
                                ))}
                            </select>
                        </div>

                        <div>
                            <label className="block text-sm text-gray-400 mb-2">To Location</label>
                            <select
                                value={toLoc}
                                onChange={e => setToLoc(e.target.value)}
                                className="w-full bg-[#0A0B10] border border-white/20 rounded p-3 text-white"
                                required
                            >
                                <option value="">Select Dest...</option>
                                {locations
                                    .filter(l => l.id !== fromLoc)
                                    .map(l => (
                                        <option key={l.id} value={l.id}>{l.path || l.code}</option>
                                    ))}
                            </select>
                        </div>
                    </div>

                    <div>
                        <label className="block text-sm text-gray-400 mb-2">Quantity (Max: {maxQty})</label>
                        <input
                            type="number"
                            min="0.001"
                            step="0.001"
                            max={maxQty}
                            value={quantity}
                            onChange={e => setQuantity(e.target.value)}
                            className="w-full bg-[#0A0B10] border border-white/20 rounded p-3 text-white font-mono"
                            required
                        />
                    </div>

                    <div>
                        <label className="block text-sm text-gray-400 mb-2">Reason</label>
                        <input
                            type="text"
                            value={reason}
                            onChange={e => setReason(e.target.value)}
                            placeholder="Why move?"
                            className="w-full bg-[#0A0B10] border border-white/20 rounded p-3 text-white"
                        />
                    </div>

                    <div className="flex gap-4 pt-4">
                        <button
                            type="button"
                            onClick={onClose}
                            className="flex-1 py-3 border border-white/10 rounded font-bold hover:bg-white/5"
                        >
                            CANCEL
                        </button>
                        <button
                            type="submit"
                            disabled={isSubmitting || Number(quantity) > maxQty}
                            className="flex-1 py-3 bg-[#00FFA3] text-black rounded font-bold hover:bg-[#00FFA3]/90 disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                            {isSubmitting ? "MOVING..." : "CONFIRM TRANSFER"}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
}
