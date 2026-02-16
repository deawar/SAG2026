/**
 * Import schools from ceeb.csv into PostgreSQL
 * Maps CSV columns to database schema
 */

const fs = require('fs');
const path = require('path');
const { Pool } = require('pg');

// Database configuration
const pool = new Pool({
  user: process.env.DB_USER || 'postgres',
  password: process.env.DB_PASSWORD || 'postgres',
  host: process.env.DB_HOST || 'localhost',
  port: process.env.DB_PORT || 5432,
  database: process.env.DB_NAME || 'silent_auction_gallery'
});

// Simple CSV parser - handles quoted fields
function parseCSVLine(line) {
  const result = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    const nextChar = line[i + 1];

    if (char === '"') {
      if (inQuotes && nextChar === '"') {
        current += '"';
        i++; // Skip the next quote
      } else {
        inQuotes = !inQuotes;
      }
    } else if (char === ',' && !inQuotes) {
      result.push(current.trim());
      current = '';
    } else {
      current += char;
    }
  }

  result.push(current.trim());
  return result;
}

async function importSchools() {
  try {
    const csvPath = path.join(__dirname, 'ceeb.csv');
    
    if (!fs.existsSync(csvPath)) {
      console.error(`❌ CSV file not found at ${csvPath}`);
      process.exit(1);
    }

    console.log('==========================================');
    console.log('Importing Schools from ceeb.csv');
    console.log('==========================================\n');

    // Read file
    const content = fs.readFileSync(csvPath, 'utf-8');
    const lines = content.split('\n').filter(line => line.trim());
    
    console.log(`📊 Total records in CSV: ${lines.length - 1}\n`);

    // Parse header
    const headers = parseCSVLine(lines[0]);
    console.log(`CSV Columns: ${headers.join(', ')}\n`);

    // Map column indices
    const ceebIdx = headers.indexOf('CEEB Code');
    const nameIdx = headers.indexOf('School Name');
    const cityIdx = headers.indexOf('City');
    const stateIdx = headers.indexOf('State');
    const postcodeIdx = headers.indexOf('Postcode');

    if (nameIdx === -1 || cityIdx === -1 || stateIdx === -1 || postcodeIdx === -1) {
      console.error('❌ Missing required columns in CSV');
      console.log('Required: School Name, City, State, Postcode');
      process.exit(1);
    }

    // Clear existing schools to start fresh (but keep any with primary_contact_user_id)
    await pool.query('DELETE FROM schools WHERE primary_contact_user_id IS NULL');
    console.log('✓ Cleared existing school data\n');

    let imported = 0;
    let skipped = 0;
    let errors = 0;

    // Process each record
    for (let i = 1; i < lines.length; i++) {
      if (i % 5000 === 0) {
        console.log(`Processing: ${i}/${lines.length - 1} records...`);
      }

      try {
        const fields = parseCSVLine(lines[i]);
        
        const ceebCode = fields[ceebIdx]?.trim() || null;
        const name = fields[nameIdx]?.trim();
        const city = fields[cityIdx]?.trim();
        const state = fields[stateIdx]?.trim();
        const postcode = fields[postcodeIdx]?.trim();

        // Skip invalid records
        if (!name || !city || !state) {
          skipped++;
          continue;
        }

        // Insert directly - duplicates will be skipped by primary key
        const result = await pool.query(
          `INSERT INTO schools (name, city, state_province, postal_code, address_line1, account_status, created_at, updated_at)
           VALUES ($1, $2, $3, $4, $5, 'ACTIVE', NOW(), NOW())
           RETURNING id`,
          [name, city, state.toUpperCase(), postcode || '', city] // Use city as address placeholder
        );

        if (result.rows.length > 0) {
          imported++;
        }
      } catch (error) {
        errors++;
        if (errors <= 5) {
          console.error(`Error on line ${i}: ${error.message}`);
        }
      }
    }

    // Get final count
    const countResult = await pool.query('SELECT COUNT(*) as total FROM schools');
    const totalSchools = parseInt(countResult.rows[0].total);

    console.log('\n✅ Import Complete!');
    console.log('==========================================');
    console.log(`Imported: ${imported} new schools`);
    console.log(`Skipped: ${skipped} incomplete records`);
    console.log(`Errors: ${errors}`);
    console.log(`Total schools in database: ${totalSchools}`);
    console.log('==========================================\n');

    // Show sample
    const sample = await pool.query(
      'SELECT name, city, state_province FROM schools ORDER BY created_at DESC LIMIT 3'
    );
    console.log('📍 Sample imported schools:');
    sample.rows.forEach((row, idx) => {
      console.log(`  ${idx + 1}. ${row.name}, ${row.city}, ${row.state_province}`);
    });

    process.exit(0);
  } catch (error) {
    console.error('Fatal error:', error);
    process.exit(1);
  }
}

importSchools();
