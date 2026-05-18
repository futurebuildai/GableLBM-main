export type PricingSource = "CONTRACT" | "TIER" | "RETAIL" | "QUANTITY_BREAK" | "JOB_OVERRIDE" | "PROMOTIONAL";

export interface CalculatedPrice {
    product_id: string;
    original_price: number;
    final_price: number;
    discount_pct: number;
    source: PricingSource;
    details: string;
}

// --- Escalator Pricing Types ---

export type EscalationType = "PERCENTAGE" | "INDEX_DELTA";

export interface MarketIndex {
    id: string;
    name: string;
    source: string;
    current_value: number;
    previous_value: number | null;
    unit: string;
    last_updated_at: string;
    created_at: string;
}

export interface EscalationRequest {
    base_price: number;
    escalation_type: EscalationType;
    escalation_rate: number;
    effective_date: string;
    target_date: string;
    market_index_id?: string;
}

export interface EscalationResult {
    base_price: number;
    future_price: number;
    price_delta: number;
    delta_percent: number;
    months_out: number;
    is_stale: boolean;
    stale_delta_pct: number;
    current_index: number | null;
    base_index: number | null;
    escalation_type: string;
    expiration_date: string;
    is_expired: boolean;
}

export interface QuoteLineEscalator {
    enabled: boolean;
    escalation_type: EscalationType;
    escalation_rate: number;
    effective_date: string;
    target_date: string;
    market_index_id?: string;
    result?: EscalationResult;
}
