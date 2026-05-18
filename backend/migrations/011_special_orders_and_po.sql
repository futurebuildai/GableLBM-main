-- 1. Update order_lines
ALTER TABLE order_lines
ADD COLUMN IF NOT EXISTS is_special_order BOOLEAN NOT NULL DEFAULT FALSE,
ADD COLUMN IF NOT EXISTS vendor_id UUID, -- Nullable, but linked if known
ADD COLUMN IF NOT EXISTS special_order_cost DECIMAL(10, 2);

-- 2. Create Purchase Orders Table
CREATE TABLE IF NOT EXISTS purchase_orders (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    vendor_id UUID, -- In a real system, REFERENCES vendors(id)
    status VARCHAR(20) NOT NULL DEFAULT 'DRAFT' CHECK (status IN ('DRAFT', 'SENT', 'RECEIVED', 'CANCELLED')),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 3. Create Purchase Order Lines
CREATE TABLE IF NOT EXISTS purchase_order_lines (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    po_id UUID NOT NULL REFERENCES purchase_orders(id) ON DELETE CASCADE,
    description TEXT NOT NULL,
    quantity DECIMAL(10, 4) NOT NULL,
    cost DECIMAL(10, 2) NOT NULL,
    linked_so_line_id UUID REFERENCES order_lines(id) ON DELETE SET NULL, -- Link back to Sales Order Line
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_po_status ON purchase_orders(status);
CREATE INDEX idx_po_lines_po ON purchase_order_lines(po_id);
