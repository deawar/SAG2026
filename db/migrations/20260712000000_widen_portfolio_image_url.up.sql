-- Widen portfolio_items.image_url so base64 image data URLs can be stored
-- directly. VARCHAR(2083) overflowed on save (Postgres 22001 -> HTTP 500),
-- mirroring the fix already applied to artwork.image_url.
ALTER TABLE portfolio_items ALTER COLUMN image_url TYPE TEXT;
