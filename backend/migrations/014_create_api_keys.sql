-- Create API Keys Table
CREATE TABLE IF NOT EXISTS api_keys (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name TEXT NOT NULL,
    key_hash TEXT NOT NULL, -- Stored as bcrypt or argon2 hash
    key_prefix TEXT NOT NULL, -- First few chars for identification (e.g., "sk_live_1234")
    scopes TEXT[] DEFAULT '{}', -- Array of permission scopes
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    last_used_at TIMESTAMP WITH TIME ZONE,
    revoked_at TIMESTAMP WITH TIME ZONE
);

CREATE INDEX IF NOT EXISTS idx_api_keys_hash ON api_keys(key_hash);
CREATE INDEX IF NOT EXISTS idx_api_keys_revoked_at ON api_keys(revoked_at);
