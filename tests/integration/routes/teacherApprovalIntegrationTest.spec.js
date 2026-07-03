/**
 * Teacher Approval Gate — Integration Tests
 *
 * Task 1: Gate self-registered TEACHER accounts behind SCHOOL_ADMIN approval.
 *
 * Uses the real test harness:
 *  - mockDb stubs UserModel queries (injected via createApp)
 *  - mockPool stubs pool.query calls in adminService / authMiddleware
 *  - Auth via locally-signed JWT (no live login calls)
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

describe('Teacher approval gate', () => {
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
  // Test 1: Registration returns requiresApproval=true for teachers
  // ---------------------------------------------------------------------------
  test('self-registered teacher registration returns requiresApproval=true', async () => {
    // UserModel.create calls:
    //   1. SELECT (email exists check) -> no rows
    //   2. INSERT -> returns user row
    // UserModel.setVerificationToken:
    //   3. UPDATE -> sets token
    mockDb.query
      .mockResolvedValueOnce({ rows: [], rowCount: 0 })          // email exists check
      .mockResolvedValueOnce({                                     // INSERT user
        rows: [{ id: 'teacher-1', email: 'teacher@example.com', first_name: 'Pat' }],
        rowCount: 1
      })
      .mockResolvedValueOnce({ rows: [], rowCount: 1 });          // setVerificationToken

    const res = await request(app).post('/api/auth/register').send({
      firstName: 'Pat',
      lastName: 'Teacher',
      email: 'teacher@example.com',
      password: 'ValidPass123!@#',
      accountType: 'teacher',
      dateOfBirth: '1990-01-01',
      schoolId: 'school-1'
    });

    expect(res.status).toBe(201);
    expect(res.body.ok).toBe(true);
    expect(res.body.requiresApproval).toBe(true);
    expect(res.body.requiresVerification).toBe(true);
  });

  // ---------------------------------------------------------------------------
  // Test 2: Non-teacher registration does NOT return requiresApproval
  // ---------------------------------------------------------------------------
  test('self-registered bidder does NOT get requiresApproval flag', async () => {
    mockDb.query
      .mockResolvedValueOnce({ rows: [], rowCount: 0 })          // email exists check
      .mockResolvedValueOnce({
        rows: [{ id: 'bidder-1', email: 'bidder@example.com', first_name: 'Bob' }],
        rowCount: 1
      })
      .mockResolvedValueOnce({ rows: [], rowCount: 1 });          // setVerificationToken

    const res = await request(app).post('/api/auth/register').send({
      firstName: 'Bob',
      lastName: 'Bidder',
      email: 'bidder@example.com',
      password: 'ValidPass123!@#',
      accountType: 'bidder'
    });

    expect(res.status).toBe(201);
    expect(res.body.requiresApproval).toBeFalsy();
  });

  // ---------------------------------------------------------------------------
  // Test 3: Login blocked for verified teacher still in PENDING_APPROVAL
  // ---------------------------------------------------------------------------
  test('verified teacher with PENDING_APPROVAL status cannot log in', async () => {
    // getByEmail returns a teacher who is email_verified_at but still PENDING_APPROVAL.
    // Password check runs FIRST (security reorder Task 6), so the hash must match the
    // supplied password so the request reaches the state-403 guard.
    // Hash below matches 'ValidPass123!@#' (bcrypt, 10 rounds).
    mockDb.query
      .mockResolvedValueOnce({
        rows: [{
          id: 'teacher-1',
          email: 'teacher@example.com',
          password_hash: '$2b$10$sSHC/GTNoeDgt/u.lll/PeCCpykyWJyCKzoC0VtZwduy8OxbPSb8m',
          role: 'TEACHER',
          account_status: 'PENDING_APPROVAL',
          email_verified_at: new Date('2026-01-01'),
          two_fa_enabled: false,
          requires_parental_consent: false,
          parental_consent_status: 'not_required',
          school_id: 'school-1'
        }],
        rowCount: 1
      });

    const res = await request(app).post('/api/auth/login').send({
      email: 'teacher@example.com',
      password: 'ValidPass123!@#'
    });

    // Should get 403 with pending_teacher_approval error
    expect(res.status).toBe(403);
    expect(res.body.error).toBe('pending_teacher_approval');
  });

  // ---------------------------------------------------------------------------
  // Test 4: Login is also blocked for email-unverified teacher in PENDING_APPROVAL
  // ---------------------------------------------------------------------------
  test('unverified teacher with PENDING_APPROVAL status gets email_not_verified', async () => {
    // Password check runs FIRST (security reorder Task 6), so the hash must match the
    // supplied password so the request reaches the state-403 guard.
    // Hash below matches 'ValidPass123!@#' (bcrypt, 10 rounds).
    mockDb.query
      .mockResolvedValueOnce({
        rows: [{
          id: 'teacher-1',
          email: 'teacher@example.com',
          password_hash: '$2b$10$sSHC/GTNoeDgt/u.lll/PeCCpykyWJyCKzoC0VtZwduy8OxbPSb8m',
          role: 'TEACHER',
          account_status: 'PENDING_APPROVAL',
          email_verified_at: null,   // Not yet verified
          two_fa_enabled: false,
          requires_parental_consent: false,
          parental_consent_status: 'not_required',
          school_id: 'school-1'
        }],
        rowCount: 1
      });

    const res = await request(app).post('/api/auth/login').send({
      email: 'teacher@example.com',
      password: 'ValidPass123!@#'
    });

    // Email check comes before pending check, so this should be email_not_verified
    expect(res.status).toBe(403);
    expect(res.body.error).toBe('email_not_verified');
  });

  // ---------------------------------------------------------------------------
  // Test 5: SCHOOL_ADMIN can approve teacher of own school (200)
  // ---------------------------------------------------------------------------
  test('SCHOOL_ADMIN approves teacher of own school — returns 200 with ACTIVE status', async () => {
    const token = makeToken({
      userId: 'admin-1',
      role: 'SCHOOL_ADMIN',
      schoolId: 'school-1',
      twoFaEnabled: true
    });

    // adminService.approveTeacher calls:
    //   1. verifyAdminAccess: SELECT id, role, school_id FROM users WHERE id=$1 AND account_status='ACTIVE'
    //   2. target teacher lookup: SELECT id, role, school_id, account_status FROM users WHERE id=$1 AND deleted_at IS NULL
    //   3. UPDATE users SET account_status='ACTIVE' WHERE id=$1 RETURNING id, account_status
    // Note: authMiddleware also calls pool.query for SCHOOL_ADMIN school_id hydration
    //       BUT pool is null in test (NODE_ENV=test), so it falls back to JWT claim.
    //       Actually pool IS mocked (not null), so mockPool handles it.
    // authMiddleware school_id hydration (SCHOOL_ADMIN):
    //   pool.query('SELECT school_id FROM users WHERE id=$1 AND deleted_at IS NULL')
    mockPool.query
      .mockResolvedValueOnce({ rows: [{ school_id: 'school-1' }], rowCount: 1 })  // auth middleware school_id hydration
      .mockResolvedValueOnce({ rows: [{ id: 'admin-1', role: 'SCHOOL_ADMIN', school_id: 'school-1' }], rowCount: 1 })  // verifyAdminAccess
      .mockResolvedValueOnce({ rows: [{ id: 'teacher-1', role: 'TEACHER', school_id: 'school-1', account_status: 'PENDING_APPROVAL' }], rowCount: 1 })  // teacher lookup
      .mockResolvedValueOnce({ rows: [{ id: 'teacher-1', account_status: 'ACTIVE' }], rowCount: 1 })  // UPDATE
      .mockResolvedValueOnce({ rows: [], rowCount: 0 }); // logAdminAction (best-effort)

    const res = await request(app)
      .post('/api/admin/users/teacher-1/approve-teacher')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.result.account_status).toBe('ACTIVE');
  });

  // ---------------------------------------------------------------------------
  // Test 6: SCHOOL_ADMIN of different school gets 403
  // ---------------------------------------------------------------------------
  test('SCHOOL_ADMIN from different school cannot approve teacher — returns 403', async () => {
    const token = makeToken({
      userId: 'admin-2',
      role: 'SCHOOL_ADMIN',
      schoolId: 'school-2',  // Different school
      twoFaEnabled: true
    });

    mockPool.query
      .mockResolvedValueOnce({ rows: [{ school_id: 'school-2' }], rowCount: 1 })  // auth middleware school_id hydration
      .mockResolvedValueOnce({ rows: [{ id: 'admin-2', role: 'SCHOOL_ADMIN', school_id: 'school-2' }], rowCount: 1 })  // verifyAdminAccess
      .mockResolvedValueOnce({ rows: [{ id: 'teacher-1', role: 'TEACHER', school_id: 'school-1', account_status: 'PENDING_APPROVAL' }], rowCount: 1 }); // teacher lookup — different school

    const res = await request(app)
      .post('/api/admin/users/teacher-1/approve-teacher')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(403);
    expect(res.body.error).toBe('CROSS_SCHOOL_ACCESS_DENIED');
  });

  // ---------------------------------------------------------------------------
  // Test 7: SITE_ADMIN can approve any teacher
  // ---------------------------------------------------------------------------
  test('SITE_ADMIN can approve any teacher regardless of school', async () => {
    const token = makeToken({
      userId: 'site-admin-1',
      role: 'SITE_ADMIN',
      twoFaEnabled: true
    });

    // SITE_ADMIN: no school_id hydration call (only SCHOOL_ADMIN gets that)
    mockPool.query
      .mockResolvedValueOnce({ rows: [{ id: 'site-admin-1', role: 'SITE_ADMIN', school_id: null }], rowCount: 1 })  // verifyAdminAccess
      .mockResolvedValueOnce({ rows: [{ id: 'teacher-1', role: 'TEACHER', school_id: 'school-1', account_status: 'PENDING_APPROVAL' }], rowCount: 1 })  // teacher lookup
      .mockResolvedValueOnce({ rows: [{ id: 'teacher-1', account_status: 'ACTIVE' }], rowCount: 1 })  // UPDATE
      .mockResolvedValueOnce({ rows: [], rowCount: 0 }); // logAdminAction

    const res = await request(app)
      .post('/api/admin/users/teacher-1/approve-teacher')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.result.account_status).toBe('ACTIVE');
  });

  // ---------------------------------------------------------------------------
  // Test 8: Cannot approve a non-TEACHER user
  // ---------------------------------------------------------------------------
  test('approving a non-TEACHER returns 400 (INVALID_STATE_TRANSITION)', async () => {
    const token = makeToken({
      userId: 'site-admin-1',
      role: 'SITE_ADMIN',
      twoFaEnabled: true
    });

    mockPool.query
      .mockResolvedValueOnce({ rows: [{ id: 'site-admin-1', role: 'SITE_ADMIN', school_id: null }], rowCount: 1 })
      .mockResolvedValueOnce({ rows: [{ id: 'student-1', role: 'STUDENT', school_id: 'school-1', account_status: 'PENDING_APPROVAL' }], rowCount: 1 });

    const res = await request(app)
      .post('/api/admin/users/student-1/approve-teacher')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(400);
  });

  // ---------------------------------------------------------------------------
  // Test 9: Cannot approve a teacher who is already ACTIVE
  // ---------------------------------------------------------------------------
  test('approving an already-ACTIVE teacher returns 400', async () => {
    const token = makeToken({
      userId: 'site-admin-1',
      role: 'SITE_ADMIN',
      twoFaEnabled: true
    });

    mockPool.query
      .mockResolvedValueOnce({ rows: [{ id: 'site-admin-1', role: 'SITE_ADMIN', school_id: null }], rowCount: 1 })
      .mockResolvedValueOnce({ rows: [{ id: 'teacher-1', role: 'TEACHER', school_id: 'school-1', account_status: 'ACTIVE' }], rowCount: 1 });

    const res = await request(app)
      .post('/api/admin/users/teacher-1/approve-teacher')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(400);
  });

  // ---------------------------------------------------------------------------
  // Test 10: Non-admin cannot access the approve-teacher endpoint
  // ---------------------------------------------------------------------------
  test('non-admin token is rejected with 403', async () => {
    const token = makeToken({
      userId: 'teacher-x',
      role: 'TEACHER',
      twoFaEnabled: false
    });

    const res = await request(app)
      .post('/api/admin/users/teacher-1/approve-teacher')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(403);
  });

  // ---------------------------------------------------------------------------
  // Test 11: approve-teacher for nonexistent user returns 404
  // ---------------------------------------------------------------------------
  test('approve-teacher for nonexistent user returns 404', async () => {
    const token = makeToken({
      userId: 'site-admin-1',
      role: 'SITE_ADMIN',
      twoFaEnabled: true
    });

    mockPool.query
      .mockResolvedValueOnce({ rows: [{ id: 'site-admin-1', role: 'SITE_ADMIN', school_id: null }], rowCount: 1 })
      .mockResolvedValueOnce({ rows: [], rowCount: 0 });  // user not found

    const res = await request(app)
      .post('/api/admin/users/nonexistent/approve-teacher')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(404);
  });
});
