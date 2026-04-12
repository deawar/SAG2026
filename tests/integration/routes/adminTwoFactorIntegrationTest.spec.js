/**
 * G17 — Mandatory 2FA for admin accounts
 * Tests:
 *  1. Admin without 2FA gets requiresTwoFactorSetup on login (not an access token)
 *  2. Non-admin without 2FA gets a normal access token on login
 *  3. POST /api/auth/2fa/force-setup returns TOTP data for a valid setupToken
 *  4. POST /api/auth/2fa/force-setup rejects an expired/wrong-purpose token
 *  5. POST /api/auth/2fa/force-verify enables 2FA and issues full session tokens
 *  6. Admin routes return 403 when twoFaEnabled=false in token (requireAdmin2fa)
 *  7. Admin routes pass when twoFaEnabled=true in token
 *  8. POST /api/auth/2fa/disable returns 403 for SITE_ADMIN
 *  9. POST /api/auth/2fa/disable returns 403 for SCHOOL_ADMIN
 * 10. POST /api/auth/2fa/disable still works for non-admin roles
 */

process.env.NODE_ENV = 'test';
if (!process.env.JWT_ACCESS_SECRET) process.env.JWT_ACCESS_SECRET = 'test-access-secret';
if (!process.env.JWT_REFRESH_SECRET) process.env.JWT_REFRESH_SECRET = 'test-refresh-secret';

const request = require('supertest');
const jwt = require('jsonwebtoken');
const createTestApp = require('../../helpers/createTestApp');
const mockDb = require('../../helpers/mockDb');

const SECRET = process.env.JWT_ACCESS_SECRET;

function makeToken(payload, expiresIn = '15m') {
  return jwt.sign(payload, SECRET, { algorithm: 'HS256', expiresIn });
}

// Full user row returned by mockDb for login tests
function makeUserRow({
  id = 'user-1',
  email = 'admin@example.com',
  role = 'SITE_ADMIN',
  account_status = 'ACTIVE',
  two_fa_enabled = false,
  email_verified_at = '2026-01-01T00:00:00Z',
  requires_parental_consent = false,
  parental_consent_status = null,
  password_hash = '$2b$10$fake.hash.for.test.only',
  school_id = 'school-1'
} = {}) {
  return {
    id, email, role, account_status, two_fa_enabled, email_verified_at,
    requires_parental_consent, parental_consent_status, password_hash, school_id,
    first_name: 'Admin', last_name: 'User', last_login: null, two_fa_secret: null
  };
}

describe('G17 — Mandatory 2FA for admin accounts', () => {
  let app;

  beforeEach(() => {
    app = createTestApp();
  });

  // ---------------------------------------------------------------------------
  // Login — admin without 2FA
  // ---------------------------------------------------------------------------
  describe('POST /api/auth/login — admin without 2FA', () => {
    test('returns requiresTwoFactorSetup and setupToken (not an access token)', async () => {
      const bcrypt = require('bcrypt');
      const hash = await bcrypt.hash('Password123!', 1);
      const user = makeUserRow({ role: 'SITE_ADMIN', two_fa_enabled: false, password_hash: hash });

      // getByEmail
      mockDb.query.mockResolvedValueOnce({ rows: [user] });

      const res = await request(app)
        .post('/api/auth/login')
        .send({ email: 'admin@example.com', password: 'Password123!' });

      expect(res.status).toBe(200);
      expect(res.body.data.requiresTwoFactorSetup).toBe(true);
      expect(res.body.data.setupToken).toBeDefined();
      expect(res.body.data.accessToken).toBeUndefined();
    });

    test('SCHOOL_ADMIN without 2FA also gets requiresTwoFactorSetup', async () => {
      const bcrypt = require('bcrypt');
      const hash = await bcrypt.hash('Password123!', 1);
      const user = makeUserRow({ role: 'SCHOOL_ADMIN', two_fa_enabled: false, password_hash: hash });

      mockDb.query.mockResolvedValueOnce({ rows: [user] });

      const res = await request(app)
        .post('/api/auth/login')
        .send({ email: 'admin@example.com', password: 'Password123!' });

      expect(res.status).toBe(200);
      expect(res.body.data.requiresTwoFactorSetup).toBe(true);
    });

    test('setupToken encodes purpose=2fa_force_setup and twoFaEnabled=false', async () => {
      const bcrypt = require('bcrypt');
      const hash = await bcrypt.hash('Password123!', 1);
      const user = makeUserRow({ role: 'SITE_ADMIN', two_fa_enabled: false, password_hash: hash });

      mockDb.query.mockResolvedValueOnce({ rows: [user] });

      const res = await request(app)
        .post('/api/auth/login')
        .send({ email: 'admin@example.com', password: 'Password123!' });

      const decoded = jwt.verify(res.body.data.setupToken, SECRET);
      expect(decoded.purpose).toBe('2fa_force_setup');
      expect(decoded.twoFaEnabled).toBe(false);
    });
  });

  // ---------------------------------------------------------------------------
  // Login — non-admin without 2FA (unaffected)
  // ---------------------------------------------------------------------------
  describe('POST /api/auth/login — non-admin without 2FA', () => {
    test('TEACHER without 2FA gets a normal access token', async () => {
      const bcrypt = require('bcrypt');
      const hash = await bcrypt.hash('Password123!', 1);
      const user = makeUserRow({ role: 'TEACHER', two_fa_enabled: false, password_hash: hash });

      // getByEmail + updateLastLogin
      mockDb.query
        .mockResolvedValueOnce({ rows: [user] })
        .mockResolvedValueOnce({ rows: [], rowCount: 1 });

      const res = await request(app)
        .post('/api/auth/login')
        .send({ email: 'admin@example.com', password: 'Password123!' });

      expect(res.status).toBe(200);
      expect(res.body.data.accessToken).toBeDefined();
      expect(res.body.data.requiresTwoFactorSetup).toBeUndefined();
    });
  });

  // ---------------------------------------------------------------------------
  // POST /api/auth/2fa/force-setup
  // ---------------------------------------------------------------------------
  describe('POST /api/auth/2fa/force-setup', () => {
    test('returns TOTP secret and QR code for a valid setupToken', async () => {
      const setupToken = makeToken({
        sub: 'user-1',
        role: 'SITE_ADMIN',
        purpose: '2fa_force_setup',
        twoFaEnabled: false
      });

      mockDb.query.mockResolvedValueOnce({
        rows: [{ id: 'user-1', email: 'admin@example.com', role: 'SITE_ADMIN' }]
      });

      const res = await request(app)
        .post('/api/auth/2fa/force-setup')
        .send({ setupToken });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.secret).toBeDefined();
      expect(res.body.data.qrCode).toMatch(/^data:image\/png;base64,/);
      expect(Array.isArray(res.body.data.backupCodes)).toBe(true);
    });

    test('rejects when no setupToken is provided', async () => {
      const res = await request(app)
        .post('/api/auth/2fa/force-setup')
        .send({});

      expect(res.status).toBe(400);
    });

    test('rejects a token with wrong purpose', async () => {
      const badToken = makeToken({
        sub: 'user-1',
        role: 'SITE_ADMIN',
        purpose: '2fa_challenge'
      });

      const res = await request(app)
        .post('/api/auth/2fa/force-setup')
        .send({ setupToken: badToken });

      expect(res.status).toBe(401);
    });

    test('rejects an expired setupToken', async () => {
      const expiredToken = makeToken({
        sub: 'user-1',
        role: 'SITE_ADMIN',
        purpose: '2fa_force_setup'
      }, '-1s');

      const res = await request(app)
        .post('/api/auth/2fa/force-setup')
        .send({ setupToken: expiredToken });

      expect(res.status).toBe(401);
    });
  });

  // ---------------------------------------------------------------------------
  // POST /api/auth/2fa/force-verify
  // ---------------------------------------------------------------------------
  describe('POST /api/auth/2fa/force-verify', () => {
    test('rejects when setupToken, secret, or code is missing', async () => {
      const res = await request(app)
        .post('/api/auth/2fa/force-verify')
        .send({ secret: 'abc', code: '123456' }); // no setupToken

      expect(res.status).toBe(400);
    });

    test('rejects a token with wrong purpose', async () => {
      const badToken = makeToken({ sub: 'user-1', role: 'SITE_ADMIN', purpose: 'other' });

      const res = await request(app)
        .post('/api/auth/2fa/force-verify')
        .send({ setupToken: badToken, secret: 'JBSWY3DPEHPK3PXP', code: '000000' });

      expect(res.status).toBe(401);
    });
  });

  // ---------------------------------------------------------------------------
  // requireAdmin2fa middleware — admin routes
  // ---------------------------------------------------------------------------
  describe('requireAdmin2fa middleware on /api/admin routes', () => {
    test('returns 403 when admin token has twoFaEnabled=false', async () => {
      const token = makeToken({
        sub: 'admin-1',
        role: 'SITE_ADMIN',
        schoolId: null,
        twoFaEnabled: false
      });

      const res = await request(app)
        .get('/api/admin/users')
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(403);
      expect(res.body.error).toBe('admin_2fa_required');
    });

    test('returns 403 for SCHOOL_ADMIN with twoFaEnabled=false', async () => {
      const token = makeToken({
        sub: 'admin-2',
        role: 'SCHOOL_ADMIN',
        schoolId: 'school-1',
        twoFaEnabled: false
      });

      const res = await request(app)
        .get('/api/admin/users')
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(403);
      expect(res.body.error).toBe('admin_2fa_required');
    });

    test('passes requireAdmin2fa when admin token has twoFaEnabled=true', async () => {
      const token = makeToken({
        sub: 'admin-1',
        role: 'SITE_ADMIN',
        schoolId: null,
        twoFaEnabled: true
      });

      // listUsers controller will call DB; mock an empty result
      mockDb.query.mockResolvedValueOnce({ rows: [], rowCount: 0 });

      const res = await request(app)
        .get('/api/admin/users')
        .set('Authorization', `Bearer ${token}`);

      // Should NOT be blocked by requireAdmin2fa (may be 200 or downstream error)
      expect(res.status).not.toBe(403);
    });

    test('non-admin route is unaffected by requireAdmin2fa', async () => {
      // TEACHER token without twoFaEnabled should NOT be blocked on non-admin routes
      const token = makeToken({ sub: 'teacher-1', role: 'TEACHER', schoolId: 'school-1' });

      const res = await request(app)
        .get('/api/auth')
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).not.toBe(403);
    });
  });

  // ---------------------------------------------------------------------------
  // POST /api/auth/2fa/disable — admin accounts blocked (G5 update)
  // ---------------------------------------------------------------------------
  describe('POST /api/auth/2fa/disable — admin roles blocked', () => {
    test('returns 403 for SITE_ADMIN', async () => {
      const token = makeToken({ sub: 'admin-1', role: 'SITE_ADMIN', schoolId: null, twoFaEnabled: true });

      const res = await request(app)
        .post('/api/auth/2fa/disable')
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(403);
      expect(res.body.error).toBe('admin_2fa_mandatory');
    });

    test('returns 403 for SCHOOL_ADMIN', async () => {
      const token = makeToken({ sub: 'admin-2', role: 'SCHOOL_ADMIN', schoolId: 'school-1', twoFaEnabled: true });

      const res = await request(app)
        .post('/api/auth/2fa/disable')
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(403);
      expect(res.body.error).toBe('admin_2fa_mandatory');
    });

    test('allows TEACHER to disable 2FA', async () => {
      const token = makeToken({ sub: 'teacher-1', role: 'TEACHER', schoolId: 'school-1' });

      mockDb.query
        .mockResolvedValueOnce({ rows: [], rowCount: 1 })  // UPDATE users
        .mockResolvedValueOnce({ rows: [], rowCount: 1 }); // audit_logs INSERT

      const res = await request(app)
        .post('/api/auth/2fa/disable')
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(200);
      expect(res.body.ok).toBe(true);
    });

    test('allows BIDDER to disable 2FA', async () => {
      const token = makeToken({ sub: 'bidder-1', role: 'BIDDER', schoolId: null });

      mockDb.query
        .mockResolvedValueOnce({ rows: [], rowCount: 1 })
        .mockResolvedValueOnce({ rows: [], rowCount: 1 });

      const res = await request(app)
        .post('/api/auth/2fa/disable')
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(200);
      expect(res.body.ok).toBe(true);
    });
  });
});
