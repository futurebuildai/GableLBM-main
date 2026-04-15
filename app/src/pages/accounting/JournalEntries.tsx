import React, { useEffect, useState, useCallback } from 'react';
import { fetchJournalEntries, fetchAccounts, createJournalEntry, postJournalEntry, voidJournalEntry } from '../../services/GLService';
import type { JournalEntry, GLAccount, CreateJournalEntryRequest } from '../../types/gl';
import { Card, CardHeader, CardTitle, CardContent } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';
import { FileText, Plus, X, Check, Ban } from 'lucide-react';
import { useToast } from '../../components/ui/ToastContext';

const STATUS_COLORS: Record<string, string> = {
    DRAFT: 'bg-amber-500/20 text-amber-300',
    POSTED: 'bg-emerald-500/20 text-emerald-300',
    VOID: 'bg-red-500/20 text-red-300',
};

const SOURCE_COLORS: Record<string, string> = {
    MANUAL: 'bg-zinc-500/20 text-zinc-300',
    INVOICE: 'bg-blue-500/20 text-blue-300',
    PAYMENT: 'bg-green-500/20 text-green-300',
    ADJUSTMENT: 'bg-purple-500/20 text-purple-300',
    CLOSING: 'bg-rose-500/20 text-rose-300',
};

interface LineForm {
    account_id: string;
    description: string;
    debit: string;
    credit: string;
}

const JournalEntries: React.FC = () => {
    const { showToast } = useToast();
    const [entries, setEntries] = useState<JournalEntry[]>([]);
    const [accounts, setAccounts] = useState<GLAccount[]>([]);
    const [loading, setLoading] = useState(true);
    const [showCreate, setShowCreate] = useState(false);
    const [memo, setMemo] = useState('');
    const [entryDate, setEntryDate] = useState(new Date().toISOString().split('T')[0]);
    const [lines, setLines] = useState<LineForm[]>([
        { account_id: '', description: '', debit: '', credit: '' },
        { account_id: '', description: '', debit: '', credit: '' },
    ]);
    const [error, setError] = useState('');

    const load = useCallback(async () => {
        try {
            const [entryData, acctData] = await Promise.all([fetchJournalEntries(), fetchAccounts()]);
            setEntries(entryData || []);
            setAccounts(acctData || []);
        } catch (err) {
            console.error(err);
            showToast('Failed to load journal entries', 'error');
        } finally {
            setLoading(false);
        }
    }, [showToast]);

    useEffect(() => { load(); }, [load]);

    const totalDebit = lines.reduce((sum, l) => sum + (parseFloat(l.debit) || 0), 0);
    const totalCredit = lines.reduce((sum, l) => sum + (parseFloat(l.credit) || 0), 0);
    const isBalanced = Math.abs(totalDebit - totalCredit) < 0.005 && totalDebit > 0;

    const addLine = () => setLines([...lines, { account_id: '', description: '', debit: '', credit: '' }]);

    const removeLine = (idx: number) => {
        if (lines.length <= 2) return;
        setLines(lines.filter((_, i) => i !== idx));
    };

    const updateLine = (idx: number, field: keyof LineForm, value: string) => {
        const updated = [...lines];
        updated[idx] = { ...updated[idx], [field]: value };
        // If user enters debit, clear credit and vice versa
        if (field === 'debit' && value) updated[idx].credit = '';
        if (field === 'credit' && value) updated[idx].debit = '';
        setLines(updated);
    };

    const handleCreate = async () => {
        setError('');
        if (!isBalanced) {
            setError('Entry must be balanced (total debits = total credits)');
            return;
        }
        try {
            const req: CreateJournalEntryRequest = {
                entry_date: entryDate,
                memo,
                lines: lines.filter(l => l.account_id).map(l => ({
                    account_id: l.account_id,
                    description: l.description,
                    debit: parseFloat(l.debit) || 0,
                    credit: parseFloat(l.credit) || 0,
                })),
            };
            await createJournalEntry(req);
            setShowCreate(false);
            setMemo('');
            setLines([
                { account_id: '', description: '', debit: '', credit: '' },
                { account_id: '', description: '', debit: '', credit: '' },
            ]);
            load();
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Failed to create entry');
        }
    };

    const handlePost = async (id: string) => {
        try {
            await postJournalEntry(id);
            load();
        } catch (err) {
            showToast(err instanceof Error ? err.message : 'Failed to post journal entry', 'error');
        }
    };

    const handleVoid = async (id: string) => {
        try {
            await voidJournalEntry(id);
            load();
        } catch (err) {
            showToast(err instanceof Error ? err.message : 'Failed to void journal entry', 'error');
        }
    };

    const formatCents = (cents: number) => `$${(cents / 100).toLocaleString('en-US', { minimumFractionDigits: 2 })}`;

    if (loading) return <div className="p-8 text-center text-zinc-400">Loading journal entries...</div>;

    return (
        <div className="p-6 max-w-[1600px] mx-auto space-y-6 animate-in fade-in duration-500">
            <div className="flex justify-between items-center">
                <div>
                    <h1 className="text-2xl font-bold bg-gradient-to-r from-white to-zinc-400 bg-clip-text text-transparent">
                        Journal Entries
                    </h1>
                    <p className="text-zinc-400 mt-1">
                        {entries.length} entries — Double-entry accounting ledger
                    </p>
                </div>
                <Button
                    variant="default"
                    className="bg-emerald-600 hover:bg-emerald-500"
                    onClick={() => setShowCreate(true)}
                >
                    <Plus className="w-4 h-4 mr-2" />
                    New Entry
                </Button>
            </div>

            {/* Create Entry Form */}
            {showCreate && (
                <Card variant="glass" className="border-emerald-500/30">
                    <CardHeader className="pb-2">
                        <div className="flex justify-between items-center">
                            <CardTitle className="text-lg text-white">New Journal Entry</CardTitle>
                            <button onClick={() => setShowCreate(false)} className="text-zinc-400 hover:text-white">
                                <X className="w-5 h-5" />
                            </button>
                        </div>
                    </CardHeader>
                    <CardContent className="space-y-4">
                        {error && <div className="text-red-400 text-sm bg-red-500/10 p-2 rounded">{error}</div>}
                        <div className="grid grid-cols-2 gap-4">
                            <div>
                                <label className="text-xs text-zinc-500 block mb-1">Date</label>
                                <input
                                    type="date"
                                    className="w-full bg-zinc-800 border border-zinc-700 rounded px-3 py-2 text-white text-sm focus:border-emerald-500 outline-none"
                                    value={entryDate}
                                    onChange={e => setEntryDate(e.target.value)}
                                />
                            </div>
                            <div>
                                <label className="text-xs text-zinc-500 block mb-1">Memo</label>
                                <input
                                    className="w-full bg-zinc-800 border border-zinc-700 rounded px-3 py-2 text-white text-sm focus:border-emerald-500 outline-none"
                                    value={memo}
                                    onChange={e => setMemo(e.target.value)}
                                    placeholder="Entry description..."
                                />
                            </div>
                        </div>

                        {/* Line Items */}
                        <div className="space-y-2">
                            <div className="grid grid-cols-[2fr_2fr_1fr_1fr_auto] gap-2 text-xs text-zinc-500 px-1">
                                <span>Account</span>
                                <span>Description</span>
                                <span>Debit ($)</span>
                                <span>Credit ($)</span>
                                <span className="w-8"></span>
                            </div>
                            {lines.map((line, i) => (
                                <div key={i} className="grid grid-cols-[2fr_2fr_1fr_1fr_auto] gap-2">
                                    <select
                                        className="bg-zinc-800 border border-zinc-700 rounded px-2 py-2 text-white text-sm focus:border-emerald-500 outline-none"
                                        value={line.account_id}
                                        onChange={e => updateLine(i, 'account_id', e.target.value)}
                                    >
                                        <option value="">Select account...</option>
                                        {accounts.map(a => <option key={a.id} value={a.id}>{a.code} — {a.name}</option>)}
                                    </select>
                                    <input
                                        className="bg-zinc-800 border border-zinc-700 rounded px-2 py-2 text-white text-sm focus:border-emerald-500 outline-none"
                                        value={line.description}
                                        onChange={e => updateLine(i, 'description', e.target.value)}
                                        placeholder="Description"
                                    />
                                    <input
                                        className="bg-zinc-800 border border-zinc-700 rounded px-2 py-2 text-white text-sm focus:border-emerald-500 outline-none font-mono text-right"
                                        value={line.debit}
                                        onChange={e => updateLine(i, 'debit', e.target.value)}
                                        placeholder="0.00"
                                        type="number"
                                        step="0.01"
                                        min="0"
                                    />
                                    <input
                                        className="bg-zinc-800 border border-zinc-700 rounded px-2 py-2 text-white text-sm focus:border-emerald-500 outline-none font-mono text-right"
                                        value={line.credit}
                                        onChange={e => updateLine(i, 'credit', e.target.value)}
                                        placeholder="0.00"
                                        type="number"
                                        step="0.01"
                                        min="0"
                                    />
                                    <button
                                        onClick={() => removeLine(i)}
                                        className="w-8 h-9 flex items-center justify-center text-zinc-500 hover:text-red-400"
                                        disabled={lines.length <= 2}
                                    >
                                        <X className="w-4 h-4" />
                                    </button>
                                </div>
                            ))}
                        </div>

                        <div className="flex justify-between items-center">
                            <Button variant="ghost" size="sm" onClick={addLine}>
                                <Plus className="w-3 h-3 mr-1" /> Add Line
                            </Button>
                            <div className={`text-sm font-mono px-3 py-1 rounded ${isBalanced ? 'bg-emerald-500/10 text-emerald-400' : 'bg-red-500/10 text-red-400'}`}>
                                DR: ${totalDebit.toFixed(2)} | CR: ${totalCredit.toFixed(2)}
                                {isBalanced ? ' ✓' : ' ✗ Unbalanced'}
                            </div>
                        </div>

                        <div className="flex justify-end gap-2 pt-2">
                            <Button variant="ghost" onClick={() => setShowCreate(false)}>Cancel</Button>
                            <Button
                                variant="default"
                                className="bg-emerald-600 hover:bg-emerald-500"
                                onClick={handleCreate}
                                disabled={!isBalanced}
                            >
                                Create Entry (Draft)
                            </Button>
                        </div>
                    </CardContent>
                </Card>
            )}

            {/* Entries Table */}
            <Card variant="glass" className="overflow-hidden">
                <CardContent className="p-0">
                    <table className="w-full text-sm">
                        <thead>
                            <tr className="border-b border-white/5 text-zinc-500">
                                <th className="text-left px-4 py-3 font-medium w-16">#</th>
                                <th className="text-left px-4 py-3 font-medium w-28">Date</th>
                                <th className="text-left px-4 py-3 font-medium">Memo</th>
                                <th className="text-left px-4 py-3 font-medium w-28">Source</th>
                                <th className="text-left px-4 py-3 font-medium w-24">Status</th>
                                <th className="text-right px-4 py-3 font-medium w-28">Total</th>
                                <th className="text-right px-4 py-3 font-medium w-32">Actions</th>
                            </tr>
                        </thead>
                        <tbody>
                            {entries.map(e => (
                                <tr key={e.id} className="border-b border-white/5 hover:bg-white/[0.02] transition-colors">
                                    <td className="px-4 py-2.5 font-mono text-zinc-400">JE-{e.entry_number}</td>
                                    <td className="px-4 py-2.5 text-zinc-300">
                                        {new Date(e.entry_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                                    </td>
                                    <td className="px-4 py-2.5 text-white truncate max-w-xs">{e.memo || '—'}</td>
                                    <td className="px-4 py-2.5">
                                        <span className={`text-xs px-2 py-0.5 rounded font-medium ${SOURCE_COLORS[e.source] || 'bg-zinc-500/20 text-zinc-300'}`}>
                                            {e.source}
                                        </span>
                                    </td>
                                    <td className="px-4 py-2.5">
                                        <span className={`text-xs px-2 py-0.5 rounded font-bold ${STATUS_COLORS[e.status]}`}>
                                            {e.status}
                                        </span>
                                    </td>
                                    <td className="px-4 py-2.5 text-right font-mono text-zinc-200">
                                        {formatCents(e.total_debit)}
                                    </td>
                                    <td className="px-4 py-2.5 text-right space-x-1">
                                        {e.status === 'DRAFT' && (
                                            <Button size="sm" variant="ghost" className="h-7 text-xs text-emerald-400 hover:bg-emerald-500/10" onClick={() => handlePost(e.id)}>
                                                <Check className="w-3 h-3 mr-1" /> Post
                                            </Button>
                                        )}
                                        {e.status === 'POSTED' && (
                                            <Button size="sm" variant="ghost" className="h-7 text-xs text-red-400 hover:bg-red-500/10" onClick={() => handleVoid(e.id)}>
                                                <Ban className="w-3 h-3 mr-1" /> Void
                                            </Button>
                                        )}
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </CardContent>
            </Card>

            {entries.length === 0 && !showCreate && (
                <div className="text-center py-20 bg-zinc-900/50 rounded-lg border border-zinc-800 border-dashed">
                    <FileText className="w-12 h-12 text-zinc-600 mx-auto mb-4" />
                    <h3 className="text-lg font-medium text-white">No Journal Entries</h3>
                    <p className="text-zinc-400 mt-2 max-w-sm mx-auto">
                        Create your first journal entry or process an invoice/payment to auto-generate entries.
                    </p>
                </div>
            )}
        </div>
    );
};

export { JournalEntries };
export default JournalEntries;
