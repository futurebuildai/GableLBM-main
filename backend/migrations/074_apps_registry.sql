-- 074: Apps registry — Odoo-style installable apps, per-instance enablement.
--
-- Rows are synced from compiled-in manifests at boot (pkg/apps.Registry.Sync):
-- metadata (name, summary, category, core, depends_on) refreshes from code on
-- every boot; `enabled` belongs to the operator and is NEVER overwritten by
-- sync. Rows whose key matches no compiled-in manifest are left untouched
-- (fork/branch drift stays visible instead of being destroyed).
--
-- TEXT natural-key PK follows the system_settings precedent for
-- registry/config tables; business tables keep UUID v4 PKs.

CREATE TABLE IF NOT EXISTS apps (
    key          TEXT PRIMARY KEY,
    name         TEXT NOT NULL,
    summary      TEXT NOT NULL DEFAULT '',
    category     TEXT NOT NULL DEFAULT 'Uncategorized',
    core         BOOLEAN NOT NULL DEFAULT FALSE,
    enabled      BOOLEAN NOT NULL DEFAULT TRUE,
    depends_on   TEXT[] NOT NULL DEFAULT '{}',
    installed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE apps IS 'Installable-app registry: one row per app manifest; enabled is operator-owned state, all other columns sync from code at boot.';
