-- 061: User-to-branch many-to-many join.
-- Users are keyed by JWT `sub` (TEXT); there is no users table yet.
-- Each user can be granted access to N branches and must have at most one
-- home branch (enforced by partial unique index).

CREATE TABLE IF NOT EXISTS user_locations (
    user_sub   TEXT      NOT NULL,
    branch_id  UUID      NOT NULL REFERENCES locations(id) ON DELETE CASCADE,
    is_home    BOOLEAN   NOT NULL DEFAULT FALSE,
    granted_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    granted_by TEXT,
    PRIMARY KEY (user_sub, branch_id)
);

CREATE INDEX IF NOT EXISTS idx_user_locations_user
    ON user_locations(user_sub);

-- At most one home branch per user.
CREATE UNIQUE INDEX IF NOT EXISTS idx_user_locations_one_home
    ON user_locations(user_sub)
    WHERE is_home = TRUE;
