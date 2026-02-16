/**
 * ============================================================================
 * School Database Verification & Quick Population
 * Checks schools table status and loads sample/real schools if needed
 * ============================================================================
 */

require('dotenv').config();
const { Pool } = require('pg');

const pool = new Pool({
  host: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT || '5432'),
  database: process.env.DB_NAME || 'silent_auction_gallery',
  user: process.env.DB_USER || 'postgres',
  password: process.env.DB_PASSWORD || '',
  ssl: process.env.DB_SSL === 'true' ? { rejectUnauthorized: false } : false,
});

async function verifySchools() {
  try {
    console.log('==========================================');
    console.log('Checking Schools Database Status');
    console.log('==========================================\n');

    // Check if schools table exists
    const tableCheck = await pool.query(
      "SELECT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'schools')"
    );

    if (!tableCheck.rows[0].exists) {
      console.log('❌ Schools table does not exist!');
      console.log('   Run: npm run load-schema\n');
      process.exit(1);
    }

    // Count all schools
    const totalCount = await pool.query('SELECT COUNT(*) as count FROM schools');
    const totalSchools = totalCount.rows[0].count;
    console.log(`📊 Total schools in table: ${totalSchools}`);

    // Count ACTIVE schools
    const activeCount = await pool.query("SELECT COUNT(*) as count FROM schools WHERE account_status = 'ACTIVE'");
    const activeSchools = activeCount.rows[0].count;
    console.log(`✅ ACTIVE schools: ${activeSchools}`);

    // Count other statuses
    const statusBreakdown = await pool.query(`
      SELECT account_status, COUNT(*) as count
      FROM schools
      GROUP BY account_status
      ORDER BY count DESC
    `);
    
    if (statusBreakdown.rows.length > 0) {
      console.log('\n📈 Schools by Status:');
      statusBreakdown.rows.forEach(row => {
        console.log(`   - ${row.account_status}: ${row.count}`);
      });
    }

    // Check state distribution
    const stateCount = await pool.query(`
      SELECT DISTINCT state_province
      FROM schools
      WHERE account_status = 'ACTIVE'
      ORDER BY state_province ASC
    `);
    console.log(`\n🗺️  States with ACTIVE schools: ${stateCount.rows.length}`);
    if (stateCount.rows.length > 0 && stateCount.rows.length <= 10) {
      console.log(`   States: ${stateCount.rows.map(r => r.state_province).join(', ')}`);
    }

    // Sample schools
    const samples = await pool.query(`
      SELECT id, name, city, state_province, account_status
      FROM schools
      LIMIT 5
    `);

    if (samples.rows.length > 0) {
      console.log('\n📋 Sample Schools:');
      samples.rows.forEach((school, i) => {
        console.log(`   ${i + 1}. ${school.name} (${school.city}, ${school.state_province}) - ${school.account_status}`);
      });
    }

    // Recommendations
    console.log('\n==========================================');
    if (activeSchools === 0) {
      console.log('⚠️  NO ACTIVE SCHOOLS FOUND!');
      console.log('\nTo populate the school database:');
      console.log('');
      console.log('Option 1: Update existing schools to ACTIVE');
      console.log("  UPDATE schools SET account_status = 'ACTIVE' WHERE account_status = 'PENDING';");
      console.log('');
      console.log('Option 2: Import fresh from NCES API');
      console.log('  node import-schools.js --state=GA --clear');
      console.log('');
      console.log('Option 3: Load sample schools');
      console.log('  node verify-schools.js --load-samples');
      console.log('');
    } else {
      console.log(`✅ Schools database is ready (${activeSchools} active schools)`);
      console.log('\nFrontend school search should now work!');
    }
    console.log('==========================================\n');

    await pool.end();
  } catch (error) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  }
}

// Load sample schools
async function loadSamples() {
  try {
    console.log('Loading sample schools...\n');

    const sampleSchools = [
      { name: 'Lincoln High School', city: 'Springfield', state: 'IL', address: '1000 Lincoln Ave', zip: '62701' },
      { name: 'Central High School', city: 'Chicago', state: 'IL', address: '2000 Central St', zip: '60601' },
      { name: 'Washington High School', city: 'Atlanta', state: 'GA', address: '3000 Washington Dr', zip: '30303' },
      { name: 'Jefferson Middle School', city: 'Atlanta', state: 'GA', address: '4000 Jefferson Way', zip: '30304' },
      { name: 'Madison Academy', city: 'Marietta', state: 'GA', address: '5000 Madison St', zip: '30060' },
      { name: 'Franklin High School', city: 'Dallas', state: 'TX', address: '6000 Franklin Blvd', zip: '75201' },
      { name: 'Roosevelt Middle', city: 'Austin', state: 'TX', address: '7000 Roosevelt Ave', zip: '78701' },
      { name: 'Kennedy High School', city: 'Los Angeles', state: 'CA', address: '8000 Kennedy Rd', zip: '90001' },
      { name: 'Adams Academy', city: 'New York', state: 'NY', address: '9000 Adams St', zip: '10001' },
      { name: 'Monroe High School', city: 'Miami', state: 'FL', address: '10000 Monroe Dr', zip: '33101' },
    ];

    for (const school of sampleSchools) {
      await pool.query(
        `INSERT INTO schools 
         (name, city, state_province, address_line1, postal_code, account_status, created_at)
         VALUES ($1, $2, $3, $4, $5, 'ACTIVE', NOW())
         ON CONFLICT (name) DO NOTHING`,
        [school.name, school.city, school.state, school.address, school.zip]
      );
    }

    console.log(`✅ Loaded ${sampleSchools.length} sample schools\n`);
    await verifySchools();
  } catch (error) {
    console.error('❌ Error loading samples:', error.message);
    process.exit(1);
  }
}

// Run verification
if (process.argv.includes('--load-samples')) {
  loadSamples();
} else {
  verifySchools();
}
