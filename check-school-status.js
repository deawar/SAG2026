/**
 * Quick script to check school status values in database
 */
require('dotenv').config();
const { Pool } = require('pg');

const pool = new Pool({
  host: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT || '5432'),
  database: process.env.DB_NAME || 'silent_auction_gallery',
  user: process.env.DB_USER || 'postgres',
  password: process.env.DB_PASSWORD || '',
});

async function checkSchoolStatus() {
  try {
    console.log('Checking school status values...\n');

    // Get distinct account_status values
    const result = await pool.query(`
      SELECT DISTINCT account_status, COUNT(*) as count
      FROM schools
      GROUP BY account_status
      ORDER BY count DESC
    `);

    console.log('📊 Account statuses in database:');
    result.rows.forEach(row => {
      console.log(`   - "${row.account_status}": ${row.count} schools`);
    });

    // Get total count
    const total = await pool.query('SELECT COUNT(*) as count FROM schools');
    console.log(`\n✅ Total schools in database: ${total.rows[0].count}`);

    // Sample some schools
    console.log('\n📋 Sample schools:');
    const samples = await pool.query(`
      SELECT id, name, city, state_province, account_status
      FROM schools
      LIMIT 5
    `);

    samples.rows.forEach((school, i) => {
      console.log(`   ${i + 1}. ${school.name} (${school.city}, ${school.state_province}) - Status: "${school.account_status}"`);
    });

    await pool.end();
  } catch (error) {
    console.error('Error:', error.message);
    process.exit(1);
  }
}

checkSchoolStatus();
