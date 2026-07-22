-- 076: Till → GL over/short posting.
--
-- On till close, a nonzero over/short posts a balanced journal entry
-- (Cash Over/Short vs Cash). Adds the expense account + a link column so
-- the drawer variance is on the ledger, not just the till report.

-- Cash Over/Short expense account (shorts debit it; overs credit it).
INSERT INTO gl_accounts (code, name, type, subtype, normal_balance, description) VALUES
    ('5030', 'Cash Over/Short', 'EXPENSE', 'Operating', 'DEBIT', 'Till drawer counting variances (short = expense, over = credit)')
ON CONFLICT (code) DO NOTHING;

-- Link a closed till session to its over/short journal entry (NULL when the
-- drawer balanced exactly — no entry is posted).
ALTER TABLE till_sessions ADD COLUMN IF NOT EXISTS gl_entry_id UUID REFERENCES gl_journal_entries(id);
