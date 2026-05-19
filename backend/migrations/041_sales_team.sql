-- Sales Team table + salesperson assignment on customers and orders

CREATE TABLE IF NOT EXISTS sales_team (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    email TEXT,
    phone TEXT,
    role TEXT NOT NULL DEFAULT 'Sales Rep',
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE customers ADD COLUMN IF NOT EXISTS salesperson_id UUID REFERENCES sales_team(id);
ALTER TABLE orders ADD COLUMN IF NOT EXISTS salesperson_id UUID REFERENCES sales_team(id);

-- Seed demo salespeople (BC/Okanagan personas matching the Gable Lumber & Supply demo brand).
-- Existing demo DBs that already applied this migration with the prior Portland-era
-- names are corrected at runtime by the seed's ON CONFLICT (id) DO UPDATE clause
-- in backend/cmd/seed/main.go; fresh installs get the corrected values directly here.
INSERT INTO sales_team (id, name, email, phone, role) VALUES
    ('a1b2c3d4-0001-4000-8000-000000000001', 'Heather Macdonald', 'heather.m@gablelumber.ca', '250-555-5001', 'Sales Manager'),
    ('a1b2c3d4-0002-4000-8000-000000000002', 'Ethan Gagnon', 'ethan.g@gablelumber.ca', '250-555-5002', 'Sales Rep'),
    ('a1b2c3d4-0003-4000-8000-000000000003', 'Priya Brar', 'priya.b@gablelumber.ca', '250-555-5003', 'Account Executive'),
    ('a1b2c3d4-0004-4000-8000-000000000004', 'Cameron Fraser', 'cameron.f@gablelumber.ca', '250-555-5004', 'Sales Rep'),
    ('a1b2c3d4-0005-4000-8000-000000000005', 'Lucas Pelletier', 'lucas.p@gablelumber.ca', '250-555-5005', 'Sales Rep'),
    ('a1b2c3d4-0006-4000-8000-000000000006', 'Amanda Wong', 'amanda.w@gablelumber.ca', '250-555-5006', 'Account Executive')
ON CONFLICT DO NOTHING;
