-- 1. Update Invoice Status Check Constraint to include 'PARTIAL'
ALTER TABLE invoices DROP CONSTRAINT invoices_status_check;
ALTER TABLE invoices ADD CONSTRAINT invoices_status_check CHECK (status IN ('UNPAID', 'PARTIAL', 'PAID', 'VOID', 'OVERDUE'));

-- 2. Create Payments Table
CREATE TABLE IF NOT EXISTS payments (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    invoice_id UUID NOT NULL REFERENCES invoices(id) ON DELETE RESTRICT,
    
    amount DECIMAL(10, 2) NOT NULL CHECK (amount > 0),
    method TEXT NOT NULL CHECK (method IN ('CASH', 'CARD', 'CHECK', 'ACCOUNT')),
    reference TEXT, -- Stripe ID, Check Number, etc.
    
    notes TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_payments_invoice ON payments(invoice_id);
CREATE INDEX idx_payments_created_at ON payments(created_at);
