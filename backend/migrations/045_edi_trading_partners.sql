-- 045_edi_trading_partners.sql
-- Vendor-agnostic EDI trading partner management and catalog persistence.

CREATE TABLE IF NOT EXISTS edi_trading_partners (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,                          -- e.g. "Orgill", "Do It Best"
    isa_sender_id TEXT NOT NULL DEFAULT '',       -- ISA06 Interchange Sender ID
    isa_sender_qualifier TEXT NOT NULL DEFAULT 'ZZ',
    isa_receiver_id TEXT NOT NULL DEFAULT '',     -- ISA08 Interchange Receiver ID
    isa_receiver_qualifier TEXT NOT NULL DEFAULT 'ZZ',
    gs_sender_id TEXT NOT NULL DEFAULT '',        -- GS02 Application Sender Code
    gs_receiver_id TEXT NOT NULL DEFAULT '',      -- GS03 Application Receiver Code
    edi_version TEXT NOT NULL DEFAULT '004010',   -- X12 version (004010, 005010)
    transport_type TEXT NOT NULL DEFAULT 'SFTP',  -- SFTP, AS2, FILE
    transport_config JSONB NOT NULL DEFAULT '{}', -- host, port, user, key_path, remote_dir etc.
    supported_documents TEXT[] NOT NULL DEFAULT ARRAY['832','846','850'], -- X12 document types
    is_active BOOLEAN NOT NULL DEFAULT true,
    notes TEXT NOT NULL DEFAULT '',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS edi_catalog_entries (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    partner_id UUID NOT NULL REFERENCES edi_trading_partners(id) ON DELETE CASCADE,
    vendor_sku TEXT NOT NULL,
    internal_product_id UUID REFERENCES products(id),  -- NULL until mapped
    description TEXT NOT NULL DEFAULT '',
    unit_cost NUMERIC(12,4) NOT NULL DEFAULT 0,
    uom TEXT NOT NULL DEFAULT 'EA',
    effective_date DATE,
    expiry_date DATE,
    min_order_qty NUMERIC(10,2) NOT NULL DEFAULT 1,
    pack_qty NUMERIC(10,2) NOT NULL DEFAULT 1,
    synced_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    UNIQUE(partner_id, vendor_sku)
);

CREATE INDEX IF NOT EXISTS idx_edi_catalog_partner ON edi_catalog_entries(partner_id);
CREATE INDEX IF NOT EXISTS idx_edi_catalog_vendor_sku ON edi_catalog_entries(vendor_sku);
CREATE INDEX IF NOT EXISTS idx_edi_catalog_internal ON edi_catalog_entries(internal_product_id) WHERE internal_product_id IS NOT NULL;
