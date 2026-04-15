import React, { useEffect, useState, useCallback } from 'react';
import { fetchAccounts, createAccount } from '../../services/GLService';
import type { GLAccount, CreateAccountRequest } from '../../types/gl';
import { Card, CardHeader, CardTitle, CardContent } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';
import { BookOpen, Plus, X } from 'lucide-react';
import { useToast } from '../../components/ui/ToastContext';

const ACCOUNT_TYPE_COLORS: Record<string, string> = {
    ASSET: 'bg-blue-500/20 text-blue-300',
    LIABILITY: 'bg-red-500/20 text-red-300',
    EQUITY: 'bg-purple-500/20 text-purple-300',
    REVENUE: 'bg-emerald-500/20 text-emerald-300',
    EXPENSE: 'bg-amber-500/20 text-amber-300',
};

const ACCOUNT_TYPES = ['ASSET', 'LIABILITY', 'EQUITY', 'REVENUE', 'EXPENSE'];

const ChartOfAccounts: React.FC = () => {
    const { showToast } = useToast();
    const [accounts, setAccounts] = useState<GLAccount[]>([]);
    const [loading, setLoading] = useState(true);
    const [showCreate, setShowCreate] = useState(false);
    const [form, setForm] = useState<CreateAccountRequest>({
        code: '', name: '', type: 'ASSET', subtype: '', normal_balance: 'DEBIT', description: '',
    });
    const [error, setError] = useState('');

    const load = useCallback(async () => {
        try {
            const data = await fetchAccounts();
            setAccounts(data || []);
        } catch (err) {
            console.error(err);
            showToast('Failed to load chart of accounts', 'error');
        } finally {
            setLoading(false);
        }
    }, [showToast]);

    useEffect(() => { load(); }, [load]);

    const handleCreate = async () => {
        setError('');
        try {
            await createAccount(form);
            setShowCreate(false);
            setForm({ code: '', name: '', type: 'ASSET', subtype: '', normal_balance: 'DEBIT', description: '' });
            load();
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Failed to create account');
        }
    };

    const formatBalance = (balanceCents: number) => {
        const dollars = Math.abs(balanceCents) / 100;
        const sign = balanceCents < 0 ? '-' : '';
        return `${sign}$${dollars.toLocaleString('en-US', { minimumFractionDigits: 2 })}`;
    };

    const groupedAccounts = ACCOUNT_TYPES.reduce((acc, type) => {
        acc[type] = accounts.filter(a => a.type === type);
        return acc;
    }, {} as Record<string, GLAccount[]>);

    if (loading) return <div className="p-8 text-center text-zinc-400">Loading chart of accounts...</div>;

    return (
        <div className="p-6 max-w-[1600px] mx-auto space-y-6 animate-in fade-in duration-500">
            <div className="flex justify-between items-center">
                <div>
                    <h1 className="text-2xl font-bold bg-gradient-to-r from-white to-zinc-400 bg-clip-text text-transparent">
                        Chart of Accounts
                    </h1>
                    <p className="text-zinc-400 mt-1">
                        {accounts.length} accounts across {ACCOUNT_TYPES.length} categories
                    </p>
                </div>
                <Button
                    variant="default"
                    className="bg-emerald-600 hover:bg-emerald-500"
                    onClick={() => setShowCreate(true)}
                >
                    <Plus className="w-4 h-4 mr-2" />
                    New Account
                </Button>
            </div>

            {/* Create Account Modal */}
            {showCreate && (
                <Card variant="glass" className="border-emerald-500/30">
                    <CardHeader className="pb-2">
                        <div className="flex justify-between items-center">
                            <CardTitle className="text-lg text-white">Create New Account</CardTitle>
                            <button onClick={() => setShowCreate(false)} className="text-zinc-400 hover:text-white">
                                <X className="w-5 h-5" />
                            </button>
                        </div>
                    </CardHeader>
                    <CardContent className="space-y-4">
                        {error && <div className="text-red-400 text-sm bg-red-500/10 p-2 rounded">{error}</div>}
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                            <div>
                                <label className="text-xs text-zinc-500 block mb-1">Code</label>
                                <input
                                    className="w-full bg-zinc-800 border border-zinc-700 rounded px-3 py-2 text-white text-sm focus:border-emerald-500 outline-none"
                                    value={form.code}
                                    onChange={e => setForm({ ...form, code: e.target.value })}
                                    placeholder="e.g. 1060"
                                />
                            </div>
                            <div>
                                <label className="text-xs text-zinc-500 block mb-1">Name</label>
                                <input
                                    className="w-full bg-zinc-800 border border-zinc-700 rounded px-3 py-2 text-white text-sm focus:border-emerald-500 outline-none"
                                    value={form.name}
                                    onChange={e => setForm({ ...form, name: e.target.value })}
                                    placeholder="e.g. Other Receivables"
                                />
                            </div>
                            <div>
                                <label className="text-xs text-zinc-500 block mb-1">Type</label>
                                <select
                                    className="w-full bg-zinc-800 border border-zinc-700 rounded px-3 py-2 text-white text-sm focus:border-emerald-500 outline-none"
                                    value={form.type}
                                    onChange={e => setForm({
                                        ...form,
                                        type: e.target.value,
                                        normal_balance: ['ASSET', 'EXPENSE'].includes(e.target.value) ? 'DEBIT' : 'CREDIT',
                                    })}
                                >
                                    {ACCOUNT_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                                </select>
                            </div>
                            <div>
                                <label className="text-xs text-zinc-500 block mb-1">Subtype</label>
                                <input
                                    className="w-full bg-zinc-800 border border-zinc-700 rounded px-3 py-2 text-white text-sm focus:border-emerald-500 outline-none"
                                    value={form.subtype}
                                    onChange={e => setForm({ ...form, subtype: e.target.value })}
                                    placeholder="e.g. Current Asset"
                                />
                            </div>
                        </div>
                        <div>
                            <label className="text-xs text-zinc-500 block mb-1">Description</label>
                            <input
                                className="w-full bg-zinc-800 border border-zinc-700 rounded px-3 py-2 text-white text-sm focus:border-emerald-500 outline-none"
                                value={form.description}
                                onChange={e => setForm({ ...form, description: e.target.value })}
                                placeholder="Brief description..."
                            />
                        </div>
                        <div className="flex justify-end gap-2 pt-2">
                            <Button variant="ghost" onClick={() => setShowCreate(false)}>Cancel</Button>
                            <Button variant="default" className="bg-emerald-600 hover:bg-emerald-500" onClick={handleCreate}>
                                Create Account
                            </Button>
                        </div>
                    </CardContent>
                </Card>
            )}

            {/* Grouped Account Tables */}
            {ACCOUNT_TYPES.map(type => {
                const accts = groupedAccounts[type];
                if (!accts || accts.length === 0) return null;
                return (
                    <Card key={type} variant="glass" className="overflow-hidden">
                        <CardHeader className="pb-2">
                            <div className="flex items-center gap-2">
                                <span className={`px-2 py-0.5 rounded text-xs font-bold ${ACCOUNT_TYPE_COLORS[type]}`}>
                                    {type}
                                </span>
                                <CardTitle className="text-sm text-zinc-400">{accts.length} accounts</CardTitle>
                            </div>
                        </CardHeader>
                        <CardContent className="p-0">
                            <table className="w-full text-sm">
                                <thead>
                                    <tr className="border-b border-white/5 text-zinc-500">
                                        <th className="text-left px-4 py-2 font-medium w-24">Code</th>
                                        <th className="text-left px-4 py-2 font-medium">Name</th>
                                        <th className="text-left px-4 py-2 font-medium">Subtype</th>
                                        <th className="text-left px-4 py-2 font-medium w-24">Normal</th>
                                        <th className="text-right px-4 py-2 font-medium w-32">Balance</th>
                                        <th className="text-center px-4 py-2 font-medium w-20">Active</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {accts.map(a => (
                                        <tr key={a.id} className="border-b border-white/5 hover:bg-white/[0.02] transition-colors">
                                            <td className="px-4 py-2.5 font-mono text-emerald-400">{a.code}</td>
                                            <td className="px-4 py-2.5 text-white">{a.name}</td>
                                            <td className="px-4 py-2.5 text-zinc-400">{a.subtype || '—'}</td>
                                            <td className="px-4 py-2.5">
                                                <span className={`text-xs px-1.5 py-0.5 rounded ${a.normal_balance === 'DEBIT' ? 'bg-blue-500/10 text-blue-400' : 'bg-rose-500/10 text-rose-400'}`}>
                                                    {a.normal_balance}
                                                </span>
                                            </td>
                                            <td className={`px-4 py-2.5 text-right font-mono ${a.balance >= 0 ? 'text-zinc-200' : 'text-red-400'}`}>
                                                {formatBalance(a.balance)}
                                            </td>
                                            <td className="px-4 py-2.5 text-center">
                                                <span className={`inline-block w-2 h-2 rounded-full ${a.is_active ? 'bg-emerald-400' : 'bg-zinc-600'}`} />
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </CardContent>
                    </Card>
                );
            })}

            {accounts.length === 0 && (
                <div className="text-center py-20 bg-zinc-900/50 rounded-lg border border-zinc-800 border-dashed">
                    <BookOpen className="w-12 h-12 text-zinc-600 mx-auto mb-4" />
                    <h3 className="text-lg font-medium text-white">No Accounts Found</h3>
                    <p className="text-zinc-400 mt-2 max-w-sm mx-auto">
                        Run the database migration to seed the standard LBM chart of accounts.
                    </p>
                </div>
            )}
        </div>
    );
};

export { ChartOfAccounts };
export default ChartOfAccounts;
