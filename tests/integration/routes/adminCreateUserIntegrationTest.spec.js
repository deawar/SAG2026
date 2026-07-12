/**
 * Admin-Created Staff Accounts — Integration Tests
 *
 * Bug: a super-admin who creates a TEACHER (or admin) via the dashboard used the
 * public /api/auth/register endpoint, which always produced an email-UNVERIFIED,
 * PENDING_APPROVAL account. Such an account could never log in (blocked at the
 * email-verification and approval gates) and therefore never reached the existing
 * first-login 2FA-setup bootstrap.
 *
 * Fix: a dedicated, admin-authenticated POST /api/admin/users that creates staff
 * accounts ACTIVE + email pre-verified (the admin is the vouching authority), so
 * the new staff member can log in once and is routed straight to 2FA setup.
 *
 * Scope: staff roles only (TEACHER, SCHOOL_ADMIN, SITE_ADMIN). STUDENT/BIDDER
 * creation stays on /api/auth/register, which enforces COPPA age-gating.
 *
 * Test harness mirrors teacherApprovalIntegrationTest.spec.js:
 *  - pool.query is mocked at the module level (adminService + UserModel share it)
 *  - Auth via locally-signed JWT
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

// A valid strong password used across tests
const STRONG_PW = 'ValidPass123!@#';

// A created-user row shaped like UserModel.create's RETURNING clause
function createdUserRow(overrides = {}) {
  return {
    id: 'new-teacher-1',
    email: 'newteacher@example.com',
    first_name: 'Pat',
    last_name: 'Teacher',
    phone_number: null,
    role: 'TEACHER',
    school_id: 'school-1',
    created_at: new Date('2026-07-12'),
    account_status: 'ACTIVE',
    requires_parental_consent: false,
    parental_consent_status: 'not_required',
    ...overrides
  };
}

describe('Admin-created staff accounts (POST /api/admin/users)', () => {
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

  // ---------------------------------------------------------------------------
  // Test 1: SITE_ADMIN creates a teacher -> 201, ACTIVE + email pre-verified
  // ---------------------------------------------------------------------------
  test('SITE_ADMIN creates a teacher — 201, account ACTIVE and email pre-verified', async () => {
    const token = makeToken({ userId: 'site-admin-1', role: 'SITE_ADMIN', twoFaEnabled: true });

    mockPool.query
      .mockResolvedValueOnce({ rows: [{ id: 'site-admin-1', role: 'SITE_ADMIN', school_id: null }], rowCount: 1 }) // verifyAdminAccess
      .mockResolvedValueOnce({ rows: [], rowCount: 0 })                    // UserModel.create: email-exists check
      .mockResolvedValueOnce({ rows: [createdUserRow()], rowCount: 1 })    // UserModel.create: INSERT
      .mockResolvedValueOnce({ rows: [], rowCount: 1 })                    // UPDATE email_verified_at
      .mockResolvedValueOnce({ rows: [], rowCount: 0 });                   // logAdminAction

    const res = await request(app)
      .post('/api/admin/users')
      .set('Authorization', `Bearer ${token}`)
      .send({
        firstName: 'Pat',
        lastName: 'Teacher',
        email: 'newteacher@example.com',
        password: STRONG_PW,
        role: 'TEACHER',
        schoolId: 'school-1'
      });

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.user.role).toBe('TEACHER');
    expect(res.body.user.accountStatus).toBe('ACTIVE');

    // The email must be marked verified so first login reaches the 2FA-setup branch
    const issuedEmailVerifyUpdate = mockPool.query.mock.calls.some(
      ([sql]) => typeof sql === 'string' && /email_verified_at/i.test(sql)
    );
    expect(issuedEmailVerifyUpdate).toBe(true);
  });

  // ---------------------------------------------------------------------------
  // Test 2: SCHOOL_ADMIN creates a teacher for own school -> 201
  // ---------------------------------------------------------------------------
  test('SCHOOL_ADMIN creates a teacher for own school — 201', async () => {
    const token = makeToken({ userId: 'admin-1', role: 'SCHOOL_ADMIN', schoolId: 'school-1', twoFaEnabled: true });

    mockPool.query
      .mockResolvedValueOnce({ rows: [{ school_id: 'school-1' }], rowCount: 1 })                                  // authMiddleware school_id hydration
      .mockResolvedValueOnce({ rows: [{ id: 'admin-1', role: 'SCHOOL_ADMIN', school_id: 'school-1' }], rowCount: 1 }) // verifyAdminAccess
      .mockResolvedValueOnce({ rows: [], rowCount: 0 })                    // email-exists check
      .mockResolvedValueOnce({ rows: [createdUserRow()], rowCount: 1 })    // INSERT
      .mockResolvedValueOnce({ rows: [], rowCount: 1 })                    // UPDATE email_verified_at
      .mockResolvedValueOnce({ rows: [], rowCount: 0 });                   // logAdminAction

    const res = await request(app)
      .post('/api/admin/users')
      .set('Authorization', `Bearer ${token}`)
      .send({
        firstName: 'Pat',
        lastName: 'Teacher',
        email: 'newteacher@example.com',
        password: STRONG_PW,
        role: 'TEACHER',
        schoolId: 'school-1'
      });

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
  });

  // ---------------------------------------------------------------------------
  // Test 3: SCHOOL_ADMIN cannot create an admin-level account -> 403
  // ---------------------------------------------------------------------------
  test('SCHOOL_ADMIN cannot create a SITE_ADMIN — 403 INSUFFICIENT_PERMISSIONS', async () => {
    const token = makeToken({ userId: 'admin-1', role: 'SCHOOL_ADMIN', schoolId: 'school-1', twoFaEnabled: true });

    mockPool.query
      .mockResolvedValueOnce({ rows: [{ school_id: 'school-1' }], rowCount: 1 })                                  // authMiddleware hydration
      .mockResolvedValueOnce({ rows: [{ id: 'admin-1', role: 'SCHOOL_ADMIN', school_id: 'school-1' }], rowCount: 1 }); // verifyAdminAccess

    const res = await request(app)
      .post('/api/admin/users')
      .set('Authorization', `Bearer ${token}`)
      .send({
        firstName: 'Sam',
        lastName: 'Boss',
        email: 'boss@example.com',
        password: STRONG_PW,
        role: 'SITE_ADMIN',
        schoolId: 'school-1'
      });

    expect(res.status).toBe(403);
    expect(res.body.error).toBe('INSUFFICIENT_PERMISSIONS');
  });

  // ---------------------------------------------------------------------------
  // Test 4: SCHOOL_ADMIN cannot create a user for a different school -> 403
  // ---------------------------------------------------------------------------
  test('SCHOOL_ADMIN creating for another school — 403 CROSS_SCHOOL_ACCESS_DENIED', async () => {
    const token = makeToken({ userId: 'admin-1', role: 'SCHOOL_ADMIN', schoolId: 'school-1', twoFaEnabled: true });

    mockPool.query
      .mockResolvedValueOnce({ rows: [{ school_id: 'school-1' }], rowCount: 1 })                                  // authMiddleware hydration
      .mockResolvedValueOnce({ rows: [{ id: 'admin-1', role: 'SCHOOL_ADMIN', school_id: 'school-1' }], rowCount: 1 }); // verifyAdminAccess

    const res = await request(app)
      .post('/api/admin/users')
      .set('Authorization', `Bearer ${token}`)
      .send({
        firstName: 'Pat',
        lastName: 'Teacher',
        email: 'newteacher@example.com',
        password: STRONG_PW,
        role: 'TEACHER',
        schoolId: 'school-2'
      });

    expect(res.status).toBe(403);
    expect(res.body.error).toBe('CROSS_SCHOOL_ACCESS_DENIED');
  });

  // ---------------------------------------------------------------------------
  // Test 5: STUDENT/BIDDER roles are rejected (COPPA path is register-only) -> 400
  // ---------------------------------------------------------------------------
  test('creating a STUDENT via admin endpoint is rejected — 400 INVALID_ROLE', async () => {
    const token = makeToken({ userId: 'site-admin-1', role: 'SITE_ADMIN', twoFaEnabled: true });

    mockPool.query
      .mockResolvedValueOnce({ rows: [{ id: 'site-admin-1', role: 'SITE_ADMIN', school_id: null }], rowCount: 1 }); // verifyAdminAccess

    const res = await request(app)
      .post('/api/admin/users')
      .set('Authorization', `Bearer ${token}`)
      .send({
        firstName: 'Kid',
        lastName: 'Student',
        email: 'kid@example.com',
        password: STRONG_PW,
        role: 'STUDENT',
        schoolId: 'school-1'
      });

    expect(res.status).toBe(400);
    expect(res.body.error).toBe('INVALID_ROLE');
  });

  // ---------------------------------------------------------------------------
  // Test 6: Duplicate email -> 409
  // ---------------------------------------------------------------------------
  test('duplicate email — 409 EMAIL_ALREADY_IN_USE', async () => {
    const token = makeToken({ userId: 'site-admin-1', role: 'SITE_ADMIN', twoFaEnabled: true });

    mockPool.query
      .mockResolvedValueOnce({ rows: [{ id: 'site-admin-1', role: 'SITE_ADMIN', school_id: null }], rowCount: 1 }) // verifyAdminAccess
      .mockResolvedValueOnce({ rows: [{ id: 'existing-user' }], rowCount: 1 });                                    // email-exists check -> found

    const res = await request(app)
      .post('/api/admin/users')
      .set('Authorization', `Bearer ${token}`)
      .send({
        firstName: 'Pat',
        lastName: 'Teacher',
        email: 'taken@example.com',
        password: STRONG_PW,
        role: 'TEACHER',
        schoolId: 'school-1'
      });

    expect(res.status).toBe(409);
    expect(res.body.error).toBe('EMAIL_ALREADY_IN_USE');
  });

  // ---------------------------------------------------------------------------
  // Test 7: Weak password -> 400 (validated before creation)
  // ---------------------------------------------------------------------------
  test('weak password — 400', async () => {
    const token = makeToken({ userId: 'site-admin-1', role: 'SITE_ADMIN', twoFaEnabled: true });

    const res = await request(app)
      .post('/api/admin/users')
      .set('Authorization', `Bearer ${token}`)
      .send({
        firstName: 'Pat',
        lastName: 'Teacher',
        email: 'newteacher@example.com',
        password: 'weak',
        role: 'TEACHER',
        schoolId: 'school-1'
      });

    expect(res.status).toBe(400);
  });

  // ---------------------------------------------------------------------------
  // Test 8: Non-admin token cannot create users -> 403
  // ---------------------------------------------------------------------------
  test('non-admin token is rejected — 403', async () => {
    const token = makeToken({ userId: 'teacher-x', role: 'TEACHER', twoFaEnabled: false });

    const res = await request(app)
      .post('/api/admin/users')
      .set('Authorization', `Bearer ${token}`)
      .send({
        firstName: 'Pat',
        lastName: 'Teacher',
        email: 'newteacher@example.com',
        password: STRONG_PW,
        role: 'TEACHER',
        schoolId: 'school-1'
      });

    expect(res.status).toBe(403);
  });
});
