-- 072: AI_LM (Load Management) integration surface.
--
-- 1. Products gain canonical parametric 3D geometry (the PIM "digital twin"
--    dimensions). AI_LM resolves geometry as OVERRIDE → PIM → FALLBACK, so a
--    NULL here means "PIM has no geometry yet" — distinct from a real zero.
-- 2. Orders gain a scheduled delivery date plus a per-order delivery geopoint
--    so AI_LM can ingest a calendar date's deliveries and route them without
--    geocoding. demo_seed marks rows created by the AI_LM demo-seed endpoint
--    so re-seeding a date replaces only its own orders.
-- 3. Delivery routes gain a load_manifest JSONB — the packing manifest pushed
--    back by AI_LM (per-stop placements in pack order) that powers the yard
--    "Pack Trucks" step-by-step loading instructions.

ALTER TABLE products
    ADD COLUMN IF NOT EXISTS length_in DECIMAL(19,4),
    ADD COLUMN IF NOT EXISTS width_in DECIMAL(19,4),
    ADD COLUMN IF NOT EXISTS height_in DECIMAL(19,4),
    ADD COLUMN IF NOT EXISTS stackable BOOLEAN,
    ADD COLUMN IF NOT EXISTS geometry_source VARCHAR(20) NOT NULL DEFAULT 'NONE'; -- NONE / MANUAL / AI

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
