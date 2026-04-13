import React from 'react';
import { useNavigate } from 'react-router-dom';
import type { Product } from '../../types/product';
import { Edit2, ArrowRightLeft, Package } from 'lucide-react';

interface InventoryTableProps {
    products: Product[];
    onAdjustStock: (product: Product) => void;
    onTransferStock: (product: Product) => void;
    onEditMargins: (product: Product) => void;
}

export const InventoryTable: React.FC<InventoryTableProps> = ({ products, onAdjustStock, onTransferStock, onEditMargins }) => {
    const navigate = useNavigate();

    return (
        <div className="w-full overflow-hidden">
            <div className="overflow-x-auto">
                <table className="w-full text-left text-sm">
                    <thead>
                        <tr className="border-b border-white/5 text-zinc-400 text-xs uppercase tracking-wider font-medium">
                            <th className="px-6 py-4">SKU / UPC</th>
                            <th className="px-6 py-4">Category / Desc</th>
                            <th className="px-6 py-4">Vendor</th>
                            <th className="px-6 py-4 text-center">UOM</th>
                            <th className="px-6 py-4 text-right">Avg Cost</th>
                            <th className="px-6 py-4 text-right">Target Margin</th>
                            <th className="px-6 py-4 text-right">Visible Price</th>
                            <th className="px-6 py-4 text-right">Available</th>
                            <th className="px-6 py-4 text-right">Actions</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-white/5">
                        {products.length === 0 ? (
                            <tr>
                                <td colSpan={8} className="px-6 py-12 text-center text-zinc-500">
                                    <div className="flex flex-col items-center gap-3">
                                        <div className="h-12 w-12 rounded-full bg-zinc-800/50 flex items-center justify-center">
                                            <Package className="w-6 h-6 text-zinc-600" />
                                        </div>
                                        <p>No products found in the pile.</p>
                                    </div>
                                </td>
                            </tr>
                        ) : (
                            products.map((p) => {
                                const available = (p.total_quantity || 0) - (p.total_allocated || 0);
                                const isLowStock = available < 100; // Example threshold

                                return (
                                    <tr key={p.id} className="group hover:bg-white/5 transition-colors cursor-pointer" onClick={() => navigate(`/inventory/${p.id}`)}>
                                        <td className="px-6 py-4">
                                            <div className="flex flex-col">
                                                <span className="font-mono font-bold text-white group-hover:text-gable-green transition-colors">
                                                    {p.sku}
                                                </span>
                                                {p.upc && <span className="text-xs text-zinc-500 font-mono mt-0.5">{p.upc}</span>}
                                            </div>
                                        </td>
                                        <td className="px-6 py-4">
                                            <div className="text-zinc-300 font-medium">{p.description}</div>
                                            <div className="text-xs text-zinc-500 font-mono mt-0.5">ID: {p.id.substring(0, 8)}</div>
                                        </td>
                                        <td className="px-6 py-4">
                                            <div className="text-zinc-400 text-sm truncate max-w-[150px]">{p.vendor || '-'}</div>
                                        </td>
                                        <td className="px-6 py-4 text-center">
                                            <span className="inline-flex items-center px-2 py-1 rounded text-xs font-mono font-medium bg-white/5 text-zinc-400 border border-white/10">
                                                {p.uom_primary}
                                            </span>
                                        </td>
                                        <td className="px-6 py-4 text-right font-mono text-emerald-400">
                                            ${(p.average_unit_cost || 0).toFixed(2)}
                                        </td>
                                        <td className="px-6 py-4 text-right font-mono text-zinc-300">
                                            {(p.target_margin || 0).toFixed(1)}% <br />
                                            <span className="text-xs text-zinc-500">{(p.commission_rate || 0).toFixed(1)}% Comm</span>
                                        </td>
                                        <td className="px-6 py-4 text-right">
                                            <span className="font-mono text-white group-hover:text-gable-green transition-colors">
                                                ${(p.base_price || 0).toFixed(2)}
                                            </span>
                                        </td>
                                        <td className="px-6 py-4 text-right">
                                            <span className={`font-mono font-bold ${isLowStock ? 'text-rose-500' : 'text-emerald-400'}`}>
                                                {available.toLocaleString()}
                                            </span>
                                        </td>
                                        <td className="px-6 py-4 text-right">
                                            <div className="flex items-center justify-end gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                                                <button
                                                    onClick={(e) => { e.stopPropagation(); onAdjustStock(p); }}
                                                    className="p-1.5 rounded-md hover:bg-white/10 text-zinc-400 hover:text-white transition-colors"
                                                    title="Adjust Stock"
                                                >
                                                    <Edit2 className="w-4 h-4" />
                                                </button>
                                                <button
                                                    onClick={(e) => { e.stopPropagation(); onTransferStock(p); }}
                                                    className="p-1.5 rounded-md hover:bg-white/10 text-zinc-400 hover:text-white transition-colors"
                                                    title="Transfer Stock"
                                                >
                                                    <ArrowRightLeft className="w-4 h-4" />
                                                </button>
                                                <button
                                                    onClick={(e) => { e.stopPropagation(); onEditMargins(p); }}
                                                    className="p-1.5 rounded-md hover:bg-white/10 text-zinc-400 hover:text-white transition-colors"
                                                    title="Edit Margins and Commissions"
                                                >
                                                    <span className="text-xs font-bold leading-none px-1 py-0.5 rounded bg-zinc-800 text-gable-green border border-gable-green/30">$</span>
                                                </button>
                                            </div>
                                        </td>
                                    </tr>
                                );
                            })
                        )}
                    </tbody>
                </table>
            </div>
        </div>
    );
};
