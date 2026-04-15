-- 032_dispatch_notifications.sql
-- Sprint 30: Dispatch Maps + Delivery Notifications

-- Add route optimization fields
ALTER TABLE delivery_routes ADD COLUMN IF NOT EXISTS total_duration_mins INT;
ALTER TABLE delivery_routes ADD COLUMN IF NOT EXISTS total_distance_miles DECIMAL(10,2);

-- Add ETA to deliveries
ALTER TABLE deliveries ADD COLUMN IF NOT EXISTS estimated_arrival TIMESTAMPTZ;

-- Driver on-site quantity adjustments
CREATE TABLE IF NOT EXISTS delivery_qty_adjustments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    delivery_id UUID NOT NULL REFERENCES deliveries(id),
    product_id UUID NOT NULL,
    original_qty DECIMAL(12,4) NOT NULL,
    adjusted_qty DECIMAL(12,4) NOT NULL,
    reason_code VARCHAR(32) NOT NULL, -- SHORT_SHIP, DAMAGED, REFUSED, WRONG_PRODUCT, OTHER
    notes TEXT,
    adjusted_by UUID NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_delivery_qty_adj_delivery ON delivery_qty_adjustments(delivery_id);

-- Notification audit log
CREATE TABLE IF NOT EXISTS delivery_notifications (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    delivery_id UUID NOT NULL REFERENCES deliveries(id),
    channel VARCHAR(16) NOT NULL, -- SMS, EMAIL
    recipient VARCHAR(128) NOT NULL,
    message_type VARCHAR(32) NOT NULL, -- STAGED, OUT_FOR_DELIVERY, DELIVERED
    status VARCHAR(16) NOT NULL DEFAULT 'SENT',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_delivery_notifications_delivery ON delivery_notifications(delivery_id);
