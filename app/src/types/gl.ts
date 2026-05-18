// General Ledger types

export interface GLAccount {
    id: string;
    code: string;
    name: string;
    type: 'ASSET' | 'LIABILITY' | 'EQUITY' | 'REVENUE' | 'EXPENSE';
    subtype: string;
    parent_id?: string;
    normal_balance: 'DEBIT' | 'CREDIT';
    is_active: boolean;
    description: string;
    balance: number; // Cents
    created_at: string;
    updated_at: string;
}

export interface JournalEntry {
    id: string;
    entry_number: number;
    entry_date: string;
    memo: string;
    source: 'MANUAL' | 'INVOICE' | 'PAYMENT' | 'ADJUSTMENT' | 'CLOSING';
    source_ref_id?: string;
    status: 'DRAFT' | 'POSTED' | 'VOID';
    posted_by: string;
    total_debit: number;  // Cents
    total_credit: number; // Cents
    lines?: JournalLine[];
    created_at: string;
    updated_at: string;
}

export interface JournalLine {
    id: string;
    journal_entry_id: string;
    account_id: string;
    account_code?: string;
    account_name?: string;
    description: string;
    debit: number;  // Cents
    credit: number; // Cents
}

export interface FiscalPeriod {
    id: string;
    name: string;
    start_date: string;
    end_date: string;
    status: 'OPEN' | 'CLOSED';
    closed_at?: string;
    closed_by?: string;
    created_at: string;
}

export interface TrialBalanceRow {
    account_id: string;
    account_code: string;
    account_name: string;
    account_type: string;
    debit: number;  // Cents
    credit: number; // Cents
}

export interface CreateAccountRequest {
    code: string;
    name: string;
    type: string;
    subtype: string;
    parent_id?: string;
    normal_balance: string;
    description: string;
}

export interface CreateJournalEntryRequest {
    entry_date: string;
    memo: string;
    lines: {
        account_id: string;
        description: string;
        debit: number;
        credit: number;
    }[];
}
