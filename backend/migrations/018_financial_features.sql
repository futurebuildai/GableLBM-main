-- C3: Tax calculation fields on invoices
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS tax_rate DECIMAL(5, 4) DEFAULT 0;
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS tax_amount DECIMAL(10, 2) DEFAULT 0;
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS subtotal DECIMAL(10, 2) DEFAULT 0;

-- C5: Payment terms
ALTER TABLE customers ADD COLUMN IF NOT EXISTS payment_terms VARCHAR(20) DEFAULT 'NET30';
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS payment_terms VARCHAR(20) DEFAULT 'NET30';

-- C2: Credit memos table
CREATE TABLE IF NOT EXISTS credit_memos (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    invoice_id UUID REFERENCES invoices(id),
    customer_id UUID NOT NULL REFERENCES customers(id),
    amount DECIMAL(10, 2) NOT NULL,
    reason TEXT NOT NULL,
    status VARCHAR(20) NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING', 'APPLIED', 'VOID')),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    applied_at TIMESTAMP WITH TIME ZONE
);

CREATE INDEX IF NOT EXISTS idx_credit_memos_customer ON credit_memos(customer_id);
CREATE INDEX IF NOT EXISTS idx_credit_memos_invoice ON credit_memos(invoice_id);
