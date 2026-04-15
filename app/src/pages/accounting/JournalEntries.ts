import { LitElement, html, nothing } from 'lit';
import { customElement, state } from 'lit/decorators.js';
import { icon } from '../../lib/icons.ts';
import { ToastService } from '../../lib/toast-service.ts';
import { fetchJournalEntries, fetchAccounts, createJournalEntry, postJournalEntry, voidJournalEntry } from '../../services/GLService';
import type { JournalEntry, GLAccount, CreateJournalEntryRequest } from '../../types/gl';
import { FileText, Plus, X, Check, Ban } from 'lucide';

const STATUS_COLORS: Record<string, string> = {
    DRAFT: 'bg-amber-500/20 text-amber-300',
    POSTED: 'bg-emerald-500/20 text-emerald-300',
    VOID: 'bg-red-500/20 text-red-300',
};

const SOURCE_COLORS: Record<string, string> = {
    MANUAL: 'bg-zinc-500/20 text-zinc-300',
    INVOICE: 'bg-blue-500/20 text-blue-300',
    PAYMENT: 'bg-green-500/20 text-green-300',
    ADJUSTMENT: 'bg-purple-500/20 text-purple-300',
    CLOSING: 'bg-rose-500/20 text-rose-300',
};

interface LineForm {
    account_id: string;
    description: string;
    debit: string;
    credit: string;
}

@customElement('gable-journal-entries')
export class JournalEntries extends LitElement {
    createRenderRoot() { return this; }

    @state() private entries: JournalEntry[] = [];
    @state() private accounts: GLAccount[] = [];
    @state() private loading = true;
    @state() private showCreate = false;
    @state() private memo = '';
    @state() private entryDate = new Date().toISOString().split('T')[0];
    @state() private lines: LineForm[] = [
        { account_id: '', description: '', debit: '', credit: '' },
        { account_id: '', description: '', debit: '', credit: '' },
    ];
    @state() private error = '';

    connectedCallback() {
        super.connectedCallback();
        this._load();
    }

    private async _load() {
        try {
            const [entryData, acctData] = await Promise.all([fetchJournalEntries(), fetchAccounts()]);
            this.entries = entryData || [];
            this.accounts = acctData || [];
        } catch (err) {
            console.error(err);
            ToastService.show('Failed to load journal entries', 'error');
        } finally {
            this.loading = false;
        }
    }

    private get _totalDebit() {
        return this.lines.reduce((sum, l) => sum + (parseFloat(l.debit) || 0), 0);
    }

    private get _totalCredit() {
        return this.lines.reduce((sum, l) => sum + (parseFloat(l.credit) || 0), 0);
    }

    private get _isBalanced() {
        return Math.abs(this._totalDebit - this._totalCredit) < 0.005 && this._totalDebit > 0;
    }

    private _addLine() {
        this.lines = [...this.lines, { account_id: '', description: '', debit: '', credit: '' }];
    }

    private _removeLine(idx: number) {
        if (this.lines.length <= 2) return;
        this.lines = this.lines.filter((_, i) => i !== idx);
    }

    private _updateLine(idx: number, field: keyof LineForm, value: string) {
        const updated = [...this.lines];
        updated[idx] = { ...updated[idx], [field]: value };
        if (field === 'debit' && value) updated[idx].credit = '';
        if (field === 'credit' && value) updated[idx].debit = '';
        this.lines = updated;
    }

    private async _handleCreate() {
        this.error = '';
        if (!this._isBalanced) {
            this.error = 'Entry must be balanced (total debits = total credits)';
            return;
        }
        try {
            const req: CreateJournalEntryRequest = {
                entry_date: this.entryDate,
                memo: this.memo,
                lines: this.lines.filter(l => l.account_id).map(l => ({
                    account_id: l.account_id,
                    description: l.description,
                    debit: parseFloat(l.debit) || 0,
                    credit: parseFloat(l.credit) || 0,
                })),
            };
            await createJournalEntry(req);
            this.showCreate = false;
            this.memo = '';
            this.lines = [
                { account_id: '', description: '', debit: '', credit: '' },
                { account_id: '', description: '', debit: '', credit: '' },
            ];
            this._load();
        } catch (err) {
            this.error = err instanceof Error ? err.message : 'Failed to create entry';
        }
    }

    private async _handlePost(id: string) {
        try {
            await postJournalEntry(id);
            this._load();
        } catch (err) {
            ToastService.show(err instanceof Error ? err.message : 'Failed to post journal entry', 'error');
        }
    }

    private async _handleVoid(id: string) {
        try {
            await voidJournalEntry(id);
            this._load();
        } catch (err) {
            ToastService.show(err instanceof Error ? err.message : 'Failed to void journal entry', 'error');
        }
    }

    private _formatCents(cents: number) {
        return `$${(cents / 100).toLocaleString('en-US', { minimumFractionDigits: 2 })}`;
    }

    render() {
        if (this.loading) {
            return html`<div class="p-8 text-center text-zinc-400">Loading journal entries...</div>`;
        }

        return html`
            <div class="p-6 max-w-[1600px] mx-auto space-y-6 animate-in fade-in duration-500">
                <div class="flex justify-between items-center">
                    <div>
                        <h1 class="text-2xl font-bold bg-gradient-to-r from-white to-zinc-400 bg-clip-text text-transparent">
                            Journal Entries
                        </h1>
                        <p class="text-zinc-400 mt-1">
                            ${this.entries.length} entries -- Double-entry accounting ledger
                        </p>
                    </div>
                    <button
                        @click=${() => this.showCreate = true}
                        class="inline-flex items-center gap-2 bg-emerald-600 hover:bg-emerald-500 text-white font-semibold px-4 py-2 rounded transition-colors"
                    >
                        ${icon(Plus, 16, 'w-4 h-4')}
                        New Entry
                    </button>
                </div>

                ${this.showCreate ? html`
                    <div class="backdrop-blur-md bg-white/5 border border-emerald-500/30 rounded-xl">
                        <div class="p-4 pb-2">
                            <div class="flex justify-between items-center">
                                <h3 class="text-lg font-semibold text-white">New Journal Entry</h3>
                                <button @click=${() => this.showCreate = false} class="text-zinc-400 hover:text-white">
                                    ${icon(X, 20, 'w-5 h-5')}
                                </button>
                            </div>
                        </div>
                        <div class="p-4 space-y-4">
                            ${this.error ? html`<div class="text-red-400 text-sm bg-red-500/10 p-2 rounded">${this.error}</div>` : nothing}
                            <div class="grid grid-cols-2 gap-4">
                                <div>
                                    <label class="text-xs text-zinc-500 block mb-1">Date</label>
                                    <input
                                        type="date"
                                        class="w-full bg-zinc-800 border border-zinc-700 rounded px-3 py-2 text-white text-sm focus:border-emerald-500 outline-none"
                                        .value=${this.entryDate}
                                        @input=${(e: Event) => this.entryDate = (e.target as HTMLInputElement).value}
                                    />
                                </div>
                                <div>
                                    <label class="text-xs text-zinc-500 block mb-1">Memo</label>
                                    <input
                                        class="w-full bg-zinc-800 border border-zinc-700 rounded px-3 py-2 text-white text-sm focus:border-emerald-500 outline-none"
                                        .value=${this.memo}
                                        @input=${(e: Event) => this.memo = (e.target as HTMLInputElement).value}
                                        placeholder="Entry description..."
                                    />
                                </div>
                            </div>

                            <div class="space-y-2">
                                <div class="grid grid-cols-[2fr_2fr_1fr_1fr_auto] gap-2 text-xs text-zinc-500 px-1">
                                    <span>Account</span>
                                    <span>Description</span>
                                    <span>Debit ($)</span>
                                    <span>Credit ($)</span>
                                    <span class="w-8"></span>
                                </div>
                                ${this.lines.map((line, i) => html`
                                    <div class="grid grid-cols-[2fr_2fr_1fr_1fr_auto] gap-2">
                                        <select
                                            class="bg-zinc-800 border border-zinc-700 rounded px-2 py-2 text-white text-sm focus:border-emerald-500 outline-none"
                                            .value=${line.account_id}
                                            @change=${(e: Event) => this._updateLine(i, 'account_id', (e.target as HTMLSelectElement).value)}
                                        >
                                            <option value="">Select account...</option>
                                            ${this.accounts.map(a => html`<option value="${a.id}">${a.code} -- ${a.name}</option>`)}
                                        </select>
                                        <input
                                            class="bg-zinc-800 border border-zinc-700 rounded px-2 py-2 text-white text-sm focus:border-emerald-500 outline-none"
                                            .value=${line.description}
                                            @input=${(e: Event) => this._updateLine(i, 'description', (e.target as HTMLInputElement).value)}
                                            placeholder="Description"
                                        />
                                        <input
                                            class="bg-zinc-800 border border-zinc-700 rounded px-2 py-2 text-white text-sm focus:border-emerald-500 outline-none font-mono text-right"
                                            .value=${line.debit}
                                            @input=${(e: Event) => this._updateLine(i, 'debit', (e.target as HTMLInputElement).value)}
                                            placeholder="0.00"
                                            type="number"
                                            step="0.01"
                                            min="0"
                                        />
                                        <input
                                            class="bg-zinc-800 border border-zinc-700 rounded px-2 py-2 text-white text-sm focus:border-emerald-500 outline-none font-mono text-right"
                                            .value=${line.credit}
                                            @input=${(e: Event) => this._updateLine(i, 'credit', (e.target as HTMLInputElement).value)}
                                            placeholder="0.00"
                                            type="number"
                                            step="0.01"
                                            min="0"
                                        />
                                        <button
                                            @click=${() => this._removeLine(i)}
                                            class="w-8 h-9 flex items-center justify-center text-zinc-500 hover:text-red-400"
                                            ?disabled=${this.lines.length <= 2}
                                        >
                                            ${icon(X, 16, 'w-4 h-4')}
                                        </button>
                                    </div>
                                `)}
                            </div>

                            <div class="flex justify-between items-center">
                                <button @click=${this._addLine} class="flex items-center gap-1 text-sm text-zinc-400 hover:text-white transition-colors">
                                    ${icon(Plus, 12, 'w-3 h-3')} Add Line
                                </button>
                                <div class="text-sm font-mono px-3 py-1 rounded ${this._isBalanced ? 'bg-emerald-500/10 text-emerald-400' : 'bg-red-500/10 text-red-400'}">
                                    DR: $${this._totalDebit.toFixed(2)} | CR: $${this._totalCredit.toFixed(2)}
                                    ${this._isBalanced ? ' [Balanced]' : ' [Unbalanced]'}
                                </div>
                            </div>

                            <div class="flex justify-end gap-2 pt-2">
                                <button @click=${() => this.showCreate = false} class="px-4 py-2 text-zinc-400 hover:text-white transition-colors">Cancel</button>
                                <button
                                    @click=${this._handleCreate}
                                    ?disabled=${!this._isBalanced}
                                    class="inline-flex items-center gap-2 bg-emerald-600 hover:bg-emerald-500 text-white font-semibold px-4 py-2 rounded transition-colors disabled:opacity-50"
                                >
                                    Create Entry (Draft)
                                </button>
                            </div>
                        </div>
                    </div>
                ` : nothing}

                <div class="backdrop-blur-md bg-white/5 border border-white/10 rounded-xl overflow-hidden">
                    <div class="p-0">
                        <table class="w-full text-sm">
                            <thead>
                                <tr class="border-b border-white/5 text-zinc-500">
                                    <th class="text-left px-4 py-3 font-medium w-16">#</th>
                                    <th class="text-left px-4 py-3 font-medium w-28">Date</th>
                                    <th class="text-left px-4 py-3 font-medium">Memo</th>
                                    <th class="text-left px-4 py-3 font-medium w-28">Source</th>
                                    <th class="text-left px-4 py-3 font-medium w-24">Status</th>
                                    <th class="text-right px-4 py-3 font-medium w-28">Total</th>
                                    <th class="text-right px-4 py-3 font-medium w-32">Actions</th>
                                </tr>
                            </thead>
                            <tbody>
                                ${this.entries.map(e => html`
                                    <tr class="border-b border-white/5 hover:bg-white/[0.02] transition-colors">
                                        <td class="px-4 py-2.5 font-mono text-zinc-400">JE-${e.entry_number}</td>
                                        <td class="px-4 py-2.5 text-zinc-300">
                                            ${new Date(e.entry_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                                        </td>
                                        <td class="px-4 py-2.5 text-white truncate max-w-xs">${e.memo || '--'}</td>
                                        <td class="px-4 py-2.5">
                                            <span class="text-xs px-2 py-0.5 rounded font-medium ${SOURCE_COLORS[e.source] || 'bg-zinc-500/20 text-zinc-300'}">
                                                ${e.source}
                                            </span>
                                        </td>
                                        <td class="px-4 py-2.5">
                                            <span class="text-xs px-2 py-0.5 rounded font-bold ${STATUS_COLORS[e.status]}">
                                                ${e.status}
                                            </span>
                                        </td>
                                        <td class="px-4 py-2.5 text-right font-mono text-zinc-200">
                                            ${this._formatCents(e.total_debit)}
                                        </td>
                                        <td class="px-4 py-2.5 text-right space-x-1">
                                            ${e.status === 'DRAFT' ? html`
                                                <button @click=${() => this._handlePost(e.id)} class="h-7 text-xs text-emerald-400 hover:bg-emerald-500/10 px-2 py-1 rounded transition-colors inline-flex items-center gap-1">
                                                    ${icon(Check, 12, 'w-3 h-3')} Post
                                                </button>
                                            ` : nothing}
                                            ${e.status === 'POSTED' ? html`
                                                <button @click=${() => this._handleVoid(e.id)} class="h-7 text-xs text-red-400 hover:bg-red-500/10 px-2 py-1 rounded transition-colors inline-flex items-center gap-1">
                                                    ${icon(Ban, 12, 'w-3 h-3')} Void
                                                </button>
                                            ` : nothing}
                                        </td>
                                    </tr>
                                `)}
                            </tbody>
                        </table>
                    </div>
                </div>

                ${this.entries.length === 0 && !this.showCreate ? html`
                    <div class="text-center py-20 bg-zinc-900/50 rounded-lg border border-zinc-800 border-dashed">
                        ${icon(FileText, 48, 'w-12 h-12 text-zinc-600 mx-auto mb-4')}
                        <h3 class="text-lg font-medium text-white">No Journal Entries</h3>
                        <p class="text-zinc-400 mt-2 max-w-sm mx-auto">
                            Create your first journal entry or process an invoice/payment to auto-generate entries.
                        </p>
                    </div>
                ` : nothing}
            </div>
        `;
    }
}

export default JournalEntries;
