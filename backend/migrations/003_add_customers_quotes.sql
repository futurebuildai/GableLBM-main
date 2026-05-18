-- 1. Price Levels
CREATE TABLE IF NOT EXISTS price_levels (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name TEXT NOT NULL,
    multiplier NUMERIC(12, 4) NOT NULL DEFAULT 1.0000, -- e.g. 0.85 for 15% off retail
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Seed Default Retail Price Level
INSERT INTO price_levels (name, multiplier)
SELECT 'Retail', 1.0000
WHERE NOT EXISTS (SELECT 1 FROM price_levels WHERE name = 'Retail');

-- 2. Customers
CREATE TABLE IF NOT EXISTS customers (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name TEXT NOT NULL,
    account_number TEXT UNIQUE NOT NULL,
    email TEXT,
    phone TEXT,
    address TEXT,
    
    price_level_id UUID REFERENCES price_levels(id) ON DELETE SET NULL,
    credit_limit NUMERIC(12, 2) DEFAULT 0.00,
    balance_due NUMERIC(12, 2) DEFAULT 0.00,
    
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Index for searching customers
CREATE INDEX IF NOT EXISTS idx_customers_name ON customers(name);
CREATE INDEX IF NOT EXISTS idx_customers_account ON customers(account_number);

-- 3. Customer Jobs (Projects)
CREATE TABLE IF NOT EXISTS customer_jobs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    customer_id UUID REFERENCES customers(id) ON DELETE CASCADE,
    name TEXT NOT NULL, -- "Smith Deck", "Main Street House"
    
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_customer_jobs_customer_id ON customer_jobs(customer_id);

-- 4. Quotes (Header)
-- Note: Reusing uom_type from 001_initial_schema.sql
CREATE TYPE quote_state AS ENUM (
    'DRAFT',
    'SENT',
    'ACCEPTED',
    'REJECTED',
    'EXPIRED'
);

CREATE TABLE IF NOT EXISTS quotes (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    customer_id UUID REFERENCES customers(id) ON DELETE RESTRICT,
    job_id UUID REFERENCES customer_jobs(id) ON DELETE SET NULL,
    
    -- Status
    state quote_state NOT NULL DEFAULT 'DRAFT',
    
    -- Financials
    total_amount NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
    
    -- Audit
    created_by UUID, -- Can link to user system later
    expires_at TIMESTAMP WITH TIME ZONE,
    
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_quotes_customer_id ON quotes(customer_id);

-- 5. Quote Lines
CREATE TABLE IF NOT EXISTS quote_lines (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    quote_id UUID REFERENCES quotes(id) ON DELETE CASCADE,
    
    -- Product Link
    product_id UUID REFERENCES products(id) ON DELETE RESTRICT,
    
    -- Details snapshot (in case product changes)
    sku TEXT NOT NULL,
    description TEXT NOT NULL,
    
    -- Quantities
    quantity NUMERIC(12, 4) NOT NULL,
    uom uom_type NOT NULL,
    
    -- Pricing (Snapshot)
    unit_price NUMERIC(12, 4) NOT NULL,
    line_total NUMERIC(12, 2) NOT NULL, -- qty * unit_price (stored for ease of query)
    
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_quote_lines_quote_id ON quote_lines(quote_id);
