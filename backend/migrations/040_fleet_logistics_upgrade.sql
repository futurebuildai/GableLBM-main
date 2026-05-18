-- Migration: 040_fleet_logistics_upgrade
-- Description: Enhance vehicles, drivers, deliveries for fleet management and portal visibility.

-- Enhance vehicles with fleet management fields
ALTER TABLE vehicles
ADD COLUMN IF NOT EXISTS vin VARCHAR(17),
ADD COLUMN IF NOT EXISTS year INTEGER,
ADD COLUMN IF NOT EXISTS make VARCHAR(100),
ADD COLUMN IF NOT EXISTS model VARCHAR(100),
ADD COLUMN IF NOT EXISTS insurance_expiry DATE,
ADD COLUMN IF NOT EXISTS next_service_date DATE,
ADD COLUMN IF NOT EXISTS odometer_miles INTEGER,
ADD COLUMN IF NOT EXISTS notes TEXT DEFAULT '';

-- Enhance drivers with HR/compliance fields
ALTER TABLE drivers
ADD COLUMN IF NOT EXISTS cdl_class VARCHAR(5),
ADD COLUMN IF NOT EXISTS cdl_expiry DATE,
ADD COLUMN IF NOT EXISTS hire_date DATE,
ADD COLUMN IF NOT EXISTS email VARCHAR(255);

-- Add geolocation to deliveries if missing
ALTER TABLE deliveries
ADD COLUMN IF NOT EXISTS latitude DOUBLE PRECISION,
ADD COLUMN IF NOT EXISTS longitude DOUBLE PRECISION,
ADD COLUMN IF NOT EXISTS estimated_arrival TIMESTAMPTZ;

-- Add route duration/distance if missing
ALTER TABLE delivery_routes
ADD COLUMN IF NOT EXISTS total_duration_mins INTEGER,
ADD COLUMN IF NOT EXISTS total_distance_miles DOUBLE PRECISION;

-- Add delivery time-window scheduling
ALTER TABLE deliveries
ADD COLUMN IF NOT EXISTS scheduled_start TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS scheduled_end TIMESTAMPTZ;

-- Reassign delivery_routes to the canonical vehicle (oldest per license_plate) before dedup
UPDATE delivery_routes SET vehicle_id = canon.keep_id
FROM (
    SELECT v.id AS dup_id, first_value(v.id) OVER (PARTITION BY v.license_plate ORDER BY v.created_at ASC) AS keep_id
    FROM vehicles v WHERE v.deleted_at IS NULL
) canon
WHERE delivery_routes.vehicle_id = canon.dup_id AND canon.dup_id != canon.keep_id;

-- Reassign delivery_routes to the canonical driver (oldest per license_number) before dedup
UPDATE delivery_routes SET driver_id = canon.keep_id
FROM (
    SELECT d.id AS dup_id, first_value(d.id) OVER (PARTITION BY d.license_number ORDER BY d.created_at ASC) AS keep_id
    FROM drivers d WHERE d.deleted_at IS NULL AND d.license_number IS NOT NULL
) canon
WHERE delivery_routes.driver_id = canon.dup_id AND canon.dup_id != canon.keep_id;

-- De-duplicate vehicles before adding unique constraint (keep oldest per license_plate)
DELETE FROM vehicles WHERE id IN (
    SELECT id FROM (
        SELECT id, ROW_NUMBER() OVER (PARTITION BY license_plate ORDER BY created_at ASC) AS rn
        FROM vehicles WHERE deleted_at IS NULL
    ) sub WHERE rn > 1
);

-- De-duplicate drivers before adding unique constraint (keep oldest per license_number)
DELETE FROM drivers WHERE id IN (
    SELECT id FROM (
        SELECT id, ROW_NUMBER() OVER (PARTITION BY license_number ORDER BY created_at ASC) AS rn
        FROM drivers WHERE deleted_at IS NULL AND license_number IS NOT NULL
    ) sub WHERE rn > 1
);

-- Add unique constraints for idempotent seeding
CREATE UNIQUE INDEX IF NOT EXISTS idx_vehicles_license_plate ON vehicles (license_plate) WHERE deleted_at IS NULL;
CREATE UNIQUE INDEX IF NOT EXISTS idx_drivers_license_number ON drivers (license_number) WHERE deleted_at IS NULL;
