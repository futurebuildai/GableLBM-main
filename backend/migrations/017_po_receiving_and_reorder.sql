-- Add product_id and qty_received to purchase_order_lines
ALTER TABLE purchase_order_lines ADD COLUMN IF NOT EXISTS product_id UUID REFERENCES products(id);
ALTER TABLE purchase_order_lines ADD COLUMN IF NOT EXISTS qty_received DECIMAL(10, 4) DEFAULT 0;

-- Add PARTIAL status to purchase_orders
ALTER TABLE purchase_orders DROP CONSTRAINT IF EXISTS purchase_orders_status_check;
ALTER TABLE purchase_orders ADD CONSTRAINT purchase_orders_status_check
    CHECK (status IN ('DRAFT', 'SENT', 'PARTIAL', 'RECEIVED', 'CANCELLED'));

-- Add reorder_point and reorder_qty to products
ALTER TABLE products ADD COLUMN IF NOT EXISTS reorder_point DECIMAL(10, 4) DEFAULT 0;
ALTER TABLE products ADD COLUMN IF NOT EXISTS reorder_qty DECIMAL(10, 4) DEFAULT 0;

-- Index for reorder alert queries
CREATE INDEX IF NOT EXISTS idx_products_reorder ON products(reorder_point) WHERE reorder_point > 0;
