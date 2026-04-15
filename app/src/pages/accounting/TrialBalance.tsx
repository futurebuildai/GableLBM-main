import React, { useEffect, useState, useCallback } from 'react';
import { fetchTrialBalance } from '../../services/GLService';
import type { TrialBalanceRow } from '../../types/gl';
import { Card, CardContent } from '../../components/ui/Card';
import { BarChart3 } from 'lucide-react';
import { useToast } from '../../components/ui/ToastContext';

const TYPE_ORDER = ['ASSET', 'LIABILITY', 'EQUITY', 'REVENUE', 'EXPENSE'];
const TYPE_LABELS: Record<string, string> = {
    ASSET: 'Assets',
    LIABILITY: 'Liabilities',
    EQUITY: 'Equity',
    REVENUE: 'Revenue',
    EXPENSE: 'Expenses',
};
const TYPE_COLORS: Record<string, string> = {
    ASSET: 'text-blue-400',
    LIABILITY: 'text-red-400',
    EQUITY: 'text-purple-400',
    REVENUE: 'text-emerald-400',
    EXPENSE: 'text-amber-400',
};

const TrialBalance: React.FC = () => {
    const { showToast } = useToast();
    const [rows, setRows] = useState<TrialBalanceRow[]>([]);
    const [loading, setLoading] = useState(true);
    const [asOfDate, setAsOfDate] = useState(new Date().toISOString().split('T')[0]);

    const load = useCallback(async () => {
        setLoading(true);
        try {
            const data = await fetchTrialBalance(asOfDate);
            setRows(data || []);
        } catch (err) {
            console.error(err);
            showToast('Failed to load trial balance', 'error');
        } finally {
            setLoading(false);
        }
    }, [asOfDate, showToast]);

    useEffect(() => { load(); }, [load]);

    const formatCents = (cents: number) => {
        if (cents === 0) return '—';
        return `$${(cents / 100).toLocaleString('en-US', { minimumFractionDigits: 2 })}`;
    };

    const totalDebit = rows.reduce((sum, r) => sum + r.debit, 0);
    const totalCredit = rows.reduce((sum, r) => sum + r.credit, 0);
    const isBalanced = totalDebit === totalCredit;

    const groupedRows = TYPE_ORDER.reduce((acc, type) => {
        acc[type] = rows.filter(r => r.account_type === type);
        return acc;
    }, {} as Record<string, TrialBalanceRow[]>);

    return (
        <div className="p-6 max-w-[1200px] mx-auto space-y-6 animate-in fade-in duration-500">
            <div className="flex justify-between items-center">
                <div>
                    <h1 className="text-2xl font-bold bg-gradient-to-r from-white to-zinc-400 bg-clip-text text-transparent">
                        Trial Balance
                    </h1>
                    <p className="text-zinc-400 mt-1">
                        Summary of all posted GL account balances
                    </p>
                </div>
                <div className="flex items-center gap-3">
                    <label className="text-sm text-zinc-400">As of:</label>
                    <input
                        type="date"
                        className="bg-zinc-800 border border-zinc-700 rounded px-3 py-2 text-white text-sm focus:border-emerald-500 outline-none"
                        value={asOfDate}
                        onChange={e => setAsOfDate(e.target.value)}
                    />
                </div>
            </div>

            {/* Balance Summary Cards */}
            <div className="grid grid-cols-3 gap-4">
                <Card variant="glass" className="text-center">
                    <CardContent className="py-4">
                        <p className="text-xs text-zinc-500 uppercase tracking-wider mb-1">Total Debits</p>
                        <p className="text-2xl font-bold font-mono text-blue-400">{formatCents(totalDebit)}</p>
                    </CardContent>
                </Card>
                <Card variant="glass" className="text-center">
                    <CardContent className="py-4">
                        <p className="text-xs text-zinc-500 uppercase tracking-wider mb-1">Total Credits</p>
                        <p className="text-2xl font-bold font-mono text-rose-400">{formatCents(totalCredit)}</p>
                    </CardContent>
                </Card>
                <Card variant="glass" className={`text-center border ${isBalanced ? 'border-emerald-500/30' : 'border-red-500/30'}`}>
                    <CardContent className="py-4">
                        <p className="text-xs text-zinc-500 uppercase tracking-wider mb-1">Status</p>
                        <p className={`text-2xl font-bold ${isBalanced ? 'text-emerald-400' : 'text-red-400'}`}>
                            {isBalanced ? '✓ Balanced' : '✗ Out of Balance'}
                        </p>
                        {!isBalanced && (
                            <p className="text-xs text-red-400/70 mt-1 font-mono">
                                Diff: {formatCents(Math.abs(totalDebit - totalCredit))}
                            </p>
                        )}
                    </CardContent>
                </Card>
            </div>

            {/* Trial Balance Table */}
            {loading ? (
                <div className="p-8 text-center text-zinc-400">Loading trial balance...</div>
            ) : rows.length === 0 ? (
                <div className="text-center py-20 bg-zinc-900/50 rounded-lg border border-zinc-800 border-dashed">
                    <BarChart3 className="w-12 h-12 text-zinc-600 mx-auto mb-4" />
                    <h3 className="text-lg font-medium text-white">No Journal Activity</h3>
                    <p className="text-zinc-400 mt-2 max-w-sm mx-auto">
                        Post journal entries to see balances in the trial balance report.
                    </p>
                </div>
            ) : (
                <Card variant="glass" className="overflow-hidden">
                    <CardContent className="p-0">
                        <table className="w-full text-sm">
                            <thead>
                                <tr className="border-b border-white/10 text-zinc-400">
                                    <th className="text-left px-4 py-3 font-medium w-24">Code</th>
                                    <th className="text-left px-4 py-3 font-medium">Account</th>
                                    <th className="text-right px-4 py-3 font-medium w-40">Debit</th>
                                    <th className="text-right px-4 py-3 font-medium w-40">Credit</th>
                                </tr>
                            </thead>
                            <tbody>
                                {TYPE_ORDER.map(type => {
                                    const typeRows = groupedRows[type];
                                    if (!typeRows || typeRows.length === 0) return null;
                                    const typeDebit = typeRows.reduce((s, r) => s + r.debit, 0);
                                    const typeCredit = typeRows.reduce((s, r) => s + r.credit, 0);
                                    return (
                                        <React.Fragment key={type}>
                                            <tr className="bg-white/[0.02]">
                                                <td colSpan={4} className={`px-4 py-2 font-bold text-xs uppercase tracking-wider ${TYPE_COLORS[type]}`}>
                                                    {TYPE_LABELS[type]}
                                                </td>
                                            </tr>
                                            {typeRows.map(row => (
                                                <tr key={row.account_id} className="border-b border-white/5 hover:bg-white/[0.02] transition-colors">
                                                    <td className="px-4 py-2.5 font-mono text-emerald-400 pl-8">{row.account_code}</td>
                                                    <td className="px-4 py-2.5 text-white">{row.account_name}</td>
                                                    <td className="px-4 py-2.5 text-right font-mono text-zinc-200">{row.debit > 0 ? formatCents(row.debit) : '—'}</td>
                                                    <td className="px-4 py-2.5 text-right font-mono text-zinc-200">{row.credit > 0 ? formatCents(row.credit) : '—'}</td>
                                                </tr>
                                            ))}
                                            <tr className="border-b border-white/10">
                                                <td colSpan={2} className="px-4 py-1.5 text-xs text-zinc-500 text-right">
                                                    Subtotal {TYPE_LABELS[type]}:
                                                </td>
                                                <td className="px-4 py-1.5 text-right font-mono text-xs text-zinc-400 border-t border-white/5">
                                                    {typeDebit > 0 ? formatCents(typeDebit) : '—'}
                                                </td>
                                                <td className="px-4 py-1.5 text-right font-mono text-xs text-zinc-400 border-t border-white/5">
                                                    {typeCredit > 0 ? formatCents(typeCredit) : '—'}
                                                </td>
                                            </tr>
                                        </React.Fragment>
                                    );
                                })}
                                {/* Grand Total */}
                                <tr className={`font-bold ${isBalanced ? 'bg-emerald-500/5' : 'bg-red-500/5'}`}>
                                    <td colSpan={2} className="px-4 py-3 text-right text-white uppercase text-xs tracking-wider">
                                        Total
                                    </td>
                                    <td className={`px-4 py-3 text-right font-mono text-lg ${isBalanced ? 'text-emerald-400' : 'text-red-400'}`}>
                                        {formatCents(totalDebit)}
                                    </td>
                                    <td className={`px-4 py-3 text-right font-mono text-lg ${isBalanced ? 'text-emerald-400' : 'text-red-400'}`}>
                                        {formatCents(totalCredit)}
                                    </td>
                                </tr>
                            </tbody>
                        </table>
                    </CardContent>
                </Card>
            )}
        </div>
    );
};

export { TrialBalance };
export default TrialBalance;
