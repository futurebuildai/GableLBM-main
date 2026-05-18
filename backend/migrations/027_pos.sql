-- Sprint 24: Retail POS Module
-- Creates tables for POS transactions, line items, tenders, and registers.

CREATE TABLE IF NOT EXISTS pos_registers (
    id VARCHAR(32) PRIMARY KEY,
    location_id UUID NOT NULL,
    name VARCHAR(64) NOT NULL,
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS pos_transactions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    register_id VARCHAR(32) NOT NULL,
    cashier_id UUID NOT NULL,
    customer_id UUID,
    subtotal NUMERIC(12,2) NOT NULL DEFAULT 0,
    tax_amount NUMERIC(12,2) NOT NULL DEFAULT 0,
    total NUMERIC(12,2) NOT NULL DEFAULT 0,
    status VARCHAR(16) NOT NULL DEFAULT 'OPEN',
    completed_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS pos_line_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    transaction_id UUID NOT NULL REFERENCES pos_transactions(id) ON DELETE CASCADE,
    product_id UUID NOT NULL,
    description VARCHAR(256) NOT NULL,
    quantity DECIMAL(12,4) NOT NULL,
    uom VARCHAR(16) NOT NULL,
    unit_price NUMERIC(12,2) NOT NULL,
    line_total NUMERIC(12,2) NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS pos_tenders (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    transaction_id UUID NOT NULL REFERENCES pos_transactions(id) ON DELETE CASCADE,
    method VARCHAR(16) NOT NULL,
    amount NUMERIC(12,2) NOT NULL,
    reference VARCHAR(128),
    card_last4 VARCHAR(4),
    card_brand VARCHAR(16),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_pos_transactions_register ON pos_transactions(register_id);
CREATE INDEX IF NOT EXISTS idx_pos_transactions_status ON pos_transactions(status);
CREATE INDEX IF NOT EXISTS idx_pos_transactions_created ON pos_transactions(created_at);
CREATE INDEX IF NOT EXISTS idx_pos_line_items_tx ON pos_line_items(transaction_id);
CREATE INDEX IF NOT EXISTS idx_pos_tenders_tx ON pos_tenders(transaction_id);

-- Seed a default register
INSERT INTO pos_registers (id, location_id, name) VALUES ('REG-01', '00000000-0000-0000-0000-000000000000', 'Counter 1') ON CONFLICT DO NOTHING;
