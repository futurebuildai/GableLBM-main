export interface Vendor {
    id: string;
    name: string;
    contact_email?: string;
    phone?: string;
    address_line1?: string;
    city?: string;
    state?: string;
    zip?: string;
    payment_terms: string;

    average_lead_time_days: number;
    fill_rate: number;
    total_spend_ytd: number;

    created_at: string;
    updated_at: string;
}

export interface CreateVendorRequest {
    name: string;
    contact_email?: string;
    phone?: string;
    payment_terms?: string;
}
