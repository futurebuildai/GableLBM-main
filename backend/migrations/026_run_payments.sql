-- Sprint 23: Run Payments Integration + Tender Management
-- Extends the payments table with gateway fields and adds refund/tender tracking

-- Add gateway-specific fields to payments table
ALTER TABLE payments ADD COLUMN IF NOT EXISTS gateway_tx_id VARCHAR(128);
ALTER TABLE payments ADD COLUMN IF NOT EXISTS gateway_status VARCHAR(32);
ALTER TABLE payments ADD COLUMN IF NOT EXISTS token_id VARCHAR(128);
ALTER TABLE payments ADD COLUMN IF NOT EXISTS card_last4 VARCHAR(4);
ALTER TABLE payments ADD COLUMN IF NOT EXISTS card_brand VARCHAR(16);
ALTER TABLE payments ADD COLUMN IF NOT EXISTS auth_code VARCHAR(32);

-- Payment refunds table (tracks individual refund transactions)
CREATE TABLE IF NOT EXISTS payment_refunds (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    payment_id UUID NOT NULL REFERENCES payments(id),
    amount NUMERIC(12,2) NOT NULL,
    reason TEXT,
    gateway_refund_id VARCHAR(128),
    status VARCHAR(32) NOT NULL DEFAULT 'PENDING',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Tender lines table (supports split payments across multiple methods)
CREATE TABLE IF NOT EXISTS tender_lines (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    invoice_id UUID NOT NULL REFERENCES invoices(id),
    payment_id UUID REFERENCES payments(id),
    method VARCHAR(16) NOT NULL,
    amount NUMERIC(12,2) NOT NULL,
    reference VARCHAR(128),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Index for faster lookups
CREATE INDEX IF NOT EXISTS idx_payment_refunds_payment_id ON payment_refunds(payment_id);
CREATE INDEX IF NOT EXISTS idx_tender_lines_invoice_id ON tender_lines(invoice_id);
CREATE INDEX IF NOT EXISTS idx_payments_gateway_tx_id ON payments(gateway_tx_id);
