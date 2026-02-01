require('dotenv').config();
const { Pool } = require('pg');

const db = new Pool({
  host: process.env.DB_HOST || 'localhost',
  port: process.env.DB_PORT || 5432,
  database: process.env.DB_NAME || 'silent_auction_gallery',
  user: process.env.DB_USER || 'SAG_DB',
  password: process.env.DB_PASSWORD
});

(async () => {
  try {
    const result = await db.query(`
      SELECT data_type 
      FROM information_schema.columns 
      WHERE table_name = 'users' AND column_name = 'email'
    `);
    console.log('Email data type:', result.rows[0]?.data_type);
    process.exit(0);
  } catch (error) {
    console.error('Error:', error.message);
    process.exit(1);
  }
})();
