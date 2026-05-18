-- Sprint 16: Sovereign Dealer Portal
-- Customer Users (separate from internal staff auth)
CREATE TABLE IF NOT EXISTS customer_users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    customer_id UUID NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
    email VARCHAR(255) NOT NULL UNIQUE,
    password_hash VARCHAR(255) NOT NULL,
    name VARCHAR(255) NOT NULL,
    role VARCHAR(50) NOT NULL DEFAULT 'member',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_customer_users_email ON customer_users(email);
CREATE INDEX IF NOT EXISTS idx_customer_users_customer_id ON customer_users(customer_id);

-- Portal Configuration (white-label branding)
CREATE TABLE IF NOT EXISTS portal_config (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    dealer_name VARCHAR(255) NOT NULL DEFAULT 'GableLBM',
    logo_url TEXT NOT NULL DEFAULT '',
    primary_color VARCHAR(7) NOT NULL DEFAULT '#00FFA3',
    support_email VARCHAR(255) NOT NULL DEFAULT '',
    support_phone VARCHAR(50) NOT NULL DEFAULT '',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
