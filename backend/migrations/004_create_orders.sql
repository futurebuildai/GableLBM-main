-- 1. Create Orders Table
CREATE TABLE IF NOT EXISTS orders (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    customer_id UUID NOT NULL REFERENCES customers(id) ON DELETE RESTRICT,
    quote_id UUID REFERENCES quotes(id) ON DELETE SET NULL, -- Link to source quote if any
    
    status TEXT NOT NULL CHECK (status IN ('DRAFT', 'CONFIRMED', 'FULFILLED', 'CANCELLED')),
    total_amount DECIMAL(10, 2) NOT NULL DEFAULT 0.00,
    
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 2. Create Order Lines Table
CREATE TABLE IF NOT EXISTS order_lines (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    order_id UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
    product_id UUID NOT NULL REFERENCES products(id) ON DELETE RESTRICT,
    
    quantity DECIMAL(10, 4) NOT NULL, -- Logical quantity (e.g. 100 PIECES)
    price_each DECIMAL(10, 2) NOT NULL, -- Snapshot of price at time of order
    
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_orders_customer ON orders(customer_id);
CREATE INDEX idx_orders_status ON orders(status);
CREATE INDEX idx_order_lines_order ON order_lines(order_id);

-- 3. Update Inventory Table
-- Add 'allocated' column to track committed stock that hasn't left the yard yet.
ALTER TABLE inventory
ADD COLUMN IF NOT EXISTS allocated DECIMAL(10, 4) NOT NULL DEFAULT 0;

-- Constraint: Allocated cannot exceed OnHand (Soft validation, hard constraint might be too rigid if inventory is out of sync)
-- But generally allocated <= quantity.
