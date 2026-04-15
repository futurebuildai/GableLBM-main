CREATE TABLE IF NOT EXISTS rebate_programs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    vendor_id UUID NOT NULL REFERENCES vendors(id),
    name VARCHAR(128) NOT NULL,
    program_type VARCHAR(16) NOT NULL, -- VOLUME, GROWTH, PRODUCT_MIX
    start_date DATE NOT NULL,
    end_date DATE NOT NULL,
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS rebate_tiers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    program_id UUID NOT NULL REFERENCES rebate_programs(id),
    min_volume BIGINT NOT NULL,
    max_volume BIGINT,
    rebate_pct DECIMAL(5,4) NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS rebate_claims (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    program_id UUID NOT NULL REFERENCES rebate_programs(id),
    period_start DATE NOT NULL,
    period_end DATE NOT NULL,
    qualifying_volume BIGINT NOT NULL,
    rebate_amount BIGINT NOT NULL,
    status VARCHAR(16) NOT NULL DEFAULT 'CALCULATED',
    claimed_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
