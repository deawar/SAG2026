-- Add email verification columns to users table
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS email_verified_at TIMESTAMPTZ NULL,
  ADD COLUMN IF NOT EXISTS email_verification_token TEXT NULL,
  ADD COLUMN IF NOT EXISTS email_verification_expires_at TIMESTAMPTZ NULL;

-- Backfill: treat all existing ACTIVE accounts as already verified
UPDATE users
   SET email_verified_at = COALESCE(created_at, NOW())
 WHERE account_status = 'ACTIVE'
   AND email_verified_at IS NULL
   AND deleted_at IS NULL;
