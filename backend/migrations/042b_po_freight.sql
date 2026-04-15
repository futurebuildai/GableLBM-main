-- 042: Purchase Order Freight Charges & AI-Powered Cost Allocation
-- Stores freight invoices uploaded against received POs and their
-- proportional allocation across PO lines for landed-cost updates.

CREATE TABLE IF NOT EXISTS po_freight_charges (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    po_id UUID NOT NULL REFERENCES purchase_orders(id),
    file_path TEXT,
    original_filename TEXT,
    carrier_name TEXT,
    invoice_number TEXT,
    total_amount_cents BIGINT NOT NULL DEFAULT 0,
    allocation_method TEXT NOT NULL DEFAULT 'cost_weighted',
    status TEXT NOT NULL DEFAULT 'PENDING',  -- PENDING | APPLIED
    ai_raw_response TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS po_freight_allocations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    freight_charge_id UUID NOT NULL REFERENCES po_freight_charges(id),
    po_line_id UUID NOT NULL REFERENCES purchase_order_lines(id),
    product_id UUID REFERENCES products(id),
    allocated_cents BIGINT NOT NULL DEFAULT 0,
    per_unit_cents BIGINT NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
