import { useEffect, useState } from 'react';
import { ReportingService } from '../services/ReportingService';
import type { DailyTillReport, SalesSummaryReport } from '../types/reporting';
import { DollarSign, CreditCard, BarChart2 } from 'lucide-react';
import { useToast } from '../components/ui/ToastContext';

export default function DailyTill() {
    const { showToast } = useToast();
    const [till, setTill] = useState<DailyTillReport | null>(null);
    const [summary, setSummary] = useState<SalesSummaryReport | null>(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        loadData();
    }, [showToast]);

    async function loadData() {
        try {
            const [tillData, summaryData] = await Promise.all([
                ReportingService.getDailyTill(),
                ReportingService.getSalesSummary()
            ]);
            setTill(tillData);
            setSummary(summaryData);
        } catch (error) {
            console.error(error);
            showToast('Failed to load daily till data', 'error');
        } finally {
            setLoading(false);
        }
    }

    if (loading || !till || !summary) return <div className="text-white p-8">Crunching numbers...</div>;

    return (
        <div className="space-y-8 max-w-6xl mx-auto p-8 pb-20">
            <div>
                <h1 className="text-3xl font-bold font-mono text-white mb-2">Financial Dashboard</h1>
                <p className="text-zinc-400">Daily Till & Sales Summary</p>
            </div>

            {/* Daily Till Section */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                {/* Till Card */}
                <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-6">
                    <div className="flex items-center justify-between mb-6">
                        <h2 className="text-xl font-bold text-emerald-400 flex items-center gap-2">
                            <DollarSign size={24} /> Daily Till ({till.date})
                        </h2>
                        <span className="text-3xl font-mono font-bold text-white">
                            ${till.total_collected.toFixed(2)}
                        </span>
                    </div>

                    <div className="space-y-4">
                        {Object.entries(till.by_method).map(([method, amount]) => (
                            <div key={method} className="flex items-center justify-between p-4 bg-black/20 rounded border border-white/5">
                                <div className="flex items-center gap-3">
                                    <div className="p-2 bg-zinc-800 rounded text-zinc-400">
                                        <CreditCard size={18} />
                                    </div>
                                    <span className="font-bold text-zinc-200">{method}</span>
                                </div>
                                <span className="font-mono text-xl text-white">${amount.toFixed(2)}</span>
                            </div>
                        ))}
                    </div>

                    <div className="mt-6 pt-6 border-t border-zinc-800 text-center text-zinc-500 text-sm">
                        {till.transaction_count} Transactions Today
                    </div>
                </div>

                {/* Sales Summary Card (30 Days) */}
                <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-6">
                    <div className="flex items-center justify-between mb-6">
                        <h2 className="text-xl font-bold text-blue-400 flex items-center gap-2">
                            <BarChart2 size={24} /> Sales Performance (30 Days)
                        </h2>
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                        <div className="p-4 bg-black/20 rounded border border-white/5">
                            <span className="block text-zinc-400 text-sm uppercase font-bold mb-1">Total Invoiced</span>
                            <span className="block text-2xl font-mono text-white">${summary.total_invoiced.toFixed(2)}</span>
                        </div>
                        <div className="p-4 bg-black/20 rounded border border-white/5">
                            <span className="block text-zinc-400 text-sm uppercase font-bold mb-1">Total Collected</span>
                            <span className="block text-2xl font-mono text-emerald-400">${summary.total_collected.toFixed(2)}</span>
                        </div>
                        <div className="p-4 bg-black/20 rounded border border-white/5 col-span-2">
                            <div className="flex justify-between items-center">
                                <span className="block text-zinc-400 text-sm uppercase font-bold">Outstanding AR (Period)</span>
                                <span className="block text-2xl font-mono text-amber-500">${summary.outstanding_ar.toFixed(2)}</span>
                            </div>
                            <div className="w-full bg-zinc-800 h-2 mt-3 rounded-full overflow-hidden">
                                <div
                                    className="h-full bg-emerald-500 transition-all duration-500"
                                    style={{ width: `${summary.total_invoiced ? (summary.total_collected / summary.total_invoiced) * 100 : 0}%` }}
                                />
                            </div>
                            <div className="flex justify-between mt-1 text-xs text-zinc-500">
                                <span>Collection Rate</span>
                                <span>{summary.total_invoiced ? ((summary.total_collected / summary.total_invoiced) * 100).toFixed(1) : 0}%</span>
                            </div>
                        </div>
                    </div>

                    <div className="mt-6 pt-6 border-t border-zinc-800 text-center text-zinc-500 text-sm">
                        {summary.invoice_count} Invoices Generated
                    </div>
                </div>
            </div>
        </div>
    );
}
