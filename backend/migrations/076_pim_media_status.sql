-- 076: Async AI image generation status for pim_media.
-- Image generation runs in a background goroutine to avoid the platform's request
-- gateway timeout: the row is inserted as 'generating' (empty url) and flipped to
-- 'ready' (with the data URI) or 'failed' when the goroutine completes. Existing
-- and seeded rows default to 'ready' so they keep rendering.
ALTER TABLE pim_media ADD COLUMN IF NOT EXISTS status VARCHAR(20) NOT NULL DEFAULT 'ready';
CREATE INDEX IF NOT EXISTS idx_pim_media_status ON pim_media(product_id, status);
