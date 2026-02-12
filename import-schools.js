/**
 * ============================================================================
 * School Data Importer
 * Imports real U.S. schools from NCES API with fallback to hardcoded data
 * 
 * This script fetches schools from the National Center for Education Statistics (NCES)
 * database with automatic caching and fallback support.
 * 
 * Usage:
 *   node import-schools.js [--force-refresh] [--state=IL] [--limit=1000]
 * 
 * Options:
 *   --force-refresh: Bypass cache and fetch fresh from NCES API
 *   --state: Filter by state code (e.g., 'IL', 'CA', 'TX')
 *   --limit: Maximum number of schools to import
 *   --clear: Clear existing schools before import
 * ============================================================================
 */

const fs = require('fs');
const path = require('path');
const { Pool } = require('pg');
const SchoolDataService = require('./src/services/schoolDataService');
require('dotenv').config();

/**
 * Configuration
 */
const config = {
  forceRefresh: process.argv.includes('--force-refresh'),
  state: process.argv.find(arg => arg.startsWith('--state='))?.split('=')[1],
  limit: parseInt(process.argv.find(arg => arg.startsWith('--limit='))?.split('=')[1] || '10000'),
  clear: process.argv.includes('--clear'),
};

/**
 * Database connection pool
 */
const pool = new Pool({
  host: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT || '5432'),
  database: process.env.DB_NAME || 'silent_auction_gallery',
  user: process.env.DB_USER || 'postgres',
  password: process.env.DB_PASSWORD || '',
});

/**
 * Import schools into database
 */
async function importSchools() {
  const client = await pool.connect();
  let imported = 0;
  let errors = 0;

  try {
    // Initialize service
    const schoolDataService = new SchoolDataService(pool);

    // Get schools (from NCES API, cache, or hardcoded fallback)
    console.log('');
    const schools = await schoolDataService.getSchools(config.state, config.forceRefresh);

    if (!schools || schools.length === 0) {
      console.error('❌ No schools to import');
      return;
    }

    console.log(`\n📚 Starting import of ${schools.length} schools...\n`);

    // Begin transaction
    await client.query('BEGIN');

    // Clear existing schools if requested
    if (config.clear) {
      console.log('🗑️  Clearing existing schools...');
      await client.query('DELETE FROM schools WHERE account_status = $1', ['ACTIVE']);
    }

    // Insert schools
    for (const school of schools) {
      // Stop at limit
      if (imported >= config.limit) {
        break;
      }

      try {
        // Normalize school data
        const schoolData = {
          name: school.name || school.school_name || 'Unknown School',
          city: school.city || 'Unknown',
          state_province: school.state_province || school.state || 'US',
          address_line1: school.address_line1 || school.address || 'Address not provided',
          postal_code: school.postal_code || school.zip || 'Unknown',
          district: school.district || null,
          phone_number: school.phone_number || null,
          website_url: school.website_url || null,
          account_status: 'ACTIVE'
        };

        const result = await client.query(
          `INSERT INTO schools (name, city, state_province, address_line1, postal_code, district, phone_number, website_url, account_status)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
           RETURNING id`,
          [
            schoolData.name,
            schoolData.city,
            schoolData.state_province,
            schoolData.address_line1.substring(0, 255),
            schoolData.postal_code,
            schoolData.district,
            schoolData.phone_number,
            schoolData.website_url,
            schoolData.account_status
          ]
        );

        if (result.rows.length > 0) {
          imported++;
          process.stdout.write(`\r✅ Imported: ${imported}/${Math.min(config.limit, schools.length)}`);
        }
      } catch (error) {
        // Skip duplicates silently, log other errors
        if (!error.message.includes('duplicate')) {
          console.error(`\n❌ Error importing school ${school.name}: ${error.message}`);
          errors++;
        }
      }
    }

    // Commit transaction
    await client.query('COMMIT');

    console.log(`\n\n✨ Import complete!`);
    console.log(`   Imported: ${imported} schools`);
    console.log(`   Errors: ${errors}`);
    console.log(`   Total schools in database: ${await getSchoolCount(client)}`);
    console.log(`\n✅ Import successful!`);

  } catch (error) {
    await client.query('ROLLBACK');
    console.error('❌ Import failed:', error.message);
    process.exit(1);
  } finally {
    client.release();
  }
}

/**
 * Get total school count from database
 */
async function getSchoolCount(client) {
  const result = await client.query('SELECT COUNT(*) as count FROM schools WHERE account_status = $1', ['ACTIVE']);
  return result.rows[0].count;
}

/**
 * Main execution
 */
async function main() {
  console.log(`
╔═══════════════════════════════════════════════════════════╗
║         School Data Import Utility                        ║
║  Imports U.S. schools from NCES API (with caching)        ║
╚═══════════════════════════════════════════════════════════╝
  `);

  console.log(`Configuration:`);
  console.log(`  Force Refresh: ${config.forceRefresh}`);
  console.log(`  Limit: ${config.limit} schools`);
  if (config.state) console.log(`  State Filter: ${config.state}`);
  if (config.clear) console.log(`  ⚠️  Will clear existing schools`);

  try {
    // Test database connection
    console.log('\n🔗 Testing database connection...');
    const result = await pool.query('SELECT NOW()');
    console.log('✅ Database connected\n');

    // Run import
    await importSchools();
    process.exit(0);

  } catch (error) {
    console.error('❌ Fatal error:', error.message);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

// Handle signals
process.on('SIGINT', async () => {
  console.log('\n\n⚠️  Import interrupted by user');
  await pool.end();
  process.exit(0);
});

// Run import
main();

