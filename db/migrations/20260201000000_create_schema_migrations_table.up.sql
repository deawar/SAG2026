-- ============================================================================
-- Migration: 20260201000000_create_schema_migrations_table
-- Description: Create schema_migrations tracking table
-- Author: SAG Development Team
-- Date: February 1, 2026
-- ============================================================================

-- This is handled by MigrationManager.initMigrationTable()
-- This migration file serves as documentation and example for future migrations

-- ============================================================================
-- CREATE: schema_migrations table (if not exists)
-- ============================================================================

CREATE TABLE IF NOT EXISTS schema_migrations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  version VARCHAR(20) NOT NULL UNIQUE,
  name VARCHAR(255) NOT NULL,
  executed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  status VARCHAR(50) DEFAULT 'success',
  error_message TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_schema_migrations_version 
  ON schema_migrations(version DESC);

-- ============================================================================
-- Example migration record (for documentation)
-- ============================================================================
-- INSERT INTO schema_migrations (version, name, status)
-- VALUES ('20260201000000', 'create_schema_migrations_table', 'success');

-- ============================================================================
-- VERIFICATION QUERIES
-- ============================================================================

-- Verify table creation
SELECT EXISTS(
  SELECT 1 FROM information_schema.tables 
  WHERE table_name = 'schema_migrations'
) as table_exists;

-- Check migration history
SELECT version, name, executed_at, status 
FROM schema_migrations 
ORDER BY version DESC;
