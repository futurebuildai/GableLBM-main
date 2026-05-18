-- 060: Attach pre-existing non-branch locations to the default branch.
-- Any existing ZONE/AISLE/RACK/SHELF/BIN/YARD rows that pre-date the branch
-- foundation need a branch_id and (if missing) a parent_id. Both default to
-- the system default branch recorded in 059.
--
-- The trigger from 058 normally fills branch_id on INSERT/UPDATE-of-parent_id,
-- but historical rows were inserted before the trigger existed. To force the
-- trigger to run, we touch each row's parent_id (setting it to itself when
-- already set, otherwise to the default branch).

WITH default_branch AS (
    SELECT value::uuid AS id FROM system_settings WHERE key = 'default_branch_id'
)
UPDATE locations l
   SET parent_id = COALESCE(l.parent_id, (SELECT id FROM default_branch))
 WHERE l.type <> 'BRANCH'
   AND (l.branch_id IS NULL OR l.parent_id IS NULL);
