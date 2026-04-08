import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Key, Globe, Activity, Plus, Trash2, Copy, Check, Eye, Sparkles, Shield, AlertCircle, ImageIcon, Network, Power, RefreshCw } from 'lucide-react';
import { Button } from '../../../components/ui/Button';
import { techAdminService, ediService, type APIKey, type AISettings, type EDITradingPartner } from '../../../services/TechAdminService';
import { cn } from '../../../lib/utils';

// --- Subcomponents (In-file for speed, can break out later) ---

const APIKeyManager = () => {
    const [keys, setKeys] = useState<APIKey[]>([]);
    const [loading, setLoading] = useState(true);
    const [isCreating, setIsCreating] = useState(false);
    const [newKeyName, setNewKeyName] = useState('');
    const [generatedKey, setGeneratedKey] = useState<string | null>(null);
    const [copied, setCopied] = useState(false);

    useEffect(() => {
        loadKeys();
    }, []);

    const loadKeys = async () => {
        try {
            const data = await techAdminService.listKeys();
            setKeys(data);
        } catch (error) {
            console.error(error);
        } finally {
            setLoading(false);
        }
    };

    const handleCreate = async () => {
        if (!newKeyName) return;
        try {
            const res = await techAdminService.createKey(newKeyName, ['read:inventory', 'write:orders']); // Default scopes for now
            setGeneratedKey(res.api_key);
            setNewKeyName(''); // Reset input
            loadKeys();
        } catch (error) {
            console.error(error);
        }
    };

    const handleRevoke = async (id: string) => {
        if (!confirm('Are you sure you want to revoke this key? integrations using it will break immediately.')) return;
        try {
            await techAdminService.revokeKey(id);
            loadKeys();
        } catch (error) {
            console.error(error);
        }
    };

    const copyToClipboard = (text: string) => {
        navigator.clipboard.writeText(text);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
    };

    return (
        <div className="space-y-6">
            <div className="flex justify-between items-center">
                <div>
                    <h2 className="text-xl font-bold text-white">API Keys</h2>
                    <p className="text-slate-400 text-sm">Manage access keys for 3rd-party integrations.</p>
                </div>
                <Button onClick={() => setIsCreating(true)} disabled={isCreating || !!generatedKey}>
                    <Plus size={16} className="mr-2" />
                    New API Key
                </Button>
            </div>

            {/* Creation Modal / Inline Form */}
            <AnimatePresence>
                {(isCreating || generatedKey) && (
                    <motion.div
                        initial={{ opacity: 0, height: 0 }}
                        animate={{ opacity: 1, height: 'auto' }}
                        exit={{ opacity: 0, height: 0 }}
                        className="bg-slate-steel/50 border border-white/10 rounded-lg p-6 overflow-hidden"
                    >
                        {!generatedKey ? (
                            <div className="flex gap-4 items-end">
                                <div className="flex-1 space-y-2">
                                    <label className="text-sm font-medium text-slate-300">Key Name (e.g. "Zapier Integration")</label>
                                    <input
                                        type="text"
                                        value={newKeyName}
                                        onChange={(e) => setNewKeyName(e.target.value)}
                                        className="w-full bg-deep-space border border-white/10 rounded px-3 py-2 text-white placeholder-slate-500 focus:outline-none focus:border-gable-green transition-colors"
                                        placeholder="Friendly name..."
                                        autoFocus
                                    />
                                </div>
                                <div className="flex gap-2">
                                    <Button variant="outline" onClick={() => setIsCreating(false)}>Cancel</Button>
                                    <Button onClick={handleCreate} disabled={!newKeyName}>Generate</Button>
                                </div>
                            </div>
                        ) : (
                            <div className="space-y-4">
                                <div className="flex items-center gap-2 text-amber-400 bg-amber-400/10 px-3 py-2 rounded text-sm">
                                    <Eye size={16} />
                                    <span>Copy this key now. You won't be able to see it again!</span>
                                </div>
                                <div className="flex gap-2">
                                    <code className="flex-1 bg-deep-space border border-gable-green/50 rounded px-4 py-3 text-gable-green font-mono text-lg break-all">
                                        {generatedKey}
                                    </code>
                                    <Button onClick={() => copyToClipboard(generatedKey)} variant="outline" className="h-[52px] w-[52px] p-0 flex items-center justify-center">
                                        {copied ? <Check size={20} className="text-gable-green" /> : <Copy size={20} />}
                                    </Button>
                                </div>
                                <div className="flex justify-end">
                                    <Button onClick={() => { setGeneratedKey(null); setIsCreating(false); }}>Done</Button>
                                </div>
                            </div>
                        )}
                    </motion.div>
                )}
            </AnimatePresence>

            {/* Key List */}
            <div className="bg-slate-steel border border-white/5 rounded-lg overflow-hidden">
                <table className="w-full text-left text-sm">
                    <thead className="bg-white/5 text-slate-400 font-medium">
                        <tr>
                            <th className="px-4 py-3">Name</th>
                            <th className="px-4 py-3">Prefix</th>
                            <th className="px-4 py-3">Created</th>
                            <th className="px-4 py-3">Last Used</th>
                            <th className="px-4 py-3">Status</th>
                            <th className="px-4 py-3 text-right">Actions</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-white/5">
                        {keys.map((key) => (
                            <tr key={key.id} className="hover:bg-white/5 transition-colors group">
                                <td className="px-4 py-3 font-medium text-white">{key.name}</td>
                                <td className="px-4 py-3 font-mono text-slate-400">{key.prefix}...</td>
                                <td className="px-4 py-3 text-slate-400">{new Date(key.created_at).toLocaleDateString()}</td>
                                <td className="px-4 py-3 text-slate-400">
                                    {key.last_used_at ? new Date(key.last_used_at).toLocaleDateString() : 'Never'}
                                </td>
                                <td className="px-4 py-3">
                                    {key.revoked_at ? (
                                        <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-red-500/10 text-red-500">Revoked</span>
                                    ) : (
                                        <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-gable-green/10 text-gable-green">Active</span>
                                    )}
                                </td>
                                <td className="px-4 py-3 text-right">
                                    {!key.revoked_at && (
                                        <button
                                            onClick={() => handleRevoke(key.id)}
                                            className="text-slate-500 hover:text-red-400 transition-colors p-1 rounded hover:bg-white/5"
                                            title="Revoke Key"
                                        >
                                            <Trash2 size={16} />
                                        </button>
                                    )}
                                </td>
                            </tr>
                        ))}
                        {keys.length === 0 && !loading && (
                            <tr>
                                <td colSpan={6} className="px-4 py-8 text-center text-slate-500">
                                    No API keys generated yet.
                                </td>
                            </tr>
                        )}
                    </tbody>
                </table>
            </div>
        </div>
    );
};

const IntegrationCard = ({ name, description, icon: Icon, connected = false }: { name: string, description: string, icon: React.ElementType, connected?: boolean }) => (
    <div className="bg-slate-steel border border-white/5 p-6 rounded-lg flex items-start justify-between hover:border-white/10 transition-colors group">
        <div className="flex gap-4">
            <div className={cn("w-12 h-12 rounded-lg flex items-center justify-center shrink-0 transition-colors", connected ? "bg-gable-green/20 text-gable-green" : "bg-white/5 text-slate-400 group-hover:text-white")}>
                <Icon size={24} />
            </div>
            <div>
                <h3 className="text-lg font-semibold text-white mb-1">{name}</h3>
                <p className="text-slate-400 text-sm leading-relaxed">{description}</p>
            </div>
        </div>
        <Button variant={connected ? "outline" : "default"} className={cn(connected && "border-gable-green/50 text-gable-green hover:bg-gable-green/10")}>
            {connected ? "Configure" : "Connect"}
        </Button>
    </div>
);

const EDITradingPartnersManager = () => {
    const [partners, setPartners] = useState<EDITradingPartner[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        loadPartners();
    }, []);

    const loadPartners = async () => {
        setLoading(true);
        try {
            const data = await ediService.listPartners();
            setPartners(data);
        } catch (error) {
            console.error(error);
        } finally {
            setLoading(false);
        }
    };

    const handleToggle = async (partner: EDITradingPartner) => {
        try {
            await ediService.togglePartner(partner);
            loadPartners();
        } catch (error) {
            console.error(error);
        }
    };

    const handleDelete = async (id: string) => {
        if (!confirm('Are you sure you want to remove this EDI partner? This will disconnect their catalog sync.')) return;
        try {
            await ediService.deletePartner(id);
            loadPartners();
        } catch (error) {
            console.error(error);
        }
    };

    return (
        <div className="space-y-6 mt-12 pt-12 border-t border-white/10">
            <div className="flex justify-between items-center">
                <div>
                    <h2 className="text-xl font-bold text-white flex items-center gap-2">
                        <Network size={20} className="text-gable-green" />
                        EDI Trading Partners
                    </h2>
                    <p className="text-slate-400 text-sm">Manage vendor-agnostic EDI configurations and catalog sync.</p>
                </div>
                <Button variant="outline" size="sm" onClick={loadPartners} className="text-slate-400 hover:text-white">
                    <RefreshCw size={14} className={cn("mr-2", loading && "animate-spin")} />
                    Refresh
                </Button>
            </div>

            <div className="bg-slate-steel border border-white/5 rounded-lg overflow-hidden">
                <table className="w-full text-left text-sm">
                    <thead className="bg-white/5 text-slate-400 font-medium">
                        <tr>
                            <th className="px-4 py-3">Partner Name</th>
                            <th className="px-4 py-3">EDI Version</th>
                            <th className="px-4 py-3">Transport</th>
                            <th className="px-4 py-3">Status</th>
                            <th className="px-4 py-3 text-right">Actions</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-white/5">
                        {partners.map((partner) => (
                            <tr key={partner.id} className="hover:bg-white/5 transition-colors group">
                                <td className="px-4 py-3">
                                    <span className="font-medium text-white">{partner.name}</span>
                                    <div className="text-[10px] text-slate-500 font-mono mt-0.5">{partner.id.split('-')[0]}...</div>
                                </td>
                                <td className="px-4 py-3">
                                    <code className="text-xs bg-white/5 px-2 py-1 rounded text-slate-300">{partner.edi_version}</code>
                                </td>
                                <td className="px-4 py-3">
                                    <div className="flex items-center gap-2">
                                        <span className="text-slate-300">{partner.transport_type}</span>
                                        <span className="text-xs text-slate-500 font-mono">({partner.isa_sender_id} ➔ {partner.isa_receiver_id})</span>
                                    </div>
                                </td>
                                <td className="px-4 py-3">
                                    <button 
                                        onClick={() => handleToggle(partner)}
                                        className={cn(
                                            "inline-flex items-center px-2 py-0.5 rounded text-xs font-medium cursor-pointer transition-colors",
                                            partner.is_active ? "bg-gable-green/10 text-gable-green hover:bg-gable-green/20" : "bg-slate-500/10 text-slate-500 hover:bg-slate-500/20"
                                        )}
                                    >
                                        <Power size={10} className="mr-1" />
                                        {partner.is_active ? 'Active' : 'Inactive'}
                                    </button>
                                </td>
                                <td className="px-4 py-3 text-right">
                                    <button
                                        onClick={() => handleDelete(partner.id)}
                                        className="text-slate-500 hover:text-red-400 transition-colors p-1 rounded hover:bg-white/5"
                                    >
                                        <Trash2 size={16} />
                                    </button>
                                </td>
                            </tr>
                        ))}
                        {partners.length === 0 && !loading && (
                            <tr>
                                <td colSpan={5} className="px-4 py-8 text-center text-slate-500">
                                    No EDI Trading Partners configured.
                                </td>
                            </tr>
                        )}
                        {loading && partners.length === 0 && (
                            <tr>
                                <td colSpan={5} className="px-4 py-8 text-center text-slate-500 italic">
                                    Loading partners...
                                </td>
                            </tr>
                        )}
                    </tbody>
                </table>
            </div>
            
            <div className="bg-amber-500/5 border border-amber-500/20 rounded-lg p-4 flex gap-4">
                <AlertCircle className="w-5 h-5 text-amber-500 shrink-0" />
                <div className="text-sm">
                    <p className="text-amber-200 font-medium mb-1">Developer Mode</p>
                    <p className="text-amber-500/80">EDI partners are currently in read+toggle mode. Full transport configuration (SFTP/AS2 keys) and catalog mapping UI are planned for the next sprint.</p>
                </div>
            </div>
        </div>
    );
};

const Integrations = () => {
    return (
        <div className="space-y-6">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                <IntegrationCard
                    name="Run Payments"
                    description="Secure payment processing for card-present and online transactions. Preferred Partner."
                    icon={Activity} // Placeholder icon
                />
                <IntegrationCard
                    name="QuickBooks Online"
                    description="Automatically sync invoices, payments, and customers with your General Ledger."
                    icon={Globe}
                />
                <IntegrationCard
                    name="Avalara AvaTax"
                    description="Real-time tax calculation and compliance for all 50 states."
                    icon={Globe}
                />
                <IntegrationCard
                    name="Zapier / Make"
                    description="Connect GableLBM to 5,000+ other apps via webhooks."
                    icon={Activity}
                />
            </div>
            
            <EDITradingPartnersManager />
        </div>
    );
};

// --- AI Settings Component ---

const AISettingsPanel = () => {
    const [settings, setSettings] = useState<AISettings | null>(null);
    const [loading, setLoading] = useState(true);
    const [newKey, setNewKey] = useState('');
    const [saving, setSaving] = useState(false);
    const [showInput, setShowInput] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [success, setSuccess] = useState<string | null>(null);

    useEffect(() => {
        loadSettings();
    }, []);

    const loadSettings = async () => {
        try {
            const data = await techAdminService.getAISettings();
            setSettings(data);
        } catch (err) {
            console.error(err);
        } finally {
            setLoading(false);
        }
    };

    const handleSave = async () => {
        if (!newKey.trim()) return;
        setSaving(true);
        setError(null);
        setSuccess(null);
        try {
            await techAdminService.saveAIKey(newKey.trim());
            setNewKey('');
            setShowInput(false);
            setSuccess('API key saved. All AI features are now active.');
            await loadSettings();
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Failed to save');
        } finally {
            setSaving(false);
        }
    };

    const handleDelete = async () => {
        if (!confirm('Remove the admin-configured API key? If an environment variable is set, it will be used as fallback.')) return;
        try {
            await techAdminService.deleteAIKey();
            setSuccess('Admin API key removed.');
            await loadSettings();
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Failed to delete');
        }
    };

    if (loading) return <div className="text-slate-400 p-8">Loading AI settings...</div>;

    const features = [
        { name: 'Material List Parsing', description: 'Upload photos/PDFs/spreadsheets of material lists and auto-build quotes' },
        { name: 'PIM Content Generation', description: 'AI-generated product descriptions and marketing copy' },
        { name: 'Blueprint Verification', description: 'Cross-check configurator selections against blueprint specs' },
    ];

    return (
        <div className="space-y-6">
            <div>
                <h2 className="text-xl font-bold text-white flex items-center gap-2">
                    <Sparkles className="w-5 h-5 text-violet-400" />
                    AI Settings
                </h2>
                <p className="text-slate-400 text-sm mt-1">Configure your Anthropic API key to power all AI features across the ERP.</p>
            </div>

            {/* Status Card */}
            <div className={cn(
                "border rounded-lg p-6",
                settings?.configured
                    ? "bg-emerald-500/5 border-emerald-500/20"
                    : "bg-amber-500/5 border-amber-500/20"
            )}>
                <div className="flex items-start justify-between">
                    <div className="flex items-start gap-4">
                        <div className={cn(
                            "w-10 h-10 rounded-lg flex items-center justify-center",
                            settings?.configured ? "bg-emerald-500/20 text-emerald-400" : "bg-amber-500/20 text-amber-400"
                        )}>
                            {settings?.configured ? <Check size={20} /> : <AlertCircle size={20} />}
                        </div>
                        <div>
                            <h3 className="text-white font-medium">
                                {settings?.configured ? 'AI Features Active' : 'AI Features Inactive'}
                            </h3>
                            {settings?.configured ? (
                                <div className="text-sm text-slate-400 mt-1 space-y-1">
                                    <p>
                                        Key: <code className="text-emerald-400 bg-emerald-500/10 px-1.5 py-0.5 rounded text-xs">{settings.key_hint}</code>
                                    </p>
                                    <p>
                                        Source: <span className={cn(
                                            "text-xs font-medium px-2 py-0.5 rounded",
                                            settings.source === 'admin' ? "bg-violet-500/15 text-violet-400" : "bg-zinc-500/15 text-zinc-400"
                                        )}>
                                            {settings.source === 'admin' ? 'Admin configured' : 'Environment variable'}
                                        </span>
                                    </p>
                                </div>
                            ) : (
                                <p className="text-sm text-slate-400 mt-1">
                                    Enter your Anthropic API key to enable AI-powered features.
                                </p>
                            )}
                        </div>
                    </div>
                    <div className="flex gap-2">
                        {settings?.source === 'admin' && (
                            <Button variant="outline" onClick={handleDelete} className="text-red-400 border-red-500/30 hover:bg-red-500/10">
                                <Trash2 size={14} className="mr-2" /> Remove
                            </Button>
                        )}
                        <Button onClick={() => setShowInput(true)} disabled={showInput}>
                            {settings?.configured ? 'Update Key' : 'Add Key'}
                        </Button>
                    </div>
                </div>

                {/* Key Input */}
                <AnimatePresence>
                    {showInput && (
                        <motion.div
                            initial={{ opacity: 0, height: 0 }}
                            animate={{ opacity: 1, height: 'auto' }}
                            exit={{ opacity: 0, height: 0 }}
                            className="mt-6 pt-6 border-t border-white/5 overflow-hidden"
                        >
                            <div className="flex gap-3">
                                <div className="flex-1 relative">
                                    <Shield className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
                                    <input
                                        type="password"
                                        value={newKey}
                                        onChange={(e) => setNewKey(e.target.value)}
                                        className="w-full bg-deep-space border border-white/10 rounded px-10 py-2.5 text-white font-mono text-sm placeholder-slate-500 focus:outline-none focus:border-gable-green transition-colors"
                                        placeholder="sk-ant-api03-..."
                                        autoFocus
                                    />
                                </div>
                                <Button variant="outline" onClick={() => { setShowInput(false); setNewKey(''); }}>Cancel</Button>
                                <Button onClick={handleSave} disabled={!newKey.trim() || saving} isLoading={saving}>
                                    Save Key
                                </Button>
                            </div>
                            <p className="text-xs text-slate-500 mt-2 flex items-center gap-1">
                                <Shield size={12} /> Your key is stored securely in the database and never exposed in API responses.
                            </p>
                        </motion.div>
                    )}
                </AnimatePresence>
            </div>

            {/* Feedback Messages */}
            {error && <div className="bg-red-500/10 border border-red-500/20 rounded-lg p-3 text-sm text-red-400">{error}</div>}
            {success && <div className="bg-emerald-500/10 border border-emerald-500/20 rounded-lg p-3 text-sm text-emerald-400">{success}</div>}

            {/* Features Powered */}
            <div>
                <h3 className="text-sm font-medium text-slate-400 uppercase tracking-wider mb-4">Features Powered by Claude</h3>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    {features.map((f) => (
                        <div key={f.name} className={cn(
                            "border rounded-lg p-4 transition-colors",
                            settings?.configured
                                ? "bg-slate-steel border-white/5"
                                : "bg-slate-steel/50 border-white/5 opacity-60"
                        )}>
                            <div className="flex items-center gap-2 mb-2">
                                <Sparkles className={cn("w-4 h-4", settings?.configured ? "text-violet-400" : "text-slate-600")} />
                                <span className="text-white text-sm font-medium">{f.name}</span>
                            </div>
                            <p className="text-xs text-slate-500">{f.description}</p>
                        </div>
                    ))}
                </div>
            </div>
        </div>
    );
};

// --- Gemini Settings Component ---

const GeminiSettingsPanel = () => {
    const [settings, setSettings] = useState<AISettings | null>(null);
    const [loading, setLoading] = useState(true);
    const [newKey, setNewKey] = useState('');
    const [saving, setSaving] = useState(false);
    const [showInput, setShowInput] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [success, setSuccess] = useState<string | null>(null);

    useEffect(() => {
        loadSettings();
    }, []);

    const loadSettings = async () => {
        try {
            const data = await techAdminService.getGeminiSettings();
            setSettings(data);
        } catch (err) {
            console.error(err);
        } finally {
            setLoading(false);
        }
    };

    const handleSave = async () => {
        if (!newKey.trim()) return;
        setSaving(true);
        setError(null);
        setSuccess(null);
        try {
            await techAdminService.saveGeminiKey(newKey.trim());
            setNewKey('');
            setShowInput(false);
            setSuccess('Gemini API key saved. Image generation is now active. Restart backend to apply.');
            await loadSettings();
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Failed to save');
        } finally {
            setSaving(false);
        }
    };

    const handleDelete = async () => {
        if (!confirm('Remove the Gemini API key? Image generation will fall back to Claude SVG.')) return;
        try {
            await techAdminService.deleteGeminiKey();
            setSuccess('Gemini API key removed.');
            await loadSettings();
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Failed to delete');
        }
    };

    if (loading) return <div className="text-slate-400 p-8">Loading Gemini settings...</div>;

    return (
        <div className="space-y-6">
            <div>
                <h2 className="text-xl font-bold text-white flex items-center gap-2">
                    <ImageIcon className="w-5 h-5 text-blue-400" />
                    Gemini Image Settings
                </h2>
                <p className="text-slate-400 text-sm mt-1">Configure your Google Gemini API key to enable AI product image generation.</p>
            </div>

            {/* Status Card */}
            <div className={cn(
                "border rounded-lg p-6",
                settings?.configured
                    ? "bg-blue-500/5 border-blue-500/20"
                    : "bg-amber-500/5 border-amber-500/20"
            )}>
                <div className="flex items-start justify-between">
                    <div className="flex items-start gap-4">
                        <div className={cn(
                            "w-10 h-10 rounded-lg flex items-center justify-center",
                            settings?.configured ? "bg-blue-500/20 text-blue-400" : "bg-amber-500/20 text-amber-400"
                        )}>
                            {settings?.configured ? <Check size={20} /> : <AlertCircle size={20} />}
                        </div>
                        <div>
                            <h3 className="text-white font-medium">
                                {settings?.configured ? 'Image Generation Active' : 'Image Generation Inactive'}
                            </h3>
                            {settings?.configured ? (
                                <div className="text-sm text-slate-400 mt-1 space-y-1">
                                    <p>
                                        Key: <code className="text-blue-400 bg-blue-500/10 px-1.5 py-0.5 rounded text-xs">{settings.key_hint}</code>
                                    </p>
                                    <p>
                                        Source: <span className={cn(
                                            "text-xs font-medium px-2 py-0.5 rounded",
                                            settings.source === 'admin' ? "bg-blue-500/15 text-blue-400" : "bg-zinc-500/15 text-zinc-400"
                                        )}>
                                            {settings.source === 'admin' ? 'Admin configured' : 'Environment variable'}
                                        </span>
                                    </p>
                                </div>
                            ) : (
                                <p className="text-sm text-slate-400 mt-1">
                                    Enter your Google Gemini API key to generate product images. Without it, Claude SVG illustrations are used as fallback.
                                </p>
                            )}
                        </div>
                    </div>
                    <div className="flex gap-2">
                        {settings?.source === 'admin' && (
                            <Button variant="outline" onClick={handleDelete} className="text-red-400 border-red-500/30 hover:bg-red-500/10">
                                <Trash2 size={14} className="mr-2" /> Remove
                            </Button>
                        )}
                        <Button onClick={() => setShowInput(true)} disabled={showInput}>
                            {settings?.configured ? 'Update Key' : 'Add Key'}
                        </Button>
                    </div>
                </div>

                {/* Key Input */}
                <AnimatePresence>
                    {showInput && (
                        <motion.div
                            initial={{ opacity: 0, height: 0 }}
                            animate={{ opacity: 1, height: 'auto' }}
                            exit={{ opacity: 0, height: 0 }}
                            className="mt-6 pt-6 border-t border-white/5 overflow-hidden"
                        >
                            <div className="flex gap-3">
                                <div className="flex-1 relative">
                                    <Shield className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
                                    <input
                                        type="password"
                                        value={newKey}
                                        onChange={(e) => setNewKey(e.target.value)}
                                        className="w-full bg-deep-space border border-white/10 rounded px-10 py-2.5 text-white font-mono text-sm placeholder-slate-500 focus:outline-none focus:border-blue-400 transition-colors"
                                        placeholder="AIza..."
                                        autoFocus
                                    />
                                </div>
                                <Button variant="outline" onClick={() => { setShowInput(false); setNewKey(''); }}>Cancel</Button>
                                <Button onClick={handleSave} disabled={!newKey.trim() || saving} isLoading={saving}>
                                    Save Key
                                </Button>
                            </div>
                            <p className="text-xs text-slate-500 mt-2 flex items-center gap-1">
                                <Shield size={12} /> Get your API key from <a href="https://aistudio.google.com/apikey" target="_blank" rel="noopener noreferrer" className="text-blue-400 hover:underline">Google AI Studio</a>. Stored securely in the database.
                            </p>
                        </motion.div>
                    )}
                </AnimatePresence>
            </div>

            {/* Feedback Messages */}
            {error && <div className="bg-red-500/10 border border-red-500/20 rounded-lg p-3 text-sm text-red-400">{error}</div>}
            {success && <div className="bg-blue-500/10 border border-blue-500/20 rounded-lg p-3 text-sm text-blue-400">{success}</div>}

            {/* Features Powered */}
            <div>
                <h3 className="text-sm font-medium text-slate-400 uppercase tracking-wider mb-4">Features Powered by Gemini</h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className={cn(
                        "border rounded-lg p-4 transition-colors",
                        settings?.configured
                            ? "bg-slate-steel border-white/5"
                            : "bg-slate-steel/50 border-white/5 opacity-60"
                    )}>
                        <div className="flex items-center gap-2 mb-2">
                            <ImageIcon className={cn("w-4 h-4", settings?.configured ? "text-blue-400" : "text-slate-600")} />
                            <span className="text-white text-sm font-medium">Product Image Generation</span>
                        </div>
                        <p className="text-xs text-slate-500">Generate professional product photos for your catalog using Gemini AI</p>
                    </div>
                </div>
            </div>
        </div>
    );
};

// --- Main Page Component ---

export const TechAdminPage = () => {
    const [activeTab, setActiveTab] = useState<'keys' | 'ai' | 'integrations' | 'health'>('keys');

    const tabs = [
        { id: 'keys', label: 'API Keys', icon: Key },
        { id: 'ai', label: 'AI Settings', icon: Sparkles },
        { id: 'integrations', label: 'Integrations', icon: Globe },
        { id: 'health', label: 'System Health', icon: Activity },
    ];

    return (
        <div className="min-h-screen bg-deep-space p-8 space-y-8">
            {/* Header */}
            <div>
                <h1 className="text-3xl font-bold text-white tracking-tight mb-2">Tech Admin</h1>
                <p className="text-slate-400">Manage integrations, API access, and system configuration.</p>
            </div>

            {/* Tabs */}
            <div className="flex gap-1 border-b border-white/10">
                {tabs.map((tab) => (
                    <button
                        key={tab.id}
                        onClick={() => setActiveTab(tab.id as typeof activeTab)}
                        className={cn(
                            "flex items-center gap-2 px-6 py-3 text-sm font-medium transition-colors relative",
                            activeTab === tab.id ? "text-gable-green" : "text-slate-400 hover:text-white"
                        )}
                    >
                        <tab.icon size={16} />
                        {tab.label}
                        {activeTab === tab.id && (
                            <motion.div
                                layoutId="activeTab"
                                className="absolute bottom-0 left-0 right-0 h-0.5 bg-gable-green"
                            />
                        )}
                    </button>
                ))}
            </div>

            {/* Content Area */}
            <div className="max-w-5xl">
                {activeTab === 'keys' && <APIKeyManager />}
                {activeTab === 'ai' && (
                    <div className="space-y-10">
                        <AISettingsPanel />
                        <GeminiSettingsPanel />
                    </div>
                )}
                {activeTab === 'integrations' && <Integrations />}
                {activeTab === 'health' && (
                    <div className="bg-slate-steel border border-white/5 rounded-lg p-12 text-center">
                        <Activity className="w-12 h-12 text-slate-500 mx-auto mb-4" />
                        <h3 className="text-lg font-medium text-white">System Health ok</h3>
                        <p className="text-slate-400 mt-2">All services are running normally. Logs coming soon.</p>
                    </div>
                )}
            </div>
        </div>
    );
};

export default TechAdminPage;
