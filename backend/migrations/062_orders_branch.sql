-- Adds branch scoping to orders. Lines inherit from their header — no
-- column added to order_lines.

ALTER TABLE orders ADD COLUMN IF NOT EXISTS branch_id UUID REFERENCES locations(id);

UPDATE orders o
SET branch_id = (SELECT value::uuid FROM system_settings WHERE key = 'default_branch_id')
WHERE o.branch_id IS NULL;

ALTER TABLE orders ALTER COLUMN branch_id SET NOT NULL;

CREATE INDEX IF NOT EXISTS idx_orders_branch_id ON orders(branch_id);
CREATE INDEX IF NOT EXISTS idx_orders_branch_created ON orders(branch_id, created_at DESC);
