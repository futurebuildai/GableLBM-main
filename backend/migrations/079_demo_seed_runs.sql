-- Migration: 079_demo_seed_runs
-- Description: Observability table for the nightly demo fresh-data injection
--              scheduler (COMM-1 pillar 1). One row per scheduler tick (and per
--              manual POST /api/v1/admin/demo-seed/run trigger). Mirrors
--              reorder_runs (migration 056): records how many future-dated
--              CONFIRMED orders the injection created so an operator can confirm
--              demo.gablelbm.com stayed stocked with a rolling window of
--              upcoming deliveries for date-dependent modules like AI_LM.

CREATE TABLE IF NOT EXISTS demo_seed_runs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    finished_at TIMESTAMPTZ,
    status VARCHAR(20) NOT NULL DEFAULT 'RUNNING',
    orders_created INT NOT NULL DEFAULT 0,
    window_days INT NOT NULL DEFAULT 0,
    error_message TEXT,
    CONSTRAINT demo_seed_runs_status_check
        CHECK (status IN ('RUNNING','SUCCESS','FAILED','SKIPPED'))
);

CREATE INDEX IF NOT EXISTS idx_demo_seed_runs_started
    ON demo_seed_runs(started_at DESC);
