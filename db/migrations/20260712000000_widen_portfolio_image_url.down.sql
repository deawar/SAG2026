-- Revert portfolio_items.image_url back to VARCHAR(2083).
-- WARNING: lossy if any stored value exceeds 2083 characters (base64 images
-- will); intended only for a clean rollback before such data exists.
ALTER TABLE portfolio_items ALTER COLUMN image_url TYPE VARCHAR(2083);
