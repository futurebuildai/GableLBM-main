-- 075: Till sessions + POS payment completeness.
--
-- 1. till_sessions — the missing drawer lifecycle: open with a float, count,
--    close with over/short. One OPEN session per register (partial unique).
-- 2. pos_transactions gains till_session_id (sales attach to the open
--    session) and change_due (computed at completion).
-- 3. pos_tenders gains gateway fields so CARD tenders carry the Run
--    Payments transaction reference and auth code.
-- 4. invoices.order_id becomes nullable: POS account-charge sales create a
--    real invoice (AR) with no originating order.
--
-- Money columns follow the existing POS convention: NUMERIC(12,2) dollars
-- in the DB, int64 cents in application code.

CREATE TABLE IF NOT EXISTS till_sessions (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    register_id   VARCHAR(32) NOT NULL REFERENCES pos_registers(id),
    branch_id     UUID,
    cashier_id    UUID NOT NULL,
    status        VARCHAR(16) NOT NULL DEFAULT 'OPEN', -- OPEN | CLOSED
    opening_float NUMERIC(12,2) NOT NULL DEFAULT 0,
    opened_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    closed_at     TIMESTAMPTZ,
    -- Set at close:
    expected_by_method JSONB,          -- {"CASH": 41235, ...} cents, computed
    counted_by_method  JSONB,          -- {"CASH": 41000, ...} cents, entered
    over_short    NUMERIC(12,2),       -- counted - expected (dollars, negative = short)
    notes         TEXT NOT NULL DEFAULT '',
    created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- One open drawer per register.
CREATE UNIQUE INDEX IF NOT EXISTS idx_till_sessions_open_register
    ON till_sessions(register_id) WHERE status = 'OPEN';
CREATE INDEX IF NOT EXISTS idx_till_sessions_register ON till_sessions(register_id, opened_at);

ALTER TABLE pos_transactions ADD COLUMN IF NOT EXISTS till_session_id UUID REFERENCES till_sessions(id);
ALTER TABLE pos_transactions ADD COLUMN IF NOT EXISTS change_due NUMERIC(12,2) NOT NULL DEFAULT 0;
CREATE INDEX IF NOT EXISTS idx_pos_transactions_till_session ON pos_transactions(till_session_id);

ALTER TABLE pos_tenders ADD COLUMN IF NOT EXISTS gateway_tx_id VARCHAR(128);
ALTER TABLE pos_tenders ADD COLUMN IF NOT EXISTS auth_code VARCHAR(32);

-- POS account-charge invoices have no order.
ALTER TABLE invoices ALTER COLUMN order_id DROP NOT NULL;
