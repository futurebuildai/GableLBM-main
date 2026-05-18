-- Migration: 055_po_source
-- Description: Track the origin of every purchase_orders row so the
--              "% of replenishments automated" KPI is measurable and
--              the UI can distinguish manual / reorder / special-order / A2A
--              POs at a glance.
--
-- Design notes:
--   - VARCHAR(20) + CHECK constraint (not a Postgres ENUM type) is chosen so
--     downstream forks can add new sources (e.g. EDI_INBOUND) without an
--     `ALTER TYPE` dance.
--   - Historical REORDER POs cannot be distinguished from MANUAL ones
--     pre-#7 (no marker existed). They default to MANUAL. Going forward
--     they will be tagged correctly by the service layer.

ALTER TABLE purchase_orders
    ADD COLUMN IF NOT EXISTS source VARCHAR(20) NOT NULL DEFAULT 'MANUAL';

-- Backfill SPECIAL_ORDER from line linkage.
UPDATE purchase_orders po
SET source = 'SPECIAL_ORDER'
WHERE po.source = 'MANUAL'
  AND EXISTS (
      SELECT 1 FROM purchase_order_lines pol
      WHERE pol.po_id = po.id
        AND pol.linked_so_line_id IS NOT NULL
  );

-- Backfill A2A from the inbound webhook log (introduced in migration 047).
UPDATE purchase_orders po
SET source = 'A2A'
FROM a2a_inbound_po_log log
WHERE log.created_po_id = po.id
  AND po.source = 'MANUAL';

-- Enforce allowed values. NOT VALID + VALIDATE keeps it cheap on big tables.
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'purchase_orders_source_check'
    ) THEN
        ALTER TABLE purchase_orders
            ADD CONSTRAINT purchase_orders_source_check
                CHECK (source IN ('MANUAL','REORDER','SPECIAL_ORDER','A2A'))
                NOT VALID;
        ALTER TABLE purchase_orders VALIDATE CONSTRAINT purchase_orders_source_check;
    END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_purchase_orders_source ON purchase_orders(source);
