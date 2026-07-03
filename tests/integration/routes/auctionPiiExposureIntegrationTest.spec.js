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
