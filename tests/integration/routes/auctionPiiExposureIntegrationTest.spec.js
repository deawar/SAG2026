/**
 * Auction PII Exposure Integration Tests
 * Task 2: Public carousel must not expose student full name or grade.
 * Task 3: Winner endpoint must not expose winner email to non-admin callers.
 * Tasks 4/5 will extend this file with bid/artwork PII checks.
 */

process.env.NODE_ENV = 'test';
if (!process.env.JWT_ACCESS_SECRET) { process.env.JWT_ACCESS_SECRET = 'test-access-secret'; }
if (!process.env.JWT_REFRESH_SECRET) { process.env.JWT_REFRESH_SECRET = 'test-refresh-secret'; }

jest.mock('../../../src/models/index', () => {
  const actual = jest.requireActual('../../../src/models/index');
  return { ...actual, pool: { query: jest.fn().mockResolvedValue({ rows: [], rowCount: 0 }) } };
});

const request = require('supertest');
const jwt = require('jsonwebtoken');
const createApp = require('../../../src/app');
const mockDb = require('../../helpers/mockDb');
const { pool: mockPool } = require('../../../src/models/index');

const SECRET = process.env.JWT_ACCESS_SECRET;

function makeToken(payload) {
  return jwt.sign(payload, SECRET, { algorithm: 'HS256', expiresIn: '15m' });
}

/** A winner row as returned by the auctionService SQL query */
function makeWinnerRow(overrides = {}) {
  return {
    artwork_id: 'artwork-1',
    title: 'Test Artwork',
    winner_id: 'user-winner-1',
    winning_bid: '150.00',
    first_name: 'Alice',
    last_name: 'Smith',
    email: 'alice@example.com',
    ...overrides
  };
}

describe('Public carousel PII', () => {
  let app;
  beforeAll(() => { mockDb.reset(); app = createApp(mockDb); });
  beforeEach(() => {
    mockPool.query.mockReset();
    mockPool.query.mockResolvedValue({ rows: [], rowCount: 0 });
    mockDb.reset();
  });

  test('carousel reduces artist name and never returns artistGrade', async () => {
    mockPool.query.mockResolvedValueOnce({ rows: [
      { id: 'a1', title: 'Burger Cat', artist_name: 'Joyce Chen', medium: 'Oil', image_url: 'data:image/jpeg;base64,xxx', auction_id: 'au1', artist_grade: 9 }
    ], rowCount: 1 });
    const res = await request(app).get('/api/auctions/carousel');
    expect(res.status).toBe(200);
    for (const art of res.body.artwork) {
      expect(art).not.toHaveProperty('artistGrade');
      expect(art.artistName).toBe('Joyce C.');
    }
  });
});

/** A bid row as returned by the getBidsForAuction SQL query */
function makeBidRow(overrides = {}) {
  return {
    id: 'bid-1',
    artwork_id: 'art-1',
    artwork_title: 'Test Artwork',
    bid_amount: '100.00',
    placed_at: new Date('2026-01-01T10:00:00Z'),
    id_of_bidder: 'user-bidder-1',
    first_name: 'Alice',
    last_name: 'Smith',
    ...overrides
  };
}

describe('Auction bids list PII', () => {
  let app;

  beforeAll(() => { mockDb.reset(); app = createApp(mockDb); });

  beforeEach(() => {
    mockPool.query.mockReset();
    mockPool.query.mockResolvedValue({ rows: [], rowCount: 0 });
    mockDb.reset();
  });

  test('STUDENT sees "Bidder #N", not real names', async () => {
    const token = makeToken({ userId: 'user-student-1', role: 'STUDENT', schoolId: 'school-1' });

    mockPool.query
      // query 1: auction lookup
      .mockResolvedValueOnce({ rows: [{ id: 'auc-1', school_id: 'school-1' }], rowCount: 1 })
      // query 2: bids rows — two bids from the same bidder, one from a different bidder
      .mockResolvedValueOnce({
        rows: [
          makeBidRow({ id: 'bid-1', id_of_bidder: 'user-a', first_name: 'Alice', last_name: 'Smith' }),
          makeBidRow({ id: 'bid-2', id_of_bidder: 'user-b', first_name: 'Bob', last_name: 'Jones' }),
          makeBidRow({ id: 'bid-3', id_of_bidder: 'user-a', first_name: 'Alice', last_name: 'Smith' })
        ],
        rowCount: 3
      });

    const res = await request(app)
      .get('/api/auctions/auc-1/bids')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);

    // Every bidderName must be anonymized
    for (const b of res.body.bids) {
      expect(b.bidderName).toMatch(/^Bidder #\d+$/);
    }

    // Two bids from the same bidder (user-a) must get the same label
    expect(res.body.bids[0].bidderName).toBe(res.body.bids[2].bidderName);

    // Two different bidders must get different labels
    expect(res.body.bids[0].bidderName).not.toBe(res.body.bids[1].bidderName);
  });

  test('SCHOOL_ADMIN sees real bidder names', async () => {
    const token = makeToken({ userId: 'user-admin-1', role: 'SCHOOL_ADMIN', schoolId: 'school-1' });

    mockPool.query
      // query 0: auth middleware hydrates school_id from DB for SCHOOL_ADMIN
      .mockResolvedValueOnce({ rows: [{ school_id: 'school-1' }], rowCount: 1 })
      // query 1: auction lookup
      .mockResolvedValueOnce({ rows: [{ id: 'auc-1', school_id: 'school-1' }], rowCount: 1 })
      // query 2: bids rows
      .mockResolvedValueOnce({
        rows: [
          makeBidRow({ id: 'bid-1', id_of_bidder: 'user-a', first_name: 'Alice', last_name: 'Smith' }),
          makeBidRow({ id: 'bid-2', id_of_bidder: 'user-b', first_name: 'Bob', last_name: 'Jones' })
        ],
        rowCount: 2
      });

    const res = await request(app)
      .get('/api/auctions/auc-1/bids')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);

    // Admins must see real names
    expect(res.body.bids[0].bidderName).toBe('Alice Smith');
    expect(res.body.bids[1].bidderName).toBe('Bob Jones');
  });
});

describe('Auction winner PII', () => {
  let app;

  beforeAll(() => { mockDb.reset(); app = createApp(mockDb); });

  beforeEach(() => {
    mockPool.query.mockReset();
    mockPool.query.mockResolvedValue({ rows: [], rowCount: 0 });
    mockDb.reset();
  });

  test('BIDDER sees winner name but not email', async () => {
    const token = makeToken({ userId: 'user-bidder-1', role: 'BIDDER', schoolId: 'school-1' });

    // Tokens without jti skip the DB blacklist check (isRevoked returns false early).
    // The only pool.query call is therefore the winner SQL itself.
    mockPool.query.mockImplementation((sql) => {
      const q = typeof sql === 'string' ? sql : (sql?.text || '');
      if (q.includes('FROM artwork')) {
        return Promise.resolve({ rows: [makeWinnerRow()], rowCount: 1 });
      }
      return Promise.resolve({ rows: [], rowCount: 0 });
    });

    const res = await request(app)
      .get('/api/auctions/auction-1/winner')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.winners.length).toBeGreaterThan(0);
    for (const w of res.body.winners) {
      expect(w).not.toHaveProperty('winnerEmail');
      expect(w).not.toHaveProperty('email');
    }
  });

  test('SITE_ADMIN sees winner name and winnerEmail', async () => {
    const token = makeToken({ userId: 'user-admin-1', role: 'SITE_ADMIN', schoolId: 'school-1' });

    mockPool.query.mockImplementation((sql) => {
      const q = typeof sql === 'string' ? sql : (sql?.text || '');
      if (q.includes('FROM artwork')) {
        return Promise.resolve({ rows: [makeWinnerRow()], rowCount: 1 });
      }
      return Promise.resolve({ rows: [], rowCount: 0 });
    });

    const res = await request(app)
      .get('/api/auctions/auction-1/winner')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.winners.length).toBeGreaterThan(0);
    for (const w of res.body.winners) {
      expect(w).toHaveProperty('winnerEmail', 'alice@example.com');
    }
  });
});
