-- 078: Staff management + per-module access grants.
--
-- Backs the COMM-1 "Staff Management" admin surface (a permission-set inside a
-- staff-management UI — Decision C) and the AI_LM `validate-staff` integration
-- call (Decision D). Staff are distinct from JWT-`sub` ERP users: this is the
-- roster AI_LM authenticates against and the grant table that gates which
-- modules each staff member may use.

-- Staff roster. `role` is a free-text label (dispatcher/yard/admin/staff/…);
-- module access is governed by module_grants, not by role.
CREATE TABLE IF NOT EXISTS staff (
    id         UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
    email      TEXT        UNIQUE NOT NULL,
    full_name  TEXT        NOT NULL,
    staff_no   TEXT        UNIQUE,
    role       TEXT        NOT NULL DEFAULT 'staff',
    active     BOOLEAN     NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Per-staff, per-module access grant. A row means "this staff member is granted
-- this module" — entitlement is additionally gated by staff.active and the
-- global modules.<id>.enabled flag in system_settings.
CREATE TABLE IF NOT EXISTS module_grants (
    staff_id   UUID        NOT NULL REFERENCES staff(id) ON DELETE CASCADE,
    module_id  TEXT        NOT NULL,
    granted_by TEXT,
    granted_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (staff_id, module_id)
);

CREATE INDEX IF NOT EXISTS idx_module_grants_module ON module_grants(module_id);

-- Demo staff roster. ON CONFLICT keeps re-runs idempotent (the email unique key
-- is the natural key) and lets edits overwrite the demo rows on redeploy.
INSERT INTO staff (email, full_name, staff_no, role, active) VALUES
    ('dispatcher@gable.com', 'Dana Ramirez', 'STF-001', 'dispatcher', TRUE),
    ('yard@gable.com',       'Yuki Tan',     'STF-002', 'yard',       TRUE),
    ('admin@gable.com',      'Avery Kim',    'STF-003', 'admin',      TRUE)
ON CONFLICT (email) DO UPDATE
    SET full_name = EXCLUDED.full_name,
        staff_no  = EXCLUDED.staff_no,
        role      = EXCLUDED.role,
        active    = EXCLUDED.active,
        updated_at = NOW();

-- Grant the dispatcher AI_LM access out of the box so the demo `validate-staff`
-- call returns entitled=true for at least one staff member.
INSERT INTO module_grants (staff_id, module_id, granted_by)
SELECT id, 'ai_lm', 'migration:078'
FROM staff WHERE email = 'dispatcher@gable.com'
ON CONFLICT (staff_id, module_id) DO NOTHING;

-- Enable the AI_LM module globally by default for the demo.
INSERT INTO system_settings (key, value) VALUES ('modules.ai_lm.enabled', 'true')
ON CONFLICT (key) DO NOTHING;
