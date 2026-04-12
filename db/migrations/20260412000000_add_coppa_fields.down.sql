-- Revert COPPA fields migration
DROP INDEX IF EXISTS idx_users_parental_consent;

ALTER TABLE users
  DROP COLUMN IF EXISTS parent_consent_granted_at,
  DROP COLUMN IF EXISTS parent_consent_expires_at,
  DROP COLUMN IF EXISTS parent_consent_token,
  DROP COLUMN IF EXISTS parent_email,
  DROP COLUMN IF EXISTS parental_consent_status,
  DROP COLUMN IF EXISTS requires_parental_consent,
  ALTER COLUMN last_name SET NOT NULL;
