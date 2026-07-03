-- Allow PENDING_APPROVAL account status for self-registered teachers
-- awaiting school-admin approval (audience-safety remediation Task 1).
ALTER TABLE users
  DROP CONSTRAINT IF EXISTS users_account_status_check;

ALTER TABLE users
  ADD CONSTRAINT users_account_status_check
  CHECK (account_status IN ('ACTIVE', 'SUSPENDED', 'LOCKED', 'INACTIVE', 'PENDING_APPROVAL'));
