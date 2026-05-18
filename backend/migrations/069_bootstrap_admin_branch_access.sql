-- 069: Bootstrap user_locations from existing audit_log activity.
--
-- Multi-branch was introduced after the system had been running, so historical
-- users have no rows in user_locations. Without a grant they would be denied
-- access by BranchMiddleware once `multi_branch_enabled` is flipped on.
--
-- This migration grants every distinct user_id observed in audit_log access
-- to the default branch, marking it as their home branch. It is gated on the
-- `system_settings.bootstrap_done` flag so it runs exactly once.
--
-- The middleware additionally contains an admin/owner first-login fallback
-- (see pkg/middleware/branch.go) so newly minted admin users obtain access
-- on the fly without requiring another migration pass.

DO $$
DECLARE
    v_default UUID;
    v_done    TEXT;
BEGIN
    -- Skip if we've already run.
    SELECT value INTO v_done
      FROM system_settings
     WHERE key = 'bootstrap_done';
    IF v_done = 'true' THEN
        RETURN;
    END IF;

    -- Resolve the default branch (must exist from migration 059).
    SELECT value::uuid INTO v_default
      FROM system_settings
     WHERE key = 'default_branch_id';
    IF v_default IS NULL THEN
        RAISE NOTICE 'bootstrap skipped: default_branch_id not set';
        RETURN;
    END IF;

    -- Grant every historical user access to the default branch. The first
    -- grant per user is marked as their home branch; subsequent passes will
    -- collide on the primary key and be no-ops.
    INSERT INTO user_locations (user_sub, branch_id, is_home, granted_by)
    SELECT DISTINCT a.user_id, v_default, TRUE, 'migration:069'
      FROM audit_log a
     WHERE a.user_id IS NOT NULL
       AND a.user_id <> ''
    ON CONFLICT (user_sub, branch_id) DO NOTHING;

    -- Record completion so we never run the bulk grant twice. Operators can
    -- manually delete this row to re-trigger if needed.
    INSERT INTO system_settings (key, value)
    VALUES ('bootstrap_done', 'true')
    ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value;
END $$;
