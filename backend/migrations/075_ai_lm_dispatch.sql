-- 075: AI_LM guided dispatch workflow support.
--
-- 1. Orders gain a scheduled delivery date plus a per-order delivery geopoint
--    so AI_LM can ingest a calendar date's deliveries and route them without
--    geocoding. demo_seed marks rows created by the AI_LM demo-seed endpoint
--    so re-seeding a date replaces only its own orders.
-- 2. Delivery routes gain a load_manifest JSONB — the packing manifest pushed
--    back by AI_LM (per-placement pack steps + securement plan) that powers
--    the yard "Pack Trucks" step-by-step loading instructions.
--
-- (Product digital-twin geometry already shipped in 073_product_dimensions.)

ALTER TABLE orders
    ADD COLUMN IF NOT EXISTS scheduled_delivery_date DATE,
    ADD COLUMN IF NOT EXISTS delivery_address TEXT,
    ADD COLUMN IF NOT EXISTS delivery_latitude DOUBLE PRECISION,
    ADD COLUMN IF NOT EXISTS delivery_longitude DOUBLE PRECISION,
    ADD COLUMN IF NOT EXISTS demo_seed BOOLEAN NOT NULL DEFAULT FALSE;

CREATE INDEX IF NOT EXISTS idx_orders_scheduled_delivery_date
    ON orders(scheduled_delivery_date) WHERE scheduled_delivery_date IS NOT NULL;

ALTER TABLE delivery_routes
    ADD COLUMN IF NOT EXISTS load_manifest JSONB;
