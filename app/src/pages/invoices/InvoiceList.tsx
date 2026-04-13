import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { InvoiceService } from '../../services/InvoiceService';
import type { Invoice } from '../../types/invoice';

export default function InvoiceList() {
    const navigate = useNavigate();
    const [invoices, setInvoices] = useState<Invoice[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        loadInvoices();
    }, []);

    async function loadInvoices() {
        try {
            const data = await InvoiceService.listInvoices();
            setInvoices(data);
        } catch (error) {
            console.error('Failed to load invoices:', error);
        } finally {
            setLoading(false);
        }
    }

    return (
        <div className="space-y-6">
            <div className="flex items-center justify-between pb-6 border-b border-white/10">
                <h1 className="text-3xl font-bold tracking-tight text-white">Invoices</h1>
            </div>

            <div className="w-full overflow-hidden border border-zinc-800 rounded-lg bg-zinc-900 text-sm">
                <div className="overflow-x-auto">
                    <table className="w-full text-left text-zinc-400">
                        <thead className="bg-zinc-950 text-zinc-200 uppercase tracking-wider text-xs font-semibold">
                            <tr>
                                <th className="px-6 py-3 border-b border-zinc-800">Invoice ID</th>
                                <th className="px-6 py-3 border-b border-zinc-800">Order ID</th>
                                <th className="px-6 py-3 border-b border-zinc-800">Customer</th>
                                <th className="px-6 py-3 border-b border-zinc-800 text-right">Amount</th>
                                <th className="px-6 py-3 border-b border-zinc-800">Status</th>
                                <th className="px-6 py-3 border-b border-zinc-800">Date</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-zinc-800">
                            {loading ? (
                                <tr><td colSpan={6} className="px-6 py-8 text-center text-zinc-600">Loading financials...</td></tr>
                            ) : invoices.length === 0 ? (
                                <tr><td colSpan={6} className="px-6 py-8 text-center text-zinc-600">No invoices generated yet.</td></tr>
                            ) : (
                                invoices.map((inv) => (
                                    <tr
                                        key={inv.id}
                                        onClick={() => navigate(`/invoices/${inv.id}`)}
                                        className="hover:bg-zinc-800/50 transition-colors cursor-pointer"
                                    >
                                        <td className="px-6 py-3 font-mono text-zinc-100">{inv.id.slice(0, 8)}</td>
                                        <td className="px-6 py-3 font-mono text-zinc-400">{inv.order_id.slice(0, 8)}</td>
                                        <td className="px-6 py-3 text-zinc-300">{inv.customer_name || inv.customer_id.slice(0, 8)}</td>
                                        <td className="px-6 py-3 text-right font-mono text-emerald-400 font-medium">
                                            ${inv.total_amount.toFixed(2)}
                                        </td>
                                        <td className="px-6 py-3">
                                            <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium border
                                                ${inv.status === 'UNPAID' ? 'bg-amber-500/10 text-amber-500 border-amber-500/20' : ''}
                                                ${inv.status === 'PAID' ? 'bg-emerald-500/10 text-emerald-500 border-emerald-500/20' : ''}
                                                ${inv.status === 'OVERDUE' ? 'bg-red-500/10 text-red-500 border-red-500/20' : ''}
                                            `}>
                                                {inv.status}
                                            </span>
                                        </td>
                                        <td className="px-6 py-3 text-zinc-500">
                                            {new Date(inv.created_at).toLocaleDateString()}
                                        </td>
                                    </tr>
                                ))
                            )}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    );
}
