-- 029_matching_and_bankrecon.sql
-- Sprint 26: 3-Way PO Matching + Bank Reconciliation

-- ============================================
-- 3-Way PO Matching
-- ============================================

-- Tolerance configuration for matching
CREATE TABLE IF NOT EXISTS po_match_config (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    qty_tolerance_pct DECIMAL(5,2) NOT NULL DEFAULT 0.00,
    price_tolerance_pct DECIMAL(5,2) NOT NULL DEFAULT 2.00,
    dollar_tolerance BIGINT NOT NULL DEFAULT 5000, -- cents ($50.00)
    auto_approve_on_match BOOLEAN NOT NULL DEFAULT true,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_by UUID
);

-- Insert default config row
INSERT INTO po_match_config (id, qty_tolerance_pct, price_tolerance_pct, dollar_tolerance, auto_approve_on_match)
VALUES (gen_random_uuid(), 0.00, 2.00, 5000, true)
ON CONFLICT DO NOTHING;

-- Overall match result per PO
CREATE TABLE IF NOT EXISTS po_match_results (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    po_id UUID NOT NULL REFERENCES purchase_orders(id),
    vendor_invoice_id UUID REFERENCES vendor_invoices(id),
    status VARCHAR(16) NOT NULL DEFAULT 'PENDING', -- PENDING, MATCHED, PARTIAL, EXCEPTION
    matched_at TIMESTAMPTZ,
    matched_by UUID,
    notes TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_po_match_results_po_id ON po_match_results(po_id);
CREATE INDEX IF NOT EXISTS idx_po_match_results_status ON po_match_results(status);

-- Per-line match detail
CREATE TABLE IF NOT EXISTS po_match_line_details (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    match_result_id UUID NOT NULL REFERENCES po_match_results(id) ON DELETE CASCADE,
    po_line_id UUID NOT NULL,
    description VARCHAR(256) NOT NULL DEFAULT '',
    po_qty DECIMAL(12,4) NOT NULL DEFAULT 0,
    received_qty DECIMAL(12,4) NOT NULL DEFAULT 0,
    invoiced_qty DECIMAL(12,4) NOT NULL DEFAULT 0,
    po_unit_cost BIGINT NOT NULL DEFAULT 0,         -- cents
    invoice_unit_price BIGINT NOT NULL DEFAULT 0,    -- cents
    qty_variance_pct DECIMAL(8,4) NOT NULL DEFAULT 0,
    price_variance_pct DECIMAL(8,4) NOT NULL DEFAULT 0,
    line_status VARCHAR(16) NOT NULL DEFAULT 'PENDING', -- MATCHED, EXCEPTION
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_po_match_line_details_result ON po_match_line_details(match_result_id);

-- ============================================
-- Bank Reconciliation
-- ============================================

CREATE TABLE IF NOT EXISTS bank_accounts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(128) NOT NULL,
    account_number VARCHAR(32),
    routing_number VARCHAR(16),
    gl_account_id UUID NOT NULL REFERENCES gl_accounts(id),
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS reconciliation_sessions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    bank_account_id UUID NOT NULL REFERENCES bank_accounts(id),
    period_start DATE NOT NULL,
    period_end DATE NOT NULL,
    statement_balance BIGINT NOT NULL DEFAULT 0,     -- cents
    gl_balance BIGINT NOT NULL DEFAULT 0,            -- cents
    cleared_count INT NOT NULL DEFAULT 0,
    cleared_total BIGINT NOT NULL DEFAULT 0,         -- cents
    outstanding_count INT NOT NULL DEFAULT 0,
    outstanding_total BIGINT NOT NULL DEFAULT 0,     -- cents
    difference BIGINT NOT NULL DEFAULT 0,            -- cents
    status VARCHAR(16) NOT NULL DEFAULT 'IN_PROGRESS', -- IN_PROGRESS, COMPLETED
    completed_by UUID,
    completed_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_recon_sessions_bank ON reconciliation_sessions(bank_account_id);

CREATE TABLE IF NOT EXISTS bank_transactions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    bank_account_id UUID NOT NULL REFERENCES bank_accounts(id),
    reconciliation_id UUID REFERENCES reconciliation_sessions(id),
    transaction_date DATE NOT NULL,
    amount BIGINT NOT NULL,                          -- cents (positive=deposit, negative=withdrawal)
    description VARCHAR(256),
    reference VARCHAR(128),
    matched_journal_entry_id UUID REFERENCES gl_journal_entries(id),
    status VARCHAR(16) NOT NULL DEFAULT 'UNMATCHED', -- UNMATCHED, MATCHED, EXCLUDED
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_bank_txn_account ON bank_transactions(bank_account_id);
CREATE INDEX IF NOT EXISTS idx_bank_txn_status ON bank_transactions(status);
CREATE INDEX IF NOT EXISTS idx_bank_txn_recon ON bank_transactions(reconciliation_id);
