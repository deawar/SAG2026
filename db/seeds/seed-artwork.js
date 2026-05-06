'use strict';

/**
 * Seed script — insert 6 artwork pieces into the production DB.
 *
 * Usage (run from project root on the server):
 *   node db/seeds/seed-artwork.js
 *
 * Requires the same DATABASE_* env vars as the main app (.env or exported).
 * Safe to re-run: skips pieces whose title already exists in the target auction.
 *
 * What it does:
 *   1. Looks up the teacher account (TEACHER_EMAIL or dean.ed.warren@gmail.com).
 *   2. Finds the most recent non-ended auction for that school, or creates a new
 *      LIVE auction (7-day window) if none exists.
 *   3. Inserts the 6 artwork pieces as APPROVED with correct image URLs.
 */

require('dotenv').config();
const { Pool } = require('pg');
const { v4: uuidv4 } = require('uuid');

const pool = new Pool({
  host:     process.env.DATABASE_HOST     || 'localhost',
  port:     parseInt(process.env.DATABASE_PORT || '5432'),
  database: process.env.DATABASE_NAME     || 'sag_db',
  user:     process.env.DATABASE_USER     || 'postgres',
  password: process.env.DATABASE_PASSWORD,
  ssl: process.env.DATABASE_SSL === 'true' ? { rejectUnauthorized: false } : false,
});

const TEACHER_EMAIL = process.env.TEACHER_EMAIL || 'dean.ed.warren@gmail.com';

const ARTWORKS = [
  {
    filename:    'BeachRooster.jpg',
    title:       'Beach Rooster',
    artist:      'Student Artist',
    medium:      'Watercolor',
    widthCm:     20,
    heightCm:    28,
    startingBid: 25.00,
    description: 'A cheerful rooster in striped board shorts and sunglasses enjoys a day at the beach. Watercolor on paper, matted and framed.',
  },
  {
    filename:    'BurgerCat.jpg',
    title:       'Burger Cat',
    artist:      'Student Artist',
    medium:      'Acrylic on Board',
    widthCm:     30,
    heightCm:    30,
    startingBid: 25.00,
    description: 'A deadpan cat gazes out from inside a burger bun surrounded by lettuce. Bold pop-art style on a vibrant yellow background.',
  },
  {
    filename:    'RainbowSky.jpg',
    title:       'Rainbow Sky',
    artist:      'Student Artist',
    medium:      'Acrylic on Canvas',
    widthCm:     30,
    heightCm:    30,
    startingBid: 30.00,
    description: 'A dramatic rainbow arcs across a stormy purple-blue sky over distant mountains. Rich atmospheric color work in acrylic.',
  },
  {
    filename:    'Roostertude.jpg',
    title:       'Roostertude',
    artist:      'Student Artist',
    medium:      'Acrylic and Marker',
    widthCm:     38,
    heightCm:    28,
    startingBid: 35.00,
    description: 'A confident rooster surveys a farm landscape complete with windmill and wooden fence. Strong linework and vivid color.',
  },
  {
    filename:    'SeaLife.jpg',
    title:       'Sea Life',
    artist:      'Student Artist',
    medium:      'Watercolor and Ink',
    widthCm:     38,
    heightCm:    50,
    startingBid: 75.00,
    description: 'An intricate framed piece featuring a sea turtle whose shell holds an entire ocean world — octopus, dolphins, tropical fish, and seagrass. Exceptional detail in watercolor and ink.',
  },
  {
    filename:    'UGASmiling.jpg',
    title:       'UGA Smiling',
    artist:      'Student Artist',
    medium:      'Acrylic on Canvas',
    widthCm:     40,
    heightCm:    32,
    startingBid: 50.00,
    description: 'The beloved UGA Bulldog mascot beams in his Georgia uniform against a bold red background. Signed by the artist.',
  },
];

async function run() {
  const client = await pool.connect();
  try {
    // 1. Find the teacher account
    const teacherRes = await client.query(
      `SELECT id, school_id FROM users
       WHERE email = $1 AND deleted_at IS NULL LIMIT 1`,
      [TEACHER_EMAIL]
    );
    if (teacherRes.rows.length === 0) {
      throw new Error(`Teacher not found with email: ${TEACHER_EMAIL}`);
    }
    const { id: teacherId, school_id: schoolId } = teacherRes.rows[0];
    console.log(`Teacher: ${teacherId} | School: ${schoolId}`);

    // 2. Find the most recent non-ended auction for this school
    let auctionId;
    const auctionRes = await client.query(
      `SELECT id, title FROM auctions
       WHERE school_id = $1
         AND auction_status IN ('DRAFT', 'APPROVED', 'LIVE')
         AND deleted_at IS NULL
       ORDER BY created_at DESC LIMIT 1`,
      [schoolId]
    );

    if (auctionRes.rows.length > 0) {
      auctionId = auctionRes.rows[0].id;
      console.log(`Using existing auction: "${auctionRes.rows[0].title}" (${auctionId})`);
    } else {
      // No suitable auction — find a payment gateway and create one
      const gwRes = await client.query(
        `SELECT id FROM payment_gateways
         WHERE school_id = $1 AND is_active = TRUE LIMIT 1`,
        [schoolId]
      );
      const gwId = gwRes.rows.length > 0 ? gwRes.rows[0].id : null;

      const now = new Date();
      const endTime = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
      auctionId = uuidv4();
      await client.query(
        `INSERT INTO auctions
           (id, school_id, title, description,
            starts_at, ends_at, auction_status,
            created_by_user_id, payment_gateway_id,
            platform_fee_percentage, created_at, updated_at)
         VALUES ($1,$2,$3,$4,$5,$6,'LIVE',$7,$8,3.5,NOW(),NOW())`,
        [
          auctionId, schoolId,
          'SAG Art Auction',
          'Silent auction featuring original student artwork.',
          now, endTime,
          teacherId, gwId,
        ]
      );
      console.log(`Created new LIVE auction: ${auctionId} (ends ${endTime.toISOString()})`);
    }

    // 3. Insert artwork pieces (idempotent — skips existing titles)
    let inserted = 0;
    let skipped  = 0;
    for (const art of ARTWORKS) {
      const exists = await client.query(
        `SELECT id FROM artwork
         WHERE title = $1 AND auction_id = $2 AND deleted_at IS NULL LIMIT 1`,
        [art.title, auctionId]
      );
      if (exists.rows.length > 0) {
        console.log(`  SKIP  ${art.title} (already exists)`);
        skipped++;
        continue;
      }
      await client.query(
        `INSERT INTO artwork
           (id, auction_id, created_by_user_id,
            title, artist_name, medium,
            dimensions_width_cm, dimensions_height_cm,
            starting_bid_amount, description,
            image_url, artwork_status,
            created_at, updated_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,'APPROVED',NOW(),NOW())`,
        [
          uuidv4(), auctionId, teacherId,
          art.title, art.artist, art.medium,
          art.widthCm, art.heightCm,
          art.startingBid, art.description,
          `/images/auction-items/${art.filename}`,
        ]
      );
      console.log(`  INSERT ${art.title}`);
      inserted++;
    }

    console.log(`\nDone. ${inserted} inserted, ${skipped} skipped.`);
  } finally {
    client.release();
    await pool.end();
  }
}

run().catch(err => {
  console.error('Seed failed:', err.message);
  process.exit(1);
});
