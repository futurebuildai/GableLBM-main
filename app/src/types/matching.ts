export interface MatchResult {
    id: string;
    po_id: string;
    vendor_invoice_id?: string;
    status: 'PENDING' | 'MATCHED' | 'PARTIAL' | 'EXCEPTION';
    matched_at?: string;
    matched_by?: string;
    notes?: string;
    created_at: string;
    lines?: MatchLineDetail[];
}

export interface MatchLineDetail {
    id: string;
    match_result_id: string;
    po_line_id: string;
    description: string;
    po_qty: number;
    received_qty: number;
    invoiced_qty: number;
    po_unit_cost: number;
    invoice_unit_price: number;
    qty_variance_pct: number;
    price_variance_pct: number;
    line_status: 'MATCHED' | 'EXCEPTION';
    created_at: string;
}

export interface MatchConfig {
    id: string;
    qty_tolerance_pct: number;
    price_tolerance_pct: number;
    dollar_tolerance: number;
    auto_approve_on_match: boolean;
    updated_at: string;
}

export interface MatchException {
    match_result_id: string;
    po_id: string;
    vendor_invoice_id?: string;
    status: 'EXCEPTION' | 'PARTIAL';
    notes?: string;
    created_at: string;
    line_count: number;
    exception_count: number;
}

export interface UpdateMatchConfigRequest {
    qty_tolerance_pct?: number;
    price_tolerance_pct?: number;
    dollar_tolerance?: number;
    auto_approve_on_match?: boolean;
}
