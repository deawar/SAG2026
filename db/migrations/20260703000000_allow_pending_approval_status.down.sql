-- Revert: remove PENDING_APPROVAL from allowed account_status values.
-- Any teachers still pending approval are moved to INACTIVE so the tighter
-- constraint can be re-applied without violation.
UPDATE users SET account_status = 'INACTIVE' WHERE account_status = 'PENDING_APPROVAL';

ALTER TABLE users
  DROP CONSTRAINT IF EXISTS users_account_status_check;

ALTER TABLE users
  ADD CONSTRAINT users_account_status_check
  CHECK (account_status IN ('ACTIVE', 'SUSPENDED', 'LOCKED', 'INACTIVE'));
