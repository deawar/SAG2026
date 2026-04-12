/**
 * Admin Reports Summary Integration Tests
 * Tests for GET /api/admin/reports (G8)
 */

process.env.NODE_ENV = 'test';
if (!process.env.JWT_ACCESS_SECRET) process.env.JWT_ACCESS_SECRET = 'test-access-secret';
if (!process.env.JWT_REFRESH_SECRET) process.env.JWT_REFRESH_SECRET = 'test-refresh-secret';

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

describe('GET /api/admin/reports', () => {
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
    const res = await request(app).get('/api/admin/reports');
    expect(res.status).toBe(401);
  });

  test('returns 403 for non-admin role', async () => {
    const token = makeToken({ userId: 'user-1', role: 'BIDDER', schoolId: null });
    const res = await request(app)
      .get('/api/admin/reports')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(403);
  });

  test('SITE_ADMIN: returns summary with all four report types', async () => {
    const token = makeToken({ userId: 'admin-1', role: 'SITE_ADMIN', schoolId: null });

    mockPool.query
      // verifyAdminAccess
      .mockResolvedValueOnce({ rows: [SITE_ADMIN_ROW], rowCount: 1 })
      // compliance_reports count query
      .mockResolvedValueOnce({
        rows: [
          { report_type: 'GDPR', count: '3' },
          { report_type: 'COPPA', count: '1' }
        ],
        rowCount: 2
      });

    const res = await request(app)
      .get('/api/admin/reports')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    const { reports } = res.body;
    expect(reports).toHaveProperty('gdpr');
    expect(reports).toHaveProperty('coppa');
    expect(reports).toHaveProperty('ferpa');
    expect(reports).toHaveProperty('ccpa');
    expect(reports.gdpr.value).toBe('3 reports generated');
    expect(reports.coppa.value).toBe('1 report generated');
    expect(reports.ferpa.value).toBe('0 reports generated');
  });

  test('SITE_ADMIN: count query has no school_id filter', async () => {
    const token = makeToken({ userId: 'admin-1', role: 'SITE_ADMIN', schoolId: null });

    mockPool.query
      .mockResolvedValueOnce({ rows: [SITE_ADMIN_ROW], rowCount: 1 })
      .mockResolvedValueOnce({ rows: [], rowCount: 0 });

    await request(app)
      .get('/api/admin/reports')
      .set('Authorization', `Bearer ${token}`);

    const countCall = mockPool.query.mock.calls.find(
      ([sql]) => sql && sql.includes('compliance_reports')
    );
    expect(countCall).toBeDefined();
    expect(countCall[0]).not.toMatch(/school_id\s*=\s*\$\d/i);
  });

  test('SCHOOL_ADMIN: count query scoped to own school', async () => {
    const token = makeToken({ userId: 'sadmin-1', role: 'SCHOOL_ADMIN', schoolId: 'school-uuid-1' });

    mockPool.query
      .mockResolvedValueOnce({ rows: [SCHOOL_ADMIN_ROW], rowCount: 1 })
      .mockResolvedValueOnce({ rows: [], rowCount: 0 });

    const res = await request(app)
      .get('/api/admin/reports')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);

    const countCall = mockPool.query.mock.calls.find(
      ([sql]) => sql && sql.includes('compliance_reports')
    );
    expect(countCall).toBeDefined();
    expect(countCall[0]).toMatch(/school_id\s*=\s*\$\d/i);
    expect(countCall[1]).toContain('school-uuid-1');
  });

  test('each report entry has title, description, value', async () => {
    const token = makeToken({ userId: 'admin-1', role: 'SITE_ADMIN', schoolId: null });

    mockPool.query
      .mockResolvedValueOnce({ rows: [SITE_ADMIN_ROW], rowCount: 1 })
      .mockResolvedValueOnce({ rows: [], rowCount: 0 });

    const res = await request(app)
      .get('/api/admin/reports')
      .set('Authorization', `Bearer ${token}`);

    const { reports } = res.body;
    for (const key of ['gdpr', 'coppa', 'ferpa', 'ccpa']) {
      expect(reports[key]).toHaveProperty('title');
      expect(reports[key]).toHaveProperty('description');
      expect(reports[key]).toHaveProperty('value');
    }
  });
});
