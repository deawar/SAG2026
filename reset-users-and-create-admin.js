#!/usr/bin/env node
/**
 * Reset Users Database & Create Super Admin
 * Usage: node reset-users-and-create-admin.js
 * Or via Docker: docker exec silent-auction-gallery-app node reset-users-and-create-admin.js
 */

const { Pool } = require('pg');
const bcrypt = require('bcrypt');
require('dotenv').config();

const pool = new Pool({
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  host: process.env.DB_HOST,
  port: process.env.DB_PORT,
  database: process.env.DB_NAME
});

async function resetUsersAndCreateAdmin() {
  const client = await pool.connect();
  
  try {
    // Step 1: Disable foreign key constraints temporarily
    console.log('Step 1: Disabling foreign key constraints...');
    await client.query('SET session_replication_role = REPLICA');
    
    // Step 2: Delete from all user-related tables in the right order
    console.log('Step 2: Deleting all user data...');
    
    const tables = [
      'audit_logs',
      'bids',
      'artwork_images',
      'artwork',
      'payment_transactions',
      'user_sessions',
      'payment_gateways',
      'school_admin_settings',
      'auctions',
      'users',
      'schools'
    ];
    
    for (const table of tables) {
      try {
        const result = await client.query(`DELETE FROM ${table}`);
        console.log(`  ✓ Cleared ${table}: ${result.rowCount} rows deleted`);
      } catch (err) {
        console.warn(`  ⚠ Could not clear ${table}: ${err.message.split('\n')[0]}`);
      }
    }
    
    // Step 3: Re-enable foreign key constraints
    console.log('Step 3: Re-enabling foreign key constraints...');
    await client.query('SET session_replication_role = DEFAULT');
    
    // Step 4: Create super admin user with no school assignment
    console.log('Step 4: Creating super admin user...');
    
    const email = 'deawar@gmail.com';
    const plainPassword = 'TE?K5EDzree8RMyB';
    const passwordHash = await bcrypt.hash(plainPassword, 12);
    
    const adminUser = await client.query(
      `INSERT INTO users (
         email, 
         password_hash, 
         first_name, 
         last_name, 
         role, 
         account_status, 
         two_fa_enabled,
         created_at
       ) VALUES ($1, $2, $3, $4, $5, $6, $7, NOW())
       RETURNING id, email, role, account_status`,
      [
        email,
        passwordHash,
        'Super',
        'Admin',
        'SITE_ADMIN',
        'ACTIVE',
        false
      ]
    );
    
    const admin = adminUser.rows[0];
    
    console.log('\n✅ Database reset complete!\n');
    console.log('═══════════════════════════════════════════════');
    console.log('SUPER ADMIN CREATED');
    console.log('═══════════════════════════════════════════════');
    console.log(`ID:       ${admin.id}`);
    console.log(`Email:    ${admin.email}`);
    console.log(`Role:     ${admin.role}`);
    console.log(`Status:   ${admin.account_status}`);
    console.log(`Password: ${plainPassword}`);
    console.log('═══════════════════════════════════════════════\n');
    console.log('⚠️  SAVE THESE CREDENTIALS - You can only see the password once!\n');
    
  } catch (err) {
    console.error('❌ Error:', err.message);
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
  }
}

// Run the function
resetUsersAndCreateAdmin()
  .then(() => {
    console.log('✅ Script completed successfully');
    process.exit(0);
  })
  .catch(err => {
    console.error('❌ Script failed:', err);
    process.exit(1);
  });
