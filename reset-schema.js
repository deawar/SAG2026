const { Pool } = require('pg');
require('dotenv').config();

const pool = new Pool({
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  host: process.env.DB_HOST,
  port: process.env.DB_PORT,
  database: process.env.DB_NAME
});

async function reset() {
  try {
    const client = await pool.connect();
    console.log('Dropping public schema...');
    await client.query('DROP SCHEMA IF EXISTS public CASCADE');
    console.log('Creating public schema...');
    await client.query('CREATE SCHEMA public');
    console.log('Granting permissions...');
    await client.query('GRANT ALL ON SCHEMA public TO public');
    console.log('✅ Schema reset complete');
    client.release();
    pool.end();
  } catch (err) {
    console.error('❌ Error:', err.message);
    process.exit(1);
  }
}

reset();
