-- 048_fk_on_delete_fix.sql
-- Fix missing ON DELETE behavior on two FKs flagged in L8 audit.
-- Also normalize NUMERIC columns to DECIMAL(19,4) per project convention (A2).

-- A1: Fix FK on edi_catalog_entries.internal_product_id
ALTER TABLE edi_catalog_entries
    DROP CONSTRAINT IF EXISTS edi_catalog_entries_internal_product_id_fkey,
    ADD CONSTRAINT edi_catalog_entries_internal_product_id_fkey
        FOREIGN KEY (internal_product_id) REFERENCES products(id) ON DELETE SET NULL;

-- A1: Fix FK on a2a_inbound_po_log.created_po_id
ALTER TABLE a2a_inbound_po_log
    DROP CONSTRAINT IF EXISTS a2a_inbound_po_log_created_po_id_fkey,
    ADD CONSTRAINT a2a_inbound_po_log_created_po_id_fkey
        FOREIGN KEY (created_po_id) REFERENCES purchase_orders(id) ON DELETE SET NULL;

-- A2: Normalize NUMERIC columns to DECIMAL(19,4) per CLAUDE.md convention
ALTER TABLE edi_catalog_entries ALTER COLUMN unit_cost TYPE DECIMAL(19,4);
ALTER TABLE edi_catalog_entries ALTER COLUMN min_order_qty TYPE DECIMAL(19,4);
ALTER TABLE edi_catalog_entries ALTER COLUMN pack_qty TYPE DECIMAL(19,4);
