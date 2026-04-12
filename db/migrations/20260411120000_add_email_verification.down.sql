-- Reverse email verification migration
ALTER TABLE users
  DROP COLUMN IF EXISTS email_verified_at,
  DROP COLUMN IF EXISTS email_verification_token,
  DROP COLUMN IF EXISTS email_verification_expires_at;
