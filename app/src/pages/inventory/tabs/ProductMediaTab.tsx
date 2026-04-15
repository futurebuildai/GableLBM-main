import React, { useState, useCallback } from 'react';
import type { PIMMedia } from '../../../types/pim';
import { PIMService } from '../../../services/PIMService';
import { Sparkles, Trash2, Star, Loader2, ImageIcon, AlertTriangle } from 'lucide-react';
import { useToast } from '../../../components/ui/ToastContext';

interface Props {
    productId: string;
    media: PIMMedia[];
    onMediaUpdate: () => void;
}

const STYLES = ['', 'photographic', 'digital-art', 'cinematic', '3d-model', 'isometric'];

export const ProductMediaTab: React.FC<Props> = ({ productId, media, onMediaUpdate }) => {
    const { showToast } = useToast();
    const [style, setStyle] = useState('');
    const [prompt, setPrompt] = useState('');
    const [generating, setGenerating] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const handleGenerate = useCallback(async () => {
        setGenerating(true);
        setError(null);
        try {
            await PIMService.generateImage(productId, { style, prompt });
            onMediaUpdate();
        } catch (err: unknown) {
            const msg = err instanceof Error ? err.message : 'Image generation failed';
            setError(msg);
        } finally {
            setGenerating(false);
        }
    }, [productId, style, prompt, onMediaUpdate]);

    const handleDelete = useCallback(async (mediaId: string) => {
        try {
            await PIMService.deleteMedia(productId, mediaId);
            onMediaUpdate();
        } catch (err) {
            console.error('Delete failed:', err);
            showToast('Failed to delete media', 'error');
        }
    }, [productId, onMediaUpdate, showToast]);

    const handleSetPrimary = useCallback(async (mediaId: string) => {
        try {
            await PIMService.setPrimaryMedia(productId, mediaId);
            onMediaUpdate();
        } catch (err) {
            console.error('Set primary failed:', err);
            showToast('Failed to set primary media', 'error');
        }
    }, [productId, onMediaUpdate, showToast]);

    return (
        <div className="space-y-6">
            {/* Generation Controls */}
            <div className="bg-zinc-900 border border-white/10 rounded-xl p-5">
                <h3 className="text-sm font-medium text-zinc-300 flex items-center gap-2 mb-4">
                    <Sparkles className="w-4 h-4 text-amber-400" />
                    AI Image Generation
                </h3>
                <div className="space-y-3">
                    <div className="flex flex-wrap items-end gap-4">
                        <div>
                            <label className="block text-xs text-zinc-500 mb-1">Style</label>
                            <select value={style} onChange={e => setStyle(e.target.value)} className="bg-zinc-800 border border-white/10 rounded-lg px-3 py-2 text-sm text-white">
                                {STYLES.map(s => (
                                    <option key={s} value={s}>{s ? s.charAt(0).toUpperCase() + s.slice(1).replace('-', ' ') : 'Auto'}</option>
                                ))}
                            </select>
                        </div>
                        <button
                            onClick={handleGenerate}
                            disabled={generating}
                            className="flex items-center gap-2 px-4 py-2 bg-amber-500/20 text-amber-400 border border-amber-500/30 rounded-lg hover:bg-amber-500/30 transition-colors disabled:opacity-50"
                        >
                            {generating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
                            {generating ? 'Generating...' : 'Generate Image'}
                        </button>
                    </div>
                    <div>
                        <label className="block text-xs text-zinc-500 mb-1">Custom Prompt (optional)</label>
                        <input
                            type="text"
                            value={prompt}
                            onChange={e => setPrompt(e.target.value)}
                            placeholder="Leave empty for auto-generated prompt based on product data..."
                            className="w-full bg-zinc-800 border border-white/10 rounded-lg px-3 py-2 text-sm text-white placeholder-zinc-600 focus:outline-none focus:border-gable-green/50"
                        />
                    </div>
                    {error && (
                        <div className="flex items-start gap-2 p-3 bg-rose-500/10 border border-rose-500/20 rounded-lg text-sm text-rose-400">
                            <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
                            <span>{error}</span>
                        </div>
                    )}
                </div>
            </div>

            {/* Gallery */}
            {media.length === 0 ? (
                <div className="bg-zinc-900 border border-white/10 rounded-xl p-12 text-center">
                    <ImageIcon className="w-12 h-12 text-zinc-600 mx-auto mb-3" />
                    <p className="text-zinc-500 text-sm">No images yet. Generate one using AI above.</p>
                </div>
            ) : (
                <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                    {media.map(m => (
                        <div key={m.id} className={`relative group bg-zinc-900 border rounded-xl overflow-hidden ${m.is_primary ? 'border-gable-green/50 ring-1 ring-gable-green/30' : 'border-white/10'}`}>
                            <div className="aspect-square">
                                <img src={m.url} alt={m.alt_text} className="w-full h-full object-cover" />
                            </div>
                            {m.is_primary && (
                                <div className="absolute top-2 left-2 px-2 py-0.5 bg-gable-green/80 text-black text-xs font-bold rounded">Primary</div>
                            )}
                            <div className="absolute top-2 right-2 px-2 py-0.5 bg-black/60 text-zinc-300 text-xs rounded">{m.media_type}</div>
                            {/* Hover Actions */}
                            <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/80 to-transparent p-3 opacity-0 group-hover:opacity-100 transition-opacity">
                                <div className="flex items-center justify-end gap-2">
                                    {!m.is_primary && (
                                        <button onClick={() => handleSetPrimary(m.id)} className="p-1.5 rounded-md bg-white/10 hover:bg-white/20 text-amber-400" title="Set as Primary">
                                            <Star className="w-4 h-4" />
                                        </button>
                                    )}
                                    <button onClick={() => handleDelete(m.id)} className="p-1.5 rounded-md bg-white/10 hover:bg-rose-500/30 text-rose-400" title="Delete">
                                        <Trash2 className="w-4 h-4" />
                                    </button>
                                </div>
                            </div>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
};
