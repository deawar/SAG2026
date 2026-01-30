/**
 * PostgreSQL Initial Setup Script - Auto-detect password
 */

const { Pool } = require('pg');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

const COMMON_PASSWORDS = ['password', 'postgres', 'admin', 'root', ''];

async function setupDatabase() {
  console.log('🗄️  PostgreSQL Database Setup\n');
  console.log('🔍 Detecting PostgreSQL superuser password...\n');

  let adminClient = null;
  let superuserPool = null;

  for (const pwd of COMMON_PASSWORDS) {
    try {
      superuserPool = new Pool({
        user: 'postgres',
        password: pwd,
        host: process.env.DB_HOST || 'localhost',
        port: process.env.DB_PORT || 5432,
        database: 'postgres',
        connectionTimeoutMillis: 3000,
      });

      adminClient = await superuserPool.connect();
      console.log(`✓ Connected with password: ${pwd ? '(set)' : '(empty)'}\n`);
      break;
    } catch (err) {
      if (superuserPool) await superuserPool.end();
    }
  }

  if (!adminClient) {
    console.error('❌ Could not connect to PostgreSQL');
    console.error('\n💡 Create database manually in pgAdmin:');
    console.error(`   • User: ${process.env.DB_USER || 'SAG_DB'}`);
    console.error(`   • Password: ${process.env.DB_PASSWORD || 'TL14YPCg'}`);
    console.error(`   • Database: ${process.env.DB_NAME || 'silent_auction_gallery'}`);
    process.exit(1);
  }

  try {
    const dbName = process.env.DB_NAME || 'silent_auction_gallery';
    const dbUser = process.env.DB_USER || 'SAG_DB';
    const dbPass = process.env.DB_PASSWORD || 'TL14YPCg';

    // Create user if not exists
    const userCheck = await adminClient.query(
      `SELECT 1 FROM pg_user WHERE usename = $1`,
      [dbUser]
    );

    if (userCheck.rows.length === 0) {
      console.log(`👤 Creating user: ${dbUser}...`);
      await adminClient.query(
        `CREATE USER "${dbUser}" WITH PASSWORD $1`,
        [dbPass]
      );
      console.log('✓ User created\n');
    } else {
      console.log(`✓ User already exists\n`);
    }

    // Create database if not exists
    const dbCheck = await adminClient.query(
      `SELECT 1 FROM pg_database WHERE datname = $1`,
      [dbName]
    );

    if (dbCheck.rows.length === 0) {
      console.log(`📦 Creating database: ${dbName}...`);
      await adminClient.query(
        `CREATE DATABASE "${dbName}" OWNER "${dbUser}"`
      );
      console.log('✓ Database created\n');
    } else {
      console.log(`✓ Database already exists\n`);
    }

    // Grant privileges
    console.log(`🔐 Granting privileges...`);
    await adminClient.query(
      `GRANT ALL PRIVILEGES ON DATABASE "${dbName}" TO "${dbUser}"`
    );
    console.log('✓ Privileges granted\n');

    adminClient.release();
    await superuserPool.end();

    // Connect to app database and load schema
    const appPool = new Pool({
      user: dbUser,
      password: dbPass,
      host: process.env.DB_HOST || 'localhost',
      port: process.env.DB_PORT || 5432,
      database: dbName,
      connectionTimeoutMillis: 5000,
    });

    console.log(`🔗 Connecting to application database...`);
    const appClient = await appPool.connect();
    console.log('✓ Connected\n');

    // Load schema
    const schemaPath = path.join(__dirname, 'schema.sql');
    const schema = fs.readFileSync(schemaPath, 'utf8');
    
    console.log('📋 Loading schema...');
    await appClient.query(schema);
    console.log('✓ Schema loaded\n');

    // Verify tables
    const tableCheck = await appClient.query(
      `SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' ORDER BY table_name`
    );
    
    console.log(`✓ ${tableCheck.rows.length} tables created:\n`);
    tableCheck.rows.forEach(row => console.log(`   • ${row.table_name}`));

    appClient.release();
    await appPool.end();

    console.log('\n✅ Database setup completed!\n');
    console.log('🎯 Next: npm run dev\n');

  } catch (error) {
    console.error('\n❌ Error:', error.message);
    if (adminClient) adminClient.release();
    process.exit(1);
  }
}

setupDatabase();
