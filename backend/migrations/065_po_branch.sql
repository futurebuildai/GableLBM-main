-- Adds branch scoping to purchase_orders and po_receipts. Receipts are
-- typically branch-scoped because they land at a specific yard/dock.

ALTER TABLE purchase_orders ADD COLUMN IF NOT EXISTS branch_id UUID REFERENCES locations(id);

UPDATE purchase_orders
SET branch_id = (SELECT value::uuid FROM system_settings WHERE key = 'default_branch_id')
WHERE branch_id IS NULL;

ALTER TABLE purchase_orders ALTER COLUMN branch_id SET NOT NULL;
CREATE INDEX IF NOT EXISTS idx_purchase_orders_branch_id ON purchase_orders(branch_id);
CREATE INDEX IF NOT EXISTS idx_purchase_orders_branch_created ON purchase_orders(branch_id, created_at DESC);

-- po_receipts may not exist in all installs; guard with a DO block.
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'po_receipts') THEN
        EXECUTE 'ALTER TABLE po_receipts ADD COLUMN IF NOT EXISTS branch_id UUID REFERENCES locations(id)';
        EXECUTE 'UPDATE po_receipts SET branch_id = (SELECT value::uuid FROM system_settings WHERE key = ''default_branch_id'') WHERE branch_id IS NULL';
        EXECUTE 'ALTER TABLE po_receipts ALTER COLUMN branch_id SET NOT NULL';
        EXECUTE 'CREATE INDEX IF NOT EXISTS idx_po_receipts_branch_id ON po_receipts(branch_id)';
    END IF;
END $$;

-- Brain agent-to-agent inbound POs land here. Default the inbound branch
-- to the same default as everyone else; admins can override later.
INSERT INTO system_settings (key, value)
VALUES ('brain_inbound_branch_id',
        (SELECT value FROM system_settings WHERE key = 'default_branch_id'))
ON CONFLICT (key) DO NOTHING;
