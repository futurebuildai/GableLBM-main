-- Migration: 056_reorder_runs
-- Description: Observability table for the auto-reorder scheduler. One row
--              per job execution. Powers the "% automated" KPI's denominator
--              (did the cron actually run last night?) and gives operators
--              a recent-runs feed.

CREATE TABLE IF NOT EXISTS reorder_runs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    job VARCHAR(40) NOT NULL,
    started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    finished_at TIMESTAMPTZ,
    dry_run BOOLEAN NOT NULL DEFAULT true,
    status VARCHAR(20) NOT NULL DEFAULT 'RUNNING',
    pos_created INT NOT NULL DEFAULT 0,
    products_updated INT NOT NULL DEFAULT 0,
    products_skipped INT NOT NULL DEFAULT 0,
    error_message TEXT,
    CONSTRAINT reorder_runs_status_check
        CHECK (status IN ('RUNNING','SUCCESS','FAILED','SKIPPED')),
    CONSTRAINT reorder_runs_job_check
        CHECK (job IN ('refresh_targets','create_reorders'))
);

CREATE INDEX IF NOT EXISTS idx_reorder_runs_job_started
    ON reorder_runs(job, started_at DESC);
