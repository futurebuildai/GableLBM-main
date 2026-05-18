-- 059: Default branch + kill switch.
-- Ensures there is always at least one BRANCH row and records its id under
-- system_settings.default_branch_id. Subsequent module migrations use this
-- value to backfill historical rows so columns can be set NOT NULL.
--
-- Also writes:
--   default_branch_required  = 'true'  (non-admin requests must supply X-Branch-Id)
--   multi_branch_enabled     = 'false' (kill switch; middleware acts single-branch when off)

DO $$
DECLARE
    v_branch UUID;
BEGIN
    -- Idempotent: skip if a default branch is already recorded.
    IF EXISTS (SELECT 1 FROM system_settings WHERE key = 'default_branch_id') THEN
        RETURN;
    END IF;

    -- Reuse first existing BRANCH if present, otherwise create one.
    SELECT id INTO v_branch
      FROM locations
     WHERE type = 'BRANCH'
     ORDER BY created_at
     LIMIT 1;

    IF v_branch IS NULL THEN
        INSERT INTO locations (parent_id, path, type, code, name, description, active)
        VALUES (NULL, 'Main', 'BRANCH', 'MAIN', 'Main Branch',
                'Default branch created by migration 059', TRUE)
        RETURNING id INTO v_branch;
    END IF;

    INSERT INTO system_settings (key, value)
    VALUES ('default_branch_id', v_branch::text)
    ON CONFLICT (key) DO NOTHING;

    INSERT INTO system_settings (key, value)
    VALUES ('default_branch_required', 'true')
    ON CONFLICT (key) DO NOTHING;

    INSERT INTO system_settings (key, value)
    VALUES ('multi_branch_enabled', 'false')
    ON CONFLICT (key) DO NOTHING;
END $$;
