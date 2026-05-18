export type TransactionType = 'INVOICE' | 'PAYMENT' | 'ADJUSTMENT' | 'REFUND';

export interface CustomerTransaction {
    id: string;
    customer_id: string;
    type: TransactionType;
    amount: number; // Cents
    balance_after: number; // Cents
    reference_id?: string;
    description: string;
    created_at: string;
}

export interface AccountSummary {
    customer_id: string;
    balance_due: number; // Cents
    credit_limit: number; // Cents
    available_credit: number; // Cents
}
