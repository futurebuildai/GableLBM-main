-- Migration 035 originally contained a `-- Down` rollback section that the
-- file-based migration runner executed alongside the Up section in the same
-- transaction (see backend/cmd/migrate/main.go), silently dropping every
-- artifact 035 had just created. Deployments that already ran the buggy 035
-- have it marked as applied in `schema_migrations` and won't re-execute the
-- fixed file. This migration idempotently re-applies the intended Up
-- content so existing demo/staging databases self-heal on the next deploy.
CREATE TABLE IF NOT EXISTS portal_invites (
    id UUID PRIMARY KEY,
    customer_id UUID NOT NULL REFERENCES customers(id),
    email VARCHAR(255) NOT NULL,
    role VARCHAR(50) NOT NULL DEFAULT 'Buyer',
    token VARCHAR(255) UNIQUE NOT NULL,
    expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

ALTER TABLE customer_users ADD COLUMN IF NOT EXISTS status VARCHAR(50) NOT NULL DEFAULT 'Active';

CREATE TABLE IF NOT EXISTS projects (
    id UUID PRIMARY KEY,
    customer_id UUID NOT NULL REFERENCES customers(id),
    name VARCHAR(255) NOT NULL,
    status VARCHAR(50) NOT NULL DEFAULT 'Active',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

ALTER TABLE orders ADD COLUMN IF NOT EXISTS project_id UUID REFERENCES projects(id);
