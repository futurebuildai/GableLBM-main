import { LitElement, html, nothing } from 'lit';
import { customElement, state } from 'lit/decorators.js';
import { icon } from '../../lib/icons.ts';
import { ToastService } from '../../lib/toast-service.ts';
import { fetchAccounts, createAccount } from '../../services/GLService';
import type { GLAccount, CreateAccountRequest } from '../../types/gl';
import { BookOpen, Plus, X } from 'lucide';

const ACCOUNT_TYPE_COLORS: Record<string, string> = {
    ASSET: 'bg-blue-500/20 text-blue-300',
    LIABILITY: 'bg-red-500/20 text-red-300',
    EQUITY: 'bg-purple-500/20 text-purple-300',
    REVENUE: 'bg-emerald-500/20 text-emerald-300',
    EXPENSE: 'bg-amber-500/20 text-amber-300',
};

const ACCOUNT_TYPES = ['ASSET', 'LIABILITY', 'EQUITY', 'REVENUE', 'EXPENSE'];

@customElement('gable-chart-of-accounts')
export class ChartOfAccounts extends LitElement {
    createRenderRoot() { return this; }

    @state() private accounts: GLAccount[] = [];
    @state() private loading = true;
    @state() private showCreate = false;
    @state() private form: CreateAccountRequest = {
        code: '', name: '', type: 'ASSET', subtype: '', normal_balance: 'DEBIT', description: '',
    };
    @state() private error = '';

    connectedCallback() {
        super.connectedCallback();
        this._load();
    }

    private async _load() {
        try {
            const data = await fetchAccounts();
            this.accounts = data || [];
        } catch (err) {
            console.error(err);
            ToastService.show('Failed to load chart of accounts', 'error');
        } finally {
            this.loading = false;
        }
    }

    private async _handleCreate() {
        this.error = '';
        try {
            await createAccount(this.form);
            this.showCreate = false;
            this.form = { code: '', name: '', type: 'ASSET', subtype: '', normal_balance: 'DEBIT', description: '' };
            this._load();
        } catch (err) {
            this.error = err instanceof Error ? err.message : 'Failed to create account';
        }
    }

    private _formatBalance(balanceCents: number) {
        const dollars = Math.abs(balanceCents) / 100;
        const sign = balanceCents < 0 ? '-' : '';
        return `${sign}$${dollars.toLocaleString('en-US', { minimumFractionDigits: 2 })}`;
    }

    private _updateForm(field: string, value: string) {
        const updated = { ...this.form, [field]: value };
        if (field === 'type') {
            updated.normal_balance = ['ASSET', 'EXPENSE'].includes(value) ? 'DEBIT' : 'CREDIT';
        }
        this.form = updated;
    }

    render() {
        if (this.loading) {
            return html`<div class="p-8 text-center text-zinc-400">Loading chart of accounts...</div>`;
        }

        const groupedAccounts = ACCOUNT_TYPES.reduce((acc, type) => {
            acc[type] = this.accounts.filter(a => a.type === type);
            return acc;
        }, {} as Record<string, GLAccount[]>);

        return html`
            <div class="p-6 max-w-[1600px] mx-auto space-y-6 animate-in fade-in duration-500">
                <div class="flex justify-between items-center">
                    <div>
                        <h1 class="text-2xl font-bold bg-gradient-to-r from-white to-zinc-400 bg-clip-text text-transparent">
                            Chart of Accounts
                        </h1>
                        <p class="text-zinc-400 mt-1">
                            ${this.accounts.length} accounts across ${ACCOUNT_TYPES.length} categories
                        </p>
                    </div>
                    <button
                        @click=${() => this.showCreate = true}
                        class="inline-flex items-center gap-2 bg-emerald-600 hover:bg-emerald-500 text-white font-semibold px-4 py-2 rounded transition-colors"
                    >
                        ${icon(Plus, 16, 'w-4 h-4')}
                        New Account
                    </button>
                </div>

                ${this.showCreate ? html`
                    <div class="backdrop-blur-md bg-white/5 border border-emerald-500/30 rounded-xl">
                        <div class="p-4 pb-2">
                            <div class="flex justify-between items-center">
                                <h3 class="text-lg font-semibold text-white">Create New Account</h3>
                                <button @click=${() => this.showCreate = false} class="text-zinc-400 hover:text-white">
                                    ${icon(X, 20, 'w-5 h-5')}
                                </button>
                            </div>
                        </div>
                        <div class="p-4 space-y-4">
                            ${this.error ? html`<div class="text-red-400 text-sm bg-red-500/10 p-2 rounded">${this.error}</div>` : nothing}
                            <div class="grid grid-cols-2 md:grid-cols-4 gap-4">
                                <div>
                                    <label class="text-xs text-zinc-500 block mb-1">Code</label>
                                    <input
                                        class="w-full bg-zinc-800 border border-zinc-700 rounded px-3 py-2 text-white text-sm focus:border-emerald-500 outline-none"
                                        .value=${this.form.code}
                                        @input=${(e: Event) => this._updateForm('code', (e.target as HTMLInputElement).value)}
                                        placeholder="e.g. 1060"
                                    />
                                </div>
                                <div>
                                    <label class="text-xs text-zinc-500 block mb-1">Name</label>
                                    <input
                                        class="w-full bg-zinc-800 border border-zinc-700 rounded px-3 py-2 text-white text-sm focus:border-emerald-500 outline-none"
                                        .value=${this.form.name}
                                        @input=${(e: Event) => this._updateForm('name', (e.target as HTMLInputElement).value)}
                                        placeholder="e.g. Other Receivables"
                                    />
                                </div>
                                <div>
                                    <label class="text-xs text-zinc-500 block mb-1">Type</label>
                                    <select
                                        class="w-full bg-zinc-800 border border-zinc-700 rounded px-3 py-2 text-white text-sm focus:border-emerald-500 outline-none"
                                        .value=${this.form.type}
                                        @change=${(e: Event) => this._updateForm('type', (e.target as HTMLSelectElement).value)}
                                    >
                                        ${ACCOUNT_TYPES.map(t => html`<option value="${t}">${t}</option>`)}
                                    </select>
                                </div>
                                <div>
                                    <label class="text-xs text-zinc-500 block mb-1">Subtype</label>
                                    <input
                                        class="w-full bg-zinc-800 border border-zinc-700 rounded px-3 py-2 text-white text-sm focus:border-emerald-500 outline-none"
                                        .value=${this.form.subtype}
                                        @input=${(e: Event) => this._updateForm('subtype', (e.target as HTMLInputElement).value)}
                                        placeholder="e.g. Current Asset"
                                    />
                                </div>
                            </div>
                            <div>
                                <label class="text-xs text-zinc-500 block mb-1">Description</label>
                                <input
                                    class="w-full bg-zinc-800 border border-zinc-700 rounded px-3 py-2 text-white text-sm focus:border-emerald-500 outline-none"
                                    .value=${this.form.description}
                                    @input=${(e: Event) => this._updateForm('description', (e.target as HTMLInputElement).value)}
                                    placeholder="Brief description..."
                                />
                            </div>
                            <div class="flex justify-end gap-2 pt-2">
                                <button @click=${() => this.showCreate = false} class="px-4 py-2 text-zinc-400 hover:text-white transition-colors">Cancel</button>
                                <button @click=${this._handleCreate} class="inline-flex items-center gap-2 bg-emerald-600 hover:bg-emerald-500 text-white font-semibold px-4 py-2 rounded transition-colors">
                                    Create Account
                                </button>
                            </div>
                        </div>
                    </div>
                ` : nothing}

                ${ACCOUNT_TYPES.map(type => {
                    const accts = groupedAccounts[type];
                    if (!accts || accts.length === 0) return nothing;
                    return html`
                        <div class="backdrop-blur-md bg-white/5 border border-white/10 rounded-xl overflow-hidden">
                            <div class="p-4 pb-2">
                                <div class="flex items-center gap-2">
                                    <span class="px-2 py-0.5 rounded text-xs font-bold ${ACCOUNT_TYPE_COLORS[type]}">
                                        ${type}
                                    </span>
                                    <span class="text-sm text-zinc-400">${accts.length} accounts</span>
                                </div>
                            </div>
                            <div class="p-0">
                                <table class="w-full text-sm">
                                    <thead>
                                        <tr class="border-b border-white/5 text-zinc-500">
                                            <th class="text-left px-4 py-2 font-medium w-24">Code</th>
                                            <th class="text-left px-4 py-2 font-medium">Name</th>
                                            <th class="text-left px-4 py-2 font-medium">Subtype</th>
                                            <th class="text-left px-4 py-2 font-medium w-24">Normal</th>
                                            <th class="text-right px-4 py-2 font-medium w-32">Balance</th>
                                            <th class="text-center px-4 py-2 font-medium w-20">Active</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        ${accts.map(a => html`
                                            <tr class="border-b border-white/5 hover:bg-white/[0.02] transition-colors">
                                                <td class="px-4 py-2.5 font-mono text-emerald-400">${a.code}</td>
                                                <td class="px-4 py-2.5 text-white">${a.name}</td>
                                                <td class="px-4 py-2.5 text-zinc-400">${a.subtype || '--'}</td>
                                                <td class="px-4 py-2.5">
                                                    <span class="text-xs px-1.5 py-0.5 rounded ${a.normal_balance === 'DEBIT' ? 'bg-blue-500/10 text-blue-400' : 'bg-rose-500/10 text-rose-400'}">
                                                        ${a.normal_balance}
                                                    </span>
                                                </td>
                                                <td class="px-4 py-2.5 text-right font-mono ${a.balance >= 0 ? 'text-zinc-200' : 'text-red-400'}">
                                                    ${this._formatBalance(a.balance)}
                                                </td>
                                                <td class="px-4 py-2.5 text-center">
                                                    <span class="inline-block w-2 h-2 rounded-full ${a.is_active ? 'bg-emerald-400' : 'bg-zinc-600'}"></span>
                                                </td>
                                            </tr>
                                        `)}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    `;
                })}

                ${this.accounts.length === 0 ? html`
                    <div class="text-center py-20 bg-zinc-900/50 rounded-lg border border-zinc-800 border-dashed">
                        ${icon(BookOpen, 48, 'w-12 h-12 text-zinc-600 mx-auto mb-4')}
                        <h3 class="text-lg font-medium text-white">No Accounts Found</h3>
                        <p class="text-zinc-400 mt-2 max-w-sm mx-auto">
                            Run the database migration to seed the standard LBM chart of accounts.
                        </p>
                    </div>
                ` : nothing}
            </div>
        `;
    }
}

export default ChartOfAccounts;
