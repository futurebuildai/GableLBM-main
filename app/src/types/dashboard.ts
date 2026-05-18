// Dashboard types for Executive Analytics

export interface DashboardSummary {
    today_revenue: number;      // Cents
    today_revenue_change: number; // Percentage
    active_orders: number;
    pending_dispatch: number;
    outstanding_ar: number;     // Cents
    outstanding_ar_count: number;
}

export interface InventoryAlert {
    product_id: string;
    sku: string;
    name: string;
    current_qty: number;
    reorder_qty: number;
    alert_type: 'LOW_STOCK' | 'OUT_OF_STOCK';
    location_id?: string;
}

export interface TopCustomer {
    customer_id: string;
    customer_name: string;
    total_revenue: number; // Cents
    order_count: number;
}

export interface RecentOrder {
    order_id: string;
    customer_name: string;
    total_amount: number; // Cents
    status: string;
    created_at: string;
}

export interface OrderActivity {
    recent_orders: RecentOrder[];
    status_breakdown: Record<string, number>;
}

export interface RevenueTrendPoint {
    date: string;
    revenue: number; // Cents
}
