export type InvoiceStatus = 'PENDING' | 'APPROVED' | 'PARTIAL' | 'PAID' | 'VOIDED';

export type PaymentMethod = 'CHECK' | 'ACH' | 'WIRE';

export interface VendorInvoice {
    id: string;
    vendor_id: string;
    vendor_name?: string;
    invoice_number: string;
    invoice_date: string;
    due_date: string;
    po_id?: string;
    subtotal: number;       // Cents
    tax_amount: number;     // Cents
    total: number;          // Cents
    amount_paid: number;    // Cents
    status: InvoiceStatus;
    approved_by?: string;
    approved_at?: string;
    notes?: string;
    created_at: string;
    lines?: VendorInvoiceLine[];
}

export interface VendorInvoiceLine {
    id: string;
    invoice_id: string;
    description: string;
    quantity: number;
    unit_price: number;     // Cents
    line_total: number;     // Cents
    gl_account_id?: string;
    created_at: string;
}

export interface APPayment {
    id: string;
    vendor_id: string;
    vendor_name?: string;
    batch_id?: string;
    amount: number;         // Cents
    method: PaymentMethod;
    check_number?: string;
    reference?: string;
    payment_date: string;
    status: string;         // PENDING, COMPLETE, VOIDED
    created_at: string;
}

export interface CreateVendorInvoiceRequest {
    vendor_id: string;
    invoice_number: string;
    invoice_date: string;   // YYYY-MM-DD
    due_date: string;       // YYYY-MM-DD
    po_id?: string;
    tax_amount: number;     // Dollars (sent as float64)
    notes: string;
    lines: CreateVendorInvoiceLineReq[];
}

export interface CreateVendorInvoiceLineReq {
    description: string;
    quantity: number;
    unit_price: number;     // Dollars (sent as float64)
    gl_account_id?: string;
}

export interface CreateAPPaymentRequest {
    vendor_id: string;
    amount: number;         // Dollars (sent as float64)
    method: PaymentMethod;
    check_number?: string;
    reference?: string;
    payment_date: string;   // YYYY-MM-DD
    invoice_ids: string[];
}

export interface APAgingSummary {
    vendor_id: string;
    vendor_name: string;
    current: number;        // Cents
    past_30: number;        // Cents
    past_60: number;        // Cents
    past_90: number;        // Cents
    total: number;          // Cents
}
