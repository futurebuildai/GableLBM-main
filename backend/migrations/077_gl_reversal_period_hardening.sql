-- 077: GL reversing entries + fiscal-period hardening.
--
-- Correction-by-reversal (proper accounting) replaces destructive void:
-- a posted entry is corrected by a linked, net-zero reversal, at most once.
-- Fiscal periods gain a DB-level closed-period guard (defense in depth
-- beyond the Go check) and a non-overlap constraint.

CREATE EXTENSION IF NOT EXISTS btree_gist;

-- Widen the source enum for reversal entries (and include the vendor sources
-- the app already emits but the original CHECK omitted).
ALTER TABLE gl_journal_entries DROP CONSTRAINT IF EXISTS gl_journal_entries_source_check;
ALTER TABLE gl_journal_entries ADD CONSTRAINT gl_journal_entries_source_check
    CHECK (source IN ('MANUAL','INVOICE','PAYMENT','ADJUSTMENT','CLOSING','REVERSAL','VENDOR_INVOICE','VENDOR_PAYMENT'));

-- Link a reversal entry to the entry it reverses; at most one reversal each.
ALTER TABLE gl_journal_entries ADD COLUMN IF NOT EXISTS reverses_entry_id UUID REFERENCES gl_journal_entries(id);
CREATE UNIQUE INDEX IF NOT EXISTS ux_gl_entry_single_reversal
    ON gl_journal_entries(reverses_entry_id) WHERE reverses_entry_id IS NOT NULL;

-- Fiscal periods must not overlap.
ALTER TABLE gl_fiscal_periods DROP CONSTRAINT IF EXISTS gl_fiscal_periods_no_overlap;
ALTER TABLE gl_fiscal_periods ADD CONSTRAINT gl_fiscal_periods_no_overlap
    EXCLUDE USING gist (daterange(start_date, end_date, '[]') WITH &&);

-- Reject posting a journal entry dated within a CLOSED period, at the DB.
CREATE OR REPLACE FUNCTION gl_reject_post_in_closed_period() RETURNS trigger AS $$
BEGIN
    IF NEW.status = 'POSTED' THEN
        IF EXISTS (
            SELECT 1 FROM gl_fiscal_periods p
            WHERE p.status = 'CLOSED' AND NEW.entry_date BETWEEN p.start_date AND p.end_date
        ) THEN
            RAISE EXCEPTION 'cannot post journal entry dated % into a closed fiscal period', NEW.entry_date
                USING ERRCODE = 'check_violation';
        END IF;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_gl_closed_period ON gl_journal_entries;
CREATE TRIGGER trg_gl_closed_period
    BEFORE INSERT OR UPDATE OF status, entry_date ON gl_journal_entries
    FOR EACH ROW EXECUTE FUNCTION gl_reject_post_in_closed_period();
