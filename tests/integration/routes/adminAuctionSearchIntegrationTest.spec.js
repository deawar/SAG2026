/**
 * Admin Auction Search Integration Tests
 * Tests for GET /api/admin/auctions/search (G7)
 */

process.env.NODE_ENV = 'test';
if (!process.env.JWT_ACCESS_SECRET) process.env.JWT_ACCESS_SECRET = 'test-access-secret';
if (!process.env.JWT_REFRESH_SECRET) process.env.JWT_REFRESH_SECRET = 'test-refresh-secret';

// adminService and adminController use pool from models/index directly
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

const SITE_ADMIN_ROW = { id: 'admin-1', role: 'SITE_ADMIN', school_id: null };
const SCHOOL_ADMIN_ROW = { id: 'sadmin-1', role: 'SCHOOL_ADMIN', school_id: 'school-uuid-1' };

const AUCTION_ROW = {
  id: 'auction-1', title: 'Art Show 2026', auction_status: 'LIVE',
  school_id: 'school-uuid-1', starts_at: null, ends_at: null, created_at: new Date(),
  school_name: 'Springfield High', gateway_name: null, gateway_type: null
};

describe('GET /api/admin/auctions/search', () => {
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

  test('returns 401 without a token', async () => {
    const res = await request(app).get('/api/admin/auctions/search?q=art');
    expect(res.status).toBe(401);
  });

  test('returns 403 for non-admin role', async () => {
    const token = makeToken({ userId: 'user-1', role: 'BIDDER', schoolId: null });
    const res = await request(app)
      .get('/api/admin/auctions/search?q=art')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(403);
  });

  test('SITE_ADMIN: empty q returns all auctions (no ILIKE filter)', async () => {
    const token = makeToken({ userId: 'admin-1', role: 'SITE_ADMIN', schoolId: null });

    mockPool.query
      // verifyAdminAccess
      .mockResolvedValueOnce({ rows: [SITE_ADMIN_ROW], rowCount: 1 })
      // main search query
      .mockResolvedValueOnce({ rows: [AUCTION_ROW], rowCount: 1 });

    const res = await request(app)
      .get('/api/admin/auctions/search')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(Array.isArray(res.body.auctions)).toBe(true);
    expect(res.body.auctions).toHaveLength(1);

    // No ILIKE clause when q is empty
    const searchCall = mockPool.query.mock.calls.find(
      ([sql]) => sql && sql.includes('FROM auctions')
    );
    expect(searchCall[0]).not.toMatch(/ILIKE/i);
  });

  test('SITE_ADMIN: ?q=art adds ILIKE clause with parameterised value', async () => {
    const token = makeToken({ userId: 'admin-1', role: 'SITE_ADMIN', schoolId: null });

    mockPool.query
      .mockResolvedValueOnce({ rows: [SITE_ADMIN_ROW], rowCount: 1 })
      .mockResolvedValueOnce({ rows: [AUCTION_ROW], rowCount: 1 });

    const res = await request(app)
      .get('/api/admin/auctions/search?q=art')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.auctions[0].title).toBe('Art Show 2026');

    const searchCall = mockPool.query.mock.calls.find(
      ([sql]) => sql && sql.includes('ILIKE')
    );
    expect(searchCall).toBeDefined();
    // Search term is passed as a parameter ($1), not string-concatenated into SQL
    expect(searchCall[0]).toContain('$1');
    expect(searchCall[1]).toContain('%art%');
  });

  test('SCHOOL_ADMIN: results scoped to own school', async () => {
    const token = makeToken({ userId: 'sadmin-1', role: 'SCHOOL_ADMIN', schoolId: 'school-uuid-1' });

    mockPool.query
      .mockResolvedValueOnce({ rows: [SCHOOL_ADMIN_ROW], rowCount: 1 })
      .mockResolvedValueOnce({ rows: [AUCTION_ROW], rowCount: 1 });

    const res = await request(app)
      .get('/api/admin/auctions/search?q=art')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);

    const searchCall = mockPool.query.mock.calls.find(
      ([sql]) => sql && sql.includes('FROM auctions')
    );
    // school_id scoping clause present
    expect(searchCall[0]).toMatch(/a\.school_id\s*=\s*\$\d/i);
    // school_id value in params
    expect(searchCall[1]).toContain('school-uuid-1');
  });

  test('SCHOOL_ADMIN: no school_id scope for SITE_ADMIN', async () => {
    const token = makeToken({ userId: 'admin-1', role: 'SITE_ADMIN', schoolId: null });

    mockPool.query
      .mockResolvedValueOnce({ rows: [SITE_ADMIN_ROW], rowCount: 1 })
      .mockResolvedValueOnce({ rows: [], rowCount: 0 });

    await request(app)
      .get('/api/admin/auctions/search?q=spring')
      .set('Authorization', `Bearer ${token}`);

    const searchCall = mockPool.query.mock.calls.find(
      ([sql]) => sql && sql.includes('FROM auctions')
    );
    // No school_id filter
    expect(searchCall[0]).not.toMatch(/a\.school_id\s*=/i);
  });
});
