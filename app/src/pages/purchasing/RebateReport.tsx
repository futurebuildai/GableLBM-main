import { useState, useEffect } from 'react';
import { PageTransition } from '../../components/ui/PageTransition';
import { Card, CardContent } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';
import { Calculator, DollarSign, Download, ArrowRight } from 'lucide-react';
import { useToast } from '../../components/ui/ToastContext';
import { RebateService } from '../../services/rebate.service';
import type { RebateProgram, RebateClaim } from '../../types/rebate';

export function RebateReport() {
    const { showToast } = useToast();
    const [programs, setPrograms] = useState<RebateProgram[]>([]);
    const [selectedProgramId, setSelectedProgramId] = useState<string>('');
    const [claims, setClaims] = useState<RebateClaim[]>([]);

    // Calculator state
    const [calcStart, setCalcStart] = useState<string>(new Date(new Date().getFullYear(), 0, 1).toISOString().split('T')[0]);
    const [calcEnd, setCalcEnd] = useState<string>(new Date().toISOString().split('T')[0]);
    const [mockVolume, setMockVolume] = useState<number>(0);
    const [isCalculating, setIsCalculating] = useState(false);

    useEffect(() => {
        RebateService.listPrograms().then(data => {
            setPrograms(data);
            if (data.length > 0 && !selectedProgramId) {
                setSelectedProgramId(data[0].id!);
            }
        }).catch(err => {
            console.error(err);
            showToast('Failed to load programs', 'error');
        });
    }, [showToast]);

    useEffect(() => {
        if (selectedProgramId) {
            loadClaims(selectedProgramId);

            // Auto-set calculation dates to program dates if available
            const prog = programs.find(p => p.id === selectedProgramId);
            if (prog) {
                setCalcStart(prog.start_date.split('T')[0]);
                setCalcEnd(prog.end_date.split('T')[0]);
            }
        } else {
            setClaims([]);
        }
    }, [selectedProgramId, programs]);

    const loadClaims = async (id: string) => {
        try {
            const data = await RebateService.listClaims(id);
            setClaims(data);
        } catch (err) {
            console.error(err);
            showToast('Failed to load claims', 'error');
        }
    };

    const handleCalculate = async () => {
        if (!selectedProgramId) return;

        setIsCalculating(true);
        try {
            await RebateService.calculateClaim(selectedProgramId, {
                period_start: new Date(calcStart).toISOString(),
                period_end: new Date(calcEnd).toISOString(),
                mock_volume: mockVolume
            });
            showToast('Rebate calculated successfully', 'success');
            loadClaims(selectedProgramId);
        } catch (err) {
            console.error(err);
            showToast('Failed to calculate rebate', 'error');
        } finally {
            setIsCalculating(false);
        }
    };

    const selectedProgram = programs.find(p => p.id === selectedProgramId);

    return (
        <PageTransition>
            <div className="flex justify-between items-center mb-6">
                <div>
                    <h1 className="text-2xl font-bold text-white">Rebate Accrual Report</h1>
                    <p className="text-zinc-400">Calculate earned rebates versus claimed amounts</p>
                </div>
                <Button variant="secondary" className="gap-2">
                    <Download className="w-4 h-4" /> Export CSV
                </Button>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
                <div className="lg:col-span-4 space-y-6">
                    <Card variant="glass">
                        <CardContent className="p-6">
                            <h2 className="text-lg font-medium text-white mb-4">Select Program</h2>
                            <select
                                className="w-full bg-[#0A0B10] border border-white/10 rounded px-3 py-2 text-white focus:border-[#00FFA3] outline-none"
                                value={selectedProgramId}
                                onChange={e => setSelectedProgramId(e.target.value)}
                            >
                                <option value="" disabled>Select a program...</option>
                                {programs.map(p => (
                                    <option key={p.id} value={p.id}>{p.name}</option>
                                ))}
                            </select>

                            {selectedProgram && selectedProgram.tiers && (
                                <div className="mt-6 border-t border-white/10 pt-4">
                                    <h3 className="text-sm font-medium text-zinc-300 mb-3">Tier Structure</h3>
                                    <div className="space-y-2">
                                        {selectedProgram.tiers.map((t, i) => (
                                            <div key={i} className="flex justify-between text-xs bg-black/20 p-2 rounded">
                                                <span className="font-mono text-zinc-400">
                                                    ${t.min_volume.toLocaleString()} - {t.max_volume ? `$${t.max_volume.toLocaleString()}` : '+'}
                                                </span>
                                                <span className="font-bold text-[#00FFA3] align-right">{(t.rebate_pct * 100).toFixed(1)}%</span>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            )}
                        </CardContent>
                    </Card>

                    <Card variant="glass" className="border-[#00FFA3]/20 bg-gradient-to-b from-black/40 to-[#00FFA3]/5">
                        <CardContent className="p-6">
                            <div className="flex items-center gap-2 mb-4">
                                <Calculator className="w-5 h-5 text-[#00FFA3]" />
                                <h2 className="text-lg font-medium text-white">Calculate Accrual</h2>
                            </div>

                            <div className="space-y-4 mb-6">
                                <div>
                                    <label className="block text-xs text-zinc-400 mb-1">Period Start</label>
                                    <input
                                        type="date"
                                        className="w-full bg-black/40 border border-white/10 rounded px-3 py-2 text-white text-sm focus:border-[#00FFA3] [color-scheme:dark]"
                                        value={calcStart}
                                        onChange={e => setCalcStart(e.target.value)}
                                    />
                                </div>
                                <div>
                                    <label className="block text-xs text-zinc-400 mb-1">Period End</label>
                                    <input
                                        type="date"
                                        className="w-full bg-black/40 border border-white/10 rounded px-3 py-2 text-white text-sm focus:border-[#00FFA3] [color-scheme:dark]"
                                        value={calcEnd}
                                        onChange={e => setCalcEnd(e.target.value)}
                                    />
                                </div>
                                <div>
                                    <label className="block text-xs text-zinc-400 mb-1">Qualifying Volume (Mock Data)</label>
                                    <div className="relative">
                                        <DollarSign className="w-4 h-4 text-zinc-500 absolute left-3 top-2.5" />
                                        <input
                                            type="number"
                                            className="w-full bg-black/40 border border-white/10 rounded pl-9 pr-3 py-2 text-white font-mono focus:border-[#00FFA3]"
                                            value={mockVolume}
                                            onChange={e => setMockVolume(Number(e.target.value))}
                                            placeholder="e.g. 500000"
                                        />
                                    </div>
                                    <p className="text-[10px] text-zinc-500 mt-1">
                                        In production, this automatically aggregates vendor invoices for the selected period.
                                    </p>
                                </div>
                            </div>

                            <Button
                                onClick={handleCalculate}
                                disabled={isCalculating || !selectedProgramId}
                                isLoading={isCalculating}
                                className="w-full gap-2 shadow-glow"
                            >
                                Calculate Earned Rebate
                            </Button>
                        </CardContent>
                    </Card>
                </div>

                <div className="lg:col-span-8">
                    <Card variant="glass" className="h-full">
                        <CardContent className="p-0">
                            <div className="p-6 border-b border-white/5 flex justify-between items-center bg-black/20">
                                <h2 className="text-lg font-medium text-white">Accrual History</h2>
                                {claims.length > 0 && (
                                    <div className="text-right">
                                        <div className="text-xs text-zinc-400">Total Accrued (YTD)</div>
                                        <div className="text-xl font-mono font-bold text-[#00FFA3]">
                                            ${claims.reduce((sum, c) => sum + Number(c.rebate_amount), 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                                        </div>
                                    </div>
                                )}
                            </div>

                            {claims.length === 0 ? (
                                <div className="p-12 text-center text-zinc-500">
                                    <Calculator className="w-12 h-12 text-zinc-600 mx-auto mb-4 opacity-50" />
                                    <p>No claims or calculations found for this program.</p>
                                    <p className="text-sm mt-2">Use the calculator to generate an accrual period.</p>
                                </div>
                            ) : (
                                <div className="overflow-x-auto">
                                    <table className="w-full text-sm text-left">
                                        <thead className="bg-[#0A0B10] text-zinc-400 font-mono text-xs uppercase">
                                            <tr>
                                                <th className="px-6 py-4 font-medium">Period</th>
                                                <th className="px-6 py-4 font-medium text-right">Vol Base</th>
                                                <th className="px-6 py-4 font-medium text-right">Earned Amount</th>
                                                <th className="px-6 py-4 font-medium">Status</th>
                                                <th className="px-6 py-4 font-medium">Action</th>
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y divide-white/5 text-zinc-300">
                                            {claims.map((claim) => (
                                                <tr key={claim.id} className="hover:bg-white/[0.02] transition-colors">
                                                    <td className="px-6 py-4 font-mono text-xs whitespace-nowrap">
                                                        {new Date(claim.period_start).toLocaleDateString()} - <br />
                                                        {new Date(claim.period_end).toLocaleDateString()}
                                                    </td>
                                                    <td className="px-6 py-4 font-mono text-right">
                                                        ${Number(claim.qualifying_volume).toLocaleString()}
                                                    </td>
                                                    <td className="px-6 py-4 font-mono text-right font-bold text-white">
                                                        ${Number(claim.rebate_amount).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                                                    </td>
                                                    <td className="px-6 py-4">
                                                        <span className={`inline-flex items-center px-2 py-1 rounded text-[10px] font-medium font-mono border ${claim.status === 'CALCULATED' ? 'bg-blue-500/10 text-blue-400 border-blue-500/20' :
                                                                claim.status === 'CLAIMED' ? 'bg-yellow-500/10 text-yellow-400 border-yellow-500/20' :
                                                                    'bg-[#00FFA3]/10 text-[#00FFA3] border-[#00FFA3]/20'
                                                            }`}>
                                                            {claim.status}
                                                        </span>
                                                    </td>
                                                    <td className="px-6 py-4">
                                                        {claim.status === 'CALCULATED' && (
                                                            <button className="text-xs font-medium text-white hover:text-[#00FFA3] flex items-center gap-1 transition-colors">
                                                                Submit Claim <ArrowRight className="w-3 h-3" />
                                                            </button>
                                                        )}
                                                        {claim.status === 'CLAIMED' && (
                                                            <button className="text-xs font-medium text-white hover:text-[#00FFA3] flex items-center gap-1 transition-colors">
                                                                Mark Received <ArrowRight className="w-3 h-3" />
                                                            </button>
                                                        )}
                                                    </td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            )}
                        </CardContent>
                    </Card>
                </div>
            </div>
        </PageTransition>
    );
}
