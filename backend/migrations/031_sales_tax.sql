-- 031_sales_tax.sql
-- Sprint 29: Avalara Sales Tax Integration
-- Tax exemption certificates for customers (contractors often have resale exemptions)

CREATE TABLE IF NOT EXISTS tax_exemptions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    customer_id UUID NOT NULL REFERENCES customers(id),
    exempt_reason VARCHAR(64) NOT NULL,
    certificate_number VARCHAR(128),
    issuing_state VARCHAR(2),
    effective_date DATE NOT NULL DEFAULT CURRENT_DATE,
    expiry_date DATE,
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_tax_exemptions_customer ON tax_exemptions(customer_id);
CREATE INDEX idx_tax_exemptions_active ON tax_exemptions(customer_id, is_active) WHERE is_active = true;
