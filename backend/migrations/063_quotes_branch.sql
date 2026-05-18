-- Adds branch scoping to quotes. Lines inherit from their header.

ALTER TABLE quotes ADD COLUMN IF NOT EXISTS branch_id UUID REFERENCES locations(id);

UPDATE quotes q
SET branch_id = (SELECT value::uuid FROM system_settings WHERE key = 'default_branch_id')
WHERE q.branch_id IS NULL;

ALTER TABLE quotes ALTER COLUMN branch_id SET NOT NULL;

CREATE INDEX IF NOT EXISTS idx_quotes_branch_id ON quotes(branch_id);
CREATE INDEX IF NOT EXISTS idx_quotes_branch_created ON quotes(branch_id, created_at DESC);
