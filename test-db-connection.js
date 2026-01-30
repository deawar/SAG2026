/**
 * PostgreSQL Connection Test
 */

const { Pool } = require('pg');
require('dotenv').config();

async function testConnection() {
  console.log('🔍 PostgreSQL Connection Test\n');
  
  const config = {
    user: process.env.DB_USER || 'postgres',
    password: process.env.DB_PASSWORD || '',
    host: process.env.DB_HOST || 'localhost',
    port: process.env.DB_PORT || 5432,
    database: 'postgres',
  };

  console.log('Configuration:');
  console.log(`  User: ${config.user}`);
  console.log(`  Host: ${config.host}:${config.port}`);
  console.log(`  Database: ${config.database}`);
  console.log(`  Password: ${config.password ? '(set)' : '(empty)'}\n`);

  const pool = new Pool(config);

  pool.on('error', (err) => {
    console.error('❌ Pool error:', err.message);
  });

  try {
    console.log('⏳ Attempting connection...');
    const client = await pool.connect();
    console.log('✅ Connection successful!\n');

    // Test query
    const result = await client.query('SELECT version()');
    console.log('PostgreSQL Version:');
    console.log(`  ${result.rows[0].version}\n`);

    client.release();
    console.log('✅ All tests passed!');
  } catch (error) {
    console.error('❌ Connection failed:', error.message);
    if (error.code) console.error(`   Code: ${error.code}`);
    
    console.log('\n💡 Next steps:');
    console.log('   1. Verify PostgreSQL service is running');
    console.log('   2. Check .env password configuration');
    console.log('   3. Try connecting with psql command-line directly');
  } finally {
    await pool.end();
    process.exit(0);
  }
}

testConnection();
