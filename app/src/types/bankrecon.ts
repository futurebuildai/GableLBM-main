export interface BankAccount {
    id: string;
    name: string;
    account_number: string;
    routing_number: string;
    gl_account_id: string;
    is_active: boolean;
    created_at: string;
}

export interface BankTransaction {
    id: string;
    bank_account_id: string;
    reconciliation_id?: string;
    transaction_date: string;
    amount: number; // cents
    description: string;
    reference: string;
    matched_journal_entry_id?: string;
    status: 'UNMATCHED' | 'MATCHED' | 'EXCLUDED';
    created_at: string;
}

export interface ReconciliationSession {
    id: string;
    bank_account_id: string;
    bank_account_name?: string;
    period_start: string;
    period_end: string;
    statement_balance: number; // cents
    gl_balance: number; // cents
    cleared_count: number;
    cleared_total: number; // cents
    outstanding_count: number;
    outstanding_total: number; // cents
    difference: number; // cents
    status: 'IN_PROGRESS' | 'COMPLETED';
    completed_by?: string;
    completed_at?: string;
    created_at: string;
    transactions?: BankTransaction[];
}

export interface CreateBankAccountRequest {
    name: string;
    account_number: string;
    routing_number: string;
    gl_account_id: string;
}

export interface CreateSessionRequest {
    bank_account_id: string;
    period_start: string;
    period_end: string;
    statement_balance: number; // dollars
}

export interface ImportCSVRequest {
    bank_account_id: string;
    reconciliation_id?: string;
    csv_content: string;
}

export interface ManualMatchRequest {
    bank_transaction_id: string;
    journal_entry_id: string;
}

export interface ImportResult {
    total_rows: number;
    imported_rows: number;
    skipped_rows: number;
    auto_matched: number;
}
