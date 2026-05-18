-- Sprint 25: Accounts Payable
-- Creates tables for vendor invoices, AP payments, and payment applications.

CREATE TABLE IF NOT EXISTS vendor_invoices (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    vendor_id UUID NOT NULL REFERENCES vendors(id),
    invoice_number VARCHAR(64) NOT NULL,
    invoice_date DATE NOT NULL,
    due_date DATE NOT NULL,
    po_id UUID,
    subtotal NUMERIC(12,2) NOT NULL,
    tax_amount NUMERIC(12,2) NOT NULL DEFAULT 0,
    total NUMERIC(12,2) NOT NULL,
    amount_paid NUMERIC(12,2) NOT NULL DEFAULT 0,
    status VARCHAR(16) NOT NULL DEFAULT 'PENDING',
    approved_by UUID,
    approved_at TIMESTAMPTZ,
    notes TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS vendor_invoice_lines (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    invoice_id UUID NOT NULL REFERENCES vendor_invoices(id) ON DELETE CASCADE,
    description VARCHAR(256) NOT NULL,
    quantity DECIMAL(12,4) NOT NULL,
    unit_price NUMERIC(12,2) NOT NULL,
    line_total NUMERIC(12,2) NOT NULL,
    gl_account_id UUID,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS ap_payments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    vendor_id UUID NOT NULL REFERENCES vendors(id),
    batch_id UUID,
    amount NUMERIC(12,2) NOT NULL,
    method VARCHAR(16) NOT NULL,
    check_number VARCHAR(32),
    reference VARCHAR(128),
    payment_date DATE NOT NULL,
    status VARCHAR(16) NOT NULL DEFAULT 'PENDING',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS ap_payment_applications (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    payment_id UUID NOT NULL REFERENCES ap_payments(id),
    invoice_id UUID NOT NULL REFERENCES vendor_invoices(id),
    amount NUMERIC(12,2) NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_vendor_invoices_vendor ON vendor_invoices(vendor_id);
CREATE INDEX IF NOT EXISTS idx_vendor_invoices_status ON vendor_invoices(status);
CREATE INDEX IF NOT EXISTS idx_vendor_invoices_due ON vendor_invoices(due_date);
CREATE INDEX IF NOT EXISTS idx_vendor_invoice_lines_inv ON vendor_invoice_lines(invoice_id);
CREATE INDEX IF NOT EXISTS idx_ap_payments_vendor ON ap_payments(vendor_id);
CREATE INDEX IF NOT EXISTS idx_ap_payment_apps_payment ON ap_payment_applications(payment_id);
CREATE INDEX IF NOT EXISTS idx_ap_payment_apps_invoice ON ap_payment_applications(invoice_id);
