-- 1. Customer Tier Enum
CREATE TYPE customer_tier AS ENUM ('RETAIL', 'SILVER', 'GOLD', 'PLATINUM');

-- 2. Add Tier to Customers
ALTER TABLE customers
ADD COLUMN tier customer_tier NOT NULL DEFAULT 'RETAIL';

-- 3. Customer Contracts (Specific SKU pricing overrides)
CREATE TABLE IF NOT EXISTS customer_contracts (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    customer_id UUID REFERENCES customers(id) ON DELETE CASCADE,
    product_id UUID REFERENCES products(id) ON DELETE CASCADE,
    
    contract_price NUMERIC(12, 4) NOT NULL,
    
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    
    UNIQUE(customer_id, product_id)
);

CREATE INDEX IF NOT EXISTS idx_customer_contracts_lookup ON customer_contracts(customer_id, product_id);
