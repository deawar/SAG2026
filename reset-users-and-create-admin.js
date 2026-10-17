#!/usr/bin/env node
/**
 * Reset Users Database & Create Super Admin
 *
 * The super-admin credentials are supplied at install time, never stored in
 * source. They are resolved in this order:
 *   1. Environment variables ADMIN_EMAIL and ADMIN_PASSWORD (non-interactive).
 *   2. An interactive prompt (masked password + confirmation) on a TTY.
 *
 * Usage (interactive):
 *   node reset-users-and-create-admin.js
 *   docker exec -it silent-auction-gallery-app node reset-users-and-create-admin.js
 *
 * Usage (non-interactive, e.g. CI/Docker):
 *   ADMIN_EMAIL=you@example.com ADMIN_PASSWORD='<strong-password>' \
 *     node reset-users-and-create-admin.js
 *
 * Password must meet policy: 12+ chars with upper, lower, number, special.
 */

const readline = require('node:readline');
const { Pool } = require('pg');
const bcrypt = require('bcrypt');
const ValidationUtils = require('./src/utils/validationUtils');
require('dotenv').config();

const PASSWORD_POLICY =
  'Password must be 12+ characters and include uppercase, lowercase, a number, and a special character.';

/**
 * Prompt for a line of input. When `mask` is true, typed characters are not
 * echoed to the terminal (for passwords). Built on Node's readline — no extra
 * dependencies.
 */
function prompt(question, { mask = false } = {}) {
  return new Promise((resolve, reject) => {
    if (!process.stdin.isTTY) {
      reject(new Error('No interactive terminal available for input.'));
      return;
    }

    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
      terminal: true,
    });

    if (mask) {
      // Suppress echo: after the prompt is written, swallow further output.
      let promptWritten = false;
      rl._writeToOutput = (chunk) => {
        if (!promptWritten) {
          rl.output.write(chunk);
          promptWritten = true;
        }
        // else: masked — write nothing so keystrokes are not shown.
      };
    }

    rl.question(question, (answer) => {
      if (mask) {
        rl.output.write('\n');
      }
      rl.close();
      resolve(answer);
    });
  });
}

/**
 * Resolve the admin email from ADMIN_EMAIL or an interactive prompt.
 */
async function resolveEmail(interactive) {
  const fromEnv = (process.env.ADMIN_EMAIL || '').trim();
  if (fromEnv) {
    if (!ValidationUtils.validateEmail(fromEnv)) {
      throw new Error(`ADMIN_EMAIL is not a valid email address: ${fromEnv}`);
    }
    return fromEnv;
  }

  if (!interactive) {
    throw new Error(
      'No admin email provided. Set ADMIN_EMAIL (and ADMIN_PASSWORD) or run in an interactive terminal.'
    );
  }

  let email = '';
  do {
    email = (await prompt('Admin email: ')).trim();
    if (!ValidationUtils.validateEmail(email)) {
      console.error('  ⚠ Invalid email address. Please try again.');
      email = '';
    }
  } while (!email);
  return email;
}

/**
 * Prompt interactively for a password with masked input and confirmation,
 * re-asking until it meets policy and both entries match.
 */
async function promptForPassword() {
  for (;;) {
    const password = await prompt('Admin password (input hidden): ', { mask: true });
    if (!ValidationUtils.validatePassword(password)) {
      console.error(`  ⚠ ${PASSWORD_POLICY}`);
      continue;
    }
    const confirm = await prompt('Confirm password: ', { mask: true });
    if (password !== confirm) {
      console.error('  ⚠ Passwords did not match. Please try again.');
      continue;
    }
    return password;
  }
}

/**
 * Resolve the admin password from ADMIN_PASSWORD or an interactive prompt.
 */
async function resolvePassword(interactive) {
  const fromEnv = process.env.ADMIN_PASSWORD || '';
  if (fromEnv) {
    if (!ValidationUtils.validatePassword(fromEnv)) {
      throw new Error(`ADMIN_PASSWORD does not meet policy. ${PASSWORD_POLICY}`);
    }
    return fromEnv;
  }

  if (!interactive) {
    throw new Error(
      'No admin password provided. Set ADMIN_PASSWORD or run in an interactive terminal.'
    );
  }

  return promptForPassword();
}

/**
 * Resolve the super-admin email and password from env vars or interactive
 * prompts, enforcing the email format and password strength policy.
 */
async function resolveCredentials() {
  const interactive = Boolean(process.stdin.isTTY);
  const email = await resolveEmail(interactive);
  const password = await resolvePassword(interactive);
  return { email, password };
}

const pool = new Pool({
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  host: process.env.DB_HOST,
  port: process.env.DB_PORT,
  database: process.env.DB_NAME
});

async function resetUsersAndCreateAdmin() {
  // Resolve credentials BEFORE touching the database, so a missing or invalid
  // password aborts the run without having deleted any data.
  const { email, password } = await resolveCredentials();
  const passwordHash = await bcrypt.hash(password, 12);

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
    console.log('Password: (the password you entered during setup)');
    console.log('═══════════════════════════════════════════════\n');
    console.log('⚠️  Use the password you just set to sign in. It is not stored or displayed.\n');
    
  } catch (err) {
    console.error('❌ Error:', err.message);
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
  }
}

// Only run the destructive reset when invoked directly (not when imported,
// e.g. by a test harness that exercises credential resolution in isolation).
if (require.main === module) {
  resetUsersAndCreateAdmin()
    .then(() => {
      console.log('✅ Script completed successfully');
      process.exit(0);
    })
    .catch(err => {
      console.error('❌ Script failed:', err);
      process.exit(1);
    });
}

module.exports = {
  prompt,
  resolveEmail,
  resolvePassword,
  resolveCredentials,
  resetUsersAndCreateAdmin,
};
