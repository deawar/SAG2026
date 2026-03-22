#!/usr/bin/env node
/**
 * scripts/import-nces-schools.js
 *
 * Imports schools from ceeb.csv into the local PostgreSQL database.
 * CSV format: CEEB Code, School Name, City, State, Postcode
 *
 * Usage (recommended — runs inside Docker, correct DB host):
 *   docker compose exec app node scripts/import-nces-schools.js
 *
 * Usage (from host machine):
 *   DB_HOST=localhost DB_PORT=5433 node scripts/import-nces-schools.js
 */

try { require('dotenv').config({ path: require('node:path').join(__dirname, '../.env') }); } catch { /* .env optional */ }

const fs       = require('node:fs');
const path     = require('node:path');
const readline = require('node:readline');
const { Pool } = require('pg');

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------
const CSV_PATH = path.join(__dirname, '../ceeb.csv');
const BATCH    = 500;  // rows per INSERT

const pool = new Pool({
  host:     process.env.DB_HOST     || 'postgres',
  port:     Number.parseInt(process.env.DB_PORT || '5432'),
  database: process.env.DB_NAME     || 'sag_db',
  user:     process.env.DB_USER     || 'postgres',
  password: process.env.DB_PASSWORD || 'postgres',
  ssl:      false,
});

// US state/territory postal codes — used to set country = 'US' vs 'CA' etc.
const US_STATES = new Set([
  'AL','AK','AZ','AR','CA','CO','CT','DE','FL','GA','HI','ID','IL','IN','IA',
  'KS','KY','LA','ME','MD','MA','MI','MN','MS','MO','MT','NE','NV','NH','NJ',
  'NM','NY','NC','ND','OH','OK','OR','PA','RI','SC','SD','TN','TX','UT','VT',
  'VA','WA','WV','WI','WY',
  'DC','PR','VI','GU','MP','AS',  // territories
  'AA','AE','AP',                  // military
]);

// ---------------------------------------------------------------------------
// CSV parser — handles optional quoting, trims whitespace
// ---------------------------------------------------------------------------
function parseCSVLine(line) {
  const fields = [];
  let cur = '';
  let inQuote = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuote && line[i + 1] === '"') { cur += '"'; i++; }
      else { inQuote = !inQuote; }
    } else if (ch === ',' && !inQuote) {
      fields.push(cur.trim());
      cur = '';
    } else {
      cur += ch;
    }
  }
  fields.push(cur.trim());
  return fields;
}

// ---------------------------------------------------------------------------
// Batch insert
// ---------------------------------------------------------------------------
async function insertBatch(rows) {
  if (rows.length === 0) return 0;

  const placeholders = [];
  const params       = [];
  let   p            = 1;

  for (const r of rows) {
    placeholders.push(
      `($${p++},$${p++},$${p++},$${p++},$${p++},$${p++},$${p++})`
    );
    params.push(r.ceeb_code, r.name, r.address_line1, r.city, r.state_province, r.postal_code, r.country);
  }

  const result = await pool.query(
    `INSERT INTO schools (ceeb_code, name, address_line1, city, state_province, postal_code, country, account_status)
     VALUES ${placeholders.join(',')}
     ON CONFLICT (ceeb_code) DO UPDATE SET
       name           = EXCLUDED.name,
       city           = EXCLUDED.city,
       state_province = EXCLUDED.state_province,
       postal_code    = EXCLUDED.postal_code,
       country        = EXCLUDED.country,
       updated_at     = NOW()`,
    params,
  );
  return result.rowCount ?? rows.length;
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------
async function main() {
  // Verify connection
  try {
    await pool.query('SELECT 1');
    console.log(`Connected to ${process.env.DB_NAME || 'sag_db'} @ ${process.env.DB_HOST || 'postgres'}:${process.env.DB_PORT || 5432}`);
  } catch (err) {
    console.error(`Cannot connect to database: ${err.message}`);
    console.error('Try:  docker compose exec app node scripts/import-nces-schools.js');
    console.error('Or:   DB_HOST=localhost DB_PORT=5433 node scripts/import-nces-schools.js');
    process.exit(1);
  }

  if (!fs.existsSync(CSV_PATH)) {
    console.error(`CSV not found: ${CSV_PATH}`);
    process.exit(1);
  }

  const { rows: [{ count: before }] } = await pool.query('SELECT COUNT(*) FROM schools');
  console.log(`Schools in DB before import: ${before}`);
  console.log(`Reading ${CSV_PATH} ...\n`);

  const rl = readline.createInterface({ input: fs.createReadStream(CSV_PATH), crlfDelay: Infinity });
  const lines = [];
  for await (const line of rl) lines.push(line);

  // Skip header row
  const dataLines = lines.slice(1).filter(l => l.trim());
  console.log(`CSV rows to process: ${dataLines.length}`);

  let batch    = [];
  let inserted = 0;
  let skipped  = 0;

  for (const line of dataLines) {
    const [, name, city, state, postcode] = parseCSVLine(line);

    // Required fields check
    if (!name || !city || !state) { skipped++; continue; }

    let country = 'US';
    if (!US_STATES.has(state.toUpperCase()) && state.length === 2) country = 'CA';

    batch.push({
      name:           name.slice(0, 255),
      address_line1:  'Address Not Available',
      city:           city.slice(0, 100),
      state_province: state.toUpperCase().slice(0, 50),
      postal_code:    (postcode || '00000').slice(0, 20),
      country:        country.slice(0, 2),
    });

    if (batch.length >= BATCH) {
      const count = await insertBatch(batch);
      inserted += count;
      process.stdout.write(`  Inserted ${inserted} so far...\r`);
      batch = [];
    }
  }

  // Final batch
  if (batch.length > 0) {
    inserted += await insertBatch(batch);
  }

  const { rows: [{ count: after }] } = await pool.query('SELECT COUNT(*) FROM schools');

  console.log(`
------------------------------------------------------------
Import complete.
  CSV rows      : ${dataLines.length}
  Rows skipped  : ${skipped} (missing required fields)
  Schools before: ${before}
  Schools after : ${after}
  Net added     : ${Number.parseInt(after) - Number.parseInt(before)}
------------------------------------------------------------`);

  await pool.end();
}

main().catch(err => {
  console.error('Fatal error:', err.message);
  process.exit(1);
});
