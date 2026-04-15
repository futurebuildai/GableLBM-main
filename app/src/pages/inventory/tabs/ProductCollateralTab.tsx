import React, { useState, useCallback, useRef, useEffect } from 'react';
import type { PIMCollateral, CollateralType } from '../../../types/pim';
import { PIMService } from '../../../services/PIMService';
import { Sparkles, Trash2, Copy, Loader2, FileText, RefreshCw, AlertTriangle } from 'lucide-react';
import { useToast } from '../../../components/ui/ToastContext';

interface Props {
    productId: string;
    collateral: PIMCollateral[];
    onCollateralUpdate: () => void;
}

const TYPES: { value: CollateralType; label: string }[] = [
    { value: 'sell_sheet', label: 'Sell Sheet' },
    { value: 'facebook', label: 'Facebook Post' },
    { value: 'instagram', label: 'Instagram Caption' },
    { value: 'linkedin', label: 'LinkedIn Post' },
    { value: 'email_blast', label: 'Email Blast' },
];

const TONES = ['professional', 'casual', 'technical', 'persuasive', 'urgent'];
const AUDIENCES = ['contractors and builders', 'DIY homeowners', 'architects and designers', 'wholesale buyers', 'general public'];

export const ProductCollateralTab: React.FC<Props> = ({ productId, collateral, onCollateralUpdate }) => {
    const { showToast } = useToast();
    const [type, setType] = useState<CollateralType>('sell_sheet');
    const [tone, setTone] = useState('professional');
    const [audience, setAudience] = useState('contractors and builders');
    const [generating, setGenerating] = useState(false);
    const [copiedId, setCopiedId] = useState<string | null>(null);
    const [error, setError] = useState<string | null>(null);
    const copiedTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    useEffect(() => {
        return () => {
            if (copiedTimerRef.current) clearTimeout(copiedTimerRef.current);
        };
    }, []);

    const handleGenerate = useCallback(async () => {
        setGenerating(true);
        setError(null);
        try {
            await PIMService.generateCollateral(productId, { type, tone, audience });
            onCollateralUpdate();
        } catch (err: unknown) {
            const msg = err instanceof Error ? err.message : 'Collateral generation failed';
            setError(msg);
        } finally {
            setGenerating(false);
        }
    }, [productId, type, tone, audience, onCollateralUpdate]);

    const handleDelete = useCallback(async (collateralId: string) => {
        try {
            await PIMService.deleteCollateral(productId, collateralId);
            onCollateralUpdate();
        } catch (err) {
            console.error('Delete failed:', err);
            showToast('Failed to delete collateral', 'error');
        }
    }, [productId, onCollateralUpdate]);

    const handleCopy = useCallback((id: string, text: string) => {
        navigator.clipboard.writeText(text).catch(() => showToast('Failed to copy to clipboard', 'error'));
        setCopiedId(id);
        copiedTimerRef.current = setTimeout(() => setCopiedId(null), 2000);
    }, [showToast]);

    const typeLabel = (t: string) => TYPES.find(x => x.value === t)?.label || t;

    return (
        <div className="space-y-6">
            {/* Generation Controls */}
            <div className="bg-zinc-900 border border-white/10 rounded-xl p-5">
                <h3 className="text-sm font-medium text-zinc-300 flex items-center gap-2 mb-4">
                    <Sparkles className="w-4 h-4 text-amber-400" />
                    AI Collateral Generation
                </h3>
                <div className="flex flex-wrap items-end gap-4">
                    <div>
                        <label className="block text-xs text-zinc-500 mb-1">Type</label>
                        <select value={type} onChange={e => setType(e.target.value as CollateralType)} className="bg-zinc-800 border border-white/10 rounded-lg px-3 py-2 text-sm text-white">
                            {TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
                        </select>
                    </div>
                    <div>
                        <label className="block text-xs text-zinc-500 mb-1">Tone</label>
                        <select value={tone} onChange={e => setTone(e.target.value)} className="bg-zinc-800 border border-white/10 rounded-lg px-3 py-2 text-sm text-white">
                            {TONES.map(t => <option key={t} value={t}>{t.charAt(0).toUpperCase() + t.slice(1)}</option>)}
                        </select>
                    </div>
                    <div>
                        <label className="block text-xs text-zinc-500 mb-1">Audience</label>
                        <select value={audience} onChange={e => setAudience(e.target.value)} className="bg-zinc-800 border border-white/10 rounded-lg px-3 py-2 text-sm text-white">
                            {AUDIENCES.map(a => <option key={a} value={a}>{a.charAt(0).toUpperCase() + a.slice(1)}</option>)}
                        </select>
                    </div>
                    <button
                        onClick={handleGenerate}
                        disabled={generating}
                        className="flex items-center gap-2 px-4 py-2 bg-amber-500/20 text-amber-400 border border-amber-500/30 rounded-lg hover:bg-amber-500/30 transition-colors disabled:opacity-50"
                    >
                        {generating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
                        {generating ? 'Generating...' : 'Generate'}
                    </button>
                </div>
                {error && (
                    <div className="flex items-start gap-2 p-3 mt-4 bg-rose-500/10 border border-rose-500/20 rounded-lg text-sm text-rose-400">
                        <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
                        <span>{error}</span>
                    </div>
                )}
            </div>

            {/* Collateral Items */}
            {collateral.length === 0 ? (
                <div className="bg-zinc-900 border border-white/10 rounded-xl p-12 text-center">
                    <FileText className="w-12 h-12 text-zinc-600 mx-auto mb-3" />
                    <p className="text-zinc-500 text-sm">No collateral yet. Generate some using AI above.</p>
                </div>
            ) : (
                <div className="space-y-4">
                    {collateral.map(c => (
                        <div key={c.id} className="bg-zinc-900 border border-white/10 rounded-xl p-5">
                            <div className="flex items-start justify-between mb-3">
                                <div>
                                    <div className="flex items-center gap-2 mb-1">
                                        <span className="px-2 py-0.5 bg-white/5 border border-white/10 rounded text-xs font-medium text-zinc-300">
                                            {typeLabel(c.collateral_type)}
                                        </span>
                                        <span className="text-xs text-zinc-500">{c.tone} / {c.audience}</span>
                                    </div>
                                    <h4 className="text-white font-medium">{c.title}</h4>
                                </div>
                                <div className="flex items-center gap-1.5">
                                    <button
                                        onClick={() => handleCopy(c.id, c.content)}
                                        className="p-1.5 rounded-md hover:bg-white/10 text-zinc-400 hover:text-white transition-colors"
                                        title="Copy to clipboard"
                                    >
                                        {copiedId === c.id ? <RefreshCw className="w-4 h-4 text-gable-green" /> : <Copy className="w-4 h-4" />}
                                    </button>
                                    <button
                                        onClick={() => handleDelete(c.id)}
                                        className="p-1.5 rounded-md hover:bg-rose-500/20 text-zinc-400 hover:text-rose-400 transition-colors"
                                        title="Delete"
                                    >
                                        <Trash2 className="w-4 h-4" />
                                    </button>
                                </div>
                            </div>
                            <pre className="whitespace-pre-wrap text-sm text-zinc-300 bg-zinc-800/50 rounded-lg p-3 font-sans">
                                {c.content}
                            </pre>
                            {c.generated_at && (
                                <div className="mt-2 text-xs text-zinc-600">
                                    Generated {new Date(c.generated_at).toLocaleString()} by {c.gen_model}
                                </div>
                            )}
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
};
