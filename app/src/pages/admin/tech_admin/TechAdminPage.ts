import { LitElement, html, nothing } from 'lit';
import { customElement, state } from 'lit/decorators.js';
import { icon } from '../../../lib/icons.ts';
import { cn } from '../../../lib/utils.ts';
import { techAdminService, ediService } from '../../../services/TechAdminService';
import type { APIKey, AISettings, RoutingSettings, EDITradingPartner } from '../../../services/TechAdminService';
import {
    Key, Globe, Activity, Plus, Trash2, Copy, Check, Eye, Sparkles,
    Shield, AlertCircle, Image as ImageIcon, Network, Power, RefreshCw, Navigation
} from 'lucide';

@customElement('gable-tech-admin')
export class TechAdminPage extends LitElement {
    createRenderRoot() { return this; }

    @state() private activeTab: 'keys' | 'ai' | 'routing' | 'integrations' | 'health' = 'keys';

    // API Key Manager state
    @state() private keys: APIKey[] = [];
    @state() private keysLoading = true;
    @state() private isCreating = false;
    @state() private newKeyName = '';
    @state() private generatedKey: string | null = null;
    @state() private copied = false;
    @state() private keyError: string | null = null;
    private _copiedTimer: ReturnType<typeof setTimeout> | null = null;

    // AI Settings state
    @state() private aiSettings: AISettings | null = null;
    @state() private aiLoading = true;
    @state() private aiNewKey = '';
    @state() private aiNewBaseUrl = '';
    @state() private aiSaving = false;
    @state() private aiShowInput = false;
    @state() private aiError: string | null = null;
    @state() private aiSuccess: string | null = null;

    // Routing (OpenRouteService) Settings state
    @state() private routingSettings: RoutingSettings | null = null;
    @state() private routingLoading = true;
    @state() private routingNewKey = '';
    @state() private routingSaving = false;
    @state() private routingShowInput = false;
    @state() private routingError: string | null = null;
    @state() private routingSuccess: string | null = null;

    // EDI state
    @state() private ediPartners: EDITradingPartner[] = [];
    @state() private ediLoading = true;
    @state() private ediError: string | null = null;

    connectedCallback() {
        super.connectedCallback();
        this._loadKeys();
        this._loadAISettings();
        this._loadRoutingSettings();
        this._loadEDIPartners();
    }

    disconnectedCallback() {
        super.disconnectedCallback();
        if (this._copiedTimer) clearTimeout(this._copiedTimer);
    }

    // --- API Key methods ---
    private async _loadKeys() {
        try {
            this.keyError = null;
            const data = await techAdminService.listKeys();
            this.keys = data;
        } catch (err) {
            console.error(err);
            this.keyError = err instanceof Error ? err.message : 'Failed to load API keys';
        } finally {
            this.keysLoading = false;
        }
    }

    private async _handleCreateKey() {
        if (!this.newKeyName) return;
        try {
            this.keyError = null;
            const res = await techAdminService.createKey(this.newKeyName, ['read:inventory', 'write:orders']);
            this.generatedKey = res.api_key;
            this.newKeyName = '';
            this._loadKeys();
        } catch (err) {
            console.error(err);
            this.keyError = err instanceof Error ? err.message : 'Failed to create API key';
        }
    }

    private async _handleRevokeKey(id: string) {
        if (!confirm('Are you sure you want to revoke this key? integrations using it will break immediately.')) return;
        try {
            this.keyError = null;
            await techAdminService.revokeKey(id);
            this._loadKeys();
        } catch (err) {
            console.error(err);
            this.keyError = err instanceof Error ? err.message : 'Failed to revoke API key';
        }
    }

    private _copyToClipboard(text: string) {
        navigator.clipboard.writeText(text).catch(() => {});
        this.copied = true;
        this._copiedTimer = setTimeout(() => this.copied = false, 2000);
    }

    // --- AI Settings methods ---
    private async _loadAISettings() {
        try {
            const data = await techAdminService.getAISettings();
            this.aiSettings = data;
        } catch (err) {
            console.error(err);
        } finally {
            this.aiLoading = false;
        }
    }

    private async _handleSaveAIKey() {
        if (!this.aiNewKey.trim()) return;
        this.aiSaving = true;
        this.aiError = null;
        this.aiSuccess = null;
        try {
            // Tri-state base URL: send a value to set the override, '' to clear an
            // existing override (revert to default), or omit it entirely when there
            // was no override and none was typed — so the default is never persisted.
            const typed = this.aiNewBaseUrl.trim();
            const hadOverride = !!this.aiSettings?.base_url;
            const baseUrlArg = typed !== '' ? typed : (hadOverride ? '' : undefined);
            await techAdminService.saveAIKey(this.aiNewKey.trim(), baseUrlArg);
            this.aiNewKey = '';
            this.aiNewBaseUrl = '';
            this.aiShowInput = false;
            this.aiSuccess = 'API key saved. All AI features are now active.';
            await this._loadAISettings();
        } catch (err) {
            this.aiError = err instanceof Error ? err.message : 'Failed to save';
        } finally {
            this.aiSaving = false;
        }
    }

    private async _handleDeleteAIKey() {
        if (!confirm('Remove the admin-configured API key? If an environment variable is set, it will be used as fallback.')) return;
        try {
            await techAdminService.deleteAIKey();
            this.aiSuccess = 'Admin API key removed.';
            await this._loadAISettings();
        } catch (err) {
            this.aiError = err instanceof Error ? err.message : 'Failed to delete';
        }
    }

    // --- Routing (OpenRouteService) Settings methods ---
    private async _loadRoutingSettings() {
        try {
            const data = await techAdminService.getRoutingSettings();
            this.routingSettings = data;
        } catch (err) {
            console.error(err);
        } finally {
            this.routingLoading = false;
        }
    }

    private async _handleSaveORSKey() {
        if (!this.routingNewKey.trim()) return;
        this.routingSaving = true;
        this.routingError = null;
        this.routingSuccess = null;
        try {
            await techAdminService.saveORSKey(this.routingNewKey.trim());
            this.routingNewKey = '';
            this.routingShowInput = false;
            this.routingSuccess = 'Routing key saved. Real route optimization & geocoding are now active.';
            await this._loadRoutingSettings();
        } catch (err) {
            this.routingError = err instanceof Error ? err.message : 'Failed to save';
        } finally {
            this.routingSaving = false;
        }
    }

    private async _handleDeleteORSKey() {
        if (!confirm('Remove the admin-configured OpenRouteService key? If an environment variable is set, it will be used as fallback; otherwise routing reverts to mock distances.')) return;
        try {
            await techAdminService.deleteORSKey();
            this.routingSuccess = 'Admin routing key removed.';
            await this._loadRoutingSettings();
        } catch (err) {
            this.routingError = err instanceof Error ? err.message : 'Failed to delete';
        }
    }

    // --- EDI methods ---
    private async _loadEDIPartners() {
        this.ediLoading = true;
        try {
            this.ediError = null;
            const data = await ediService.listPartners();
            this.ediPartners = data;
        } catch (err) {
            console.error(err);
            this.ediError = err instanceof Error ? err.message : 'Failed to load EDI partners';
        } finally {
            this.ediLoading = false;
        }
    }

    private async _handleTogglePartner(partner: EDITradingPartner) {
        try {
            this.ediError = null;
            await ediService.togglePartner(partner);
            this._loadEDIPartners();
        } catch (err) {
            console.error(err);
            this.ediError = err instanceof Error ? err.message : 'Failed to toggle partner status';
        }
    }

    private async _handleDeletePartner(id: string) {
        if (!confirm('Are you sure you want to remove this EDI partner? This will disconnect their catalog sync.')) return;
        try {
            this.ediError = null;
            await ediService.deletePartner(id);
            this._loadEDIPartners();
        } catch (err) {
            console.error(err);
            this.ediError = err instanceof Error ? err.message : 'Failed to delete EDI partner';
        }
    }

    private _renderTabs() {
        const tabs = [
            { id: 'keys' as const, label: 'API Keys', iconData: Key },
            { id: 'ai' as const, label: 'AI Settings', iconData: Sparkles },
            { id: 'routing' as const, label: 'Routing', iconData: Navigation },
            { id: 'integrations' as const, label: 'Integrations', iconData: Globe },
            { id: 'health' as const, label: 'System Health', iconData: Activity },
        ];

        return html`
            <div class="flex gap-1 border-b border-white/10">
                ${tabs.map((tab) => html`
                    <button
                        @click=${() => this.activeTab = tab.id}
                        class="${cn(
                            'flex items-center gap-2 px-6 py-3 text-sm font-medium transition-colors relative',
                            this.activeTab === tab.id ? 'text-gable-green' : 'text-slate-400 hover:text-white'
                        )}"
                    >
                        ${icon(tab.iconData, 16)}
                        ${tab.label}
                        ${this.activeTab === tab.id ? html`
                            <div class="absolute bottom-0 left-0 right-0 h-0.5 bg-gable-green"></div>
                        ` : nothing}
                    </button>
                `)}
            </div>
        `;
    }

    private _renderAPIKeyManager() {
        return html`
            <div class="space-y-6">
                <div class="flex justify-between items-center">
                    <div>
                        <h2 class="text-xl font-bold text-white">API Keys</h2>
                        <p class="text-slate-400 text-sm">Manage access keys for 3rd-party integrations.</p>
                    </div>
                    <button
                        @click=${() => this.isCreating = true}
                        ?disabled=${this.isCreating || !!this.generatedKey}
                        class="inline-flex items-center gap-2 bg-[#00FFA3] text-black font-semibold px-4 py-2 rounded hover:shadow-[0_0_10px_rgba(0,255,163,0.3)] transition-all disabled:opacity-50"
                    >
                        ${icon(Plus, 16)} New API Key
                    </button>
                </div>

                ${(this.isCreating || this.generatedKey) ? html`
                    <div class="bg-slate-steel/50 border border-white/10 rounded-lg p-6 overflow-hidden">
                        ${!this.generatedKey ? html`
                            <div class="flex gap-4 items-end">
                                <div class="flex-1 space-y-2">
                                    <label class="text-sm font-medium text-slate-300">Key Name (e.g. "Zapier Integration")</label>
                                    <input
                                        type="text"
                                        .value=${this.newKeyName}
                                        @input=${(e: Event) => this.newKeyName = (e.target as HTMLInputElement).value}
                                        class="w-full bg-deep-space border border-white/10 rounded px-3 py-2 text-white placeholder-slate-500 focus:outline-none focus:border-gable-green transition-colors"
                                        placeholder="Friendly name..."
                                    />
                                </div>
                                <div class="flex gap-2">
                                    <button @click=${() => this.isCreating = false} class="px-4 py-2 border border-white/10 text-white rounded hover:bg-white/5 transition-colors">Cancel</button>
                                    <button @click=${this._handleCreateKey} ?disabled=${!this.newKeyName} class="inline-flex items-center gap-2 bg-[#00FFA3] text-black font-semibold px-4 py-2 rounded disabled:opacity-50">Generate</button>
                                </div>
                            </div>
                        ` : html`
                            <div class="space-y-4">
                                <div class="flex items-center gap-2 text-amber-400 bg-amber-400/10 px-3 py-2 rounded text-sm">
                                    ${icon(Eye, 16)}
                                    <span>Copy this key now. You won't be able to see it again!</span>
                                </div>
                                <div class="flex gap-2">
                                    <code class="flex-1 bg-deep-space border border-gable-green/50 rounded px-4 py-3 text-gable-green font-mono text-lg break-all">
                                        ${this.generatedKey}
                                    </code>
                                    <button @click=${() => this._copyToClipboard(this.generatedKey!)} class="h-[52px] w-[52px] p-0 flex items-center justify-center border border-white/10 rounded hover:bg-white/5">
                                        ${this.copied ? icon(Check, 20, 'text-gable-green') : icon(Copy, 20)}
                                    </button>
                                </div>
                                <div class="flex justify-end">
                                    <button @click=${() => { this.generatedKey = null; this.isCreating = false; }} class="inline-flex items-center gap-2 bg-[#00FFA3] text-black font-semibold px-4 py-2 rounded">Done</button>
                                </div>
                            </div>
                        `}
                    </div>
                ` : nothing}

                ${this.keyError ? html`<div class="bg-red-500/10 border border-red-500/20 rounded-lg p-3 text-sm text-red-400">${this.keyError}</div>` : nothing}

                <div class="bg-slate-steel border border-white/5 rounded-lg overflow-hidden">
                    <table class="w-full text-left text-sm">
                        <thead class="bg-white/5 text-slate-400 font-medium">
                            <tr>
                                <th class="px-4 py-3">Name</th>
                                <th class="px-4 py-3">Prefix</th>
                                <th class="px-4 py-3">Created</th>
                                <th class="px-4 py-3">Last Used</th>
                                <th class="px-4 py-3">Status</th>
                                <th class="px-4 py-3 text-right">Actions</th>
                            </tr>
                        </thead>
                        <tbody class="divide-y divide-white/5">
                            ${this.keys.map((key) => html`
                                <tr class="hover:bg-white/5 transition-colors group">
                                    <td class="px-4 py-3 font-medium text-white">${key.name}</td>
                                    <td class="px-4 py-3 font-mono text-slate-400">${key.prefix}...</td>
                                    <td class="px-4 py-3 text-slate-400">${new Date(key.created_at).toLocaleDateString()}</td>
                                    <td class="px-4 py-3 text-slate-400">
                                        ${key.last_used_at ? new Date(key.last_used_at).toLocaleDateString() : 'Never'}
                                    </td>
                                    <td class="px-4 py-3">
                                        ${key.revoked_at
                                            ? html`<span class="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-red-500/10 text-red-500">Revoked</span>`
                                            : html`<span class="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-gable-green/10 text-gable-green">Active</span>`
                                        }
                                    </td>
                                    <td class="px-4 py-3 text-right">
                                        ${!key.revoked_at ? html`
                                            <button
                                                @click=${() => this._handleRevokeKey(key.id)}
                                                class="text-slate-500 hover:text-red-400 transition-colors p-1 rounded hover:bg-white/5"
                                                title="Revoke Key"
                                            >
                                                ${icon(Trash2, 16)}
                                            </button>
                                        ` : nothing}
                                    </td>
                                </tr>
                            `)}
                            ${this.keys.length === 0 && !this.keysLoading ? html`
                                <tr>
                                    <td colspan="6" class="px-4 py-8 text-center text-slate-500">
                                        No API keys generated yet.
                                    </td>
                                </tr>
                            ` : nothing}
                        </tbody>
                    </table>
                </div>
            </div>
        `;
    }

    private _renderAISettingsPanel() {
        if (this.aiLoading) return html`<div class="text-slate-400 p-8">Loading AI settings...</div>`;

        const features = [
            { name: 'Material List Parsing', description: 'Upload photos/PDFs/spreadsheets of material lists and auto-build quotes', iconData: Sparkles },
            { name: 'Freight Invoice OCR', description: 'Extract carrier, total, and invoice number from uploaded freight invoices', iconData: Sparkles },
            { name: 'PIM Content Generation', description: 'AI-generated product descriptions, SEO, and marketing copy', iconData: Sparkles },
            { name: 'Product Image Generation', description: 'Generate professional product images for your catalog', iconData: ImageIcon },
        ];

        return html`
            <div class="space-y-6">
                <div>
                    <h2 class="text-xl font-bold text-white flex items-center gap-2">
                        ${icon(Sparkles, 20, 'w-5 h-5 text-violet-400')}
                        AI Provider
                    </h2>
                    <p class="text-slate-400 text-sm mt-1">Configure your OpenRouter API key — one key powers all AI features across the ERP. Optionally point at a self-hosted, OpenAI-compatible endpoint.</p>
                </div>

                <div class="${cn('border rounded-lg p-6', this.aiSettings?.configured ? 'bg-emerald-500/5 border-emerald-500/20' : 'bg-amber-500/5 border-amber-500/20')}">
                    <div class="flex items-start justify-between">
                        <div class="flex items-start gap-4">
                            <div class="${cn('w-10 h-10 rounded-lg flex items-center justify-center', this.aiSettings?.configured ? 'bg-emerald-500/20 text-emerald-400' : 'bg-amber-500/20 text-amber-400')}">
                                ${this.aiSettings?.configured ? icon(Check, 20) : icon(AlertCircle, 20)}
                            </div>
                            <div>
                                <h3 class="text-white font-medium">
                                    ${this.aiSettings?.configured ? 'AI Features Active' : 'AI Features Inactive'}
                                </h3>
                                ${this.aiSettings?.configured ? html`
                                    <div class="text-sm text-slate-400 mt-1 space-y-1">
                                        <p>Key: <code class="text-emerald-400 bg-emerald-500/10 px-1.5 py-0.5 rounded text-xs">${this.aiSettings.key_hint}</code></p>
                                        <p>Source: <span class="${cn('text-xs font-medium px-2 py-0.5 rounded', this.aiSettings.source === 'admin' ? 'bg-violet-500/15 text-violet-400' : 'bg-zinc-500/15 text-zinc-400')}">${this.aiSettings.source === 'admin' ? 'Admin configured' : 'Environment variable'}</span></p>
                                        ${this.aiSettings.base_url ? html`<p>Base URL: <code class="text-blueprint-blue bg-blueprint-blue/10 px-1.5 py-0.5 rounded text-xs">${this.aiSettings.base_url}</code></p>` : nothing}
                                    </div>
                                ` : html`<p class="text-sm text-slate-400 mt-1">Enter your OpenRouter API key to enable AI-powered features.</p>`}
                            </div>
                        </div>
                        <div class="flex gap-2">
                            ${this.aiSettings?.source === 'admin' ? html`
                                <button @click=${this._handleDeleteAIKey} class="px-4 py-2 border border-red-500/30 text-red-400 rounded hover:bg-red-500/10 transition-colors inline-flex items-center gap-2">
                                    ${icon(Trash2, 14)} Remove
                                </button>
                            ` : nothing}
                            <button @click=${() => { this.aiShowInput = true; this.aiNewBaseUrl = this.aiSettings?.base_url ?? ''; }} ?disabled=${this.aiShowInput} class="inline-flex items-center gap-2 bg-[#00FFA3] text-black font-semibold px-4 py-2 rounded disabled:opacity-50">
                                ${this.aiSettings?.configured ? 'Update Key' : 'Add Key'}
                            </button>
                        </div>
                    </div>

                    ${this.aiShowInput ? html`
                        <div class="mt-6 pt-6 border-t border-white/5 overflow-hidden space-y-3">
                            <div class="relative">
                                ${icon(Shield, 16, 'absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500')}
                                <input
                                    type="password"
                                    .value=${this.aiNewKey}
                                    @input=${(e: Event) => this.aiNewKey = (e.target as HTMLInputElement).value}
                                    class="w-full bg-deep-space border border-white/10 rounded px-10 py-2.5 text-white font-mono text-sm placeholder-slate-500 focus:outline-none focus:border-gable-green transition-colors"
                                    placeholder="sk-or-..."
                                />
                            </div>
                            <div class="relative">
                                ${icon(Globe, 16, 'absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500')}
                                <input
                                    type="text"
                                    .value=${this.aiNewBaseUrl}
                                    @input=${(e: Event) => this.aiNewBaseUrl = (e.target as HTMLInputElement).value}
                                    class="w-full bg-deep-space border border-white/10 rounded px-10 py-2.5 text-white font-mono text-sm placeholder-slate-500 focus:outline-none focus:border-gable-green transition-colors"
                                    placeholder="https://openrouter.ai/api/v1  (optional — blank uses the default)"
                                />
                            </div>
                            <div class="flex gap-2 justify-end">
                                <button @click=${() => { this.aiShowInput = false; this.aiNewKey = ''; this.aiNewBaseUrl = ''; }} class="px-4 py-2 border border-white/10 text-white rounded hover:bg-white/5">Cancel</button>
                                <button @click=${this._handleSaveAIKey} ?disabled=${!this.aiNewKey.trim() || this.aiSaving} class="inline-flex items-center gap-2 bg-[#00FFA3] text-black font-semibold px-4 py-2 rounded disabled:opacity-50">
                                    Save Key
                                </button>
                            </div>
                            <p class="text-xs text-slate-500 flex items-center gap-1">
                                ${icon(Shield, 12)} Your key is stored securely in the database and never exposed in API responses. The base URL can target a self-hosted OpenAI-compatible endpoint.
                            </p>
                        </div>
                    ` : nothing}
                </div>

                ${this.aiError ? html`<div class="bg-red-500/10 border border-red-500/20 rounded-lg p-3 text-sm text-red-400">${this.aiError}</div>` : nothing}
                ${this.aiSuccess ? html`<div class="bg-emerald-500/10 border border-emerald-500/20 rounded-lg p-3 text-sm text-emerald-400">${this.aiSuccess}</div>` : nothing}

                <div>
                    <h3 class="text-sm font-medium text-slate-400 uppercase tracking-wider mb-4">Features Powered by AI</h3>
                    <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
                        ${features.map((f) => html`
                            <div class="${cn('border rounded-lg p-4 transition-colors', this.aiSettings?.configured ? 'bg-slate-steel border-white/5' : 'bg-slate-steel/50 border-white/5 opacity-60')}">
                                <div class="flex items-center gap-2 mb-2">
                                    ${icon(f.iconData, 16, cn('w-4 h-4', this.aiSettings?.configured ? 'text-violet-400' : 'text-slate-600'))}
                                    <span class="text-white text-sm font-medium">${f.name}</span>
                                </div>
                                <p class="text-xs text-slate-500">${f.description}</p>
                            </div>
                        `)}
                    </div>
                </div>
            </div>
        `;
    }

    private _renderRoutingSettingsPanel() {
        if (this.routingLoading) return html`<div class="text-slate-400 p-8">Loading routing settings...</div>`;

        const features = [
            { name: 'Route Optimization', description: 'Reorder delivery stops into the shortest-distance run from the dispatch board', iconData: Navigation },
            { name: 'Address Geocoding', description: 'Resolve delivery addresses to coordinates for mapping and ETAs', iconData: Globe },
        ];

        return html`
            <div class="space-y-6">
                <div>
                    <h2 class="text-xl font-bold text-white flex items-center gap-2">
                        ${icon(Navigation, 20, 'w-5 h-5 text-gable-green')}
                        Route Optimization Provider
                    </h2>
                    <p class="text-slate-400 text-sm mt-1">Configure your OpenRouteService API key to enable real route optimization &amp; geocoding. Without a key, the dispatch board falls back to mock distances. No redeploy needed — the key applies within 30 seconds.</p>
                </div>

                <div class="${cn('border rounded-lg p-6', this.routingSettings?.configured ? 'bg-emerald-500/5 border-emerald-500/20' : 'bg-amber-500/5 border-amber-500/20')}">
                    <div class="flex items-start justify-between">
                        <div class="flex items-start gap-4">
                            <div class="${cn('w-10 h-10 rounded-lg flex items-center justify-center', this.routingSettings?.configured ? 'bg-emerald-500/20 text-emerald-400' : 'bg-amber-500/20 text-amber-400')}">
                                ${this.routingSettings?.configured ? icon(Check, 20) : icon(AlertCircle, 20)}
                            </div>
                            <div>
                                <h3 class="text-white font-medium">
                                    ${this.routingSettings?.configured ? 'Real Routing Active' : 'Using Mock Routing'}
                                </h3>
                                ${this.routingSettings?.configured ? html`
                                    <div class="text-sm text-slate-400 mt-1 space-y-1">
                                        <p>Key: <code class="text-emerald-400 bg-emerald-500/10 px-1.5 py-0.5 rounded text-xs">${this.routingSettings.key_hint}</code></p>
                                        <p>Source: <span class="${cn('text-xs font-medium px-2 py-0.5 rounded', this.routingSettings.source === 'admin' ? 'bg-violet-500/15 text-violet-400' : 'bg-zinc-500/15 text-zinc-400')}">${this.routingSettings.source === 'admin' ? 'Admin configured' : 'Environment variable'}</span></p>
                                    </div>
                                ` : html`<p class="text-sm text-slate-400 mt-1">Enter your OpenRouteService API key to enable real route optimization and geocoding.</p>`}
                            </div>
                        </div>
                        <div class="flex gap-2">
                            ${this.routingSettings?.source === 'admin' ? html`
                                <button @click=${this._handleDeleteORSKey} class="px-4 py-2 border border-red-500/30 text-red-400 rounded hover:bg-red-500/10 transition-colors inline-flex items-center gap-2">
                                    ${icon(Trash2, 14)} Remove
                                </button>
                            ` : nothing}
                            <button @click=${() => { this.routingShowInput = true; }} ?disabled=${this.routingShowInput} class="inline-flex items-center gap-2 bg-[#00FFA3] text-black font-semibold px-4 py-2 rounded disabled:opacity-50">
                                ${this.routingSettings?.configured ? 'Update Key' : 'Add Key'}
                            </button>
                        </div>
                    </div>

                    ${this.routingShowInput ? html`
                        <div class="mt-6 pt-6 border-t border-white/5 overflow-hidden space-y-3">
                            <div class="relative">
                                ${icon(Shield, 16, 'absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500')}
                                <input
                                    type="password"
                                    .value=${this.routingNewKey}
                                    @input=${(e: Event) => this.routingNewKey = (e.target as HTMLInputElement).value}
                                    class="w-full bg-deep-space border border-white/10 rounded px-10 py-2.5 text-white font-mono text-sm placeholder-slate-500 focus:outline-none focus:border-gable-green transition-colors"
                                    placeholder="5b3ce3597851..."
                                />
                            </div>
                            <div class="flex gap-2 justify-end">
                                <button @click=${() => { this.routingShowInput = false; this.routingNewKey = ''; }} class="px-4 py-2 border border-white/10 text-white rounded hover:bg-white/5">Cancel</button>
                                <button @click=${this._handleSaveORSKey} ?disabled=${!this.routingNewKey.trim() || this.routingSaving} class="inline-flex items-center gap-2 bg-[#00FFA3] text-black font-semibold px-4 py-2 rounded disabled:opacity-50">
                                    Save Key
                                </button>
                            </div>
                            <p class="text-xs text-slate-500 flex items-center gap-1">
                                ${icon(Shield, 12)} Your key is stored securely in the database and never exposed in API responses. Get a free key at openrouteservice.org.
                            </p>
                        </div>
                    ` : nothing}
                </div>

                ${this.routingError ? html`<div class="bg-red-500/10 border border-red-500/20 rounded-lg p-3 text-sm text-red-400">${this.routingError}</div>` : nothing}
                ${this.routingSuccess ? html`<div class="bg-emerald-500/10 border border-emerald-500/20 rounded-lg p-3 text-sm text-emerald-400">${this.routingSuccess}</div>` : nothing}

                <div>
                    <h3 class="text-sm font-medium text-slate-400 uppercase tracking-wider mb-4">Features Powered by Routing</h3>
                    <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
                        ${features.map((f) => html`
                            <div class="${cn('border rounded-lg p-4 transition-colors', this.routingSettings?.configured ? 'bg-slate-steel border-white/5' : 'bg-slate-steel/50 border-white/5 opacity-60')}">
                                <div class="flex items-center gap-2 mb-2">
                                    ${icon(f.iconData, 16, cn('w-4 h-4', this.routingSettings?.configured ? 'text-gable-green' : 'text-slate-600'))}
                                    <span class="text-white text-sm font-medium">${f.name}</span>
                                </div>
                                <p class="text-xs text-slate-500">${f.description}</p>
                            </div>
                        `)}
                    </div>
                </div>
            </div>
        `;
    }

    private _renderIntegrations() {
        const integrations = [
            { name: 'Run Payments', description: 'Secure payment processing for card-present and online transactions. Preferred Partner.', iconData: Activity, connected: false },
            { name: 'QuickBooks Online', description: 'Automatically sync invoices, payments, and customers with your General Ledger.', iconData: Globe, connected: false },
            { name: 'Avalara AvaTax', description: 'Real-time tax calculation and compliance for all 50 states.', iconData: Globe, connected: false },
            { name: 'Zapier / Make', description: 'Connect GableLBM to 5,000+ other apps via webhooks.', iconData: Activity, connected: false },
        ];

        return html`
            <div class="space-y-6">
                <div class="grid grid-cols-1 lg:grid-cols-2 gap-4">
                    ${integrations.map(i => html`
                        <div class="bg-slate-steel border border-white/5 p-6 rounded-lg flex items-start justify-between hover:border-white/10 transition-colors group">
                            <div class="flex gap-4">
                                <div class="${cn('w-12 h-12 rounded-lg flex items-center justify-center shrink-0 transition-colors', i.connected ? 'bg-gable-green/20 text-gable-green' : 'bg-white/5 text-slate-400 group-hover:text-white')}">
                                    ${icon(i.iconData, 24)}
                                </div>
                                <div>
                                    <h3 class="text-lg font-semibold text-white mb-1">${i.name}</h3>
                                    <p class="text-slate-400 text-sm leading-relaxed">${i.description}</p>
                                </div>
                            </div>
                            <button class="${cn('inline-flex items-center gap-2 px-4 py-2 rounded font-semibold transition-colors', i.connected ? 'border border-gable-green/50 text-gable-green hover:bg-gable-green/10' : 'bg-[#00FFA3] text-black')}">
                                ${i.connected ? 'Configure' : 'Connect'}
                            </button>
                        </div>
                    `)}
                </div>

                <!-- EDI Trading Partners -->
                <div class="space-y-6 mt-12 pt-12 border-t border-white/10">
                    <div class="flex justify-between items-center">
                        <div>
                            <h2 class="text-xl font-bold text-white flex items-center gap-2">
                                ${icon(Network, 20, 'text-gable-green')}
                                EDI Trading Partners
                            </h2>
                            <p class="text-slate-400 text-sm">Manage vendor-agnostic EDI configurations and catalog sync.</p>
                        </div>
                        <button @click=${this._loadEDIPartners} class="px-3 py-1.5 border border-white/10 text-slate-400 hover:text-white rounded text-sm inline-flex items-center gap-2 transition-colors">
                            ${icon(RefreshCw, 14, cn(this.ediLoading && 'animate-spin'))} Refresh
                        </button>
                    </div>

                    ${this.ediError ? html`<div class="bg-red-500/10 border border-red-500/20 rounded-lg p-3 text-sm text-red-400">${this.ediError}</div>` : nothing}

                    <div class="bg-slate-steel border border-white/5 rounded-lg overflow-hidden">
                        <table class="w-full text-left text-sm">
                            <thead class="bg-white/5 text-slate-400 font-medium">
                                <tr>
                                    <th class="px-4 py-3">Partner Name</th>
                                    <th class="px-4 py-3">EDI Version</th>
                                    <th class="px-4 py-3">Transport</th>
                                    <th class="px-4 py-3">Status</th>
                                    <th class="px-4 py-3 text-right">Actions</th>
                                </tr>
                            </thead>
                            <tbody class="divide-y divide-white/5">
                                ${this.ediPartners.map((partner) => html`
                                    <tr class="hover:bg-white/5 transition-colors group">
                                        <td class="px-4 py-3">
                                            <span class="font-medium text-white">${partner.name}</span>
                                            <div class="text-[10px] text-slate-500 font-mono mt-0.5">${partner.id.split('-')[0]}...</div>
                                        </td>
                                        <td class="px-4 py-3">
                                            <code class="text-xs bg-white/5 px-2 py-1 rounded text-slate-300">${partner.edi_version}</code>
                                        </td>
                                        <td class="px-4 py-3">
                                            <div class="flex items-center gap-2">
                                                <span class="text-slate-300">${partner.transport_type}</span>
                                                <span class="text-xs text-slate-500 font-mono">(${partner.isa_sender_id} -> ${partner.isa_receiver_id})</span>
                                            </div>
                                        </td>
                                        <td class="px-4 py-3">
                                            <button
                                                @click=${() => this._handleTogglePartner(partner)}
                                                class="${cn(
                                                    'inline-flex items-center px-2 py-0.5 rounded text-xs font-medium cursor-pointer transition-colors',
                                                    partner.is_active ? 'bg-gable-green/10 text-gable-green hover:bg-gable-green/20' : 'bg-slate-500/10 text-slate-500 hover:bg-slate-500/20'
                                                )}"
                                            >
                                                ${icon(Power, 10, 'mr-1')}
                                                ${partner.is_active ? 'Active' : 'Inactive'}
                                            </button>
                                        </td>
                                        <td class="px-4 py-3 text-right">
                                            <button
                                                @click=${() => this._handleDeletePartner(partner.id)}
                                                class="text-slate-500 hover:text-red-400 transition-colors p-1 rounded hover:bg-white/5"
                                            >
                                                ${icon(Trash2, 16)}
                                            </button>
                                        </td>
                                    </tr>
                                `)}
                                ${this.ediPartners.length === 0 && !this.ediLoading ? html`
                                    <tr><td colspan="5" class="px-4 py-8 text-center text-slate-500">No EDI Trading Partners configured.</td></tr>
                                ` : nothing}
                                ${this.ediLoading && this.ediPartners.length === 0 ? html`
                                    <tr><td colspan="5" class="px-4 py-8 text-center text-slate-500 italic">Loading partners...</td></tr>
                                ` : nothing}
                            </tbody>
                        </table>
                    </div>

                    <div class="bg-amber-500/5 border border-amber-500/20 rounded-lg p-4 flex gap-4">
                        ${icon(AlertCircle, 20, 'w-5 h-5 text-amber-500 shrink-0')}
                        <div class="text-sm">
                            <p class="text-amber-200 font-medium mb-1">Developer Mode</p>
                            <p class="text-amber-500/80">EDI partners are currently in read+toggle mode. Full transport configuration (SFTP/AS2 keys) and catalog mapping UI are planned for the next sprint.</p>
                        </div>
                    </div>
                </div>
            </div>
        `;
    }

    render() {
        return html`
            <div class="min-h-screen bg-deep-space p-8 space-y-8">
                <div>
                    <h1 class="text-3xl font-bold text-white tracking-tight mb-2">Tech Admin</h1>
                    <p class="text-slate-400">Manage integrations, API access, and system configuration.</p>
                </div>

                ${this._renderTabs()}

                <div class="max-w-5xl">
                    ${this.activeTab === 'keys' ? this._renderAPIKeyManager() : nothing}
                    ${this.activeTab === 'ai' ? this._renderAISettingsPanel() : nothing}
                    ${this.activeTab === 'routing' ? this._renderRoutingSettingsPanel() : nothing}
                    ${this.activeTab === 'integrations' ? this._renderIntegrations() : nothing}
                    ${this.activeTab === 'health' ? html`
                        <div class="bg-slate-steel border border-white/5 rounded-lg p-12 text-center">
                            ${icon(Activity, 48, 'w-12 h-12 text-slate-500 mx-auto mb-4')}
                            <h3 class="text-lg font-medium text-white">System Health ok</h3>
                            <p class="text-slate-400 mt-2">All services are running normally. Logs coming soon.</p>
                        </div>
                    ` : nothing}
                </div>
            </div>
        `;
    }
}

export default TechAdminPage;
