-- 078: Sovereign Z-reports — an immutable end-of-day snapshot per till session.
--
-- Generated once at close (UNIQUE on till_session_id) and never recomputed:
-- the payload is the frozen closing report (expected/counted/over-short by
-- tender, sales/tax/change, opening float, GL link). The till_sessions row
-- is already immutable once CLOSED; this is its auditable rendered record.

CREATE TABLE IF NOT EXISTS till_z_reports (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    till_session_id UUID NOT NULL UNIQUE REFERENCES till_sessions(id),
    register_id     VARCHAR(32) NOT NULL,
    branch_id       UUID,
    over_short      NUMERIC(12,2) NOT NULL DEFAULT 0, -- cents-as-dollars, for querying
    payload         JSONB NOT NULL,                   -- the frozen TillReport snapshot
    generated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_till_z_reports_register ON till_z_reports(register_id, generated_at);
CREATE INDEX IF NOT EXISTS idx_till_z_reports_branch ON till_z_reports(branch_id, generated_at);
