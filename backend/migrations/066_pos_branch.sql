-- Adds branch scoping to POS. Registers are physical and tied to a branch;
-- transactions inherit branch_id from their register but also carry the
-- column denormalized for fast filtering and integrity (a register may be
-- moved between branches over its lifetime — historic txns must keep their
-- original branch).

DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'pos_registers') THEN
        EXECUTE 'ALTER TABLE pos_registers ADD COLUMN IF NOT EXISTS branch_id UUID REFERENCES locations(id)';
        EXECUTE 'UPDATE pos_registers SET branch_id = (SELECT value::uuid FROM system_settings WHERE key = ''default_branch_id'') WHERE branch_id IS NULL';
        EXECUTE 'ALTER TABLE pos_registers ALTER COLUMN branch_id SET NOT NULL';
        EXECUTE 'CREATE INDEX IF NOT EXISTS idx_pos_registers_branch_id ON pos_registers(branch_id)';
    END IF;
END $$;

DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'pos_transactions') THEN
        EXECUTE 'ALTER TABLE pos_transactions ADD COLUMN IF NOT EXISTS branch_id UUID REFERENCES locations(id)';
        EXECUTE 'UPDATE pos_transactions SET branch_id = (SELECT value::uuid FROM system_settings WHERE key = ''default_branch_id'') WHERE branch_id IS NULL';
        EXECUTE 'ALTER TABLE pos_transactions ALTER COLUMN branch_id SET NOT NULL';
        EXECUTE 'CREATE INDEX IF NOT EXISTS idx_pos_transactions_branch_id ON pos_transactions(branch_id)';
        EXECUTE 'CREATE INDEX IF NOT EXISTS idx_pos_transactions_branch_created ON pos_transactions(branch_id, created_at DESC)';
    END IF;
END $$;
