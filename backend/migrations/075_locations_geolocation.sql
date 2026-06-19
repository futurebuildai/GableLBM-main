-- 075: Geolocation for branch locations.
-- Route optimization needs the branch's coordinates as the vehicle origin
-- (start/end). Branches carry address/city/state/zip since migration 057 but no
-- coordinates. Mirrors 021_add_delivery_geolocation.sql (deliveries lat/lng).
--
-- Columns are nullable and backfilled lazily: the delivery service geocodes a
-- branch's address via OpenRouteService the first time a route from that branch
-- is optimized, then persists the result here (delivery.Service.resolveBranchOrigin).

ALTER TABLE locations
    ADD COLUMN IF NOT EXISTS latitude  DOUBLE PRECISION,
    ADD COLUMN IF NOT EXISTS longitude DOUBLE PRECISION;
