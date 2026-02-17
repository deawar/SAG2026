/**
 * Simple CSV Import for Schools
 */
require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { Pool } = require('pg');

const pool = new Pool({
  host: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT || '5432'),
  database: process.env.DB_NAME || 'silent_auction_gallery',
  user: process.env.DB_USER || 'postgres',
  password: process.env.DB_PASSWORD || '',
});

function parseCSV(content) {
  const lines = content.split('\n');
  const headers = lines[0].split(',').map(h => h.trim());
  const records = [];
  
  for (let i = 1; i < lines.length; i++) {
    if (!lines[i].trim()) continue;
    const values = lines[i].split(',').map(v => v.trim());
    const record = {};
    headers.forEach((header, index) => {
      record[header] = values[index] || '';
    });
    records.push(record);
  }
  
  return records;
}

async function importSchools() {
  try {
    console.log('==========================================');
    console.log('Importing Schools from CSV');
    console.log('==========================================\n');

    const csvPath = path.join(__dirname, 'ceeb.csv');
    
    if (!fs.existsSync(csvPath)) {
      console.error(`❌ CSV file not found: ${csvPath}`);
      process.exit(1);
    }

    const fileContent = fs.readFileSync(csvPath, 'utf-8');
    const records = parseCSV(fileContent);

    console.log(`📊 Total records in CSV: ${records.length}\n`);

    let imported = 0;
    let duplicates = 0;
    let errors = 0;

    for (let i = 0; i < records.length; i++) {
      const school = records[i];
      
      try {
        const name = school['School Name'];
        const city = school['City'];
        const state = school['State'];
        const postcode = school['Postcode'];
        const ceebCode = school['CEEB Code'];

        if (!name || !city || !state || name === 'School Name') {
          continue;
        }

        const result = await pool.query(
          `INSERT INTO schools (name, city, state_province, postal_code, ceeb_code, created_at)
           VALUES ($1, $2, $3, $4, $5, NOW())
           ON CONFLICT (name, city, state_province) DO NOTHING
           RETURNING id`,
          [name, city, state, postcode || null, ceebCode || null]
        );

        if (result.rows.length > 0) {
          imported++;
        } else {
          duplicates++;
        }

        if ((i + 1) % 1000 === 0) {
          console.log(`✅ Processed: ${i + 1}/${records.length}`);
        }
      } catch (error) {
        errors++;
      }
    }

    console.log('\n==========================================');
    console.log('✅ Import Complete!');
    console.log(`📊 Imported: ${imported}`);
    console.log(`⚠️  Duplicates: ${duplicates}`);
    console.log(`❌ Errors: ${errors}`);

    const finalCount = await pool.query('SELECT COUNT(*) as count FROM schools');
    console.log(`📈 Total schools: ${finalCount.rows[0].count}\n`);

    await pool.end();
  } catch (error) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  }
}

importSchools();
