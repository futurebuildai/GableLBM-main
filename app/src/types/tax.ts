// Tax domain types matching backend models

export interface TaxAddress {
    line1: string;
    line2?: string;
    city: string;
    state: string;
    postal_code: string;
    country: string; // ISO 3166-1 alpha-2 (e.g., "US")
}

export interface TaxLineInput {
    line_number: number;
    item_code: string;
    description: string;
    quantity: number;
    amount: number; // Pre-tax line total in cents
    tax_code?: string; // Avalara tax code, defaults to "P0000000"
}

export interface TaxLine {
    line_number: number;
    item_code: string;
    description: string;
    quantity: number;
    amount: number; // Pre-tax amount in cents
    tax_amount: number; // Tax in cents
    tax_rate: number; // Effective tax rate (0.0825 = 8.25%)
    jurisdiction: string;
    tax_code: string;
    exempt: boolean;
}

export interface TaxResult {
    document_code?: string;
    total_amount: number; // Pre-tax total in cents
    total_tax: number; // Total tax in cents
    grand_total: number; // total_amount + total_tax
    lines: TaxLine[];
    is_estimate: boolean; // True if flat-rate fallback was used
}

export interface TaxPreviewRequest {
    customer_id?: string;
    ship_from: TaxAddress;
    ship_to: TaxAddress;
    lines: TaxLineInput[];
    document_type?: string; // "SalesInvoice" (default) or "ReturnInvoice"
}

export interface TaxExemption {
    id: string;
    customer_id: string;
    exempt_reason: string; // "RESALE", "GOVERNMENT", "CONTRACTOR"
    certificate_number: string;
    issuing_state: string; // 2-letter state code
    effective_date: string; // ISO date
    expiry_date?: string; // ISO date, null if no expiry
    is_active: boolean;
    created_at: string;
}

export interface CreateExemptionRequest {
    customer_id: string;
    exempt_reason: string;
    certificate_number: string;
    issuing_state: string;
    expiry_date?: string; // ISO date
}
