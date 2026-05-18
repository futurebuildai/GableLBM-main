// POS Types — Retail Counter Sales

export type TransactionStatus = 'OPEN' | 'COMPLETED' | 'VOIDED' | 'RETURNED' | 'HELD';

export interface POSTransaction {
    id: string;
    register_id: string;
    cashier_id: string;
    customer_id?: string;
    subtotal: number;
    tax_amount: number;
    total: number;
    status: TransactionStatus;
    completed_at?: string;
    created_at: string;
    line_items?: POSLineItem[];
    tenders?: POSTender[];
}

export interface POSLineItem {
    id: string;
    transaction_id: string;
    product_id: string;
    description: string;
    quantity: number;
    uom: string;
    unit_price: number; // cents
    line_total: number; // cents
    created_at: string;
}

export interface POSTender {
    id: string;
    transaction_id: string;
    method: string;
    amount: number; // cents
    reference?: string;
    card_last4?: string;
    card_brand?: string;
    created_at: string;
}

export interface QuickSearchResult {
    product_id: string;
    sku: string;
    description: string;
    unit_price: number;
    uom: string;
    in_stock: number;
}

export interface AddLineItemRequest {
    product_id: string;
    quantity: number;
    uom: string;
}

export interface AddTenderRequest {
    method: string;
    amount: number;
    reference?: string;
    token_id?: string;
}

export interface TransactionSummary {
    id: string;
    register_id: string;
    total: number;
    status: TransactionStatus;
    item_count: number;
    completed_at?: string;
    created_at: string;
}
