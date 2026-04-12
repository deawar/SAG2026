/**
 * Auction Routes Integration Tests
 */

process.env.NODE_ENV = 'test';
if (!process.env.JWT_ACCESS_SECRET) process.env.JWT_ACCESS_SECRET = 'test-access-secret';
if (!process.env.JWT_REFRESH_SECRET) process.env.JWT_REFRESH_SECRET = 'test-refresh-secret';

// Mock models/index to intercept pool.query used by auctionController directly,
// while preserving UserModel/SchoolModel/etc. needed by other routes.
jest.mock('../../../src/models/index', () => {
  const actual = jest.requireActual('../../../src/models/index');
  return {
    ...actual,
    pool: { query: jest.fn().mockResolvedValue({ rows: [], rowCount: 0 }) }
  };
});

const request = require('supertest');
const jwt = require('jsonwebtoken');
const createApp = require('../../../src/app');
const mockDb = require('../../helpers/mockDb');
const { pool: mockPool } = require('../../../src/models/index');

const SECRET = process.env.JWT_ACCESS_SECRET;

function makeToken(payload) {
  return jwt.sign(payload, SECRET, { algorithm: 'HS256' });
}

describe('Auction Routes Integration Tests', () => {
  let app;

  beforeAll(() => {
    mockDb.reset();
    app = createApp(mockDb);
  });

  beforeEach(() => {
    mockPool.query.mockReset();
    mockPool.query.mockResolvedValue({ rows: [], rowCount: 0 });
    mockDb.reset();
  });

  test.todo('GET /api/auctions returns list');
  test.todo('POST /api/auctions requires auth');
  test.todo('GET /api/auctions/:id returns detail');

  describe('GET /api/auctions/:id/bids', () => {
    const AUCTION_ID = 'auction-uuid-1';
    const SCHOOL_ID = 'school-uuid-1';

    test('returns 401 without a token', async () => {
      const res = await request(app).get(`/api/auctions/${AUCTION_ID}/bids`);
      expect(res.status).toBe(401);
    });

    test('returns 200 with bids array for an authorized user', async () => {
      const token = makeToken({ userId: 'user-1', role: 'BIDDER', schoolId: SCHOOL_ID });

      mockPool.query
        // auction lookup
        .mockResolvedValueOnce({ rows: [{ id: AUCTION_ID, school_id: SCHOOL_ID }], rowCount: 1 })
        // bids query
        .mockResolvedValueOnce({
          rows: [
            {
              id: 'bid-1', artwork_id: 'art-1', artwork_title: 'Sunrise',
              bid_amount: '150.00', placed_at: new Date('2026-01-01T10:00:00Z'),
              first_name: 'Alice', last_name: 'Smith'
            },
            {
              id: 'bid-2', artwork_id: 'art-2', artwork_title: 'Ocean',
              bid_amount: '200.00', placed_at: new Date('2026-01-01T09:00:00Z'),
              first_name: 'Bob', last_name: 'Jones'
            }
          ],
          rowCount: 2
        });

      const res = await request(app)
        .get(`/api/auctions/${AUCTION_ID}/bids`)
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(Array.isArray(res.body.bids)).toBe(true);
      expect(res.body.bids).toHaveLength(2);
      expect(res.body.bids[0]).toMatchObject({
        id: 'bid-1',
        artworkId: 'art-1',
        artworkTitle: 'Sunrise',
        bidderName: 'Alice Smith',
        amount: '150.00'
      });
    });

    test('returns 403 for a user outside the auction school', async () => {
      const token = makeToken({ userId: 'user-2', role: 'TEACHER', schoolId: 'other-school-id' });

      mockPool.query.mockResolvedValueOnce({
        rows: [{ id: AUCTION_ID, school_id: SCHOOL_ID }],
        rowCount: 1
      });

      const res = await request(app)
        .get(`/api/auctions/${AUCTION_ID}/bids`)
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(403);
    });

    test('returns 404 when auction does not exist', async () => {
      const token = makeToken({ userId: 'user-1', role: 'BIDDER', schoolId: SCHOOL_ID });

      mockPool.query.mockResolvedValueOnce({ rows: [], rowCount: 0 });

      const res = await request(app)
        .get('/api/auctions/nonexistent-id/bids')
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(404);
    });

    test('SITE_ADMIN can view bids for any school', async () => {
      const token = makeToken({ userId: 'admin-1', role: 'SITE_ADMIN', schoolId: null });

      mockPool.query
        .mockResolvedValueOnce({ rows: [{ id: AUCTION_ID, school_id: SCHOOL_ID }], rowCount: 1 })
        .mockResolvedValueOnce({ rows: [], rowCount: 0 });

      const res = await request(app)
        .get(`/api/auctions/${AUCTION_ID}/bids`)
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(200);
      expect(res.body.bids).toEqual([]);
    });
  });
});
