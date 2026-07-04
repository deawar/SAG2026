/**
 * Admin Report CSV Export Integration Tests
 *
 * Guards the SQL column names used by the CSV export queries. A mock pool
 * cannot throw on a bad column name (it returns whatever we tell it), so these
 * tests inspect the SQL string actually passed to pool.query and assert it uses
 * columns that exist in the real schema. This catches the class of bug where an
 * export 500s in production because it references a non-existent column.
 */

process.env.NODE_ENV = 'test';
if (!process.env.JWT_ACCESS_SECRET) {process.env.JWT_ACCESS_SECRET = 'test-access-secret';}
if (!process.env.JWT_REFRESH_SECRET) {process.env.JWT_REFRESH_SECRET = 'test-refresh-secret';}

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
function makeToken(payload) { return jwt.sign(payload, SECRET, { algorithm: 'HS256' }); }

const SITE_ADMIN_ROW = { id: 'admin-1', role: 'SITE_ADMIN', school_id: null };

/** Concatenate every SQL string passed to the mock pool for this request. */
function allSql() {
  return mockPool.query.mock.calls.map(c => c[0]).join('\n---\n');
}

describe('Admin report CSV export', () => {
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

  function siteAdminToken() {
    return makeToken({ userId: 'admin-1', role: 'SITE_ADMIN', schoolId: null, twoFaEnabled: true });
  }

  test('performance export succeeds and uses real bids/auctions columns', async () => {
    mockPool.query
      .mockResolvedValueOnce({ rows: [SITE_ADMIN_ROW], rowCount: 1 }) // verifyAdminAccess
      .mockResolvedValueOnce({ rows: [], rowCount: 0 });               // performance query

    const res = await request(app)
      .get('/api/admin/reports/performance/export')
      .set('Authorization', `Bearer ${siteAdminToken()}`);

    expect(res.status).toBe(200);

    const sql = allSql();
    // Correct columns that exist in the schema
    expect(sql).toMatch(/b\.bid_amount/);
    expect(sql).toMatch(/a\.starts_at/);
    expect(sql).toMatch(/a\.ends_at/);
    // Wrong columns that would 500 against a real Postgres
    expect(sql).not.toMatch(/b\.amount\b/);
    expect(sql).not.toMatch(/a\.start_date\b/);
    expect(sql).not.toMatch(/a\.end_date\b/);
  });

  test('compliance export uses real compliance_reports columns', async () => {
    mockPool.query
      .mockResolvedValueOnce({ rows: [SITE_ADMIN_ROW], rowCount: 1 }) // verifyAdminAccess
      .mockResolvedValueOnce({ rows: [], rowCount: 0 });               // compliance query

    const res = await request(app)
      .get('/api/admin/reports/compliance/export')
      .set('Authorization', `Bearer ${siteAdminToken()}`);

    expect(res.status).toBe(200);

    const sql = allSql();
    // Correct columns that exist in the schema
    expect(sql).toMatch(/report_period_start/);
    expect(sql).toMatch(/report_period_end/);
    expect(sql).toMatch(/generated_by_user_id/);
    // Wrong columns that would 500 against a real Postgres
    expect(sql).not.toMatch(/cr\.start_date\b/);
    expect(sql).not.toMatch(/cr\.end_date\b/);
    expect(sql).not.toMatch(/cr\.generated_by\b/);
  });

  test('all four export endpoints return 200 (routing + handler wired)', async () => {
    for (const type of ['revenue', 'activity', 'performance', 'compliance']) {
      mockPool.query.mockReset();
      mockPool.query
        .mockResolvedValueOnce({ rows: [SITE_ADMIN_ROW], rowCount: 1 }) // verifyAdminAccess
        .mockResolvedValueOnce({ rows: [], rowCount: 0 });               // report query

      const res = await request(app)
        .get(`/api/admin/reports/${type}/export`)
        .set('Authorization', `Bearer ${siteAdminToken()}`);

      expect(res.status).toBe(200);
      expect(res.headers['content-type']).toMatch(/text\/csv/);
    }
  });
});
