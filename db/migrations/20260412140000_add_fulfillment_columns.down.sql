ALTER TABLE bids
  DROP COLUMN IF EXISTS shipped_at,
  DROP COLUMN IF EXISTS tracking_carrier,
  DROP COLUMN IF EXISTS tracking_number,
  DROP COLUMN IF EXISTS delivered_at,
  DROP COLUMN IF EXISTS fulfillment_notes;
