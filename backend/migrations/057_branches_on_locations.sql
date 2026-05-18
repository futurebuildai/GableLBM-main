-- 057: Multi-branch foundation.
-- Extends the existing `locations` hierarchy with a top-level BRANCH type and
-- branch-scoped metadata. A branch is just a `locations` row with type='BRANCH'
-- and parent_id IS NULL. Every non-branch location row carries a denormalized
-- `branch_id` (set by trigger in migration 058) for fast scoping queries.

ALTER TABLE locations
    ADD COLUMN IF NOT EXISTS name                  TEXT,
    ADD COLUMN IF NOT EXISTS address               TEXT,
    ADD COLUMN IF NOT EXISTS city                  TEXT,
    ADD COLUMN IF NOT EXISTS state                 TEXT,
    ADD COLUMN IF NOT EXISTS zip                   TEXT,
    ADD COLUMN IF NOT EXISTS phone                 TEXT,
    ADD COLUMN IF NOT EXISTS tax_jurisdiction_code TEXT,
    ADD COLUMN IF NOT EXISTS default_tax_rate      NUMERIC(7,4),
    ADD COLUMN IF NOT EXISTS timezone              TEXT NOT NULL DEFAULT 'America/New_York',
    ADD COLUMN IF NOT EXISTS active                BOOLEAN NOT NULL DEFAULT TRUE,
    ADD COLUMN IF NOT EXISTS branch_id             UUID REFERENCES locations(id) ON DELETE RESTRICT;

-- Branch rows must be roots (no parent).
ALTER TABLE locations
    DROP CONSTRAINT IF EXISTS chk_branch_is_root;
ALTER TABLE locations
    ADD CONSTRAINT chk_branch_is_root
    CHECK (type <> 'BRANCH' OR parent_id IS NULL);

-- Partial index for fast "list active branches" lookups.
CREATE INDEX IF NOT EXISTS idx_locations_branches
    ON locations(id)
    WHERE type = 'BRANCH' AND active = TRUE;

-- Plain index on denormalized branch_id for downstream scoping joins.
CREATE INDEX IF NOT EXISTS idx_locations_branch_id ON locations(branch_id);
