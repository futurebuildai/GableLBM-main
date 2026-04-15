import React, { useState, useCallback } from 'react';
import type { PIMContent } from '../../../types/pim';
import { PIMService } from '../../../services/PIMService';
import { Sparkles, Save, Loader2 } from 'lucide-react';
import { useToast } from '../../../components/ui/ToastContext';

interface Props {
    productId: string;
    content: PIMContent | null;
    onContentUpdate: (content: PIMContent) => void;
}

const TONES = ['professional', 'casual', 'technical', 'persuasive'];
const AUDIENCES = ['contractors and builders', 'DIY homeowners', 'architects and designers', 'wholesale buyers'];

export const ProductContentTab: React.FC<Props> = ({ productId, content, onContentUpdate }) => {
    const { showToast } = useToast();
    const [tone, setTone] = useState('professional');
    const [audience, setAudience] = useState('contractors and builders');
    const [generating, setGenerating] = useState(false);
    const [saving, setSaving] = useState(false);
    const [shortDesc, setShortDesc] = useState(content?.short_description || '');
    const [longDesc, setLongDesc] = useState(content?.long_description || '');
    const [marketingCopy, setMarketingCopy] = useState(content?.marketing_copy || '');
    const [attributes, setAttributes] = useState<Record<string, string>>(content?.attributes || {});

    React.useEffect(() => {
        setShortDesc(content?.short_description || '');
        setLongDesc(content?.long_description || '');
        setMarketingCopy(content?.marketing_copy || '');
        setAttributes(content?.attributes || {});
    }, [content]);

    const handleGenerate = useCallback(async () => {
        setGenerating(true);
        try {
            const result = await PIMService.generateDescriptions(productId, { tone, audience });
            onContentUpdate(result);
        } catch (err) {
            console.error('Generate failed:', err);
            showToast('Failed to generate content', 'error');
        } finally {
            setGenerating(false);
        }
    }, [productId, tone, audience, onContentUpdate, showToast]);

    const handleSave = useCallback(async () => {
        setSaving(true);
        try {
            const result = await PIMService.updateContent(productId, {
                short_description: shortDesc,
                long_description: longDesc,
                marketing_copy: marketingCopy,
                attributes,
            });
            onContentUpdate(result);
        } catch (err) {
            console.error('Save failed:', err);
            showToast('Failed to save content changes', 'error');
        } finally {
            setSaving(false);
        }
    }, [productId, shortDesc, longDesc, marketingCopy, attributes, onContentUpdate, showToast]);

    return (
        <div className="space-y-6">
            {/* Generation Controls */}
            <div className="bg-zinc-900 border border-white/10 rounded-xl p-5">
                <div className="flex items-center justify-between mb-4">
                    <h3 className="text-sm font-medium text-zinc-300 flex items-center gap-2">
                        <Sparkles className="w-4 h-4 text-amber-400" />
                        AI Content Generation
                    </h3>
                    {content?.last_gen_at && (
                        <span className="text-xs text-zinc-500">
                            Last generated: {new Date(content.last_gen_at).toLocaleString()}
                        </span>
                    )}
                </div>
                <div className="flex flex-wrap items-end gap-4">
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
            </div>

            {/* Editable Descriptions */}
            <div className="space-y-4">
                <TextArea label="Short Description" value={shortDesc} onChange={setShortDesc} rows={2} maxLength={160} />
                <TextArea label="Long Description" value={longDesc} onChange={setLongDesc} rows={5} />
                <TextArea label="Marketing Copy" value={marketingCopy} onChange={setMarketingCopy} rows={5} />
            </div>

            {/* Attributes */}
            {Object.keys(attributes).length > 0 && (
                <div className="bg-zinc-900 border border-white/10 rounded-xl p-5">
                    <h3 className="text-sm font-medium text-zinc-300 mb-3">Extracted Attributes</h3>
                    <div className="flex flex-wrap gap-2">
                        {Object.entries(attributes).map(([key, value]) =>
                            value ? (
                                <span key={key} className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs bg-white/5 border border-white/10 text-zinc-300">
                                    <span className="text-zinc-500">{key}:</span> {value}
                                </span>
                            ) : null
                        )}
                    </div>
                </div>
            )}

            {/* Save Button */}
            <div className="flex justify-end">
                <button
                    onClick={handleSave}
                    disabled={saving}
                    className="flex items-center gap-2 px-5 py-2.5 bg-gable-green/20 text-gable-green border border-gable-green/30 rounded-lg hover:bg-gable-green/30 transition-colors disabled:opacity-50"
                >
                    {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                    {saving ? 'Saving...' : 'Save Changes'}
                </button>
            </div>
        </div>
    );
};

const TextArea: React.FC<{ label: string; value: string; onChange: (v: string) => void; rows?: number; maxLength?: number }> = ({ label, value, onChange, rows = 3, maxLength }) => (
    <div className="bg-zinc-900 border border-white/10 rounded-xl p-4">
        <div className="flex items-center justify-between mb-2">
            <label className="text-sm font-medium text-zinc-400">{label}</label>
            {maxLength && (
                <span className={`text-xs ${value.length > maxLength ? 'text-rose-400' : 'text-zinc-500'}`}>
                    {value.length}/{maxLength}
                </span>
            )}
        </div>
        <textarea
            value={value}
            onChange={e => onChange(e.target.value)}
            rows={rows}
            className="w-full bg-zinc-800 border border-white/10 rounded-lg px-3 py-2 text-sm text-white placeholder-zinc-600 resize-none focus:outline-none focus:border-gable-green/50"
            placeholder={`Enter ${label.toLowerCase()}...`}
        />
    </div>
);
