import type {
    BankAccount,
    ReconciliationSession,
    CreateBankAccountRequest,
    CreateSessionRequest,
    ImportCSVRequest,
    ManualMatchRequest,
    ImportResult,
} from '../types/bankrecon';
import { fetchWithAuth } from './fetchClient';

const API = import.meta.env.VITE_API_URL || '';

// --- Bank Accounts ---

export async function createBankAccount(data: CreateBankAccountRequest): Promise<BankAccount> {
    const res = await fetchWithAuth(`${API}/api/v1/bankrecon/accounts`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
    });
    if (!res.ok) throw new Error(await res.text());
    return res.json();
}

export async function listBankAccounts(): Promise<BankAccount[]> {
    const res = await fetchWithAuth(`${API}/api/v1/bankrecon/accounts`);
    if (!res.ok) throw new Error('Failed to fetch bank accounts');
    return res.json();
}

// --- CSV Import ---

export async function importStatement(data: ImportCSVRequest): Promise<ImportResult> {
    const res = await fetchWithAuth(`${API}/api/v1/bankrecon/import`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
    });
    if (!res.ok) throw new Error(await res.text());
    return res.json();
}

// --- Reconciliation Sessions ---

export async function createSession(data: CreateSessionRequest): Promise<ReconciliationSession> {
    const res = await fetchWithAuth(`${API}/api/v1/bankrecon/sessions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
    });
    if (!res.ok) throw new Error(await res.text());
    return res.json();
}

export async function getSession(id: string): Promise<ReconciliationSession> {
    const res = await fetchWithAuth(`${API}/api/v1/bankrecon/sessions/${id}`);
    if (!res.ok) throw new Error('Failed to fetch session');
    return res.json();
}

export async function listSessions(bankAccountId?: string): Promise<ReconciliationSession[]> {
    const params = bankAccountId ? `?bank_account_id=${bankAccountId}` : '';
    const res = await fetchWithAuth(`${API}/api/v1/bankrecon/sessions${params}`);
    if (!res.ok) throw new Error('Failed to fetch sessions');
    return res.json();
}

export async function completeSession(id: string): Promise<ReconciliationSession> {
    const res = await fetchWithAuth(`${API}/api/v1/bankrecon/sessions/${id}/complete`, { method: 'POST' });
    if (!res.ok) throw new Error(await res.text());
    return res.json();
}

// --- Match/Unmatch ---

export async function matchTransaction(data: ManualMatchRequest): Promise<void> {
    const res = await fetchWithAuth(`${API}/api/v1/bankrecon/match`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
    });
    if (!res.ok) throw new Error(await res.text());
}

export async function unmatchTransaction(bankTransactionId: string): Promise<void> {
    const res = await fetchWithAuth(`${API}/api/v1/bankrecon/unmatch`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ bank_transaction_id: bankTransactionId }),
    });
    if (!res.ok) throw new Error(await res.text());
}
