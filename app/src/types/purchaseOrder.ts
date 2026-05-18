export type POStatus = 'DRAFT' | 'SENT' | 'PARTIAL' | 'RECEIVED' | 'CANCELLED';

// POSource — must stay in sync with the CHECK constraint in
// backend/migrations/055_po_source.sql.
export type POSource = 'MANUAL' | 'REORDER' | 'SPECIAL_ORDER' | 'A2A';

export interface PurchaseOrder {
    id: string;
    vendor_id?: string;
    vendor_name?: string;
    status: POStatus;
    source: POSource;
    created_at: string;
    updated_at: string;
    lines?: PurchaseOrderLine[];
    line_count?: number;
    total_cost?: number;
}

// Response shape for GET /api/v1/purchase-orders/source-summary —
// a map of source value to PO count. Some sources may be absent if no rows.
export type POSourceSummary = Partial<Record<POSource, number>>;

export interface PurchaseOrderLine {
    id: string;
    po_id: string;
    product_id?: string;
    description: string;
    quantity: number;
    qty_received: number;
    cost: number;
    linked_so_line_id?: string;
}

export interface CreatePORequest {
    vendor_id: string;
    lines: CreatePOLine[];
}

export interface CreatePOLine {
    product_id: string;
    description: string;
    quantity: number;
    cost: number;
}

export interface ReceivePORequest {
    lines: ReceiveLine[];
}

export interface ReceiveLine {
    line_id: string;
    qty_received: number;
    location_id: string;
}

export interface FreightCharge {
    id: string;
    po_id: string;
    file_path?: string;
    original_filename?: string;
    carrier_name?: string;
    invoice_number?: string;
    total_amount_cents: number;
    allocation_method: string;
    status: string;
    created_at: string;
    allocations?: FreightAllocation[];
}

export interface FreightAllocation {
    id: string;
    freight_charge_id: string;
    po_line_id: string;
    product_id?: string;
    allocated_cents: number;
    per_unit_cents: number;
    description?: string;
    created_at: string;
}

export interface FreightUploadResponse {
    freight_charge: FreightCharge;
    allocations: FreightAllocation[];
}

export type UrgencyLevel = 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW';

export interface PurchaseRecommendation {
    product_id: string;
    product_sku: string;
    product_name: string;
    vendor_name?: string;
    current_stock: number;
    avg_daily_sales: number;
    std_dev_sales: number;
    lead_time_days: number;
    reorder_point: number;
    safety_stock: number;
    suggested_qty: number;
    estimated_cost: number;
    urgency: UrgencyLevel;
    days_until_out: number;
    catalog_price?: number;
}

export interface RecommendationSummary {
    total_items: number;
    critical_count: number;
    high_count: number;
    medium_count: number;
    low_count: number;
    total_estimated_cost: number;
    items: PurchaseRecommendation[];
}
