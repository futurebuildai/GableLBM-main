-- General Ledger Module: Chart of Accounts, Journal Entries, Fiscal Periods
-- Sprint 20: Closing Gap F1 (the #1 competitive gap)

-- 1. Chart of Accounts
CREATE TABLE IF NOT EXISTS gl_accounts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    code VARCHAR(20) NOT NULL UNIQUE,
    name VARCHAR(100) NOT NULL,
    type VARCHAR(20) NOT NULL CHECK (type IN ('ASSET', 'LIABILITY', 'EQUITY', 'REVENUE', 'EXPENSE')),
    subtype VARCHAR(50) DEFAULT '',
    parent_id UUID REFERENCES gl_accounts(id),
    normal_balance VARCHAR(10) NOT NULL CHECK (normal_balance IN ('DEBIT', 'CREDIT')),
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    description TEXT DEFAULT '',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_gl_accounts_type ON gl_accounts(type);
CREATE INDEX IF NOT EXISTS idx_gl_accounts_code ON gl_accounts(code);
CREATE INDEX IF NOT EXISTS idx_gl_accounts_parent ON gl_accounts(parent_id);

-- 2. Fiscal Periods
CREATE TABLE IF NOT EXISTS gl_fiscal_periods (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(50) NOT NULL,
    start_date DATE NOT NULL,
    end_date DATE NOT NULL,
    status VARCHAR(10) NOT NULL DEFAULT 'OPEN' CHECK (status IN ('OPEN', 'CLOSED')),
    closed_at TIMESTAMP WITH TIME ZONE,
    closed_by VARCHAR(100),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_gl_fiscal_periods_dates ON gl_fiscal_periods(start_date, end_date);
CREATE INDEX IF NOT EXISTS idx_gl_fiscal_periods_status ON gl_fiscal_periods(status);

-- 3. Journal Entries (header)
CREATE TABLE IF NOT EXISTS gl_journal_entries (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    entry_number SERIAL,
    entry_date DATE NOT NULL DEFAULT CURRENT_DATE,
    memo TEXT NOT NULL DEFAULT '',
    source VARCHAR(20) NOT NULL DEFAULT 'MANUAL' CHECK (source IN ('MANUAL', 'INVOICE', 'PAYMENT', 'ADJUSTMENT', 'CLOSING')),
    source_ref_id UUID,
    status VARCHAR(10) NOT NULL DEFAULT 'DRAFT' CHECK (status IN ('DRAFT', 'POSTED', 'VOID')),
    posted_by VARCHAR(100),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_gl_journal_entries_date ON gl_journal_entries(entry_date);
CREATE INDEX IF NOT EXISTS idx_gl_journal_entries_status ON gl_journal_entries(status);
CREATE INDEX IF NOT EXISTS idx_gl_journal_entries_source ON gl_journal_entries(source, source_ref_id);

-- 4. Journal Entry Lines (detail)
CREATE TABLE IF NOT EXISTS gl_journal_lines (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    journal_entry_id UUID NOT NULL REFERENCES gl_journal_entries(id) ON DELETE CASCADE,
    account_id UUID NOT NULL REFERENCES gl_accounts(id),
    description TEXT DEFAULT '',
    debit DECIMAL(12, 2) NOT NULL DEFAULT 0,
    credit DECIMAL(12, 2) NOT NULL DEFAULT 0,
    CONSTRAINT chk_debit_or_credit CHECK (
        (debit > 0 AND credit = 0) OR (debit = 0 AND credit > 0)
    )
);

CREATE INDEX IF NOT EXISTS idx_gl_journal_lines_entry ON gl_journal_lines(journal_entry_id);
CREATE INDEX IF NOT EXISTS idx_gl_journal_lines_account ON gl_journal_lines(account_id);

-- 5. Seed Standard LBM Chart of Accounts
INSERT INTO gl_accounts (code, name, type, subtype, normal_balance, description) VALUES
    -- Assets
    ('1010', 'Cash',                 'ASSET',     'Current Asset',    'DEBIT',  'Cash and checking accounts'),
    ('1020', 'Accounts Receivable',  'ASSET',     'Current Asset',    'DEBIT',  'Customer balances due'),
    ('1030', 'Inventory',            'ASSET',     'Current Asset',    'DEBIT',  'Lumber, hardware, and building materials on hand'),
    ('1040', 'Prepaid Expenses',     'ASSET',     'Current Asset',    'DEBIT',  'Insurance, deposits, prepaid rent'),
    ('1500', 'Trucks & Equipment',   'ASSET',     'Fixed Asset',      'DEBIT',  'Delivery trucks, forklifts, yard equipment'),
    ('1510', 'Accum. Depreciation',  'ASSET',     'Fixed Asset',      'CREDIT', 'Contra-asset for depreciation'),
    -- Liabilities
    ('2010', 'Accounts Payable',     'LIABILITY', 'Current Liability','CREDIT', 'Vendor balances owed'),
    ('2020', 'Sales Tax Payable',    'LIABILITY', 'Current Liability','CREDIT', 'Collected sales tax awaiting remittance'),
    ('2030', 'Accrued Expenses',     'LIABILITY', 'Current Liability','CREDIT', 'Wages, utilities, and other accruals'),
    -- Equity
    ('3010', 'Owner Equity',         'EQUITY',    'Owner Equity',     'CREDIT', 'Owner investment and retained earnings'),
    ('3020', 'Retained Earnings',    'EQUITY',    'Retained Earnings','CREDIT', 'Cumulative net income retained'),
    -- Revenue
    ('4010', 'Sales Revenue',        'REVENUE',   'Operating',        'CREDIT', 'Revenue from material sales'),
    ('4020', 'Delivery Revenue',     'REVENUE',   'Operating',        'CREDIT', 'Revenue from delivery charges'),
    -- Expenses
    ('5010', 'Cost of Goods Sold',   'EXPENSE',   'COGS',             'DEBIT',  'Direct cost of materials sold'),
    ('5020', 'Operating Expenses',   'EXPENSE',   'Operating',        'DEBIT',  'Rent, utilities, wages, and general overhead')
ON CONFLICT (code) DO NOTHING;

-- 6. Seed initial fiscal periods (current year monthly)
INSERT INTO gl_fiscal_periods (name, start_date, end_date, status)
SELECT
    TO_CHAR(d, 'Mon YYYY'),
    DATE_TRUNC('month', d)::DATE,
    (DATE_TRUNC('month', d) + INTERVAL '1 month' - INTERVAL '1 day')::DATE,
    CASE WHEN DATE_TRUNC('month', d) <= DATE_TRUNC('month', CURRENT_DATE) THEN 'OPEN' ELSE 'OPEN' END
FROM generate_series(
    DATE_TRUNC('year', CURRENT_DATE),
    DATE_TRUNC('year', CURRENT_DATE) + INTERVAL '11 months',
    INTERVAL '1 month'
) AS d
ON CONFLICT DO NOTHING;
