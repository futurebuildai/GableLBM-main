-- Migration: 043_quote_delivery
-- Description: Add delivery type, freight amount, and vehicle selection to quotes.

ALTER TABLE quotes ADD COLUMN IF NOT EXISTS delivery_type TEXT NOT NULL DEFAULT 'PICKUP';
ALTER TABLE quotes ADD COLUMN IF NOT EXISTS freight_amount NUMERIC(12,2) NOT NULL DEFAULT 0;
ALTER TABLE quotes ADD COLUMN IF NOT EXISTS vehicle_id UUID REFERENCES vehicles(id);
