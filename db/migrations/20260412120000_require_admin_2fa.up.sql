-- G17: Ensure all existing admin accounts have two_fa_enabled = FALSE
-- so the forced-setup flow activates for them on next login.
-- (two_fa_enabled DEFAULT FALSE already, so this is a no-op data migration;
--  it exists for audit-trail purposes and to make the intent explicit.)
UPDATE users
SET two_fa_enabled = FALSE
WHERE role IN ('SITE_ADMIN', 'SCHOOL_ADMIN')
  AND two_fa_enabled IS NULL;
