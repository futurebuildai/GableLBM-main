import type { UOM } from "./product";

export type QuoteState = 'DRAFT' | 'SENT' | 'ACCEPTED' | 'REJECTED' | 'EXPIRED';

export interface QuoteLine {
    id: string;
    quote_id: string;
    product_id: string;
    sku: string;
    description: string;
    quantity: number;
    uom: UOM;
    unit_price: number;
    unit_cost: number;
    line_total: number;
    created_at: string;
}

export interface Quote {
    id: string;
    customer_id: string;
    customer_name?: string;
    job_id?: string;
    state: QuoteState;
    total_amount: number;
    expires_at?: string;
    created_at: string;
    updated_at: string;

    // Lifecycle timestamps
    sent_at?: string;
    accepted_at?: string;
    rejected_at?: string;

    // Delivery
    delivery_type: 'PICKUP' | 'DELIVERY';
    freight_amount: number;
    vehicle_id?: string;
    vehicle_name?: string;

    // Analytics
    margin_total?: number;
    source?: 'manual' | 'ai';

    // Original upload metadata (file downloaded separately)
    original_filename?: string;
    original_content_type?: string;

    // AI parse mapping data
    parse_map?: ParseMapItem[];

    lines?: QuoteLine[];
}

export interface ParseMapItem {
    raw_text: string;
    matched_product: {
        product_id: string;
        sku: string;
        description: string;
        uom: string;
        base_price: number;
    } | null;
    quantity: number;
    uom: string;
    confidence: number;
    is_special_order: boolean;
    alternatives: {
        product_id: string;
        sku: string;
        description: string;
        uom: string;
        base_price: number;
    }[];
}

export interface QuoteAnalytics {
    total_quotes: number;
    draft_count: number;
    sent_count: number;
    accepted_count: number;
    rejected_count: number;
    expired_count: number;
    conversion_rate: number;
    avg_margin_accepted: number;
    avg_margin_rejected: number;
    avg_days_to_close: number;
    total_quote_value: number;
    total_accepted_value: number;
    ai_sourced_count: number;
    ai_conversion_rate: number;
    manual_conversion_rate: number;
    trend_data: QuoteAnalyticsTrend[];
}

export interface QuoteAnalyticsTrend {
    date: string;
    created: number;
    accepted: number;
    rejected: number;
    total_value: number;
    accepted_value: number;
}

// Payload for creating a quote
export interface CreateQuoteRequest {
    customer_id: string;
    job_id?: string;
    source?: 'manual' | 'ai';
    delivery_type?: 'PICKUP' | 'DELIVERY';
    freight_amount?: number;
    vehicle_id?: string;
    original_file?: string; // base64 encoded
    original_filename?: string;
    original_content_type?: string;
    parse_map?: ParseMapItem[];
    lines: Array<{
        product_id: string;
        sku: string;
        description: string;
        quantity: number;
        uom: UOM;
        unit_price: number;
    }>;
}
