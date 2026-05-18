-- Adds branch scoping to invoices. GL/journal entries are intentionally
-- NOT modified in this phase — branch dimension on GL is a deferred item.

ALTER TABLE invoices ADD COLUMN IF NOT EXISTS branch_id UUID REFERENCES locations(id);

UPDATE invoices i
SET branch_id = (SELECT value::uuid FROM system_settings WHERE key = 'default_branch_id')
WHERE i.branch_id IS NULL;

ALTER TABLE invoices ALTER COLUMN branch_id SET NOT NULL;

CREATE INDEX IF NOT EXISTS idx_invoices_branch_id ON invoices(branch_id);
CREATE INDEX IF NOT EXISTS idx_invoices_branch_created ON invoices(branch_id, created_at DESC);
