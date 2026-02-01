/**
 * ============================================================================
 * Database Migration Manager
 * Silent Auction Gallery - Section 10
 * ============================================================================
 * 
 * Manages database schema versioning and rollback capabilities.
 * Migrations are stored in the `db/migrations/` directory with naming convention:
 * - Up migration: `YYYYMMDD-HHMMSS_description.up.sql`
 * - Down migration: `YYYYMMDD-HHMMSS_description.down.sql`
 * 
 * Usage:
 *   npm run migrate:up     # Apply next pending migration
 *   npm run migrate:down   # Rollback last migration
 *   npm run migrate:status # Show migration status
 * 
 * Migration History Table:
 *   - id: UUID primary key
 *   - version: timestamp-based version (e.g., 20260201120000)
 *   - name: migration file name (without .up/.down.sql)
 *   - executed_at: timestamp when applied
 *   - status: 'success' | 'pending' | 'failed'
 *   - error_message: error details if failed
 */

const fs = require('fs');
const path = require('path');
const { Pool } = require('pg');
const logger = require('../src/utils/logger');

class MigrationManager {
  constructor(database) {
    this.db = database;
    this.migrationsDir = path.join(__dirname, 'migrations');
  }

  /**
   * Initialize migration tracking table
   */
  async initMigrationTable() {
    const query = `
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
    `;

    try {
      await this.db.query(query);
      logger.info('Migration table initialized');
    } catch (error) {
      logger.error('Failed to initialize migration table:', error);
      throw error;
    }
  }

  /**
   * Get all migration files in order
   */
  getMigrationFiles() {
    if (!fs.existsSync(this.migrationsDir)) {
      return [];
    }

    const files = fs.readdirSync(this.migrationsDir)
      .filter(file => file.endsWith('.up.sql'))
      .map(file => {
        const name = file.replace('.up.sql', '');
        const version = name.split('_')[0];
        return { version, name, file };
      })
      .sort((a, b) => a.version.localeCompare(b.version));

    return files;
  }

  /**
   * Get applied migrations
   */
  async getAppliedMigrations() {
    const query = 'SELECT version, name FROM schema_migrations WHERE status = $1 ORDER BY version';
    const result = await this.db.query(query, ['success']);
    return result.rows;
  }

  /**
   * Get pending migrations
   */
  async getPendingMigrations() {
    const allMigrations = this.getMigrationFiles();
    const applied = await this.getAppliedMigrations();
    const appliedVersions = applied.map(m => m.version);

    return allMigrations.filter(m => !appliedVersions.includes(m.version));
  }

  /**
   * Apply next pending migration
   */
  async migrateUp() {
    await this.initMigrationTable();
    const pending = await this.getPendingMigrations();

    if (pending.length === 0) {
      logger.info('No pending migrations');
      return { success: true, message: 'No pending migrations' };
    }

    const migration = pending[0];
    const upFilePath = path.join(this.migrationsDir, `${migration.name}.up.sql`);

    try {
      const sql = fs.readFileSync(upFilePath, 'utf-8');
      
      await this.db.query('BEGIN');
      
      // Execute migration
      await this.db.query(sql);

      // Record migration
      const recordQuery = `
        INSERT INTO schema_migrations (version, name, status)
        VALUES ($1, $2, $3)
      `;
      await this.db.query(recordQuery, [migration.version, migration.name, 'success']);

      await this.db.query('COMMIT');

      logger.info(`Migration applied: ${migration.name}`, { version: migration.version });
      return { success: true, migration: migration.name };
    } catch (error) {
      await this.db.query('ROLLBACK');

      // Record failed migration
      try {
        const failQuery = `
          INSERT INTO schema_migrations (version, name, status, error_message)
          VALUES ($1, $2, $3, $4)
        `;
        await this.db.query(failQuery, [migration.version, migration.name, 'failed', error.message]);
      } catch (recordError) {
        logger.error('Failed to record migration error:', recordError);
      }

      logger.error(`Migration failed: ${migration.name}`, { error: error.message });
      throw error;
    }
  }

  /**
   * Rollback last migration
   */
  async migrateDown() {
    await this.initMigrationTable();
    const applied = await this.getAppliedMigrations();

    if (applied.length === 0) {
      logger.info('No migrations to rollback');
      return { success: true, message: 'No migrations to rollback' };
    }

    // Get the last applied migration
    const lastMigration = applied[applied.length - 1];
    const downFilePath = path.join(this.migrationsDir, `${lastMigration.name}.down.sql`);

    if (!fs.existsSync(downFilePath)) {
      throw new Error(`No down migration found for: ${lastMigration.name}`);
    }

    try {
      const sql = fs.readFileSync(downFilePath, 'utf-8');

      await this.db.query('BEGIN');

      // Execute rollback
      await this.db.query(sql);

      // Remove migration record
      const deleteQuery = 'DELETE FROM schema_migrations WHERE version = $1';
      await this.db.query(deleteQuery, [lastMigration.version]);

      await this.db.query('COMMIT');

      logger.info(`Migration rolled back: ${lastMigration.name}`, { version: lastMigration.version });
      return { success: true, migration: lastMigration.name };
    } catch (error) {
      await this.db.query('ROLLBACK');
      logger.error(`Rollback failed: ${lastMigration.name}`, { error: error.message });
      throw error;
    }
  }

  /**
   * Get migration status
   */
  async status() {
    await this.initMigrationTable();
    
    const all = this.getMigrationFiles();
    const applied = await this.getAppliedMigrations();
    const appliedVersions = applied.map(m => m.version);

    const status = {
      applied: applied.length,
      pending: all.length - applied.length,
      total: all.length,
      migrations: all.map(m => ({
        version: m.version,
        name: m.name,
        applied: appliedVersions.includes(m.version)
      }))
    };

    return status;
  }
}

// Export for CLI usage
if (require.main === module) {
  const command = process.argv[2];
  const { Pool } = require('pg');
  
  const pool = new Pool({
    host: process.env.DB_HOST || process.env.PG_HOST,
    port: process.env.DB_PORT || process.env.PG_PORT,
    database: process.env.DB_NAME || process.env.PG_DATABASE,
    user: process.env.DB_USER || process.env.PG_USER,
    password: process.env.DB_PASSWORD || process.env.PG_PASSWORD
  });

  const manager = new MigrationManager(pool);

  (async () => {
    try {
      if (command === 'up') {
        const result = await manager.migrateUp();
        console.log('✓ Migration up:', result);
      } else if (command === 'down') {
        const result = await manager.migrateDown();
        console.log('✓ Migration down:', result);
      } else if (command === 'status') {
        const result = await manager.status();
        console.log('Migration Status:');
        console.log(`  Applied: ${result.applied}/${result.total}`);
        console.log(`  Pending: ${result.pending}`);
        console.table(result.migrations);
      } else {
        console.log('Usage: node db/migrations.js [up|down|status]');
      }
    } catch (error) {
      console.error('Migration error:', error.message);
      process.exit(1);
    } finally {
      await pool.end();
    }
  })();
}

module.exports = MigrationManager;
