import { LitElement, html, nothing } from 'lit';
import { customElement, state } from 'lit/decorators.js';
import { icon } from '../../lib/icons.ts';
import { Plus, Percent, Check, AlertCircle } from 'lucide';
import { ToastService } from '../../lib/toast-service.ts';
import { RebateService } from '../../services/rebate.service.ts';
import type { RebateProgram, RebateTier } from '../../types/rebate.ts';

@customElement('gable-rebate-programs')
export class GableRebatePrograms extends LitElement {
    createRenderRoot() { return this; }

    @state() private programs: RebateProgram[] = [];
    @state() private loading = true;

    @state() private isCreating = false;
    @state() private newProgram: Partial<RebateProgram> = {
        program_type: 'VOLUME',
        is_active: true
    };
    @state() private newTiers: Partial<RebateTier>[] = [{ min_volume: 0, max_volume: 100000, rebate_pct: 0.02 }];

    connectedCallback() {
        super.connectedCallback();
        this._loadPrograms();
    }

    private async _loadPrograms() {
        this.loading = true;
        try {
            const data = await RebateService.listPrograms();
            this.programs = data;
        } catch (err) {
            console.error(err);
            ToastService.show('Failed to load rebate programs', 'error');
        } finally {
            this.loading = false;
        }
    }

    private async _handleCreate() {
        if (!this.newProgram.vendor_id || !this.newProgram.name || !this.newProgram.start_date || !this.newProgram.end_date) {
            ToastService.show('Please fill out all program details', 'error');
            return;
        }

        try {
            await RebateService.createProgram(this.newProgram as RebateProgram, this.newTiers as RebateTier[]);
            ToastService.show('Rebate program created', 'success');
            this.isCreating = false;
            this.newProgram = { program_type: 'VOLUME', is_active: true };
            this.newTiers = [{ min_volume: 0, max_volume: 100000, rebate_pct: 0.02 }];
            this._loadPrograms();
        } catch (err) {
            console.error(err);
            ToastService.show('Failed to create rebate program', 'error');
        }
    }

    private _addTier() {
        const lastTier = this.newTiers[this.newTiers.length - 1];
        this.newTiers = [...this.newTiers, {
            min_volume: lastTier ? Number(lastTier.max_volume) + 1 : 0,
            max_volume: null,
            rebate_pct: lastTier ? lastTier.rebate_pct! + 0.01 : 0.02
        }];
    }

    private _updateTier(idx: number, field: keyof RebateTier, value: number | string | null) {
        const tiers = [...this.newTiers];
        tiers[idx] = { ...tiers[idx], [field]: value };
        this.newTiers = tiers;
    }

    render() {
        return html`
            <div>
                <div class="flex justify-between items-center mb-6">
                    <div>
                        <h1 class="text-2xl font-bold text-white">Vendor Rebate Programs</h1>
                        <p class="text-zinc-400">Manage volume and growth-based vendor incentive programs</p>
                    </div>
                    <button
                        @click=${() => { this.isCreating = !this.isCreating; }}
                        class="flex items-center gap-2 px-4 py-2 rounded-lg font-semibold transition-colors shadow-[0_0_15px_rgba(0,255,163,0.3)] ${this.isCreating
                            ? 'bg-white/5 border border-white/10 text-white'
                            : 'bg-[#00FFA3] text-black'
                        }"
                    >
                        ${this.isCreating ? 'Cancel' : html`${icon(Plus, 16, 'w-4 h-4')} New Program`}
                    </button>
                </div>

                ${this.isCreating ? html`
                    <div class="bg-[#161821]/60 backdrop-blur-sm border border-[#00FFA3]/30 rounded-2xl mb-8">
                        <div class="p-6">
                            <h2 class="text-lg font-semibold text-white mb-4">Create New Rebate Program</h2>

                            <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
                                <div>
                                    <label class="block text-xs text-zinc-400 mb-1">Vendor ID</label>
                                    <input
                                        type="text"
                                        class="w-full bg-black/40 border border-white/10 rounded px-3 py-2 text-white text-sm focus:border-[#00FFA3] focus:outline-none"
                                        .value=${this.newProgram.vendor_id || ''}
                                        @input=${(e: InputEvent) => { this.newProgram = { ...this.newProgram, vendor_id: (e.target as HTMLInputElement).value }; }}
                                        placeholder="UUID"
                                    />
                                </div>
                                <div>
                                    <label class="block text-xs text-zinc-400 mb-1">Program Name</label>
                                    <input
                                        type="text"
                                        class="w-full bg-black/40 border border-white/10 rounded px-3 py-2 text-white text-sm focus:border-[#00FFA3] focus:outline-none"
                                        .value=${this.newProgram.name || ''}
                                        @input=${(e: InputEvent) => { this.newProgram = { ...this.newProgram, name: (e.target as HTMLInputElement).value }; }}
                                        placeholder="e.g. 2028 Simpson Strong-Tie Volume"
                                    />
                                </div>
                                <div>
                                    <label class="block text-xs text-zinc-400 mb-1">Start Date</label>
                                    <input
                                        type="date"
                                        class="w-full bg-black/40 border border-white/10 rounded px-3 py-2 text-white text-sm focus:border-[#00FFA3] focus:outline-none [color-scheme:dark]"
                                        .value=${this.newProgram.start_date || ''}
                                        @change=${(e: Event) => { this.newProgram = { ...this.newProgram, start_date: (e.target as HTMLInputElement).value }; }}
                                    />
                                </div>
                                <div>
                                    <label class="block text-xs text-zinc-400 mb-1">End Date</label>
                                    <input
                                        type="date"
                                        class="w-full bg-black/40 border border-white/10 rounded px-3 py-2 text-white text-sm focus:border-[#00FFA3] focus:outline-none [color-scheme:dark]"
                                        .value=${this.newProgram.end_date || ''}
                                        @change=${(e: Event) => { this.newProgram = { ...this.newProgram, end_date: (e.target as HTMLInputElement).value }; }}
                                    />
                                </div>
                            </div>

                            <div class="mb-6">
                                <div class="flex justify-between items-center mb-2">
                                    <label class="block text-sm font-medium text-white mb-1">Volume Tiers</label>
                                    <button @click=${() => this._addTier()} class="text-xs text-[#00FFA3] hover:text-white transition-colors flex items-center gap-1">
                                        ${icon(Plus, 12, 'w-3 h-3')} Add Tier
                                    </button>
                                </div>

                                <div class="bg-black/20 rounded-lg p-1 border border-white/5">
                                    ${this.newTiers.map((tier, idx) => html`
                                        <div class="flex gap-2 p-2 items-end">
                                            <div class="flex-1">
                                                <span class="text-xs text-zinc-500 block mb-1">Min Volume ($)</span>
                                                <input
                                                    type="number"
                                                    class="w-full bg-[#0A0B10] border border-white/10 rounded px-2 py-1.5 text-white font-mono text-sm focus:border-[#00FFA3] outline-none"
                                                    .value=${String(tier.min_volume || 0)}
                                                    @input=${(e: InputEvent) => this._updateTier(idx, 'min_volume', Number((e.target as HTMLInputElement).value))}
                                                />
                                            </div>
                                            <div class="flex-1">
                                                <span class="text-xs text-zinc-500 block mb-1">Max Volume ($)</span>
                                                <input
                                                    type="number"
                                                    class="w-full bg-[#0A0B10] border border-white/10 rounded px-2 py-1.5 text-white font-mono text-sm focus:border-[#00FFA3] outline-none"
                                                    .value=${tier.max_volume != null ? String(tier.max_volume) : ''}
                                                    placeholder="No limit"
                                                    @input=${(e: InputEvent) => {
                                                        const val = (e.target as HTMLInputElement).value;
                                                        this._updateTier(idx, 'max_volume', val ? Number(val) : null);
                                                    }}
                                                />
                                            </div>
                                            <div class="w-32">
                                                <span class="text-xs text-zinc-500 block mb-1">Rebate %</span>
                                                <div class="relative">
                                                    <input
                                                        type="number"
                                                        step="0.001"
                                                        class="w-full bg-[#0A0B10] border border-white/10 rounded pl-8 pr-2 py-1.5 text-white font-mono text-sm focus:border-[#00FFA3] outline-none"
                                                        .value=${String(tier.rebate_pct || 0)}
                                                        @input=${(e: InputEvent) => this._updateTier(idx, 'rebate_pct', Number((e.target as HTMLInputElement).value))}
                                                    />
                                                    ${icon(Percent, 16, 'w-4 h-4 text-zinc-500 absolute left-2.5 top-2')}
                                                </div>
                                            </div>
                                        </div>
                                    `)}
                                </div>
                            </div>

                            <div class="flex justify-end gap-3">
                                <button
                                    @click=${() => { this.isCreating = false; }}
                                    class="px-4 py-2 text-zinc-400 hover:text-white transition-colors"
                                >
                                    Cancel
                                </button>
                                <button
                                    @click=${() => this._handleCreate()}
                                    class="flex items-center gap-2 px-4 py-2 bg-[#00FFA3] text-black font-semibold rounded-lg hover:bg-[#00FFA3]/90 transition-colors"
                                >
                                    ${icon(Check, 16, 'w-4 h-4')} Save Program
                                </button>
                            </div>
                        </div>
                    </div>
                ` : nothing}

                <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                    ${this.loading ? html`
                        <div class="col-span-full py-12 text-center text-zinc-500">Loading programs...</div>
                    ` : this.programs.length === 0 ? html`
                        <div class="col-span-full py-20 text-center">
                            ${icon(AlertCircle, 48, 'w-12 h-12 text-zinc-600 mx-auto mb-4')}
                            <h3 class="text-lg font-medium text-white mb-2">No Rebate Programs</h3>
                            <p class="text-zinc-400 mb-6">Create your first vendor rebate program to start tracking incentives.</p>
                            <button
                                @click=${() => { this.isCreating = true; }}
                                class="px-4 py-2 bg-[#00FFA3] text-black font-semibold rounded-lg hover:bg-[#00FFA3]/90 transition-colors"
                            >
                                Create Program
                            </button>
                        </div>
                    ` : html`
                        ${this.programs.map(prog => html`
                            <div class="bg-[#161821]/60 backdrop-blur-sm border border-white/10 rounded-2xl hover:border-white/20 transition-all">
                                <div class="p-6 relative">
                                    ${prog.is_active ? html`
                                        <div class="absolute top-4 right-4 w-2 h-2 rounded-full bg-[#00FFA3] shadow-[0_0_8px_rgba(0,255,163,0.8)]" title="Active"></div>
                                    ` : html`
                                        <div class="absolute top-4 right-4 w-2 h-2 rounded-full bg-zinc-600" title="Inactive"></div>
                                    `}

                                    <div class="text-xs text-[#00FFA3] font-mono mb-2 bg-[#00FFA3]/10 inline-block px-2 py-0.5 rounded">
                                        ${prog.program_type}
                                    </div>
                                    <h3 class="text-lg font-bold text-white mb-1 truncate" title="${prog.name}">${prog.name}</h3>
                                    <p class="text-sm text-zinc-400 font-mono mb-4 text-xs truncate">Vendor: ${prog.vendor_id}</p>

                                    <div class="grid grid-cols-2 gap-4 mb-4 text-sm bg-black/20 p-3 rounded border border-white/5">
                                        <div>
                                            <div class="text-zinc-500 text-xs mb-1">Period Start</div>
                                            <div class="text-white font-mono">${new Date(prog.start_date).toLocaleDateString()}</div>
                                        </div>
                                        <div>
                                            <div class="text-zinc-500 text-xs mb-1">Period End</div>
                                            <div class="text-white font-mono">${new Date(prog.end_date).toLocaleDateString()}</div>
                                        </div>
                                    </div>

                                    ${prog.tiers && prog.tiers.length > 0 ? html`
                                        <div>
                                            <div class="text-xs font-semibold text-zinc-400 uppercase tracking-wider mb-2">Tiers (${prog.tiers.length})</div>
                                            <div class="space-y-1">
                                                ${prog.tiers.slice(0, 3).map(tier => html`
                                                    <div class="flex justify-between text-xs font-mono">
                                                        <span class="text-zinc-400">
                                                            $${tier.min_volume.toLocaleString()} - ${tier.max_volume ? `$${tier.max_volume.toLocaleString()}` : 'MAX'}
                                                        </span>
                                                        <span class="text-[#00FFA3]">${(tier.rebate_pct * 100).toFixed(1)}%</span>
                                                    </div>
                                                `)}
                                                ${prog.tiers.length > 3 ? html`
                                                    <div class="text-xs text-zinc-500 mt-1 italic">+ ${prog.tiers.length - 3} more tiers</div>
                                                ` : nothing}
                                            </div>
                                        </div>
                                    ` : nothing}
                                </div>
                            </div>
                        `)}
                    `}
                </div>
            </div>
        `;
    }
}
