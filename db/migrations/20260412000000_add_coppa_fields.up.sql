-- COPPA compliance: parental consent fields on users table
ALTER TABLE users
  ALTER COLUMN last_name DROP NOT NULL,
  ADD COLUMN IF NOT EXISTS requires_parental_consent BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS parental_consent_status   VARCHAR(32) NOT NULL DEFAULT 'not_required',
  ADD COLUMN IF NOT EXISTS parent_email              VARCHAR(255) NULL,
  ADD COLUMN IF NOT EXISTS parent_consent_token      TEXT NULL,
  ADD COLUMN IF NOT EXISTS parent_consent_expires_at TIMESTAMPTZ NULL,
  ADD COLUMN IF NOT EXISTS parent_consent_granted_at TIMESTAMPTZ NULL;

-- Fast lookup for pending-consent accounts
CREATE INDEX IF NOT EXISTS idx_users_parental_consent
  ON users(parental_consent_status)
  WHERE requires_parental_consent = TRUE;

-- Backfill: all existing accounts are adults (no parental consent needed)
UPDATE users
   SET parental_consent_status = 'not_required'
 WHERE requires_parental_consent = FALSE
   AND parental_consent_status   = 'not_required';
