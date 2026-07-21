'use strict';
/**
 * Gallery Transfer/Drop Cascade Integration Tests
 *
 * Verifies that PUT /api/admin/users/:userId/profile fires the three cascade
 * queries (DELETE gallery_roster, DELETE gallery_grant_members, UPDATE portfolio_items)
 * when a student's schoolId changes, and does NOT fire them when schoolId is
 * unchanged or not provided.
 *
 * Uses the same mock pattern as adminCreateUserIntegrationTest.spec.js:
 *   pool.query is mocked at the module level; mockPool.query.mockResolvedValueOnce()
 *   sequences provide canned rows for each call in order.
 */

process.env.NODE_ENV = 'test';
if (!process.env.JWT_ACCESS_SECRET) { process.env.JWT_ACCESS_SECRET = 'test-access-secret'; }
if (!process.env.JWT_REFRESH_SECRET) { process.env.JWT_REFRESH_SECRET = 'test-refresh-secret'; }

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

const SITE_ADMIN_ID = 'site-admin-1';
const STUDENT_ID = 'student-1';
const OLD_SCHOOL_ID = 'school-old';
const NEW_SCHOOL_ID = 'school-new';

// Canned DB responses for the happy-path school-change sequence (SITE_ADMIN, no email change):
// 1. verifyAdminAccess SELECT
// 2. SELECT current user
// 3. UPDATE users SET school_id
// 4. DELETE FROM gallery_roster      ← cascade #1
// 5. DELETE FROM gallery_grant_members ← cascade #2
// 6. UPDATE portfolio_items SET shared_to_gallery = false ← cascade #3
// 7. logAdminAction INSERT
function queueSchoolChange() {
  mockPool.query
    .mockResolvedValueOnce({ rows: [{ id: SITE_ADMIN_ID, role: 'SITE_ADMIN', school_id: null }], rowCount: 1 })  // verifyAdminAccess
    .mockResolvedValueOnce({ rows: [{                                                                              // SELECT current user
      id: STUDENT_ID,
      first_name: 'Kim',
      last_name: 'Student',
      email: 'kim@school.edu',
      phone_number: null,
      school_id: OLD_SCHOOL_ID
    }], rowCount: 1 })
    .mockResolvedValueOnce({ rows: [], rowCount: 1 })   // UPDATE users SET school_id
    .mockResolvedValueOnce({ rows: [], rowCount: 0 })   // DELETE gallery_roster
    .mockResolvedValueOnce({ rows: [], rowCount: 0 })   // DELETE gallery_grant_members
    .mockResolvedValueOnce({ rows: [], rowCount: 0 })   // UPDATE portfolio_items shared_to_gallery=false
    .mockResolvedValueOnce({ rows: [], rowCount: 1 });  // logAdminAction INSERT
}

describe('Gallery transfer/drop cascade (PUT /api/admin/users/:userId/profile)', () => {
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

  // ── happy path ──────────────────────────────────────────────────────────

  test('SITE_ADMIN changes student school → 200 and all three cascade queries fire', async () => {
    const token = makeToken({ userId: SITE_ADMIN_ID, role: 'SITE_ADMIN', twoFaEnabled: true });
    queueSchoolChange();

    const res = await request(app)
      .put(`/api/admin/users/${STUDENT_ID}/profile`)
      .set('Authorization', `Bearer ${token}`)
      .send({ schoolId: NEW_SCHOOL_ID });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);

    const allSql = mockPool.query.mock.calls.map(([sql]) => (typeof sql === 'string' ? sql : ''));

    const rosterDelete = allSql.some(s => /DELETE FROM gallery_roster/i.test(s));
    const membersDelete = allSql.some(s => /DELETE FROM gallery_grant_members/i.test(s));
    const portfolioUpdate = allSql.some(s => /UPDATE portfolio_items SET shared_to_gallery/i.test(s));

    expect(rosterDelete).toBe(true);
    expect(membersDelete).toBe(true);
    expect(portfolioUpdate).toBe(true);
  });

  test('cascade queries fire in the correct order (roster → members → portfolio)', async () => {
    const token = makeToken({ userId: SITE_ADMIN_ID, role: 'SITE_ADMIN', twoFaEnabled: true });
    queueSchoolChange();

    await request(app)
      .put(`/api/admin/users/${STUDENT_ID}/profile`)
      .set('Authorization', `Bearer ${token}`)
      .send({ schoolId: NEW_SCHOOL_ID });

    const allSql = mockPool.query.mock.calls.map(([sql]) => (typeof sql === 'string' ? sql : ''));
    const rIdx = allSql.findIndex(s => /DELETE FROM gallery_roster/i.test(s));
    const mIdx = allSql.findIndex(s => /DELETE FROM gallery_grant_members/i.test(s));
    const pIdx = allSql.findIndex(s => /UPDATE portfolio_items SET shared_to_gallery/i.test(s));

    expect(rIdx).toBeGreaterThan(-1);
    expect(mIdx).toBeGreaterThan(rIdx);
    expect(pIdx).toBeGreaterThan(mIdx);
  });

  // ── no-cascade paths ────────────────────────────────────────────────────

  test('schoolId not provided → cascade does NOT fire', async () => {
    const token = makeToken({ userId: SITE_ADMIN_ID, role: 'SITE_ADMIN', twoFaEnabled: true });

    // Only need verifyAdminAccess, SELECT user, UPDATE users, logAdminAction
    mockPool.query
      .mockResolvedValueOnce({ rows: [{ id: SITE_ADMIN_ID, role: 'SITE_ADMIN', school_id: null }], rowCount: 1 })
      .mockResolvedValueOnce({ rows: [{
        id: STUDENT_ID, first_name: 'Kim', last_name: 'Student',
        email: 'kim@school.edu', phone_number: null, school_id: OLD_SCHOOL_ID
      }], rowCount: 1 })
      .mockResolvedValueOnce({ rows: [], rowCount: 1 })   // UPDATE users
      .mockResolvedValueOnce({ rows: [], rowCount: 1 });  // logAdminAction

    const res = await request(app)
      .put(`/api/admin/users/${STUDENT_ID}/profile`)
      .set('Authorization', `Bearer ${token}`)
      .send({ firstName: 'Kimberly' }); // no schoolId

    expect(res.status).toBe(200);

    const allSql = mockPool.query.mock.calls.map(([sql]) => (typeof sql === 'string' ? sql : ''));
    const rosterDelete = allSql.some(s => /DELETE FROM gallery_roster/i.test(s));
    const membersDelete = allSql.some(s => /DELETE FROM gallery_grant_members/i.test(s));
    const portfolioUpdate = allSql.some(s => /UPDATE portfolio_items SET shared_to_gallery/i.test(s));

    expect(rosterDelete).toBe(false);
    expect(membersDelete).toBe(false);
    expect(portfolioUpdate).toBe(false);
  });

  test('schoolId provided but same as current → cascade does NOT fire', async () => {
    const token = makeToken({ userId: SITE_ADMIN_ID, role: 'SITE_ADMIN', twoFaEnabled: true });

    mockPool.query
      .mockResolvedValueOnce({ rows: [{ id: SITE_ADMIN_ID, role: 'SITE_ADMIN', school_id: null }], rowCount: 1 })
      .mockResolvedValueOnce({ rows: [{
        id: STUDENT_ID, first_name: 'Kim', last_name: 'Student',
        email: 'kim@school.edu', phone_number: null, school_id: OLD_SCHOOL_ID
      }], rowCount: 1 })
      .mockResolvedValueOnce({ rows: [], rowCount: 1 })   // UPDATE users (no-op, same school)
      .mockResolvedValueOnce({ rows: [], rowCount: 1 });  // logAdminAction

    const res = await request(app)
      .put(`/api/admin/users/${STUDENT_ID}/profile`)
      .set('Authorization', `Bearer ${token}`)
      .send({ schoolId: OLD_SCHOOL_ID }); // same school — no cascade

    expect(res.status).toBe(200);

    const allSql = mockPool.query.mock.calls.map(([sql]) => (typeof sql === 'string' ? sql : ''));
    expect(allSql.some(s => /DELETE FROM gallery_roster/i.test(s))).toBe(false);
    expect(allSql.some(s => /DELETE FROM gallery_grant_members/i.test(s))).toBe(false);
    expect(allSql.some(s => /UPDATE portfolio_items SET shared_to_gallery/i.test(s))).toBe(false);
  });
});
