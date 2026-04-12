/**
 * Email Verification Integration Tests (G11)
 * Tests for:
 *   POST /api/auth/register   → requires verification, no JWT
 *   POST /api/auth/login      → blocked until verified
 *   GET  /api/auth/verify-email → verifies token, activates account
 *   POST /api/auth/resend-verification → always 200
 */

process.env.NODE_ENV = 'test';
if (!process.env.JWT_ACCESS_SECRET) process.env.JWT_ACCESS_SECRET = 'test-access-secret';
if (!process.env.JWT_REFRESH_SECRET) process.env.JWT_REFRESH_SECRET = 'test-refresh-secret';

const request = require('supertest');
const createTestApp = require('../../helpers/createTestApp');
const mockDb = require('../../helpers/mockDb');

// ── helpers ──────────────────────────────────────────────────────────────────

const VALID_USER = {
  email: 'verify-test@example.com',
  password: 'SecurePass123!',
  firstName: 'Alice',
  lastName: 'Tester',
};

const NEW_USER_ROW = {
  id: 'user-verify-1',
  email: VALID_USER.email,
  first_name: 'Alice',
  last_name: 'Tester',
  role: 'STUDENT',
  school_id: null,
  account_status: 'PENDING',
  created_at: new Date(),
};

// A verified user row (returned by getByEmail after verification)
const VERIFIED_USER_ROW = {
  ...NEW_USER_ROW,
  account_status: 'ACTIVE',
  email_verified_at: new Date(),
  password_hash: '$2b$12$placeholder', // not actually checked — we mock checkPassword
  two_fa_enabled: false,
};

// Unverified user row (returned by getByEmail before verification)
const UNVERIFIED_USER_ROW = {
  ...NEW_USER_ROW,
  email_verified_at: null,
  password_hash: '$2b$12$placeholder',
  two_fa_enabled: false,
};

// ─────────────────────────────────────────────────────────────────────────────

describe('Email Verification flow', () => {
  let app;

  beforeEach(() => {
    app = createTestApp();
  });

  // ── Register ───────────────────────────────────────────────────────────────

  describe('POST /api/auth/register', () => {
    test('returns 201 with requiresVerification=true and no accessToken', async () => {
      mockDb.query
        // email uniqueness check → no existing user
        .mockResolvedValueOnce({ rows: [], rowCount: 0 })
        // INSERT users → new user row
        .mockResolvedValueOnce({ rows: [NEW_USER_ROW], rowCount: 1 })
        // setVerificationToken UPDATE
        .mockResolvedValueOnce({ rows: [], rowCount: 1 });

      const res = await request(app)
        .post('/api/auth/register')
        .send(VALID_USER);

      expect(res.status).toBe(201);
      expect(res.body.ok).toBe(true);
      expect(res.body.requiresVerification).toBe(true);
      expect(res.body).not.toHaveProperty('accessToken');
      expect(res.body).not.toHaveProperty('data');
    });
  });

  // ── Login blocked before verification ─────────────────────────────────────

  describe('POST /api/auth/login — unverified', () => {
    test('returns 403 with error=email_not_verified', async () => {
      mockDb.query
        // getByEmail → unverified user
        .mockResolvedValueOnce({ rows: [UNVERIFIED_USER_ROW], rowCount: 1 });

      const res = await request(app)
        .post('/api/auth/login')
        .send({ email: VALID_USER.email, password: VALID_USER.password });

      expect(res.status).toBe(403);
      expect(res.body.error).toBe('email_not_verified');
    });
  });

  // ── GET /verify-email ──────────────────────────────────────────────────────

  describe('GET /api/auth/verify-email', () => {
    test('returns 400 when uid or token missing', async () => {
      const res = await request(app).get('/api/auth/verify-email?uid=only-uid');
      expect(res.status).toBe(400);
    });

    test('returns 400 when token hash does not match (invalid/expired)', async () => {
      mockDb.query
        // verifyEmailToken UPDATE finds no matching row
        .mockResolvedValueOnce({ rows: [], rowCount: 0 });

      const res = await request(app)
        .get('/api/auth/verify-email?uid=user-1&token=wrongtoken');

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
    });

    test('returns 200 { ok: true } when token matches', async () => {
      mockDb.query
        // verifyEmailToken UPDATE succeeds
        .mockResolvedValueOnce({ rows: [{ id: 'user-verify-1' }], rowCount: 1 });

      const res = await request(app)
        .get('/api/auth/verify-email?uid=user-verify-1&token=validrawtoken123');

      expect(res.status).toBe(200);
      expect(res.body.ok).toBe(true);
    });

    test('verify endpoint issues parameterised UPDATE with sha256 hash', async () => {
      const crypto = require('crypto');
      const rawToken = 'mytesttoken';
      const expectedHash = crypto.createHash('sha256').update(rawToken).digest('hex');

      mockDb.query
        .mockResolvedValueOnce({ rows: [{ id: 'u1' }], rowCount: 1 });

      await request(app)
        .get(`/api/auth/verify-email?uid=u1&token=${rawToken}`);

      const updateCall = mockDb.query.mock.calls.find(
        ([sql]) => sql && sql.includes('UPDATE users') && sql.includes('email_verified_at')
      );
      expect(updateCall).toBeDefined();
      // Token hash (not raw token) is passed as a DB parameter
      expect(updateCall[1]).toContain(expectedHash);
      expect(updateCall[1]).not.toContain(rawToken);
    });
  });

  // ── Resend verification ────────────────────────────────────────────────────

  describe('POST /api/auth/resend-verification', () => {
    test('always returns 200 { ok: true } (no enumeration)', async () => {
      // No mockDb config needed — unknown email → getByEmail returns []
      const res = await request(app)
        .post('/api/auth/resend-verification')
        .send({ email: 'unknown@example.com' });

      expect(res.status).toBe(200);
      expect(res.body.ok).toBe(true);
    });

    test('re-issues token when user is unverified', async () => {
      mockDb.query
        // getByEmail → unverified user
        .mockResolvedValueOnce({ rows: [UNVERIFIED_USER_ROW], rowCount: 1 })
        // setVerificationToken UPDATE
        .mockResolvedValueOnce({ rows: [], rowCount: 1 });

      const res = await request(app)
        .post('/api/auth/resend-verification')
        .send({ email: VALID_USER.email });

      expect(res.status).toBe(200);
      expect(res.body.ok).toBe(true);

      const updateCall = mockDb.query.mock.calls.find(
        ([sql]) => sql && sql.includes('UPDATE users') && sql.includes('email_verification_token')
      );
      expect(updateCall).toBeDefined();
    });

    test('does nothing (silently) when user is already verified', async () => {
      mockDb.query
        // getByEmail → verified user (email_verified_at is set)
        .mockResolvedValueOnce({ rows: [VERIFIED_USER_ROW], rowCount: 1 });

      const res = await request(app)
        .post('/api/auth/resend-verification')
        .send({ email: VALID_USER.email });

      expect(res.status).toBe(200);
      // No UPDATE should have been issued
      const updateCall = mockDb.query.mock.calls.find(
        ([sql]) => sql && sql.includes('UPDATE users') && sql.includes('email_verification_token')
      );
      expect(updateCall).toBeUndefined();
    });
  });
});
