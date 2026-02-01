-- ============================================================================
-- Rollback: 20260201000000_create_schema_migrations_table
-- Description: Drop schema_migrations tracking table
-- ============================================================================

-- Drop migration history index
DROP INDEX IF EXISTS idx_schema_migrations_version;

-- Drop migration tracking table
DROP TABLE IF EXISTS schema_migrations;

-- ============================================================================
-- VERIFICATION QUERY
-- ============================================================================

SELECT EXISTS(
  SELECT 1 FROM information_schema.tables 
  WHERE table_name = 'schema_migrations'
) as table_exists;  -- Should return false
