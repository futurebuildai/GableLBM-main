-- Adds branch awareness to customers. A customer has a primary branch
-- (used for default scoping and reporting) and may be shared across
-- branches via the customer_branches join. A null primary_branch_id is
-- forbidden so list filtering is well-defined.

ALTER TABLE customers ADD COLUMN IF NOT EXISTS primary_branch_id UUID REFERENCES locations(id);

UPDATE customers
SET primary_branch_id = (SELECT value::uuid FROM system_settings WHERE key = 'default_branch_id')
WHERE primary_branch_id IS NULL;

ALTER TABLE customers ALTER COLUMN primary_branch_id SET NOT NULL;
CREATE INDEX IF NOT EXISTS idx_customers_primary_branch ON customers(primary_branch_id);

-- Join table for customers shared across branches. The primary branch is
-- also represented here for uniform query handling.
CREATE TABLE IF NOT EXISTS customer_branches (
    customer_id UUID NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
    branch_id   UUID NOT NULL REFERENCES locations(id) ON DELETE CASCADE,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (customer_id, branch_id)
);
CREATE INDEX IF NOT EXISTS idx_customer_branches_branch ON customer_branches(branch_id);

-- Backfill: every existing customer is mapped to their primary branch.
INSERT INTO customer_branches (customer_id, branch_id)
SELECT id, primary_branch_id FROM customers
ON CONFLICT DO NOTHING;
