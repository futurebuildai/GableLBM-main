-- Sprint 17: Market Indices & Price Escalators

CREATE TABLE IF NOT EXISTS market_indices (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(255) NOT NULL,
    source VARCHAR(255) NOT NULL DEFAULT 'MANUAL',
    current_value NUMERIC(12,4) NOT NULL,
    previous_value NUMERIC(12,4),
    unit VARCHAR(50) NOT NULL DEFAULT 'MBF',
    last_updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS price_escalators (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    quote_line_id UUID REFERENCES quote_lines(id) ON DELETE CASCADE,
    market_index_id UUID REFERENCES market_indices(id) ON DELETE SET NULL,
    escalation_type VARCHAR(20) NOT NULL CHECK (escalation_type IN ('PERCENTAGE', 'INDEX_DELTA')),
    escalation_rate NUMERIC(8,4) NOT NULL DEFAULT 0,
    base_price NUMERIC(12,4) NOT NULL,
    base_index_value NUMERIC(12,4),
    effective_date DATE NOT NULL,
    expiration_date DATE NOT NULL,
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_price_escalators_quote_line ON price_escalators(quote_line_id);
CREATE INDEX IF NOT EXISTS idx_price_escalators_market_index ON price_escalators(market_index_id);
CREATE INDEX IF NOT EXISTS idx_market_indices_name ON market_indices(name);

-- Seed default lumber market indices
INSERT INTO market_indices (name, source, current_value, previous_value, unit)
VALUES
    ('Random Lengths Framing Lumber Composite', 'RANDOM_LENGTHS', 485.0000, 472.0000, 'MBF'),
    ('Random Lengths Structural Panel Composite', 'RANDOM_LENGTHS', 520.0000, 505.0000, 'MBF'),
    ('CME Lumber Futures', 'CME', 498.5000, 490.0000, 'MBF')
ON CONFLICT DO NOTHING;
