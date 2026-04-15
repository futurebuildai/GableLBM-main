CREATE TABLE IF NOT EXISTS audit_log (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    action TEXT NOT NULL,          -- e.g. 'order.confirmed', 'invoice.created', 'price.changed'
    entity_type TEXT NOT NULL,     -- e.g. 'order', 'invoice', 'payment'
    entity_id UUID NOT NULL,
    user_id TEXT,                  -- from JWT claims (may be null for system actions)
    changes JSONB,                 -- optional diff/details
    ip_address TEXT,
    request_id TEXT,               -- correlation with request logs
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_audit_log_entity ON audit_log(entity_type, entity_id);
CREATE INDEX IF NOT EXISTS idx_audit_log_created ON audit_log(created_at);
