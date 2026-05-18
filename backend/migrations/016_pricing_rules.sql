-- Pricing rules for quantity breaks, job-level overrides, and promotional pricing
CREATE TABLE IF NOT EXISTS pricing_rules (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    rule_type TEXT NOT NULL CHECK (rule_type IN ('QUANTITY_BREAK', 'JOB_OVERRIDE', 'PROMOTIONAL')),

    -- Scope: which products/customers/jobs this applies to (NULL = all)
    product_id UUID REFERENCES products(id),
    customer_id UUID REFERENCES customers(id),
    job_id UUID REFERENCES customer_jobs(id),
    category TEXT, -- product category match

    -- Pricing: one of these must be set
    fixed_price NUMERIC(12,4),          -- absolute price override
    discount_pct NUMERIC(6,4),          -- percentage discount off base
    markup_pct NUMERIC(6,4),            -- cost-plus markup percentage

    -- Quantity break thresholds
    min_quantity NUMERIC(12,4) DEFAULT 0,
    max_quantity NUMERIC(12,4),

    -- Margin protection
    margin_floor_pct NUMERIC(6,4),      -- minimum margin percentage

    -- Validity
    starts_at TIMESTAMPTZ,
    expires_at TIMESTAMPTZ,
    is_active BOOLEAN NOT NULL DEFAULT true,
    priority INTEGER NOT NULL DEFAULT 0, -- higher = checked first

    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_pricing_rules_product ON pricing_rules(product_id) WHERE is_active = true;
CREATE INDEX idx_pricing_rules_customer ON pricing_rules(customer_id) WHERE is_active = true;
CREATE INDEX idx_pricing_rules_job ON pricing_rules(job_id) WHERE is_active = true;
CREATE INDEX idx_pricing_rules_type ON pricing_rules(rule_type) WHERE is_active = true;
