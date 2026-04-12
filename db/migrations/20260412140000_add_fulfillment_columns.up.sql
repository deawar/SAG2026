-- G14: Add fulfillment tracking columns to bids table
-- Won bids (bid_status = 'ACCEPTED') track shipping and delivery status.
ALTER TABLE bids
  ADD COLUMN IF NOT EXISTS shipped_at        TIMESTAMPTZ  NULL,
  ADD COLUMN IF NOT EXISTS tracking_carrier  VARCHAR(64)  NULL,
  ADD COLUMN IF NOT EXISTS tracking_number   VARCHAR(128) NULL,
  ADD COLUMN IF NOT EXISTS delivered_at      TIMESTAMPTZ  NULL,
  ADD COLUMN IF NOT EXISTS fulfillment_notes TEXT         NULL;
