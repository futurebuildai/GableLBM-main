-- 044_offline_sync.sql
-- Adds offline POS sync tracking columns and sync log table.

-- Track which transactions were synced from offline
ALTER TABLE pos_transactions ADD COLUMN IF NOT EXISTS synced_from TEXT;
ALTER TABLE pos_transactions ADD COLUMN IF NOT EXISTS client_created_at TIMESTAMPTZ;

-- Log each offline sync batch for auditability
CREATE TABLE IF NOT EXISTS pos_sync_log (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    batch_id TEXT NOT NULL,
    register_id TEXT NOT NULL DEFAULT '',
    synced_count INT NOT NULL DEFAULT 0,
    duplicate_count INT NOT NULL DEFAULT 0,
    error_count INT NOT NULL DEFAULT 0,
    errors JSONB DEFAULT '[]',
    synced_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_pos_sync_log_batch ON pos_sync_log(batch_id);
CREATE INDEX IF NOT EXISTS idx_pos_transactions_synced ON pos_transactions(synced_from) WHERE synced_from IS NOT NULL;
