-- Migration: 020_create_vendors
-- Description: Create vendors table and backfill from products

CREATE TABLE IF NOT EXISTS vendors (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(255) NOT NULL UNIQUE,
    contact_email VARCHAR(255),
    phone VARCHAR(50),
    address_line1 VARCHAR(255),
    city VARCHAR(100),
    state VARCHAR(50),
    zip VARCHAR(20),
    payment_terms VARCHAR(50) DEFAULT 'Net 30',
    
    -- Performance Metrics
    average_lead_time_days DECIMAL(10, 2) DEFAULT 0,
    fill_rate DECIMAL(5, 2) DEFAULT 0, -- Percentage
    total_spend_ytd DECIMAL(12, 2) DEFAULT 0,
    
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Backfill vendors from products (if any)
INSERT INTO vendors (name)
SELECT DISTINCT vendor
FROM products
WHERE vendor IS NOT NULL AND vendor != ''
ON CONFLICT (name) DO NOTHING;

-- Index for performance
CREATE INDEX idx_vendors_name ON vendors(name);
