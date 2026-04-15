import { useState, useEffect } from 'react';
import { PageTransition } from '../../components/ui/PageTransition';
import { Card, CardContent } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';
import { Plus, Percent, Check, AlertCircle } from 'lucide-react';
import { useToast } from '../../components/ui/ToastContext';
import { RebateService } from '../../services/rebate.service';
import type { RebateProgram, RebateTier } from '../../types/rebate';

export function RebatePrograms() {
    const { showToast } = useToast();
    const [programs, setPrograms] = useState<RebateProgram[]>([]);
    const [loading, setLoading] = useState(true);

    const [isCreating, setIsCreating] = useState(false);
    const [newProgram, setNewProgram] = useState<Partial<RebateProgram>>({
        program_type: 'VOLUME',
        is_active: true
    });
    const [newTiers, setNewTiers] = useState<Partial<RebateTier>[]>([{ min_volume: 0, max_volume: 100000, rebate_pct: 0.02 }]);

    useEffect(() => {
        loadPrograms();
    }, []);

    const loadPrograms = async () => {
        setLoading(true);
        try {
            const data = await RebateService.listPrograms();
            setPrograms(data);
        } catch (err) {
            console.error(err);
            showToast('Failed to load rebate programs', 'error');
        } finally {
            setLoading(false);
        }
    };

    const handleCreate = async () => {
        if (!newProgram.vendor_id || !newProgram.name || !newProgram.start_date || !newProgram.end_date) {
            showToast('Please fill out all program details', 'error');
            return;
        }

        try {
            await RebateService.createProgram(newProgram as RebateProgram, newTiers as RebateTier[]);
            showToast('Rebate program created', 'success');
            setIsCreating(false);
            setNewProgram({ program_type: 'VOLUME', is_active: true });
            setNewTiers([{ min_volume: 0, max_volume: 100000, rebate_pct: 0.02 }]);
            loadPrograms();
        } catch (err) {
            console.error(err);
            showToast('Failed to create rebate program', 'error');
        }
    };

    const addTier = () => {
        const lastTier = newTiers[newTiers.length - 1];
        setNewTiers([...newTiers, {
            min_volume: lastTier ? Number(lastTier.max_volume) + 1 : 0,
            max_volume: null,
            rebate_pct: lastTier ? lastTier.rebate_pct! + 0.01 : 0.02
        }]);
    };

    const updateTier = (idx: number, field: keyof RebateTier, value: number | string | null) => {
        const tiers = [...newTiers];
        tiers[idx] = { ...tiers[idx], [field]: value };
        setNewTiers(tiers);
    };

    return (
        <PageTransition>
            <div className="flex justify-between items-center mb-6">
                <div>
                    <h1 className="text-2xl font-bold text-white">Vendor Rebate Programs</h1>
                    <p className="text-zinc-400">Manage volume and growth-based vendor incentive programs</p>
                </div>
                <Button onClick={() => setIsCreating(!isCreating)} className="shadow-glow gap-2" variant={isCreating ? "secondary" : "default"}>
                    {isCreating ? 'Cancel' : <><Plus className="w-4 h-4" /> New Program</>}
                </Button>
            </div>

            {isCreating && (
                <Card variant="glass" className="mb-8 border-[#00FFA3]/30">
                    <CardContent className="p-6">
                        <h2 className="text-lg font-semibold text-white mb-4">Create New Rebate Program</h2>

                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
                            <div>
                                <label className="block text-xs text-zinc-400 mb-1">Vendor ID</label>
                                <input
                                    type="text"
                                    className="w-full bg-black/40 border border-white/10 rounded px-3 py-2 text-white text-sm focus:border-[#00FFA3] focus:outline-none"
                                    value={newProgram.vendor_id || ''}
                                    onChange={e => setNewProgram({ ...newProgram, vendor_id: e.target.value })}
                                    placeholder="UUID"
                                />
                            </div>
                            <div>
                                <label className="block text-xs text-zinc-400 mb-1">Program Name</label>
                                <input
                                    type="text"
                                    className="w-full bg-black/40 border border-white/10 rounded px-3 py-2 text-white text-sm focus:border-[#00FFA3] focus:outline-none"
                                    value={newProgram.name || ''}
                                    onChange={e => setNewProgram({ ...newProgram, name: e.target.value })}
                                    placeholder="e.g. 2028 Simpson Strong-Tie Volume"
                                />
                            </div>
                            <div>
                                <label className="block text-xs text-zinc-400 mb-1">Start Date</label>
                                <input
                                    type="date"
                                    className="w-full bg-black/40 border border-white/10 rounded px-3 py-2 text-white text-sm focus:border-[#00FFA3] focus:outline-none [color-scheme:dark]"
                                    value={newProgram.start_date || ''}
                                    onChange={e => setNewProgram({ ...newProgram, start_date: e.target.value })}
                                />
                            </div>
                            <div>
                                <label className="block text-xs text-zinc-400 mb-1">End Date</label>
                                <input
                                    type="date"
                                    className="w-full bg-black/40 border border-white/10 rounded px-3 py-2 text-white text-sm focus:border-[#00FFA3] focus:outline-none [color-scheme:dark]"
                                    value={newProgram.end_date || ''}
                                    onChange={e => setNewProgram({ ...newProgram, end_date: e.target.value })}
                                />
                            </div>
                        </div>

                        <div className="mb-6">
                            <div className="flex justify-between items-center mb-2">
                                <label className="block text-sm font-medium text-white mb-1">Volume Tiers</label>
                                <button onClick={addTier} className="text-xs text-[#00FFA3] hover:text-white transition-colors flex items-center gap-1">
                                    <Plus className="w-3 h-3" /> Add Tier
                                </button>
                            </div>

                            <div className="bg-black/20 rounded-lg p-1 border border-white/5">
                                {newTiers.map((tier, idx) => (
                                    <div key={idx} className="flex gap-2 p-2 items-end">
                                        <div className="flex-1">
                                            <span className="text-xs text-zinc-500 block mb-1">Min Volume ($)</span>
                                            <input
                                                type="number"
                                                className="w-full bg-[#0A0B10] border border-white/10 rounded px-2 py-1.5 text-white font-mono text-sm focus:border-[#00FFA3] outline-none"
                                                value={tier.min_volume || 0}
                                                onChange={e => updateTier(idx, 'min_volume', Number(e.target.value))}
                                            />
                                        </div>
                                        <div className="flex-1">
                                            <span className="text-xs text-zinc-500 block mb-1">Max Volume ($)</span>
                                            <input
                                                type="number"
                                                className="w-full bg-[#0A0B10] border border-white/10 rounded px-2 py-1.5 text-white font-mono text-sm focus:border-[#00FFA3] outline-none"
                                                value={tier.max_volume || ''}
                                                placeholder="No limit"
                                                onChange={e => updateTier(idx, 'max_volume', e.target.value ? Number(e.target.value) : null)}
                                            />
                                        </div>
                                        <div className="w-32">
                                            <span className="text-xs text-zinc-500 block mb-1">Rebate %</span>
                                            <div className="relative">
                                                <input
                                                    type="number"
                                                    step="0.001"
                                                    className="w-full bg-[#0A0B10] border border-white/10 rounded pl-8 pr-2 py-1.5 text-white font-mono text-sm focus:border-[#00FFA3] outline-none"
                                                    value={tier.rebate_pct || 0}
                                                    onChange={e => updateTier(idx, 'rebate_pct', Number(e.target.value))}
                                                />
                                                <Percent className="w-4 h-4 text-zinc-500 absolute left-2.5 top-2" />
                                            </div>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>

                        <div className="flex justify-end gap-3">
                            <Button variant="ghost" onClick={() => setIsCreating(false)}>Cancel</Button>
                            <Button onClick={handleCreate} className="gap-2">
                                <Check className="w-4 h-4" /> Save Program
                            </Button>
                        </div>
                    </CardContent>
                </Card>
            )}

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {loading ? (
                    <div className="col-span-full py-12 text-center text-zinc-500">Loading programs...</div>
                ) : programs.length === 0 ? (
                    <div className="col-span-full py-20 text-center">
                        <AlertCircle className="w-12 h-12 text-zinc-600 mx-auto mb-4" />
                        <h3 className="text-lg font-medium text-white mb-2">No Rebate Programs</h3>
                        <p className="text-zinc-400 mb-6">Create your first vendor rebate program to start tracking incentives.</p>
                        <Button onClick={() => setIsCreating(true)}>Create Program</Button>
                    </div>
                ) : (
                    programs.map(prog => (
                        <Card key={prog.id} variant="glass" className="hover:border-white/20 transition-all">
                            <CardContent className="p-6 relative">
                                {prog.is_active ? (
                                    <div className="absolute top-4 right-4 w-2 h-2 rounded-full bg-[#00FFA3] shadow-[0_0_8px_rgba(0,255,163,0.8)]" title="Active" />
                                ) : (
                                    <div className="absolute top-4 right-4 w-2 h-2 rounded-full bg-zinc-600" title="Inactive" />
                                )}

                                <div className="text-xs text-[#00FFA3] font-mono mb-2 bg-[#00FFA3]/10 inline-block px-2 py-0.5 rounded">
                                    {prog.program_type}
                                </div>
                                <h3 className="text-lg font-bold text-white mb-1 truncate" title={prog.name}>{prog.name}</h3>
                                <p className="text-sm text-zinc-400 font-mono mb-4 text-xs truncate">Vendor: {prog.vendor_id}</p>

                                <div className="grid grid-cols-2 gap-4 mb-4 text-sm bg-black/20 p-3 rounded border border-white/5">
                                    <div>
                                        <div className="text-zinc-500 text-xs mb-1">Period Start</div>
                                        <div className="text-white font-mono">{new Date(prog.start_date).toLocaleDateString()}</div>
                                    </div>
                                    <div>
                                        <div className="text-zinc-500 text-xs mb-1">Period End</div>
                                        <div className="text-white font-mono">{new Date(prog.end_date).toLocaleDateString()}</div>
                                    </div>
                                </div>

                                {prog.tiers && prog.tiers.length > 0 && (
                                    <div>
                                        <div className="text-xs font-semibold text-zinc-400 uppercase tracking-wider mb-2">Tiers ({prog.tiers.length})</div>
                                        <div className="space-y-1">
                                            {prog.tiers.slice(0, 3).map((tier, i) => (
                                                <div key={i} className="flex justify-between text-xs font-mono">
                                                    <span className="text-zinc-400">
                                                        ${tier.min_volume.toLocaleString()} - {tier.max_volume ? `$${tier.max_volume.toLocaleString()}` : 'MAX'}
                                                    </span>
                                                    <span className="text-[#00FFA3]">{(tier.rebate_pct * 100).toFixed(1)}%</span>
                                                </div>
                                            ))}
                                            {prog.tiers.length > 3 && (
                                                <div className="text-xs text-zinc-500 mt-1 italic">+ {prog.tiers.length - 3} more tiers</div>
                                            )}
                                        </div>
                                    </div>
                                )}
                            </CardContent>
                        </Card>
                    ))
                )}
            </div>
        </PageTransition>
    );
}
