export type PaymentMethod = 'CASH' | 'CARD' | 'CHECK' | 'ACCOUNT';

export interface Payment {
    id: string;
    invoice_id: string;
    amount: number;
    method: PaymentMethod;
    reference: string;
    notes: string;
    created_at: string;

    // Gateway fields (present for card payments)
    gateway_tx_id?: string;
    gateway_status?: string;
    card_last4?: string;
    card_brand?: string;
    auth_code?: string;
}

export interface CreatePaymentRequest {
    invoice_id: string;
    amount: number; // cents
    method: PaymentMethod;
    reference: string;
    notes: string;
}

// Run Payments card payment flow
export interface PaymentIntentRequest {
    invoice_id: string;
    amount: number; // cents
}

export interface PaymentIntentResponse {
    public_key: string;
    invoice_id: string;
    amount_cents: number;
}

export interface ProcessCardPaymentRequest {
    invoice_id: string;
    token_id: string;
    amount: number; // cents
    notes: string;
}

export interface RefundRequest {
    payment_id: string;
    amount: number; // cents
    reason: string;
}

export interface Refund {
    id: string;
    payment_id: string;
    amount: number;
    reason: string;
    gateway_refund_id?: string;
    status: string;
    created_at: string;
}

// Tender line for split payments
export interface TenderLine {
    id: string;
    invoice_id: string;
    payment_id?: string;
    method: PaymentMethod;
    amount: number;
    reference?: string;
    created_at: string;
}
