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

/** An artwork row as returned by the getAuctionArtwork SQL query */
function makeArtworkRow(overrides = {}) {
  return {
    id: 'art-1',
    title: 'Burger Cat',
    description: 'A cat eating a burger',
    image_url: 'https://example.com/art.jpg',
    medium: 'Oil',
    dimensions_width_cm: 30,
    dimensions_height_cm: 40,
    starting_bid_amount: '10.00',
    current_bid: '15.00',
    bid_count: '2',
    artist_name: 'Joyce Chen',
    created_by_user_id: 'user-student-42',
    school_id: 'school-1',
    auction_id: 'auc-1',
    artwork_status: 'APPROVED',
    deleted_at: null,
    created_at: new Date('2026-01-01T10:00:00Z'),
    ...overrides
  };
}

describe('Public artwork PII', () => {
  let app;

  beforeAll(() => { mockDb.reset(); app = createApp(mockDb); });

  beforeEach(() => {
    mockPool.query.mockReset();
    mockPool.query.mockResolvedValue({ rows: [], rowCount: 0 });
    mockDb.reset();
  });

  test('BIDDER sees reduced artistName and no createdByUserId', async () => {
    const token = makeToken({ userId: 'user-bidder-1', role: 'BIDDER', schoolId: null });

    mockPool.query
      // Only one query: the artwork SELECT (no prior auction lookup)
      .mockResolvedValueOnce({
        rows: [
          makeArtworkRow({ id: 'art-1', artist_name: 'Joyce Chen', created_by_user_id: 'user-student-42' }),
          makeArtworkRow({ id: 'art-2', artist_name: 'Sam Williams', created_by_user_id: 'user-student-99' })
        ],
        rowCount: 2
      });

    const res = await request(app)
      .get('/api/auctions/auc-1/artwork')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.artwork.length).toBe(2);

    for (const art of res.body.artwork) {
      // Must NOT expose internal userId
      expect(art).not.toHaveProperty('createdByUserId');
      // artistName must match "First L." reduced form (e.g. "Joyce C.")
      expect(art.artistName).toMatch(/^\S+( \S\.)?$/);
    }

    // Spot-check the exact reduced values
    expect(res.body.artwork[0].artistName).toBe('Joyce C.');
    expect(res.body.artwork[1].artistName).toBe('Sam W.');
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

  test('BIDDER receives reduced winnerName ("First L."), not full name', async () => {
    const token = makeToken({ userId: 'user-bidder-1', role: 'BIDDER', schoolId: 'school-1' });

    mockPool.query.mockImplementation((sql) => {
      const q = typeof sql === 'string' ? sql : (sql?.text || '');
      if (q.includes('FROM artwork')) {
        return Promise.resolve({
          rows: [makeWinnerRow({ first_name: 'Ava', last_name: 'Rodriguez' })],
          rowCount: 1
        });
      }
      return Promise.resolve({ rows: [], rowCount: 0 });
    });

    const res = await request(app)
      .get('/api/auctions/auction-1/winner')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.winners.length).toBeGreaterThan(0);
    const w = res.body.winners[0];
    // Must match "First L." reduced form
    expect(w.winnerName).toMatch(/^\S+ \S\.$/);
    expect(w.winnerName).toBe('Ava R.');
    // Must NOT contain the full last name
    expect(w.winnerName).not.toContain('Rodriguez');
  });

  test('SITE_ADMIN receives full winnerName "First Last"', async () => {
    const token = makeToken({ userId: 'user-admin-1', role: 'SITE_ADMIN', schoolId: 'school-1' });

    mockPool.query.mockImplementation((sql) => {
      const q = typeof sql === 'string' ? sql : (sql?.text || '');
      if (q.includes('FROM artwork')) {
        return Promise.resolve({
          rows: [makeWinnerRow({ first_name: 'Ava', last_name: 'Rodriguez' })],
          rowCount: 1
        });
      }
      return Promise.resolve({ rows: [], rowCount: 0 });
    });

    const res = await request(app)
      .get('/api/auctions/auction-1/winner')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.winners.length).toBeGreaterThan(0);
    const w = res.body.winners[0];
    expect(w.winnerName).toBe('Ava Rodriguez');
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

/** A bidding-service winner row (bids JOIN artwork JOIN users) */
function makeBiddingWinnerRow(overrides = {}) {
  return {
    placed_by_user_id: 'user-winner-99',
    bid_amount: '250.00',
    artwork_id: 'artwork-77',
    first_name: 'Nina',
    last_name: 'Patel',
    artwork_title: 'Starry Night II',
    ...overrides
  };
}

describe('Bidding winner endpoint PII (GET /api/bidding/auction/:id/winner)', () => {
  let app;

  beforeAll(() => { mockDb.reset(); app = createApp(mockDb); });

  beforeEach(() => {
    mockPool.query.mockReset();
    mockPool.query.mockResolvedValue({ rows: [], rowCount: 0 });
    mockDb.reset();
  });

  test('BIDDER gets reduced name and NO id field', async () => {
    const token = makeToken({ userId: 'user-bidder-2', role: 'BIDDER', schoolId: null });

    mockPool.query.mockImplementation((sql) => {
      const q = typeof sql === 'string' ? sql : (sql?.text || '');
      if (q.includes('FROM bids')) {
        return Promise.resolve({ rows: [makeBiddingWinnerRow()], rowCount: 1 });
      }
      return Promise.resolve({ rows: [], rowCount: 0 });
    });

    const res = await request(app)
      .get('/api/bidding/auction/auction-42/winner')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.hasWinner).toBe(true);

    const winner = res.body.data.winner;
    // Reduced "First L." form
    expect(winner.name).toMatch(/^\S+ \S\.$/);
    expect(winner.name).toBe('Nina P.');
    // Raw userId MUST be absent for non-admin
    expect(winner).not.toHaveProperty('id');
  });

  test('SITE_ADMIN gets full name and id field', async () => {
    const token = makeToken({ userId: 'user-admin-2', role: 'SITE_ADMIN', schoolId: null });

    mockPool.query.mockImplementation((sql) => {
      const q = typeof sql === 'string' ? sql : (sql?.text || '');
      if (q.includes('FROM bids')) {
        return Promise.resolve({ rows: [makeBiddingWinnerRow()], rowCount: 1 });
      }
      return Promise.resolve({ rows: [], rowCount: 0 });
    });

    const res = await request(app)
      .get('/api/bidding/auction/auction-42/winner')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.data.hasWinner).toBe(true);

    const winner = res.body.data.winner;
    expect(winner.name).toBe('Nina Patel');
    expect(winner.id).toBe('user-winner-99');
  });

  test('SCHOOL_ADMIN gets full name and id field', async () => {
    const token = makeToken({ userId: 'user-admin-3', role: 'SCHOOL_ADMIN', schoolId: 'school-1' });

    mockPool.query.mockImplementation((sql) => {
      const q = typeof sql === 'string' ? sql : (sql?.text || '');
      if (q.includes('FROM bids')) {
        return Promise.resolve({ rows: [makeBiddingWinnerRow({ first_name: 'Tom', last_name: 'Chen', placed_by_user_id: 'user-555' })], rowCount: 1 });
      }
      return Promise.resolve({ rows: [], rowCount: 0 });
    });

    const res = await request(app)
      .get('/api/bidding/auction/auction-42/winner')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.data.winner.name).toBe('Tom Chen');
    expect(res.body.data.winner.id).toBe('user-555');
  });
});
