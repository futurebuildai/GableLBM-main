// Notification types for delivery status notifications and qty adjustments

export type DeliveryEventType = 'STAGED' | 'OUT_FOR_DELIVERY' | 'DELIVERED';

export interface DeliveryNotification {
    id: string;
    delivery_id: string;
    channel: 'SMS' | 'EMAIL';
    recipient: string;
    message_type: DeliveryEventType;
    status: string;
    created_at: string;
}

export type QtyAdjustmentReasonCode =
    | 'SHORT_SHIP'
    | 'DAMAGED'
    | 'REFUSED'
    | 'WRONG_PRODUCT'
    | 'OTHER';

export interface DeliveryLineAdjustment {
    product_id: string;
    original_qty: number;
    adjusted_qty: number;
    reason_code: QtyAdjustmentReasonCode;
    notes?: string;
}

export interface QtyAdjustmentRequest {
    delivery_id: string;
    adjusted_by: string;
    adjustments: DeliveryLineAdjustment[];
}

export interface RouteOptimizationResult {
    optimized_order: number[];
    legs: RouteLeg[];
    total_duration_mins: number;
    total_distance_miles: number;
}

export interface RouteLeg {
    stop_index: number;
    duration_mins: number;
    distance_miles: number;
    eta: string; // ISO 8601
}
