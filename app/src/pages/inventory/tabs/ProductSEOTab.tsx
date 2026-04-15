import React, { useState, useCallback } from 'react';
import type { PIMContent } from '../../../types/pim';
import { PIMService } from '../../../services/PIMService';
import { Sparkles, Save, Loader2, Search, X, Globe } from 'lucide-react';
import { useToast } from '../../../components/ui/ToastContext';

interface Props {
    productId: string;
    content: PIMContent | null;
    onContentUpdate: (content: PIMContent) => void;
}

export const ProductSEOTab: React.FC<Props> = ({ productId, content, onContentUpdate }) => {
    const { showToast } = useToast();
    const [generating, setGenerating] = useState(false);
    const [saving, setSaving] = useState(false);
    const [title, setTitle] = useState(content?.seo_title || '');
    const [description, setDescription] = useState(content?.seo_description || '');
    const [keywords, setKeywords] = useState<string[]>(content?.seo_keywords || []);
    const [slug, setSlug] = useState(content?.seo_slug || '');
    const [keywordInput, setKeywordInput] = useState('');

    React.useEffect(() => {
        setTitle(content?.seo_title || '');
        setDescription(content?.seo_description || '');
        setKeywords(content?.seo_keywords || []);
        setSlug(content?.seo_slug || '');
    }, [content]);

    const handleGenerate = useCallback(async () => {
        setGenerating(true);
        try {
            const result = await PIMService.generateSEO(productId, { target_keywords: keywords.length > 0 ? keywords : [] });
            onContentUpdate(result);
        } catch (err) {
            console.error('Generate SEO failed:', err);
            showToast('Failed to generate SEO content', 'error');
        } finally {
            setGenerating(false);
        }
    }, [productId, keywords, onContentUpdate, showToast]);

    const handleSave = useCallback(async () => {
        setSaving(true);
        try {
            const result = await PIMService.updateContent(productId, {
                seo_title: title,
                seo_description: description,
                seo_keywords: keywords,
                seo_slug: slug,
            });
            onContentUpdate(result);
        } catch (err) {
            console.error('Save SEO failed:', err);
            showToast('Failed to save SEO changes', 'error');
        } finally {
            setSaving(false);
        }
    }, [productId, title, description, keywords, slug, onContentUpdate, showToast]);

    const addKeyword = useCallback(() => {
        const kw = keywordInput.trim().toLowerCase();
        if (kw && !keywords.includes(kw)) {
            setKeywords([...keywords, kw]);
        }
        setKeywordInput('');
    }, [keywordInput, keywords]);

    const removeKeyword = useCallback((kw: string) => {
        setKeywords(keywords.filter(k => k !== kw));
    }, [keywords]);

    return (
        <div className="space-y-6">
            {/* Generate Button */}
            <div className="bg-zinc-900 border border-white/10 rounded-xl p-5">
                <div className="flex items-center justify-between">
                    <h3 className="text-sm font-medium text-zinc-300 flex items-center gap-2">
                        <Sparkles className="w-4 h-4 text-amber-400" />
                        AI SEO Generation
                    </h3>
                    <button
                        onClick={handleGenerate}
                        disabled={generating}
                        className="flex items-center gap-2 px-4 py-2 bg-amber-500/20 text-amber-400 border border-amber-500/30 rounded-lg hover:bg-amber-500/30 transition-colors disabled:opacity-50"
                    >
                        {generating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
                        {generating ? 'Generating...' : 'Generate SEO'}
                    </button>
                </div>
            </div>

            {/* Meta Title */}
            <div className="bg-zinc-900 border border-white/10 rounded-xl p-4">
                <div className="flex items-center justify-between mb-2">
                    <label className="text-sm font-medium text-zinc-400">Meta Title</label>
                    <span className={`text-xs ${title.length > 60 ? 'text-rose-400' : 'text-zinc-500'}`}>
                        {title.length}/60
                    </span>
                </div>
                <input
                    type="text"
                    value={title}
                    onChange={e => setTitle(e.target.value)}
                    placeholder="SEO page title..."
                    className="w-full bg-zinc-800 border border-white/10 rounded-lg px-3 py-2 text-sm text-white placeholder-zinc-600 focus:outline-none focus:border-gable-green/50"
                />
            </div>

            {/* Meta Description */}
            <div className="bg-zinc-900 border border-white/10 rounded-xl p-4">
                <div className="flex items-center justify-between mb-2">
                    <label className="text-sm font-medium text-zinc-400">Meta Description</label>
                    <span className={`text-xs ${description.length > 160 ? 'text-rose-400' : 'text-zinc-500'}`}>
                        {description.length}/160
                    </span>
                </div>
                <textarea
                    value={description}
                    onChange={e => setDescription(e.target.value)}
                    rows={3}
                    placeholder="SEO meta description..."
                    className="w-full bg-zinc-800 border border-white/10 rounded-lg px-3 py-2 text-sm text-white placeholder-zinc-600 resize-none focus:outline-none focus:border-gable-green/50"
                />
            </div>

            {/* Keywords */}
            <div className="bg-zinc-900 border border-white/10 rounded-xl p-4">
                <label className="text-sm font-medium text-zinc-400 mb-2 block">Keywords</label>
                <div className="flex flex-wrap gap-2 mb-3">
                    {keywords.map(kw => (
                        <span key={kw} className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs bg-gable-green/10 border border-gable-green/20 text-gable-green">
                            {kw}
                            <button onClick={() => removeKeyword(kw)} className="hover:text-white">
                                <X className="w-3 h-3" />
                            </button>
                        </span>
                    ))}
                </div>
                <div className="flex gap-2">
                    <input
                        type="text"
                        value={keywordInput}
                        onChange={e => setKeywordInput(e.target.value)}
                        onKeyDown={e => e.key === 'Enter' && (e.preventDefault(), addKeyword())}
                        placeholder="Add keyword..."
                        className="flex-1 bg-zinc-800 border border-white/10 rounded-lg px-3 py-2 text-sm text-white placeholder-zinc-600 focus:outline-none focus:border-gable-green/50"
                    />
                    <button onClick={addKeyword} className="px-3 py-2 bg-white/5 border border-white/10 rounded-lg text-sm text-zinc-300 hover:bg-white/10">
                        Add
                    </button>
                </div>
            </div>

            {/* URL Slug */}
            <div className="bg-zinc-900 border border-white/10 rounded-xl p-4">
                <label className="text-sm font-medium text-zinc-400 mb-2 block">URL Slug</label>
                <div className="flex items-center gap-2">
                    <span className="text-zinc-500 text-sm">/products/</span>
                    <input
                        type="text"
                        value={slug}
                        onChange={e => setSlug(e.target.value)}
                        placeholder="url-friendly-slug"
                        className="flex-1 bg-zinc-800 border border-white/10 rounded-lg px-3 py-2 text-sm text-white font-mono placeholder-zinc-600 focus:outline-none focus:border-gable-green/50"
                    />
                </div>
            </div>

            {/* Google Preview */}
            {(title || description) && (
                <div className="bg-zinc-900 border border-white/10 rounded-xl p-5">
                    <h3 className="text-sm font-medium text-zinc-400 flex items-center gap-2 mb-4">
                        <Globe className="w-4 h-4" />
                        Google Search Preview
                    </h3>
                    <div className="bg-white rounded-lg p-4 max-w-[600px]">
                        <div className="flex items-center gap-2 text-xs text-gray-500 mb-1">
                            <Search className="w-3 h-3" />
                            www.example.com/products/{slug || '...'}
                        </div>
                        <div className="text-blue-700 text-lg hover:underline cursor-pointer leading-snug">
                            {title || 'Page Title'}
                        </div>
                        <div className="text-gray-600 text-sm mt-1 line-clamp-2">
                            {description || 'Meta description will appear here...'}
                        </div>
                    </div>
                </div>
            )}

            {/* Save */}
            <div className="flex justify-end">
                <button
                    onClick={handleSave}
                    disabled={saving}
                    className="flex items-center gap-2 px-5 py-2.5 bg-gable-green/20 text-gable-green border border-gable-green/30 rounded-lg hover:bg-gable-green/30 transition-colors disabled:opacity-50"
                >
                    {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                    {saving ? 'Saving...' : 'Save SEO'}
                </button>
            </div>
        </div>
    );
};
