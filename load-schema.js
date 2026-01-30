/**
 * PostgreSQL Schema Loader
 * Connects directly with SAG_DB credentials and loads the schema
 */

const { Pool } = require('pg');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

async function loadSchema() {
  console.log('🗄️  PostgreSQL Schema Setup\n');

  const dbName = process.env.DB_NAME || 'silent_auction_gallery';
  const dbUser = process.env.DB_USER || 'SAG_DB';
  const dbPass = process.env.DB_PASSWORD;
  const dbHost = process.env.DB_HOST || 'localhost';
  const dbPort = process.env.DB_PORT || 5432;

  console.log(`📊 Connecting as ${dbUser}@${dbHost}:${dbPort}/${dbName}...\n`);

  const pool = new Pool({
    user: dbUser,
    password: dbPass,
    host: dbHost,
    port: dbPort,
    database: dbName,
    connectionTimeoutMillis: 10000,
  });

  try {
    const client = await pool.connect();
    console.log('✓ Connected to database\n');

    // Drop all existing tables to avoid conflicts (using CASCADE to handle FKs)
    console.log('🧹 Cleaning up existing tables...');
    await client.query(`
      DO $$ DECLARE
        r RECORD;
      BEGIN
        FOR r IN (SELECT tablename FROM pg_tables WHERE schemaname = 'public') LOOP
          EXECUTE 'DROP TABLE IF EXISTS ' || quote_ident(r.tablename) || ' CASCADE';
        END LOOP;
      END $$;
    `);
    console.log('✓ Tables cleaned\n');

    // Read schema file
    const schemaPath = path.join(__dirname, 'schema.sql');
    if (!fs.existsSync(schemaPath)) {
      throw new Error(`Schema file not found: ${schemaPath}`);
    }

    const schema = fs.readFileSync(schemaPath, 'utf8');
    
    console.log('📋 Loading schema...');
    await client.query(schema);
    console.log('✓ Schema loaded\n');

    // Verify tables were created
    const tableCheck = await client.query(
      `SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' ORDER BY table_name`
    );
    
    if (tableCheck.rows.length > 0) {
      console.log(`✓ ${tableCheck.rows.length} tables created:\n`);
      tableCheck.rows.forEach(row => console.log(`   • ${row.table_name}`));
    } else {
      console.log('⚠️  No tables found (schema may already exist)\n');
    }

    client.release();
    await pool.end();

    console.log('\n✅ Database setup completed successfully!\n');
    console.log('🎯 Next steps:');
    console.log('   npm run dev       Start development server');
    console.log('   npm test          Run test suite\n');

  } catch (error) {
    console.error('\n❌ Error:', error.message);
    console.error('\n💡 Troubleshooting:');
    console.error(`   • Check credentials in .env file`);
    console.error(`   • Verify database "${dbName}" exists`);
    console.error(`   • Verify user "${dbUser}" has permissions`);
    await pool.end();
    process.exit(1);
  }
}

loadSchema();
