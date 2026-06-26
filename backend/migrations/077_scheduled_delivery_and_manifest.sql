-- Migration: 077_scheduled_delivery_and_manifest
-- Description: Make the /api/integration seam serve a LIVE AI_LM dispatch integration.
--   * scheduled_delivery_date — the FUTURE date an order is planned to be delivered.
--     AI_LM pulls orders by this date (GET /api/integration/orders?date=) to build the
--     next day's routes; ListOrdersForDate filters on
--     COALESCE(scheduled_delivery_date, created_at::date) so legacy orders without a
--     scheduled date still resolve by their creation date.
--   * packing_manifest — the 3D packing manifest AI_LM writes back with an approved
--     route (POST /api/integration/delivery-routes, load_manifest field). GableLBM
--     persists it per stop's order so the yard "Pack Trucks" surface can replay the
--     loading steps.
-- Columns are nullable; this migration is idempotent (IF NOT EXISTS everywhere).

ALTER TABLE orders ADD COLUMN IF NOT EXISTS scheduled_delivery_date DATE;
CREATE INDEX IF NOT EXISTS idx_orders_sched_delivery ON orders(scheduled_delivery_date);
ALTER TABLE orders ADD COLUMN IF NOT EXISTS packing_manifest JSONB;
