export interface RebateTier {
    id?: string;
    program_id?: string;
    min_volume: number;
    max_volume: number | null;
    rebate_pct: number;
    created_at?: string;
}

export interface RebateProgram {
    id?: string;
    vendor_id: string;
    name: string;
    program_type: 'VOLUME' | 'GROWTH' | 'PRODUCT_MIX';
    start_date: string;
    end_date: string;
    is_active: boolean;
    created_at?: string;
    tiers?: RebateTier[];
}

export interface RebateClaim {
    id?: string;
    program_id: string;
    period_start: string;
    period_end: string;
    qualifying_volume: number;
    rebate_amount: number;
    status: 'CALCULATED' | 'CLAIMED' | 'RECEIVED';
    claimed_at?: string | null;
    created_at?: string;
}

export interface CalculateClaimRequest {
    period_start: string;
    period_end: string;
    mock_volume: number;
}
