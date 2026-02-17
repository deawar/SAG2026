/**
 * ============================================================================
 * Import Schools from CSV File
 * Loads school data from ceeb.csv into the database
 * ============================================================================
 */

require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { Pool } = require('pg');
const csv = require('csv-parse/sync');

const pool = new Pool({
  host: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT || '5432'),
  database: process.env.DB_NAME || 'silent_auction_gallery',
  user: process.env.DB_USER || 'postgres',
  password: process.env.DB_PASSWORD || '',
});

async function importSchoolsFromCSV() {
  try {
    console.log('==========================================');
    console.log('Importing Schools from CSV');
    console.log('==========================================\n');

    // Read CSV file
    const csvPath = path.join(__dirname, 'ceeb.csv');
    
    if (!fs.existsSync(csvPath)) {
      console.error(`❌ CSV file not found: ${csvPath}`);
      process.exit(1);
    }

    const fileContent = fs.readFileSync(csvPath, 'utf-8');
    const records = csv.parse(fileContent, {
      columns: true,
      skip_empty_lines: true,
      trim: true,
    });

    console.log(`📊 Total records in CSV: ${records.length}`);
    console.log('Starting import...\n');

    let importedCount = 0;
    let errorCount = 0;
    let duplicateCount = 0;

    // Insert schools with progress tracking
    for (let i = 0; i < records.length; i++) {
      const school = records[i];
      
      try {
        // Map CSV columns to database columns
        const ceebCode = school['CEEB Code']?.trim();
        const name = school['School Name']?.trim();
        const city = school['City']?.trim();
        const state = school['State']?.trim();
        const postcode = school['Postcode']?.trim();

        // Validate required fields
        if (!name || !city || !state) {
          errorCount++;
          continue;
        }

        // Insert into database
        const result = await pool.query(
          `INSERT INTO schools 
           (name, city, state_province, postal_code, ceeb_code, created_at)
           VALUES ($1, $2, $3, $4, $5, NOW())
           ON CONFLICT (name, city, state_province) DO NOTHING
           RETURNING id`,
          [name, city, state, postcode, ceebCode]
        );

        if (result.rows.length > 0) {
          importedCount++;
        } else {
          duplicateCount++;
        }

        // Show progress every 100 records
        if ((i + 1) % 100 === 0) {
          console.log(`✅ Imported: ${i + 1}/${records.length} (${importedCount} new, ${duplicateCount} duplicates)`);
        }
      } catch (error) {
        errorCount++;
        if (errorCount <= 5) {
          console.error(`  Error on row ${i + 1}:`, error.message);
        }
      }
    }

    console.log('\n==========================================');
    console.log('✅ Import Complete!');
    console.log('==========================================');
    console.log(`📊 Total processed: ${records.length}`);
    console.log(`✅ Imported: ${importedCount}`);
    console.log(`⚠️  Duplicates skipped: ${duplicateCount}`);
    console.log(`❌ Errors: ${errorCount}`);

    // Final count
    const finalCount = await pool.query('SELECT COUNT(*) as count FROM schools');
    console.log(`\n📈 Total schools in database: ${finalCount.rows[0].count}\n`);

    // Sample results
    const samples = await pool.query(`
      SELECT name, city, state_province, postal_code
      FROM schools
      ORDER BY RANDOM()
      LIMIT 5
    `);

    console.log('📋 Sample imported schools:');
    samples.rows.forEach((school, i) => {
      console.log(`   ${i + 1}. ${school.name} (${school.city}, ${school.state_province}) - ${school.postal_code}`);
    });

    await pool.end();
  } catch (error) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  }
}

importSchoolsFromCSV();
