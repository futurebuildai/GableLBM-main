-- 079: POS returns/refunds + customer deposits.
--
-- Two money-moving flows that close out the till subsystem:
--
-- 1. Returns — a customer brings merchandise back. We restock the sellable
--    lines, refund via cash/card/account, and book the GL reversal of the
--    original sale (DR Sales Revenue / CR Cash, the mirror of a cash sale).
--    A return may or may not reference an original transaction (no-receipt
--    returns are allowed) and may or may not carry a customer (walk-in cash).
--
-- 2. Customer deposits — prepayments held as a liability (2200 Customer
--    Deposits) until applied against the customer's AR. Taking a deposit is
--    DR Cash / CR 2200; applying it is DR 2200 / CR Accounts Receivable and a
--    payment-shaped subledger entry that reduces balance_due.
--
-- Money columns follow the POS convention: NUMERIC(12,2) dollars in the DB,
-- int64 cents in application code.

-- Customer Deposits liability account (credited when taken, debited on apply).
INSERT INTO gl_accounts (code, name, type, subtype, normal_balance, description) VALUES
    ('2200', 'Customer Deposits', 'LIABILITY', 'Current Liability', 'CREDIT', 'Customer prepayments held until applied to AR')
ON CONFLICT (code) DO NOTHING;

-- Widen the journal source enum for the two new posting flows so the ledger
-- is filterable by source (matches the 077 pattern of adding explicit sources
-- rather than overloading ADJUSTMENT).
ALTER TABLE gl_journal_entries DROP CONSTRAINT IF EXISTS gl_journal_entries_source_check;
ALTER TABLE gl_journal_entries ADD CONSTRAINT gl_journal_entries_source_check
    CHECK (source IN ('MANUAL','INVOICE','PAYMENT','ADJUSTMENT','CLOSING','REVERSAL','VENDOR_INVOICE','VENDOR_PAYMENT','RETURN','DEPOSIT'));

-- --- Returns ---

CREATE TABLE IF NOT EXISTS pos_returns (
    id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    register_id             VARCHAR(32) NOT NULL REFERENCES pos_registers(id),
    till_session_id         UUID REFERENCES till_sessions(id),
    original_transaction_id UUID REFERENCES pos_transactions(id), -- NULL = no-receipt return
    customer_id             UUID,                                 -- NULL = walk-in cash refund
    branch_id               UUID,
    cashier_id              UUID NOT NULL,
    subtotal                NUMERIC(12,2) NOT NULL DEFAULT 0,
    tax_amount              NUMERIC(12,2) NOT NULL DEFAULT 0,
    total                   NUMERIC(12,2) NOT NULL DEFAULT 0,
    refund_method           VARCHAR(16) NOT NULL DEFAULT 'CASH',  -- CASH | CARD | ACCOUNT
    reason                  TEXT NOT NULL DEFAULT '',
    status                  VARCHAR(16) NOT NULL DEFAULT 'COMPLETED',
    gl_entry_id             UUID REFERENCES gl_journal_entries(id), -- the reversal entry
    created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_pos_returns_register ON pos_returns(register_id, created_at);
CREATE INDEX IF NOT EXISTS idx_pos_returns_branch ON pos_returns(branch_id, created_at);
CREATE INDEX IF NOT EXISTS idx_pos_returns_customer ON pos_returns(customer_id);
CREATE INDEX IF NOT EXISTS idx_pos_returns_original ON pos_returns(original_transaction_id);

CREATE TABLE IF NOT EXISTS pos_return_lines (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    return_id   UUID NOT NULL REFERENCES pos_returns(id) ON DELETE CASCADE,
    product_id  UUID NOT NULL,
    description TEXT NOT NULL DEFAULT '',
    quantity    NUMERIC(19,4) NOT NULL,
    uom         VARCHAR(16) NOT NULL DEFAULT 'EA',
    unit_price  NUMERIC(12,2) NOT NULL DEFAULT 0,
    line_total  NUMERIC(12,2) NOT NULL DEFAULT 0,
    restock     BOOLEAN NOT NULL DEFAULT TRUE, -- damaged goods don't re-enter sellable stock
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_pos_return_lines_return ON pos_return_lines(return_id);

-- --- Customer deposits ---

CREATE TABLE IF NOT EXISTS customer_deposits (
    id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    customer_id    UUID NOT NULL,
    branch_id      UUID,
    amount         NUMERIC(12,2) NOT NULL,               -- original deposit
    applied_amount NUMERIC(12,2) NOT NULL DEFAULT 0,     -- cumulative applied to AR
    status         VARCHAR(16) NOT NULL DEFAULT 'OPEN',  -- OPEN | APPLIED | REFUNDED
    method         VARCHAR(16) NOT NULL DEFAULT 'CASH',  -- how the prepayment was taken
    reference      TEXT NOT NULL DEFAULT '',
    note           TEXT NOT NULL DEFAULT '',
    gl_entry_id    UUID REFERENCES gl_journal_entries(id), -- DR Cash / CR 2200
    created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT customer_deposits_applied_le_amount CHECK (applied_amount <= amount),
    CONSTRAINT customer_deposits_amount_positive CHECK (amount > 0)
);

CREATE INDEX IF NOT EXISTS idx_customer_deposits_customer ON customer_deposits(customer_id, status);
CREATE INDEX IF NOT EXISTS idx_customer_deposits_branch ON customer_deposits(branch_id, created_at);

-- Each application of a deposit against AR (audit trail; a deposit may be
-- applied in parts across several invoices).
CREATE TABLE IF NOT EXISTS customer_deposit_applications (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    deposit_id  UUID NOT NULL REFERENCES customer_deposits(id) ON DELETE CASCADE,
    customer_id UUID NOT NULL,
    amount      NUMERIC(12,2) NOT NULL CHECK (amount > 0),
    invoice_id  UUID,                                   -- optional: applied to a specific invoice
    gl_entry_id UUID REFERENCES gl_journal_entries(id), -- DR 2200 / CR AR
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_deposit_applications_deposit ON customer_deposit_applications(deposit_id);
CREATE INDEX IF NOT EXISTS idx_deposit_applications_customer ON customer_deposit_applications(customer_id);
