export type InvoiceStatus = 'UNPAID' | 'PARTIAL' | 'PAID' | 'VOID' | 'OVERDUE';
export type PaymentTerms = 'COD' | 'DUE_ON_RECEIPT' | 'NET30' | 'NET60' | 'NET90';

export interface Invoice {
    id: string;
    order_id: string;
    customer_id: string;
    customer_name?: string;
    status: InvoiceStatus;
    subtotal: number;
    tax_rate: number;
    tax_amount: number;
    total_amount: number;
    payment_terms: PaymentTerms;
    due_date?: string;
    paid_at?: string;
    created_at: string;
    updated_at: string;

    // Relations
    lines?: InvoiceLine[];
}

export interface InvoiceLine {
    id: string;
    invoice_id: string;
    product_id: string;
    product_sku?: string;
    product_name?: string;
    quantity: number;
    price_each: number;
    created_at: string;
}

export interface CreditMemo {
    id: string;
    invoice_id?: string;
    customer_id: string;
    amount: number;
    reason: string;
    status: 'PENDING' | 'APPLIED' | 'VOID';
    created_at: string;
    applied_at?: string;
}

export interface ARAgingBucket {
    customer_id: string;
    customer_name: string;
    current: number;
    days_31_60: number;
    days_61_90: number;
    over_90: number;
    total: number;
}

export interface ARAgingReport {
    as_of_date: string;
    buckets: ARAgingBucket[];
    total_current: number;
    total_31_60: number;
    total_61_90: number;
    total_over_90: number;
    grand_total: number;
}

export interface StatementLine {
    date: string;
    type: string;
    description: string;
    debit: number;
    credit: number;
    balance: number;
}

export interface CustomerStatement {
    customer_id: string;
    customer_name: string;
    start_date: string;
    end_date: string;
    open_balance: number;
    close_balance: number;
    lines: StatementLine[];
}
