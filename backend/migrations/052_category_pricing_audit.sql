-- 052: Audit trail for category pricing rule changes
CREATE TABLE IF NOT EXISTS category_pricing_audit (
    id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    rule_id      UUID NOT NULL,
    action       TEXT NOT NULL CHECK (action IN ('CREATE','UPDATE','DELETE')),
    old_values   JSONB,
    new_values   JSONB,
    performed_by TEXT,
    performed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    category_id  UUID,
    target_type  TEXT,
    tier         TEXT,
    customer_id  UUID
);

CREATE INDEX IF NOT EXISTS idx_cpa_rule_id ON category_pricing_audit(rule_id);
CREATE INDEX IF NOT EXISTS idx_cpa_performed_at ON category_pricing_audit(performed_at DESC);
