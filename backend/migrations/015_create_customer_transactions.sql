-- 1. Create Customer Transactions Table
CREATE TYPE transaction_type AS ENUM (
    'INVOICE',
    'PAYMENT',
    'ADJUSTMENT',
    'REFUND'
);

CREATE TABLE IF NOT EXISTS customer_transactions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    customer_id UUID NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
    
    type transaction_type NOT NULL,
    amount BIGINT NOT NULL, -- Positive for Debit (Invoice), Negative for Credit (Payment). In Cents.
    balance_after BIGINT NOT NULL, -- Running balance snapshot. In Cents.
    
    reference_id UUID, -- Can link to invoices(id) or payments(id)
    description TEXT,
    
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_customer_transactions_customer_id ON customer_transactions(customer_id);
CREATE INDEX IF NOT EXISTS idx_customer_transactions_created_at ON customer_transactions(created_at);
