const { Pool } = require('pg');
require('dotenv').config();

const pool = new Pool({
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  host: process.env.DB_HOST,
  port: process.env.DB_PORT,
  database: process.env.DB_NAME
});

async function listTables() {
  try {
    const result = await pool.query(`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public'
      ORDER BY table_name
    `);
    console.log('Tables in database:');
    if (result.rows.length === 0) {
      console.log('  (no tables found)');
    } else {
      result.rows.forEach(row => console.log(`  - ${row.table_name}`));
    }
    pool.end();
  } catch (err) {
    console.error('Error:', err.message);
    process.exit(1);
  }
}

listTables();
