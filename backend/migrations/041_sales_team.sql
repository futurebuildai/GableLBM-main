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

-- Seed demo salespeople
INSERT INTO sales_team (id, name, email, phone, role) VALUES
    ('a1b2c3d4-0001-4000-8000-000000000001', 'Sarah Mitchell', 'sarah.m@gable.com', '503-555-5001', 'Sales Manager'),
    ('a1b2c3d4-0002-4000-8000-000000000002', 'Jake Rodriguez', 'jake.r@gable.com', '503-555-5002', 'Sales Rep'),
    ('a1b2c3d4-0003-4000-8000-000000000003', 'Emily Chen', 'emily.c@gable.com', '503-555-5003', 'Account Executive'),
    ('a1b2c3d4-0004-4000-8000-000000000004', 'Marcus Williams', 'marcus.w@gable.com', '503-555-5004', 'Sales Rep'),
    ('a1b2c3d4-0005-4000-8000-000000000005', 'Tyler Brooks', 'tyler.b@gable.com', '503-555-5005', 'Sales Rep'),
    ('a1b2c3d4-0006-4000-8000-000000000006', 'Rachel Dunn', 'rachel.d@gable.com', '503-555-5006', 'Account Executive')
ON CONFLICT DO NOTHING;
