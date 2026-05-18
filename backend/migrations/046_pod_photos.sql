-- 046_pod_photos.sql
-- Multi-photo POD support and signature data storage for deliveries.

CREATE TABLE IF NOT EXISTS delivery_pod_photos (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    delivery_id UUID NOT NULL REFERENCES deliveries(id) ON DELETE CASCADE,
    photo_url TEXT NOT NULL,
    photo_type TEXT NOT NULL DEFAULT 'site',  -- 'signature', 'site', 'damage'
    uploaded_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_pod_photos_delivery ON delivery_pod_photos(delivery_id);

-- Store base64 signature canvas data directly on delivery
ALTER TABLE deliveries ADD COLUMN IF NOT EXISTS signature_data_url TEXT;
