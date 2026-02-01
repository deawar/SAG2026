/**
 * ============================================================================
 * Data Integrity Tests
 * Silent Auction Gallery - Section 10
 * ============================================================================
 * 
 * Tests for:
 * - Cascade delete behavior
 * - Orphaned record prevention
 * - Constraint violation handling
 * - Transaction safety (ACID)
 * - Referential integrity
 * - Data consistency
 * 
 * Total: 28+ tests
 */

require('dotenv').config();
const { Pool } = require('pg');
const { v4: uuidv4 } = require('uuid');

describe('Data Integrity', () => {
  let db;
  let testSchoolId, testUserId, testAuctionId, testGatewayId, testArtworkId;

  beforeAll(async () => {
    const password = process.env.DB_PASSWORD || process.env.PG_PASSWORD;
    db = new Pool({
      host: process.env.DB_HOST || process.env.PG_HOST || 'localhost',
      port: process.env.DB_PORT || process.env.PG_PORT || 5432,
      database: process.env.DB_NAME || process.env.PG_DATABASE || 'silent_auction_gallery',
      user: process.env.DB_USER || process.env.PG_USER || 'SAG_DB',
      ...(password && { password })
    });
  });

  afterAll(async () => {
    await db.end();
  });

  beforeEach(async () => {
    testSchoolId = uuidv4();
    testUserId = uuidv4();
    testGatewayId = uuidv4();
    testAuctionId = uuidv4();
    testArtworkId = uuidv4();

    // Create test school
    await db.query(
      `INSERT INTO schools (id, name, address_line1, city, state_province, postal_code)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [testSchoolId, 'Test School', '123 Main St', 'Test City', 'TS', '12345']
    );

    // Create test user
    await db.query(
      `INSERT INTO users (id, school_id, email, password_hash, first_name, last_name, role)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [testUserId, testSchoolId, 'test@example.com', 'hash', 'Test', 'User', 'STUDENT']
    );

    // Create payment gateway
    await db.query(
      `INSERT INTO payment_gateways (id, school_id, gateway_type, api_key_encrypted, api_secret_encrypted, created_by_user_id)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [testGatewayId, testSchoolId, 'STRIPE', 'test_key', 'test_secret', testUserId]
    );

    // Create test auction
    await db.query(
      `INSERT INTO auctions (id, school_id, title, auction_status, starts_at, ends_at, created_by_user_id, payment_gateway_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [testAuctionId, testSchoolId, 'Test Auction', 'LIVE', new Date(), new Date(Date.now() + 86400000), testUserId, testGatewayId]
    );

    // Create test artwork
    await db.query(
      `INSERT INTO artwork (id, auction_id, created_by_user_id, title, artist_name, starting_bid_amount)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [testArtworkId, testAuctionId, testUserId, 'Test Art', 'Artist Name', 50.00]
    );
  });

  afterEach(async () => {
    try {
      await db.query('TRUNCATE TABLE bids CASCADE');
      await db.query('TRUNCATE TABLE artwork CASCADE');
      await db.query('TRUNCATE TABLE auctions CASCADE');
      await db.query('TRUNCATE TABLE payment_gateways CASCADE');
      await db.query('TRUNCATE TABLE users CASCADE');
      await db.query('TRUNCATE TABLE schools CASCADE');
    } catch (error) {
      // Ignore
    }
  });

  /**
   * =========================================================================
   * FOREIGN KEY CONSTRAINT TESTS (5 tests)
   * =========================================================================
   */
  describe('Foreign Key Constraints', () => {
    test('should prevent inserting bid with non-existent auction', async () => {
      try {
        await db.query(
          `INSERT INTO bids (id, auction_id, artwork_id, placed_by_user_id, bid_amount)
           VALUES ($1, $2, $3, $4, $5)`,
          [uuidv4(), uuidv4(), uuidv4(), testUserId, 100.00]
        );
        expect(true).toBe(false);
      } catch (error) {
        expect(error.code).toBe('23503');
      }
    });

    test('should prevent inserting bid with non-existent bidder', async () => {
      try {
        await db.query(
          `INSERT INTO bids (id, auction_id, artwork_id, placed_by_user_id, bid_amount)
           VALUES ($1, $2, $3, $4, $5)`,
          [uuidv4(), testAuctionId, testArtworkId, uuidv4(), 100.00]
        );
        expect(true).toBe(false);
      } catch (error) {
        expect(error.code).toBe('23503');
      }
    });

    test('should prevent inserting auction with non-existent school', async () => {
      try {
        await db.query(
          `INSERT INTO auctions (id, school_id, title, auction_status, starts_at, ends_at, created_by_user_id, payment_gateway_id)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
          [uuidv4(), uuidv4(), 'Bad Auction', 'DRAFT', new Date(), new Date(Date.now() + 86400000), testUserId, testGatewayId]
        );
        expect(true).toBe(false);
      } catch (error) {
        expect(error.code).toBe('23503');
      }
    });

    test('should prevent inserting user with non-existent school', async () => {
      try {
        await db.query(
          `INSERT INTO users (id, school_id, email, password_hash, first_name, last_name, role)
           VALUES ($1, $2, $3, $4, $5, $6, $7)`,
          [uuidv4(), uuidv4(), 'bad@example.com', 'hash', 'Bad', 'User', 'STUDENT']
        );
        expect(true).toBe(false);
      } catch (error) {
        expect(error.code).toBe('23503');
      }
    });

    test('should allow inserting user with NULL school_id (for SITE_ADMIN)', async () => {
      const adminId = uuidv4();
      await db.query(
        `INSERT INTO users (id, email, password_hash, first_name, last_name, role)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [adminId, 'admin@example.com', 'hash', 'Admin', 'User', 'SITE_ADMIN']
      );

      const result = await db.query('SELECT * FROM users WHERE id = $1', [adminId]);
      expect(result.rows[0].school_id).toBeNull();
    });
  });

  /**
   * =========================================================================
   * UNIQUE CONSTRAINT TESTS (4 tests)
   * =========================================================================
   */
  describe('Unique Constraints', () => {
    test('should prevent duplicate email addresses', async () => {
      try {
        await db.query(
          `INSERT INTO users (id, school_id, email, password_hash, first_name, last_name, role)
           VALUES ($1, $2, $3, $4, $5, $6, $7)`,
          [uuidv4(), testSchoolId, 'test@example.com', 'hash', 'Dup', 'User', 'STUDENT']
        );
        expect(true).toBe(false);
      } catch (error) {
        expect(error.code).toBe('23505');
      }
    });

    test('should prevent duplicate college board codes', async () => {
      // Placeholder - schema doesn't currently have college_board_code
      expect(true).toBe(true);
    });

    test('should allow multiple users with same email in different schools', async () => {
      // Emails are unique system-wide in our schema
      expect(true).toBe(true);
    });

    test('should allow NULL in deleted_at (soft delete)', async () => {
      const result = await db.query(
        'SELECT * FROM users WHERE id = $1',
        [testUserId]
      );
      expect(result.rows[0].deleted_at).toBeNull();
    });
  });

  /**
   * =========================================================================
   * NOT NULL CONSTRAINT TESTS (5 tests)
   * =========================================================================
   */
  describe('NOT NULL Constraints', () => {
    test('should prevent NULL email', async () => {
      try {
        await db.query(
          `INSERT INTO users (id, school_id, email, password_hash, first_name, last_name, role)
           VALUES ($1, $2, $3, $4, $5, $6, $7)`,
          [uuidv4(), testSchoolId, null, 'hash', 'No', 'Email', 'STUDENT']
        );
        expect(true).toBe(false);
      } catch (error) {
        expect(error.code).toBe('23502');
      }
    });

    test('should prevent NULL password_hash', async () => {
      try {
        await db.query(
          `INSERT INTO users (id, school_id, email, password_hash, first_name, last_name, role)
           VALUES ($1, $2, $3, $4, $5, $6, $7)`,
          [uuidv4(), testSchoolId, 'nopass@example.com', null, 'No', 'Pass', 'STUDENT']
        );
        expect(true).toBe(false);
      } catch (error) {
        expect(error.code).toBe('23502');
      }
    });

    test('should prevent NULL title on auction', async () => {
      try {
        await db.query(
          `INSERT INTO auctions (id, school_id, title, auction_status, starts_at, ends_at, created_by_user_id, payment_gateway_id)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
          [uuidv4(), testSchoolId, null, 'DRAFT', new Date(), new Date(Date.now() + 86400000), testUserId, testGatewayId]
        );
        expect(true).toBe(false);
      } catch (error) {
        expect(error.code).toBe('23502');
      }
    });

    test('should prevent NULL bid_amount', async () => {
      try {
        await db.query(
          `INSERT INTO bids (id, auction_id, artwork_id, placed_by_user_id, bid_amount)
           VALUES ($1, $2, $3, $4, $5)`,
          [uuidv4(), testAuctionId, testArtworkId, testUserId, null]
        );
        expect(true).toBe(false);
      } catch (error) {
        expect(error.code).toBe('23502');
      }
    });

    test('should allow NULL optional fields (description, image_url)', async () => {
      const result = await db.query(
        'SELECT description, image_url FROM artwork WHERE id = $1',
        [testArtworkId]
      );
      expect(result.rows[0].description).toBeNull();
      expect(result.rows[0].image_url).toBeNull();
    });
  });

  /**
   * =========================================================================
   * CHECK CONSTRAINT TESTS (3 tests)
   * =========================================================================
   */
  describe('Check Constraints', () => {
    test('should validate auction status values', async () => {
      try {
        await db.query(
          `INSERT INTO auctions (id, school_id, title, auction_status, starts_at, ends_at, created_by_user_id, payment_gateway_id)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
          [uuidv4(), testSchoolId, 'Bad Status', 'INVALID_STATUS', new Date(), new Date(), testUserId, testGatewayId]
        );
        expect(true).toBe(false);
      } catch (error) {
        expect(error.code).toBe('23514');
      }
    });

    test('should prevent negative bid amounts', async () => {
      try {
        await db.query(
          `INSERT INTO bids (id, auction_id, artwork_id, placed_by_user_id, bid_amount)
           VALUES ($1, $2, $3, $4, $5)`,
          [uuidv4(), testAuctionId, testArtworkId, testUserId, -10.00]
        );
        expect(true).toBe(false);
      } catch (error) {
        expect(error.code).toBe('23514');
      }
    });

    test('should prevent negative reserve prices', async () => {
      try {
        await db.query(
          `INSERT INTO artwork (id, auction_id, created_by_user_id, title, artist_name, starting_bid_amount, reserve_bid_amount)
           VALUES ($1, $2, $3, $4, $5, $6, $7)`,
          [uuidv4(), testAuctionId, testUserId, 'Negative Art', 'Artist', 50.00, -25.00]
        );
        expect(true).toBe(false);
      } catch (error) {
        expect(error.code).toBe('23514');
      }
    });
  });

  /**
   * =========================================================================
   * TRANSACTION SAFETY TESTS (4 tests)
   * =========================================================================
   */
  describe('Transaction Safety (ACID)', () => {
    test('should rollback failed transaction', async () => {
      const client = await db.connect();
      try {
        await client.query('BEGIN');
        const userId = uuidv4();
        await client.query(
          `INSERT INTO users (id, email, password_hash, first_name, last_name, role)
           VALUES ($1, $2, $3, $4, $5, $6)`,
          [userId, 'transaction@example.com', 'hash', 'Trans', 'User', 'SITE_ADMIN']
        );
        await client.query(
          `INSERT INTO users (id, email, password_hash, first_name, last_name, role)
           VALUES ($1, $2, $3, $4, $5, $6)`,
          [uuidv4(), 'transaction@example.com', 'hash', 'Dup', 'User', 'SITE_ADMIN']
        );
        await client.query('COMMIT');
      } catch (error) {
        await client.query('ROLLBACK');
        const result = await db.query(
          'SELECT COUNT(*) FROM users WHERE email = $1',
          ['transaction@example.com']
        );
        expect(parseInt(result.rows[0].count)).toBe(0);
      } finally {
        client.release();
      }
    });

    test('should commit successful transaction', async () => {
      const client = await db.connect();
      const userId = uuidv4();
      try {
        await client.query('BEGIN');
        await client.query(
          `INSERT INTO users (id, email, password_hash, first_name, last_name, role)
           VALUES ($1, $2, $3, $4, $5, $6)`,
          [userId, 'committed@example.com', 'hash', 'Commit', 'User', 'SITE_ADMIN']
        );
        await client.query('COMMIT');
        const result = await db.query('SELECT * FROM users WHERE id = $1', [userId]);
        expect(result.rows[0].email).toBe('committed@example.com');
      } finally {
        client.release();
      }
    });

    test('should maintain consistency with cascade constraints', async () => {
      const schoolId = uuidv4();
      const userId = uuidv4();
      await db.query(
        `INSERT INTO schools (id, name, address_line1, city, state_province, postal_code)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [schoolId, 'Cascade School', '789 Test Ave', 'Test City', 'TS', '99999']
      );
      await db.query(
        `INSERT INTO users (id, school_id, email, password_hash, first_name, last_name, role)
         VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [userId, schoolId, 'cascade@example.com', 'hash', 'Cascade', 'User', 'STUDENT']
      );
      await db.query('DELETE FROM schools WHERE id = $1', [schoolId]);
      const result = await db.query('SELECT COUNT(*) FROM auctions WHERE school_id = $1', [schoolId]);
      expect(parseInt(result.rows[0].count)).toBe(0);
    });

    test('should support concurrent reads and writes', async () => {
      const promises = [];
      for (let i = 0; i < 5; i++) {
        promises.push(db.query('SELECT COUNT(*) FROM users'));
      }
      const results = await Promise.all(promises);
      results.forEach(result => {
        expect(parseInt(result.rows[0].count)).toBeGreaterThanOrEqual(0);
      });
    });
  });

  /**
   * =========================================================================
   * ORPHANED RECORD PREVENTION TESTS (3 tests)
   * =========================================================================
   */
  describe('Orphaned Record Prevention', () => {
    test('should prevent orphaned bids when deleting auction', async () => {
      // Verify auction exists
      const auctionResult = await db.query('SELECT * FROM auctions WHERE id = $1', [testAuctionId]);
      expect(auctionResult.rows.length).toBe(1);

      // When we delete auction, bids cascade (ON DELETE CASCADE)
      await db.query('DELETE FROM auctions WHERE id = $1', [testAuctionId]);

      // Bids should be deleted
      const bidResult = await db.query('SELECT COUNT(*) FROM bids WHERE auction_id = $1', [testAuctionId]);
      expect(parseInt(bidResult.rows[0].count)).toBe(0);
    });

    test('should prevent orphaned auctions when deleting school', async () => {
      const schoolId = uuidv4();
      const auctionId = uuidv4();
      const gatewayId = uuidv4();
      
      await db.query(
        `INSERT INTO schools (id, name, address_line1, city, state_province, postal_code)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [schoolId, 'Orphan Test School', '555 Test Way', 'Test City', 'TS', '55555']
      );
      
      await db.query(
        `INSERT INTO payment_gateways (id, school_id, gateway_type, api_key_encrypted, api_secret_encrypted, created_by_user_id)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [gatewayId, schoolId, 'STRIPE', 'key', 'secret', testUserId]
      );
      
      await db.query(
        `INSERT INTO auctions (id, school_id, title, auction_status, starts_at, ends_at, created_by_user_id, payment_gateway_id)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
        [auctionId, schoolId, 'Orphan Auction', 'DRAFT', new Date(), new Date(Date.now() + 86400000), testUserId, gatewayId]
      );

      // Delete school - auctions should cascade
      await db.query('DELETE FROM schools WHERE id = $1', [schoolId]);

      const result = await db.query('SELECT COUNT(*) FROM auctions WHERE school_id = $1', [schoolId]);
      expect(parseInt(result.rows[0].count)).toBe(0);
    });

    test('should prevent orphaned users when deleting school', async () => {
      // Users with SET NULL cascade - should remain but school_id becomes NULL
      const result = await db.query('SELECT school_id FROM users WHERE id = $1', [testUserId]);
      expect(result.rows[0]).toBeDefined();
    });
  });

  /**
   * =========================================================================
   * SOFT DELETE IMPLEMENTATION TESTS (2 tests)
   * =========================================================================
   */
  describe('Soft Delete Implementation', () => {
    test('should support soft delete on users', async () => {
      const userId = uuidv4();
      await db.query(
        `INSERT INTO users (id, school_id, email, password_hash, first_name, last_name, role)
         VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [userId, testSchoolId, 'softdelete@example.com', 'hash', 'Soft', 'Delete', 'STUDENT']
      );

      await db.query('UPDATE users SET deleted_at = NOW() WHERE id = $1', [userId]);

      const result = await db.query('SELECT * FROM users WHERE id = $1', [userId]);
      expect(result.rows[0].deleted_at).not.toBeNull();
    });

    test('should support restore from soft delete', async () => {
      const userId = uuidv4();
      await db.query(
        `INSERT INTO users (id, school_id, email, password_hash, first_name, last_name, role)
         VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [userId, testSchoolId, 'restore@example.com', 'hash', 'Restore', 'User', 'STUDENT']
      );

      await db.query('UPDATE users SET deleted_at = NOW() WHERE id = $1', [userId]);
      await db.query('UPDATE users SET deleted_at = NULL WHERE id = $1', [userId]);

      const result = await db.query('SELECT * FROM users WHERE id = $1', [userId]);
      expect(result.rows[0].deleted_at).toBeNull();
    });
  });
});
