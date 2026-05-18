-- A2A Inbound Purchase Order Log
-- Records inbound A2A webhook events from FB Brain for idempotency and audit.
CREATE TABLE IF NOT EXISTS a2a_inbound_po_log (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    idempotency_key TEXT UNIQUE NOT NULL,
    event_type      TEXT NOT NULL,
    payload         JSONB NOT NULL,
    trace_id        TEXT,
    created_po_id   UUID REFERENCES purchase_orders(id),
    received_at     TIMESTAMPTZ DEFAULT NOW()
);

-- Index for fast idempotency lookups
CREATE INDEX IF NOT EXISTS idx_a2a_inbound_po_log_idempotency ON a2a_inbound_po_log(idempotency_key);
