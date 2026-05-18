import { LitElement, html, nothing } from 'lit';
import { customElement, state } from 'lit/decorators.js';
import { icon } from '../../lib/icons.ts';
import { Calculator, DollarSign, Download, ArrowRight } from 'lucide';
import { ToastService } from '../../lib/toast-service.ts';
import { RebateService } from '../../services/rebate.service.ts';
import type { RebateProgram, RebateClaim } from '../../types/rebate.ts';

@customElement('gable-rebate-report')
export class GableRebateReport extends LitElement {
    createRenderRoot() { return this; }

    @state() private programs: RebateProgram[] = [];
    @state() private selectedProgramId = '';
    @state() private claims: RebateClaim[] = [];

    // Calculator state
    @state() private calcStart = new Date(new Date().getFullYear(), 0, 1).toISOString().split('T')[0];
    @state() private calcEnd = new Date().toISOString().split('T')[0];
    @state() private mockVolume = 0;
    @state() private isCalculating = false;

    connectedCallback() {
        super.connectedCallback();
        this._loadPrograms();
    }

    private async _loadPrograms() {
        try {
            const data = await RebateService.listPrograms();
            this.programs = data;
            if (data.length > 0 && !this.selectedProgramId) {
                this.selectedProgramId = data[0].id!;
                this._onProgramChange();
            }
        } catch (err) {
            console.error(err);
            ToastService.show('Failed to load programs', 'error');
        }
    }

    updated(changed: Map<string, unknown>) {
        if (changed.has('selectedProgramId') && this.selectedProgramId) {
            this._onProgramChange();
        }
    }

    private _onProgramChange() {
        if (this.selectedProgramId) {
            this._loadClaims(this.selectedProgramId);
            const prog = this.programs.find(p => p.id === this.selectedProgramId);
            if (prog) {
                this.calcStart = prog.start_date.split('T')[0];
                this.calcEnd = prog.end_date.split('T')[0];
            }
        } else {
            this.claims = [];
        }
    }

    private async _loadClaims(id: string) {
        try {
            const data = await RebateService.listClaims(id);
            this.claims = data;
        } catch (err) {
            console.error(err);
            ToastService.show('Failed to load claims', 'error');
        }
    }

    private async _handleCalculate() {
        if (!this.selectedProgramId) return;

        this.isCalculating = true;
        try {
            await RebateService.calculateClaim(this.selectedProgramId, {
                period_start: new Date(this.calcStart).toISOString(),
                period_end: new Date(this.calcEnd).toISOString(),
                mock_volume: this.mockVolume
            });
            ToastService.show('Rebate calculated successfully', 'success');
            this._loadClaims(this.selectedProgramId);
        } catch (err) {
            console.error(err);
            ToastService.show('Failed to calculate rebate', 'error');
        } finally {
            this.isCalculating = false;
        }
    }

    private get selectedProgram(): RebateProgram | undefined {
        return this.programs.find(p => p.id === this.selectedProgramId);
    }

    private _getClaimStatusClasses(status: string): string {
        if (status === 'CALCULATED') return 'bg-blue-500/10 text-blue-400 border-blue-500/20';
        if (status === 'CLAIMED') return 'bg-yellow-500/10 text-yellow-400 border-yellow-500/20';
        return 'bg-[#00FFA3]/10 text-[#00FFA3] border-[#00FFA3]/20';
    }

    render() {
        return html`
            <div>
                <div class="flex justify-between items-center mb-6">
                    <div>
                        <h1 class="text-2xl font-bold text-white">Rebate Accrual Report</h1>
                        <p class="text-zinc-400">Calculate earned rebates versus claimed amounts</p>
                    </div>
                    <button class="flex items-center gap-2 px-4 py-2 bg-white/5 border border-white/10 text-white rounded-lg hover:bg-white/10 transition-colors">
                        ${icon(Download, 16, 'w-4 h-4')} Export CSV
                    </button>
                </div>

                <div class="grid grid-cols-1 lg:grid-cols-12 gap-6">
                    <div class="lg:col-span-4 space-y-6">
                        <div class="bg-[#161821]/60 backdrop-blur-sm border border-white/10 rounded-2xl">
                            <div class="p-6">
                                <h2 class="text-lg font-medium text-white mb-4">Select Program</h2>
                                <select
                                    class="w-full bg-[#0A0B10] border border-white/10 rounded px-3 py-2 text-white focus:border-[#00FFA3] outline-none"
                                    .value=${this.selectedProgramId}
                                    @change=${(e: Event) => { this.selectedProgramId = (e.target as HTMLSelectElement).value; }}
                                >
                                    <option value="" disabled>Select a program...</option>
                                    ${this.programs.map(p => html`
                                        <option value="${p.id}">${p.name}</option>
                                    `)}
                                </select>

                                ${this.selectedProgram?.tiers ? html`
                                    <div class="mt-6 border-t border-white/10 pt-4">
                                        <h3 class="text-sm font-medium text-zinc-300 mb-3">Tier Structure</h3>
                                        <div class="space-y-2">
                                            ${this.selectedProgram.tiers.map(t => html`
                                                <div class="flex justify-between text-xs bg-black/20 p-2 rounded">
                                                    <span class="font-mono text-zinc-400">
                                                        $${t.min_volume.toLocaleString()} - ${t.max_volume ? `$${t.max_volume.toLocaleString()}` : '+'}
                                                    </span>
                                                    <span class="font-bold text-[#00FFA3] align-right">${(t.rebate_pct * 100).toFixed(1)}%</span>
                                                </div>
                                            `)}
                                        </div>
                                    </div>
                                ` : nothing}
                            </div>
                        </div>

                        <div class="bg-[#161821]/60 backdrop-blur-sm border border-[#00FFA3]/20 rounded-2xl bg-gradient-to-b from-black/40 to-[#00FFA3]/5">
                            <div class="p-6">
                                <div class="flex items-center gap-2 mb-4">
                                    ${icon(Calculator, 20, 'w-5 h-5 text-[#00FFA3]')}
                                    <h2 class="text-lg font-medium text-white">Calculate Accrual</h2>
                                </div>

                                <div class="space-y-4 mb-6">
                                    <div>
                                        <label class="block text-xs text-zinc-400 mb-1">Period Start</label>
                                        <input
                                            type="date"
                                            class="w-full bg-black/40 border border-white/10 rounded px-3 py-2 text-white text-sm focus:border-[#00FFA3] [color-scheme:dark]"
                                            .value=${this.calcStart}
                                            @change=${(e: Event) => { this.calcStart = (e.target as HTMLInputElement).value; }}
                                        />
                                    </div>
                                    <div>
                                        <label class="block text-xs text-zinc-400 mb-1">Period End</label>
                                        <input
                                            type="date"
                                            class="w-full bg-black/40 border border-white/10 rounded px-3 py-2 text-white text-sm focus:border-[#00FFA3] [color-scheme:dark]"
                                            .value=${this.calcEnd}
                                            @change=${(e: Event) => { this.calcEnd = (e.target as HTMLInputElement).value; }}
                                        />
                                    </div>
                                    <div>
                                        <label class="block text-xs text-zinc-400 mb-1">Qualifying Volume (Mock Data)</label>
                                        <div class="relative">
                                            ${icon(DollarSign, 16, 'w-4 h-4 text-zinc-500 absolute left-3 top-2.5')}
                                            <input
                                                type="number"
                                                class="w-full bg-black/40 border border-white/10 rounded pl-9 pr-3 py-2 text-white font-mono focus:border-[#00FFA3]"
                                                .value=${String(this.mockVolume)}
                                                @input=${(e: InputEvent) => { this.mockVolume = Number((e.target as HTMLInputElement).value); }}
                                                placeholder="e.g. 500000"
                                            />
                                        </div>
                                        <p class="text-[10px] text-zinc-500 mt-1">
                                            In production, this automatically aggregates vendor invoices for the selected period.
                                        </p>
                                    </div>
                                </div>

                                <button
                                    @click=${() => this._handleCalculate()}
                                    ?disabled=${this.isCalculating || !this.selectedProgramId}
                                    class="w-full flex items-center justify-center gap-2 px-4 py-3 bg-[#00FFA3] text-black font-semibold rounded-lg hover:bg-[#00FFA3]/90 transition-colors disabled:opacity-50 shadow-[0_0_15px_rgba(0,255,163,0.3)]"
                                >
                                    ${this.isCalculating ? html`
                                        <div class="w-4 h-4 border-2 border-black border-t-transparent rounded-full animate-spin"></div>
                                    ` : nothing}
                                    Calculate Earned Rebate
                                </button>
                            </div>
                        </div>
                    </div>

                    <div class="lg:col-span-8">
                        <div class="bg-[#161821]/60 backdrop-blur-sm border border-white/10 rounded-2xl h-full">
                            <div class="p-6 border-b border-white/5 flex justify-between items-center bg-black/20">
                                <h2 class="text-lg font-medium text-white">Accrual History</h2>
                                ${this.claims.length > 0 ? html`
                                    <div class="text-right">
                                        <div class="text-xs text-zinc-400">Total Accrued (YTD)</div>
                                        <div class="text-xl font-mono font-bold text-[#00FFA3]">
                                            $${this.claims.reduce((sum, c) => sum + Number(c.rebate_amount), 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                                        </div>
                                    </div>
                                ` : nothing}
                            </div>

                            ${this.claims.length === 0 ? html`
                                <div class="p-12 text-center text-zinc-500">
                                    ${icon(Calculator, 48, 'w-12 h-12 text-zinc-600 mx-auto mb-4 opacity-50')}
                                    <p>No claims or calculations found for this program.</p>
                                    <p class="text-sm mt-2">Use the calculator to generate an accrual period.</p>
                                </div>
                            ` : html`
                                <div class="overflow-x-auto">
                                    <table class="w-full text-sm text-left">
                                        <thead class="bg-[#0A0B10] text-zinc-400 font-mono text-xs uppercase">
                                            <tr>
                                                <th class="px-6 py-4 font-medium">Period</th>
                                                <th class="px-6 py-4 font-medium text-right">Vol Base</th>
                                                <th class="px-6 py-4 font-medium text-right">Earned Amount</th>
                                                <th class="px-6 py-4 font-medium">Status</th>
                                                <th class="px-6 py-4 font-medium">Action</th>
                                            </tr>
                                        </thead>
                                        <tbody class="divide-y divide-white/5 text-zinc-300">
                                            ${this.claims.map(claim => html`
                                                <tr class="hover:bg-white/[0.02] transition-colors">
                                                    <td class="px-6 py-4 font-mono text-xs whitespace-nowrap">
                                                        ${new Date(claim.period_start).toLocaleDateString()} -<br/>
                                                        ${new Date(claim.period_end).toLocaleDateString()}
                                                    </td>
                                                    <td class="px-6 py-4 font-mono text-right">
                                                        $${Number(claim.qualifying_volume).toLocaleString()}
                                                    </td>
                                                    <td class="px-6 py-4 font-mono text-right font-bold text-white">
                                                        $${Number(claim.rebate_amount).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                                                    </td>
                                                    <td class="px-6 py-4">
                                                        <span class="inline-flex items-center px-2 py-1 rounded text-[10px] font-medium font-mono border ${this._getClaimStatusClasses(claim.status)}">
                                                            ${claim.status}
                                                        </span>
                                                    </td>
                                                    <td class="px-6 py-4">
                                                        ${claim.status === 'CALCULATED' ? html`
                                                            <button class="text-xs font-medium text-white hover:text-[#00FFA3] flex items-center gap-1 transition-colors">
                                                                Submit Claim ${icon(ArrowRight, 12, 'w-3 h-3')}
                                                            </button>
                                                        ` : nothing}
                                                        ${claim.status === 'CLAIMED' ? html`
                                                            <button class="text-xs font-medium text-white hover:text-[#00FFA3] flex items-center gap-1 transition-colors">
                                                                Mark Received ${icon(ArrowRight, 12, 'w-3 h-3')}
                                                            </button>
                                                        ` : nothing}
                                                    </td>
                                                </tr>
                                            `)}
                                        </tbody>
                                    </table>
                                </div>
                            `}
                        </div>
                    </div>
                </div>
            </div>
        `;
    }
}
