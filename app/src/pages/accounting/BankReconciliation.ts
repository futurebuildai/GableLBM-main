import { LitElement, html, nothing } from 'lit';
import { customElement, state } from 'lit/decorators.js';
import { ToastService } from '../../lib/toast-service.ts';
import type { BankAccount, BankTransaction, ReconciliationSession } from '../../types/bankrecon';
import {
    listBankAccounts,
    createBankAccount,
    importStatement,
    createSession,
    getSession,
    listSessions,
    matchTransaction,
    unmatchTransaction,
    completeSession,
} from '../../services/BankReconService';

@customElement('gable-bank-reconciliation')
export class BankReconciliation extends LitElement {
    createRenderRoot() { return this; }

    @state() private accounts: BankAccount[] = [];
    @state() private sessions: ReconciliationSession[] = [];
    @state() private activeSession: ReconciliationSession | null = null;
    @state() private selectedBankTxn: string | null = null;
    @state() private loading = true;
    @state() private message = '';
    @state() private tab: 'sessions' | 'accounts' = 'sessions';

    // New account form
    @state() private newAcctName = '';
    @state() private newAcctNumber = '';
    @state() private newAcctRouting = '';
    @state() private newAcctGLID = '';

    // New session form
    @state() private newSessionAcctId = '';
    @state() private newSessionStart = '';
    @state() private newSessionEnd = '';
    @state() private newSessionBalance = '';

    // Import form
    @state() private csvContent = '';

    // Match input
    @state() private jeMatchValue = '';

    connectedCallback() {
        super.connectedCallback();
        this._loadData();
    }

    private async _loadData() {
        try {
            this.loading = true;
            const [accts, sess] = await Promise.all([listBankAccounts(), listSessions()]);
            this.accounts = accts;
            this.sessions = sess;
        } catch (err) {
            console.error('Failed to load bank recon data:', err);
            ToastService.show('Failed to load bank reconciliation data', 'error');
        } finally {
            this.loading = false;
        }
    }

    private async _handleCreateAccount() {
        try {
            await createBankAccount({
                name: this.newAcctName,
                account_number: this.newAcctNumber,
                routing_number: this.newAcctRouting,
                gl_account_id: this.newAcctGLID,
            });
            this.message = 'Bank account created';
            this.newAcctName = '';
            this.newAcctNumber = '';
            this.newAcctRouting = '';
            this.newAcctGLID = '';
            this._loadData();
        } catch (err: unknown) {
            this.message = `Error: ${err instanceof Error ? err.message : 'Unknown error'}`;
        }
    }

    private async _handleImport() {
        try {
            const result = await importStatement({
                bank_account_id: this.activeSession!.bank_account_id,
                csv_content: this.csvContent,
            });
            this.message = `Imported ${result.imported_rows} rows, auto-matched ${result.auto_matched}`;
            this.csvContent = '';
            if (this.activeSession) {
                const updated = await getSession(this.activeSession.id);
                this.activeSession = updated;
            }
        } catch (err: unknown) {
            this.message = `Error: ${err instanceof Error ? err.message : 'Unknown error'}`;
        }
    }

    private async _handleCreateSession() {
        try {
            const session = await createSession({
                bank_account_id: this.newSessionAcctId,
                period_start: this.newSessionStart,
                period_end: this.newSessionEnd,
                statement_balance: parseFloat(this.newSessionBalance),
            });
            this.message = 'Session created';
            this.activeSession = session;
            this._loadData();
        } catch (err: unknown) {
            this.message = `Error: ${err instanceof Error ? err.message : 'Unknown error'}`;
        }
    }

    private async _handleOpenSession(id: string) {
        try {
            const session = await getSession(id);
            this.activeSession = session;
        } catch (err: unknown) {
            this.message = `Error: ${err instanceof Error ? err.message : 'Unknown error'}`;
        }
    }

    private async _handleMatch(bankTxnId: string, journalEntryId: string) {
        try {
            await matchTransaction({ bank_transaction_id: bankTxnId, journal_entry_id: journalEntryId });
            if (this.activeSession) {
                const updated = await getSession(this.activeSession.id);
                this.activeSession = updated;
            }
            this.selectedBankTxn = null;
            this.jeMatchValue = '';
            this.message = 'Transaction matched';
        } catch (err: unknown) {
            this.message = `Error: ${err instanceof Error ? err.message : 'Unknown error'}`;
        }
    }

    private async _handleUnmatch(bankTxnId: string) {
        try {
            await unmatchTransaction(bankTxnId);
            if (this.activeSession) {
                const updated = await getSession(this.activeSession.id);
                this.activeSession = updated;
            }
            this.message = 'Transaction unmatched';
        } catch (err: unknown) {
            this.message = `Error: ${err instanceof Error ? err.message : 'Unknown error'}`;
        }
    }

    private async _handleComplete() {
        if (!this.activeSession) return;
        try {
            const session = await completeSession(this.activeSession.id);
            this.activeSession = session;
            this.message = 'Reconciliation completed';
            this._loadData();
        } catch (err: unknown) {
            this.message = `Error: ${err instanceof Error ? err.message : 'Unknown error'}`;
        }
    }

    private _formatCents(cents: number) {
        return `$${(Math.abs(cents) / 100).toFixed(2)}${cents < 0 ? ' DR' : ''}`;
    }

    private _statusColor(status: string) {
        return status === 'MATCHED' ? '#22c55e' : status === 'EXCLUDED' ? '#6b7280' : '#eab308';
    }

    render() {
        if (this.loading) {
            return html`<div class="p-8 text-center text-slate-400">Loading bank reconciliation data...</div>`;
        }

        return html`
            <div class="p-8 max-w-[1400px] mx-auto">
                <div class="flex justify-between items-center mb-6">
                    <h1 class="text-2xl font-bold text-slate-100">Bank Reconciliation</h1>
                    <div class="flex gap-2">
                        <button
                            @click=${() => { this.tab = 'sessions'; this.activeSession = null; }}
                            class="px-4 py-1.5 rounded-lg border border-slate-600 text-sm font-medium transition-colors ${this.tab === 'sessions' ? 'bg-blue-500 text-white' : 'bg-transparent text-slate-400 hover:text-white'}"
                        >
                            Sessions
                        </button>
                        <button
                            @click=${() => { this.tab = 'accounts'; }}
                            class="px-4 py-1.5 rounded-lg border border-slate-600 text-sm font-medium transition-colors ${this.tab === 'accounts' ? 'bg-blue-500 text-white' : 'bg-transparent text-slate-400 hover:text-white'}"
                        >
                            Bank Accounts
                        </button>
                    </div>
                </div>

                ${this.message ? html`
                    <div class="px-4 py-2.5 mb-4 rounded-lg text-sm ${this.message.startsWith('Error') ? 'bg-red-500/15 text-red-400 border border-red-500/20' : 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/20'}">
                        ${this.message}
                    </div>
                ` : nothing}

                ${this._renderActiveSession()}
                ${this._renderSessionsList()}
                ${this._renderAccountsTab()}
            </div>
        `;
    }

    private _renderActiveSession() {
        if (!this.activeSession) return nothing;
        const s = this.activeSession;

        const summaryItems = [
            { label: 'Statement Balance', value: this._formatCents(s.statement_balance), color: 'text-blue-500' },
            { label: 'GL Balance', value: this._formatCents(s.gl_balance), color: 'text-violet-500' },
            { label: 'Cleared', value: `${s.cleared_count} items (${this._formatCents(s.cleared_total)})`, color: 'text-emerald-500' },
            { label: 'Outstanding', value: `${s.outstanding_count} items (${this._formatCents(s.outstanding_total)})`, color: 'text-yellow-500' },
            { label: 'Difference', value: this._formatCents(s.difference), color: s.difference === 0 ? 'text-emerald-500' : 'text-red-500' },
        ];

        return html`
            <div class="mb-6">
                <!-- Summary Bar -->
                <div class="grid grid-cols-5 gap-4 mb-5">
                    ${summaryItems.map(item => html`
                        <div class="bg-slate-800 rounded-xl p-4 border border-slate-700">
                            <div class="text-xs text-slate-500 mb-1">${item.label}</div>
                            <div class="text-lg font-bold font-mono ${item.color}">${item.value}</div>
                        </div>
                    `)}
                </div>

                <!-- Import & Actions -->
                <div class="flex gap-3 mb-5 items-end">
                    <div class="flex-1">
                        <label class="text-xs text-slate-400 block mb-1">Paste CSV Statement</label>
                        <textarea
                            .value=${this.csvContent}
                            @input=${(e: Event) => this.csvContent = (e.target as HTMLTextAreaElement).value}
                            placeholder="Date,Amount,Description,Reference"
                            rows="3"
                            class="w-full px-3 py-2 rounded-lg border border-slate-600 bg-slate-900 text-slate-200 text-sm font-mono resize-y focus:border-violet-500 outline-none"
                        ></textarea>
                    </div>
                    <button
                        @click=${this._handleImport}
                        class="px-5 py-2 rounded-lg bg-violet-600 text-white font-semibold text-sm hover:bg-violet-500 transition-colors h-10"
                    >
                        Import CSV
                    </button>
                    ${s.status === 'IN_PROGRESS' ? html`
                        <button
                            @click=${this._handleComplete}
                            ?disabled=${s.difference !== 0}
                            class="px-5 py-2 rounded-lg font-semibold text-sm text-white transition-colors h-10 ${s.difference === 0 ? 'bg-emerald-600 hover:bg-emerald-500' : 'bg-slate-600 cursor-not-allowed'}"
                        >
                            Complete Reconciliation
                        </button>
                    ` : nothing}
                </div>

                <!-- Transactions Table -->
                <div class="bg-slate-800 rounded-xl p-5 border border-slate-700">
                    <h2 class="text-base font-semibold text-slate-200 mb-3">
                        Transactions (${s.transactions?.length || 0})
                    </h2>
                    ${!s.transactions || s.transactions.length === 0 ? html`
                        <p class="text-slate-500">No transactions imported yet. Use the CSV import above.</p>
                    ` : html`
                        <table class="w-full text-sm">
                            <thead>
                                <tr class="border-b border-slate-700 text-xs font-semibold text-slate-500 uppercase tracking-wider">
                                    <th class="text-left px-3 py-2">Date</th>
                                    <th class="text-left px-3 py-2">Amount</th>
                                    <th class="text-left px-3 py-2">Description</th>
                                    <th class="text-left px-3 py-2">Reference</th>
                                    <th class="text-left px-3 py-2">Status</th>
                                    <th class="text-left px-3 py-2">Actions</th>
                                </tr>
                            </thead>
                            <tbody>
                                ${s.transactions.map((txn: BankTransaction) => html`
                                    <tr class="border-b border-slate-800 ${this.selectedBankTxn === txn.id ? 'bg-blue-500/10' : ''}">
                                        <td class="px-3 py-2.5 text-slate-300">
                                            ${new Date(txn.transaction_date).toLocaleDateString()}
                                        </td>
                                        <td class="px-3 py-2.5 font-mono font-semibold ${txn.amount >= 0 ? 'text-emerald-400' : 'text-red-400'}">
                                            ${this._formatCents(txn.amount)}
                                        </td>
                                        <td class="px-3 py-2.5 text-slate-300">${txn.description}</td>
                                        <td class="px-3 py-2.5 text-slate-500 text-xs font-mono">${txn.reference}</td>
                                        <td class="px-3 py-2.5">
                                            <span class="inline-block px-2.5 py-0.5 rounded-full text-xs font-semibold text-white" style="background:${this._statusColor(txn.status)}">
                                                ${txn.status}
                                            </span>
                                        </td>
                                        <td class="px-3 py-2.5">
                                            ${txn.status === 'UNMATCHED' ? html`
                                                <button
                                                    @click=${() => this.selectedBankTxn = this.selectedBankTxn === txn.id ? null : txn.id}
                                                    class="px-3 py-1 rounded border border-slate-600 text-blue-400 text-xs hover:bg-blue-500/10 transition-colors"
                                                >
                                                    ${this.selectedBankTxn === txn.id ? 'Cancel' : 'Select to Match'}
                                                </button>
                                            ` : txn.status === 'MATCHED' ? html`
                                                <button
                                                    @click=${() => this._handleUnmatch(txn.id)}
                                                    class="px-3 py-1 rounded border border-red-500/30 text-red-400 text-xs hover:bg-red-500/10 transition-colors"
                                                >
                                                    Unmatch
                                                </button>
                                            ` : nothing}
                                        </td>
                                    </tr>
                                `)}
                            </tbody>
                        </table>
                    `}

                    ${this.selectedBankTxn ? html`
                        <div class="mt-4 p-4 rounded-lg bg-blue-500/10 border border-blue-500/20">
                            <p class="text-slate-400 mb-2 text-sm">
                                Enter the Journal Entry ID to match with this bank transaction:
                            </p>
                            <div class="flex gap-2">
                                <input
                                    type="text"
                                    .value=${this.jeMatchValue}
                                    @input=${(e: Event) => this.jeMatchValue = (e.target as HTMLInputElement).value}
                                    placeholder="Journal Entry UUID"
                                    class="flex-1 px-3 py-1.5 rounded border border-slate-600 bg-slate-900 text-slate-200 text-sm focus:border-blue-500 outline-none"
                                />
                                <button
                                    @click=${() => {
                                        if (this.jeMatchValue && this.selectedBankTxn) {
                                            this._handleMatch(this.selectedBankTxn, this.jeMatchValue);
                                        }
                                    }}
                                    class="px-4 py-1.5 rounded bg-blue-600 text-white font-semibold text-sm hover:bg-blue-500 transition-colors"
                                >
                                    Match
                                </button>
                            </div>
                        </div>
                    ` : nothing}
                </div>
            </div>
        `;
    }

    private _renderSessionsList() {
        if (this.tab !== 'sessions' || this.activeSession) return nothing;

        return html`
            <div>
                <!-- New Session Form -->
                <div class="bg-slate-800 rounded-xl p-5 mb-5 border border-slate-700">
                    <h2 class="text-base font-semibold text-slate-200 mb-3">New Reconciliation Session</h2>
                    <div class="grid grid-cols-4 gap-3">
                        <div>
                            <label class="text-xs text-slate-400 block mb-1">Bank Account</label>
                            <select
                                .value=${this.newSessionAcctId}
                                @change=${(e: Event) => this.newSessionAcctId = (e.target as HTMLSelectElement).value}
                                class="w-full px-2.5 py-1.5 rounded border border-slate-600 bg-slate-900 text-slate-200 text-sm focus:border-blue-500 outline-none"
                            >
                                <option value="">Select account...</option>
                                ${this.accounts.map(a => html`<option value="${a.id}">${a.name}</option>`)}
                            </select>
                        </div>
                        <div>
                            <label class="text-xs text-slate-400 block mb-1">Period Start</label>
                            <input type="date" .value=${this.newSessionStart}
                                @input=${(e: Event) => this.newSessionStart = (e.target as HTMLInputElement).value}
                                class="w-full px-2.5 py-1.5 rounded border border-slate-600 bg-slate-900 text-slate-200 text-sm focus:border-blue-500 outline-none" />
                        </div>
                        <div>
                            <label class="text-xs text-slate-400 block mb-1">Period End</label>
                            <input type="date" .value=${this.newSessionEnd}
                                @input=${(e: Event) => this.newSessionEnd = (e.target as HTMLInputElement).value}
                                class="w-full px-2.5 py-1.5 rounded border border-slate-600 bg-slate-900 text-slate-200 text-sm focus:border-blue-500 outline-none" />
                        </div>
                        <div>
                            <label class="text-xs text-slate-400 block mb-1">Statement Ending Balance ($)</label>
                            <input type="number" step="0.01" .value=${this.newSessionBalance}
                                @input=${(e: Event) => this.newSessionBalance = (e.target as HTMLInputElement).value}
                                class="w-full px-2.5 py-1.5 rounded border border-slate-600 bg-slate-900 text-slate-200 text-sm focus:border-blue-500 outline-none" />
                        </div>
                    </div>
                    <button @click=${this._handleCreateSession}
                        class="mt-3 px-5 py-2 rounded-lg bg-blue-600 text-white font-semibold text-sm hover:bg-blue-500 transition-colors">
                        Start Session
                    </button>
                </div>

                <!-- Sessions List -->
                <div class="bg-slate-800 rounded-xl p-5 border border-slate-700">
                    <h2 class="text-base font-semibold text-slate-200 mb-3">
                        Reconciliation Sessions (${this.sessions.length})
                    </h2>
                    ${this.sessions.length === 0 ? html`
                        <p class="text-slate-500">No sessions yet. Create one above.</p>
                    ` : html`
                        <table class="w-full text-sm">
                            <thead>
                                <tr class="border-b border-slate-700 text-xs font-semibold text-slate-500 uppercase tracking-wider">
                                    <th class="text-left px-3 py-2">Account</th>
                                    <th class="text-left px-3 py-2">Period</th>
                                    <th class="text-left px-3 py-2">Stmt Balance</th>
                                    <th class="text-left px-3 py-2">Difference</th>
                                    <th class="text-left px-3 py-2">Status</th>
                                    <th class="text-left px-3 py-2">Actions</th>
                                </tr>
                            </thead>
                            <tbody>
                                ${this.sessions.map(s => html`
                                    <tr class="border-b border-slate-800">
                                        <td class="px-3 py-2.5 text-slate-300">${s.bank_account_name || 'N/A'}</td>
                                        <td class="px-3 py-2.5 text-slate-300">
                                            ${new Date(s.period_start).toLocaleDateString()} - ${new Date(s.period_end).toLocaleDateString()}
                                        </td>
                                        <td class="px-3 py-2.5 text-slate-300 font-mono">${this._formatCents(s.statement_balance)}</td>
                                        <td class="px-3 py-2.5 font-mono font-semibold ${s.difference === 0 ? 'text-emerald-400' : 'text-red-400'}">
                                            ${this._formatCents(s.difference)}
                                        </td>
                                        <td class="px-3 py-2.5">
                                            <span class="inline-block px-2.5 py-0.5 rounded-full text-xs font-semibold text-white" style="background:${s.status === 'COMPLETED' ? '#22c55e' : '#3b82f6'}">
                                                ${s.status}
                                            </span>
                                        </td>
                                        <td class="px-3 py-2.5">
                                            <button @click=${() => this._handleOpenSession(s.id)}
                                                class="px-3 py-1 rounded border border-slate-600 text-blue-400 text-xs hover:bg-blue-500/10 transition-colors">
                                                Open
                                            </button>
                                        </td>
                                    </tr>
                                `)}
                            </tbody>
                        </table>
                    `}
                </div>
            </div>
        `;
    }

    private _renderAccountsTab() {
        if (this.tab !== 'accounts') return nothing;

        return html`
            <div>
                <!-- Add Bank Account Form -->
                <div class="bg-slate-800 rounded-xl p-5 mb-5 border border-slate-700">
                    <h2 class="text-base font-semibold text-slate-200 mb-3">Add Bank Account</h2>
                    <div class="grid grid-cols-4 gap-3">
                        <div>
                            <label class="text-xs text-slate-400 block mb-1">Account Name</label>
                            <input .value=${this.newAcctName} @input=${(e: Event) => this.newAcctName = (e.target as HTMLInputElement).value}
                                placeholder="Operating Account"
                                class="w-full px-2.5 py-1.5 rounded border border-slate-600 bg-slate-900 text-slate-200 text-sm focus:border-blue-500 outline-none" />
                        </div>
                        <div>
                            <label class="text-xs text-slate-400 block mb-1">Account Number</label>
                            <input .value=${this.newAcctNumber} @input=${(e: Event) => this.newAcctNumber = (e.target as HTMLInputElement).value}
                                placeholder="****1234"
                                class="w-full px-2.5 py-1.5 rounded border border-slate-600 bg-slate-900 text-slate-200 text-sm focus:border-blue-500 outline-none" />
                        </div>
                        <div>
                            <label class="text-xs text-slate-400 block mb-1">Routing Number</label>
                            <input .value=${this.newAcctRouting} @input=${(e: Event) => this.newAcctRouting = (e.target as HTMLInputElement).value}
                                placeholder="021000021"
                                class="w-full px-2.5 py-1.5 rounded border border-slate-600 bg-slate-900 text-slate-200 text-sm focus:border-blue-500 outline-none" />
                        </div>
                        <div>
                            <label class="text-xs text-slate-400 block mb-1">GL Account ID</label>
                            <input .value=${this.newAcctGLID} @input=${(e: Event) => this.newAcctGLID = (e.target as HTMLInputElement).value}
                                placeholder="UUID of GL Cash account"
                                class="w-full px-2.5 py-1.5 rounded border border-slate-600 bg-slate-900 text-slate-200 text-sm focus:border-blue-500 outline-none" />
                        </div>
                    </div>
                    <button @click=${this._handleCreateAccount}
                        class="mt-3 px-5 py-2 rounded-lg bg-blue-600 text-white font-semibold text-sm hover:bg-blue-500 transition-colors">
                        Add Account
                    </button>
                </div>

                <!-- Bank Accounts List -->
                <div class="bg-slate-800 rounded-xl p-5 border border-slate-700">
                    <h2 class="text-base font-semibold text-slate-200 mb-3">
                        Bank Accounts (${this.accounts.length})
                    </h2>
                    ${this.accounts.length === 0 ? html`
                        <p class="text-slate-500">No bank accounts configured.</p>
                    ` : html`
                        <table class="w-full text-sm">
                            <thead>
                                <tr class="border-b border-slate-700 text-xs font-semibold text-slate-500 uppercase tracking-wider">
                                    <th class="text-left px-3 py-2">Name</th>
                                    <th class="text-left px-3 py-2">Account #</th>
                                    <th class="text-left px-3 py-2">Routing #</th>
                                    <th class="text-left px-3 py-2">Status</th>
                                </tr>
                            </thead>
                            <tbody>
                                ${this.accounts.map(a => html`
                                    <tr class="border-b border-slate-800">
                                        <td class="px-3 py-2.5 text-slate-300">${a.name}</td>
                                        <td class="px-3 py-2.5 text-slate-300 font-mono">${a.account_number || '---'}</td>
                                        <td class="px-3 py-2.5 text-slate-300 font-mono">${a.routing_number || '---'}</td>
                                        <td class="px-3 py-2.5">
                                            <span class="inline-block px-2.5 py-0.5 rounded-full text-xs font-semibold text-white" style="background:${a.is_active ? '#22c55e' : '#6b7280'}">
                                                ${a.is_active ? 'Active' : 'Inactive'}
                                            </span>
                                        </td>
                                    </tr>
                                `)}
                            </tbody>
                        </table>
                    `}
                </div>
            </div>
        `;
    }
}

export default BankReconciliation;
