export type OrderStatus = 'DRAFT' | 'CONFIRMED' | 'FULFILLED' | 'CANCELLED' | 'ON_HOLD';
export type OrderStatusColor = 'default' | 'info' | 'success' | 'warning' | 'error';

export interface Order {
    id: string;
    customer_id: string;
    customer_name?: string;
    quote_id?: string;
    status: OrderStatus;
    total_amount: number;
    created_at: string;
    updated_at: string;

    // Salesperson
    salesperson_id?: string;
    salesperson_name?: string;

    // Margin & Commission
    total_cost: number;
    total_margin: number;
    margin_percent: number;
    total_commission: number;

    // Relations
    lines?: OrderLine[];
}

export interface OrderLine {
    id: string;
    order_id: string;
    product_id: string;
    product_sku?: string;
    product_name?: string;
    quantity: number;
    price_each: number;
    unit_cost: number;
    commission_rate: number;
}

export interface CreateOrderRequest {
    customer_id: string;
    quote_id?: string;
    lines: {
        product_id: string;
        quantity: number;
        price_each: number;
    }[];
}

export const getStatusColor = (status: OrderStatus): OrderStatusColor => {
    switch (status) {
        case 'DRAFT': return 'default';
        case 'CONFIRMED': return 'info';
        case 'FULFILLED': return 'success';
        case 'ON_HOLD': return 'warning';
        case 'CANCELLED': return 'error';
        default: return 'default';
    }
};
