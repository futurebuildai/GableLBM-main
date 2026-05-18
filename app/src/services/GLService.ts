import type {
    GLAccount,
    JournalEntry,
    FiscalPeriod,
    TrialBalanceRow,
    CreateAccountRequest,
    CreateJournalEntryRequest,
} from '../types/gl';
import { fetchWithAuth } from './fetchClient';

const API = import.meta.env.VITE_API_URL || '';

// --- Accounts ---

export async function fetchAccounts(): Promise<GLAccount[]> {
    const res = await fetchWithAuth(`${API}/api/v1/gl/accounts`);
    if (!res.ok) throw new Error('Failed to fetch accounts');
    return res.json();
}

export async function createAccount(data: CreateAccountRequest): Promise<GLAccount> {
    const res = await fetchWithAuth(`${API}/api/v1/gl/accounts`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
    });
    if (!res.ok) throw new Error(await res.text());
    return res.json();
}

export async function updateAccount(id: string, data: CreateAccountRequest): Promise<GLAccount> {
    const res = await fetchWithAuth(`${API}/api/v1/gl/accounts/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
    });
    if (!res.ok) throw new Error(await res.text());
    return res.json();
}

// --- Journal Entries ---

export async function fetchJournalEntries(): Promise<JournalEntry[]> {
    const res = await fetchWithAuth(`${API}/api/v1/gl/journal-entries`);
    if (!res.ok) throw new Error('Failed to fetch journal entries');
    return res.json();
}

export async function fetchJournalEntry(id: string): Promise<JournalEntry> {
    const res = await fetchWithAuth(`${API}/api/v1/gl/journal-entries/${id}`);
    if (!res.ok) throw new Error('Failed to fetch journal entry');
    return res.json();
}

export async function createJournalEntry(data: CreateJournalEntryRequest): Promise<JournalEntry> {
    const res = await fetchWithAuth(`${API}/api/v1/gl/journal-entries`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
    });
    if (!res.ok) throw new Error(await res.text());
    return res.json();
}

export async function postJournalEntry(id: string): Promise<void> {
    const res = await fetchWithAuth(`${API}/api/v1/gl/journal-entries/${id}/post`, { method: 'POST' });
    if (!res.ok) throw new Error(await res.text());
}

export async function voidJournalEntry(id: string): Promise<void> {
    const res = await fetchWithAuth(`${API}/api/v1/gl/journal-entries/${id}/void`, { method: 'POST' });
    if (!res.ok) throw new Error(await res.text());
}

// --- Trial Balance ---

export async function fetchTrialBalance(asOfDate?: string): Promise<TrialBalanceRow[]> {
    const params = asOfDate ? `?as_of=${asOfDate}` : '';
    const res = await fetchWithAuth(`${API}/api/v1/gl/trial-balance${params}`);
    if (!res.ok) throw new Error('Failed to fetch trial balance');
    return res.json();
}

// --- Fiscal Periods ---

export async function fetchFiscalPeriods(): Promise<FiscalPeriod[]> {
    const res = await fetchWithAuth(`${API}/api/v1/gl/fiscal-periods`);
    if (!res.ok) throw new Error('Failed to fetch fiscal periods');
    return res.json();
}

export async function closeFiscalPeriod(id: string): Promise<void> {
    const res = await fetchWithAuth(`${API}/api/v1/gl/fiscal-periods/${id}/close`, { method: 'POST' });
    if (!res.ok) throw new Error(await res.text());
}
