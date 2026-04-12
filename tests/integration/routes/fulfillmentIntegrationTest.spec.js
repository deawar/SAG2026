/**
 * G14 — Fulfillment loop integration tests
 *
 * Tests:
 *  1.  PATCH /api/admin/wins/:id/fulfillment — happy path (mark shipped + tracking)
 *  2.  PATCH /api/admin/wins/:id/fulfillment — returns 404 when bid not found
 *  3.  PATCH /api/admin/wins/:id/fulfillment — returns 403 for non-admin role
 *  4.  PATCH /api/admin/wins/:id/fulfillment — returns 403 for SCHOOL_ADMIN cross-school
 *  5.  PATCH /api/admin/wins/:id/fulfillment — returns 403 when twoFaEnabled=false (requireAdmin2fa)
 *  6.  PATCH /api/admin/wins/:id/fulfillment — returns 400 when no fields provided
 *  7.  GET  /api/user/wins — returns fulfillment fields (shipped, trackingCarrier, etc.)
 *  8.  GET  /api/user/wins — returns shipped=false when shipped_at IS NULL
 *  9.  GET  /api/admin/wins — returns unshipped wins list
 * 10.  notifyArtworkShipped — sends shipped email with tracking info
 * 11.  notifyArtworkShipped — skips send when email_winner pref is false
 */

process.env.NODE_ENV = 'test';
if (!process.env.JWT_ACCESS_SECRET) process.env.JWT_ACCESS_SECRET = 'test-access-secret';
if (!process.env.JWT_REFRESH_SECRET) process.env.JWT_REFRESH_SECRET = 'test-refresh-secret';

// ── Nodemailer mock ──────────────────────────────────────────────────────────
const mockSendMail = jest.fn().mockResolvedValue({ messageId: '<test@example.com>' });
jest.mock('nodemailer', () => ({
  createTransport: jest.fn(() => ({
    sendMail: mockSendMail,
    verify:   jest.fn().mockResolvedValue(true)
  }))
}));

// ── models/index mock (pool used by adminRoutes, tokenBlacklist) ─────────────
jest.mock('../../../src/models/index', () => {
  const actual = jest.requireActual('../../../src/models/index');
  return {
    ...actual,
    pool: { query: jest.fn().mockResolvedValue({ rows: [], rowCount: 0 }) }
  };
});

const { pool: mockPool } = require('../../../src/models/index');

const request = require('supertest');
const jwt     = require('jsonwebtoken');
const { v4: uuidv4 } = require('uuid');
const createTestApp  = require('../../helpers/createTestApp');
const mockDb         = require('../../helpers/mockDb');
const { notifyArtworkShipped, EmailProvider } = require('../../../src/services/notificationService');

const ACCESS_SECRET = process.env.JWT_ACCESS_SECRET;

// ── Helpers ──────────────────────────────────────────────────────────────────

function makeToken(payload = {}) {
  return jwt.sign(
    { sub: 'admin-1', role: 'SITE_ADMIN', twoFaEnabled: true, schoolId: 'school-1', jti: uuidv4(), ...payload },
    ACCESS_SECRET,
    { algorithm: 'HS256', expiresIn: '15m' }
  );
}

function makeBidRow(overrides = {}) {
  return {
    id:                 'bid-1',
    placed_by_user_id:  'user-winner',
    bid_status:         'ACCEPTED',
    shipped_at:         null,
    school_id:          'school-1',
    artwork_title:      'Sunset Over Mountains',
    winner_email:       'winner@example.com',
    winner_first_name:  'Alice',
    ...overrides
  };
}

// ── Admin PATCH tests ────────────────────────────────────────────────────────

describe('G14 — PATCH /api/admin/wins/:id/fulfillment', () => {
  let app;

  beforeEach(() => {
    app = createTestApp();
    mockSendMail.mockClear();
    mockPool.query.mockReset();
    mockPool.query.mockResolvedValue({ rows: [], rowCount: 0 });
    mockDb.reset();
  });

  test('happy path: marks shipped with tracking, returns 200', async () => {
    const token = makeToken();
    const bidId = uuidv4();
    const bid   = makeBidRow({ id: bidId });

    mockPool.query
      .mockResolvedValueOnce({ rows: [], rowCount: 0 })         // tokenBlacklist.isRevoked
      .mockResolvedValueOnce({ rows: [bid], rowCount: 1 })      // SELECT bid for ownership check
      .mockResolvedValueOnce({ rows: [], rowCount: 1 })         // UPDATE bids
      .mockResolvedValue({ rows: [], rowCount: 0 });            // audit log + notifications

    const res = await request(app)
      .patch(`/api/admin/wins/${bidId}/fulfillment`)
      .set('Authorization', `Bearer ${token}`)
      .send({ shipped: true, trackingCarrier: 'UPS', trackingNumber: '1Z999AA10123456784' });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });

  test('returns 404 when bid not found or not ACCEPTED', async () => {
    const token = makeToken();

    mockPool.query
      .mockResolvedValueOnce({ rows: [], rowCount: 0 }) // tokenBlacklist.isRevoked
      .mockResolvedValueOnce({ rows: [], rowCount: 0 }) // SELECT bid → not found
      .mockResolvedValue({ rows: [], rowCount: 0 });

    const res = await request(app)
      .patch(`/api/admin/wins/${uuidv4()}/fulfillment`)
      .set('Authorization', `Bearer ${token}`)
      .send({ shipped: true });

    expect(res.status).toBe(404);
    expect(res.body.success).toBe(false);
  });

  test('returns 403 for non-admin role (BIDDER)', async () => {
    const token = makeToken({ role: 'BIDDER', twoFaEnabled: false });

    mockPool.query
      .mockResolvedValueOnce({ rows: [], rowCount: 0 }) // tokenBlacklist.isRevoked
      .mockResolvedValue({ rows: [], rowCount: 0 });

    const res = await request(app)
      .patch(`/api/admin/wins/${uuidv4()}/fulfillment`)
      .set('Authorization', `Bearer ${token}`)
      .send({ shipped: true });

    expect(res.status).toBe(403);
  });

  test('returns 403 for SCHOOL_ADMIN trying to update a different school\'s win', async () => {
    const token = makeToken({ role: 'SCHOOL_ADMIN', twoFaEnabled: true, schoolId: 'school-A' });
    const bid   = makeBidRow({ school_id: 'school-B' }); // different school

    mockPool.query
      .mockResolvedValueOnce({ rows: [], rowCount: 0 })     // tokenBlacklist.isRevoked
      .mockResolvedValueOnce({ rows: [bid], rowCount: 1 })  // SELECT bid
      .mockResolvedValue({ rows: [], rowCount: 0 });

    const res = await request(app)
      .patch(`/api/admin/wins/${bid.id}/fulfillment`)
      .set('Authorization', `Bearer ${token}`)
      .send({ shipped: true });

    expect(res.status).toBe(403);
    expect(res.body.message).toMatch(/not your school/i);
  });

  test('returns 403 when admin token has twoFaEnabled=false (requireAdmin2fa)', async () => {
    const token = makeToken({ role: 'SITE_ADMIN', twoFaEnabled: false });

    mockPool.query
      .mockResolvedValueOnce({ rows: [], rowCount: 0 }) // tokenBlacklist.isRevoked
      .mockResolvedValue({ rows: [], rowCount: 0 });

    const res = await request(app)
      .patch(`/api/admin/wins/${uuidv4()}/fulfillment`)
      .set('Authorization', `Bearer ${token}`)
      .send({ shipped: true });

    expect(res.status).toBe(403);
    expect(res.body.error).toBe('admin_2fa_required');
  });

  test('returns 400 when no update fields are provided', async () => {
    const token = makeToken();
    const bid   = makeBidRow();

    mockPool.query
      .mockResolvedValueOnce({ rows: [], rowCount: 0 })    // tokenBlacklist.isRevoked
      .mockResolvedValueOnce({ rows: [bid], rowCount: 1 }) // SELECT bid
      .mockResolvedValue({ rows: [], rowCount: 0 });

    const res = await request(app)
      .patch(`/api/admin/wins/${bid.id}/fulfillment`)
      .set('Authorization', `Bearer ${token}`)
      .send({});

    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
  });
});

// ── GET /api/admin/wins ──────────────────────────────────────────────────────

describe('G14 — GET /api/admin/wins', () => {
  let app;

  beforeEach(() => {
    app = createTestApp();
    mockPool.query.mockReset();
    mockPool.query.mockResolvedValue({ rows: [], rowCount: 0 });
    mockDb.reset();
  });

  test('returns unshipped wins list for SITE_ADMIN', async () => {
    const token = makeToken({ role: 'SITE_ADMIN', twoFaEnabled: true });
    const winRow = {
      bidId: 'bid-1', winningBid: 5000, shippedAt: null,
      trackingCarrier: null, trackingNumber: null, deliveredAt: null,
      fulfillmentNotes: null, artworkId: 'aw-1', artworkTitle: 'Cool Art',
      auctionId: 'auc-1', auctionTitle: 'Spring Auction', schoolId: 'school-1',
      winnerId: 'user-1', winnerFirstName: 'Bob', winnerLastName: 'Smith',
      winnerEmail: 'bob@example.com'
    };

    mockPool.query
      .mockResolvedValueOnce({ rows: [], rowCount: 0 })       // tokenBlacklist.isRevoked
      .mockResolvedValueOnce({ rows: [winRow], rowCount: 1 }) // SELECT wins
      .mockResolvedValue({ rows: [], rowCount: 0 });

    const res = await request(app)
      .get('/api/admin/wins')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(Array.isArray(res.body.wins)).toBe(true);
  });
});

// ── GET /api/user/wins ───────────────────────────────────────────────────────

describe('G14 — GET /api/user/wins', () => {
  let app;

  beforeEach(() => {
    app = createTestApp();
    mockPool.query.mockReset();
    mockPool.query.mockResolvedValue({ rows: [], rowCount: 0 });
    mockDb.reset();
  });

  test('returns fulfillment fields when shipped', async () => {
    const token = jwt.sign(
      { sub: 'user-1', role: 'BIDDER', twoFaEnabled: false },
      ACCESS_SECRET,
      { algorithm: 'HS256', expiresIn: '15m' }
    );

    const winRow = {
      bidId: 'bid-1', winningBid: 7500,
      auctionId: 'auc-1', auctionTitle: 'Spring Auction',
      artworkId: 'aw-1', artworkTitle: 'Blue Horizon',
      shipped: true, shippedAt: new Date('2026-04-15T10:00:00Z'),
      trackingCarrier: 'UPS', trackingNumber: '1Z999', delivered: false,
      deliveredAt: null, fulfillmentNotes: null
    };

    // tokenBlacklist.isRevoked uses mockPool
    mockPool.query.mockResolvedValueOnce({ rows: [], rowCount: 0 });
    // wins query uses mockDb (injected db via factory)
    mockDb.query.mockResolvedValueOnce({ rows: [winRow], rowCount: 1 });

    const res = await request(app)
      .get('/api/user/wins')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.wins[0].shipped).toBe(true);
    expect(res.body.wins[0].trackingCarrier).toBe('UPS');
    expect(res.body.wins[0].trackingNumber).toBe('1Z999');
  });

  test('returns shipped=false when shipped_at IS NULL', async () => {
    const token = jwt.sign(
      { sub: 'user-1', role: 'BIDDER', twoFaEnabled: false },
      ACCESS_SECRET,
      { algorithm: 'HS256', expiresIn: '15m' }
    );

    const winRow = {
      bidId: 'bid-2', winningBid: 5000,
      auctionId: 'auc-2', auctionTitle: 'Fall Auction',
      artworkId: 'aw-2', artworkTitle: 'Red Trees',
      shipped: false, shippedAt: null,
      trackingCarrier: null, trackingNumber: null, delivered: false,
      deliveredAt: null, fulfillmentNotes: null
    };

    mockPool.query.mockResolvedValueOnce({ rows: [], rowCount: 0 });
    mockDb.query.mockResolvedValueOnce({ rows: [winRow], rowCount: 1 });

    const res = await request(app)
      .get('/api/user/wins')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.wins[0].shipped).toBe(false);
    expect(res.body.wins[0].trackingCarrier).toBeNull();
  });
});

// ── notifyArtworkShipped unit tests ──────────────────────────────────────────

describe('G14 — notifyArtworkShipped', () => {
  beforeEach(() => mockSendMail.mockClear());

  test('sends shipped email with tracking info', async () => {
    const emailProvider = new EmailProvider({ provider: 'json' });
    const db = { query: jest.fn().mockResolvedValue({ rows: [], rowCount: 0 }) };

    await notifyArtworkShipped(emailProvider, db, {
      userId: 'user-1',
      email: 'winner@example.com',
      firstName: 'Alice',
      artworkTitle: 'Sunset Over Mountains',
      trackingCarrier: 'FedEx',
      trackingNumber: 'FX123456789'
    });

    expect(mockSendMail).toHaveBeenCalledTimes(1);
    const call = mockSendMail.mock.calls[0][0];
    expect(call.to).toBe('winner@example.com');
    expect(call.subject).toMatch(/shipped/i);
    expect(call.html).toMatch(/FedEx/);
    expect(call.html).toMatch(/FX123456789/);
  });

  test('skips send when email_winner preference is false', async () => {
    const emailProvider = new EmailProvider({ provider: 'json' });
    const db = {
      query: jest.fn().mockResolvedValue({
        rows: [{ email_winner: false }], rowCount: 1
      })
    };

    await notifyArtworkShipped(emailProvider, db, {
      userId: 'user-2',
      email: 'quiet@example.com',
      firstName: 'Bob',
      artworkTitle: 'Blue Sky',
      trackingCarrier: null,
      trackingNumber: null
    });

    expect(mockSendMail).not.toHaveBeenCalled();
  });
});
