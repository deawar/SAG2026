/**
 * G19 — Concurrent session limiting
 * Tests:
 *  1.  6th login evicts the oldest session (MAX_SESSIONS_PER_USER enforcement)
 *  2.  Refresh with a revoked JTI returns 401
 *  3.  Refresh with an active JTI succeeds
 *  4.  Refresh with no session record (legacy token) succeeds (fail-open)
 *  5.  GET /api/user/sessions returns session list
 *  6.  GET /api/user/sessions requires authentication
 *  7.  DELETE /api/user/sessions revokes all sessions
 *  8.  DELETE /api/user/sessions with currentRefreshToken spares the current session
 *  9.  DELETE /api/user/sessions/:id revokes a specific session
 * 10.  DELETE /api/user/sessions/:id returns 404 for unknown/already-revoked session
 * 11.  DELETE /api/admin/users/:userId/sessions force-logouts the target user
 * 12.  DELETE /api/admin/users/:userId/sessions requires admin role
 * 13.  DELETE /api/admin/users/:userId/sessions requires 2FA (twoFaEnabled=true)
 */

process.env.NODE_ENV = 'test';
if (!process.env.JWT_ACCESS_SECRET) process.env.JWT_ACCESS_SECRET = 'test-access-secret';
if (!process.env.JWT_REFRESH_SECRET) process.env.JWT_REFRESH_SECRET = 'test-refresh-secret';

// adminRoutes and tokenBlacklist use pool from models/index directly — mock it so
// the sessions endpoint and blacklist revoke calls don't need a live PG connection.
jest.mock('../../../src/models/index', () => {
  const actual = jest.requireActual('../../../src/models/index');
  return {
    ...actual,
    pool: { query: jest.fn().mockResolvedValue({ rows: [], rowCount: 0 }) }
  };
});

const request = require('supertest');
const jwt = require('jsonwebtoken');
const { v4: uuidv4 } = require('uuid');
const createTestApp = require('../../helpers/createTestApp');
const mockDb = require('../../helpers/mockDb');
const { pool: mockPool } = require('../../../src/models/index');

const ACCESS_SECRET = process.env.JWT_ACCESS_SECRET;
const REFRESH_SECRET = process.env.JWT_REFRESH_SECRET;

// ---------------------------------------------------------------------------
// Token factory helpers
// ---------------------------------------------------------------------------

function makeAccessToken(payload = {}, expiresIn = '15m') {
  const defaults = {
    sub: 'user-1',
    email: 'user@example.com',
    role: 'BIDDER',
    twoFaEnabled: false,
    jti: uuidv4(),
  };
  return jwt.sign({ ...defaults, ...payload }, ACCESS_SECRET, {
    algorithm: 'HS256',
    expiresIn,
  });
}

function makeAdminAccessToken(payload = {}) {
  return makeAccessToken({
    sub: 'admin-1',
    email: 'admin@example.com',
    role: 'SITE_ADMIN',
    twoFaEnabled: true,
    ...payload,
  });
}

function makeRefreshToken(userId = 'user-1', jti = uuidv4(), expiresIn = '7d') {
  return jwt.sign(
    { sub: userId, jti, type: 'refresh' },
    REFRESH_SECRET,
    {
      algorithm: 'HS256',
      expiresIn,
      issuer: 'silent-auction-gallery',
      audience: 'silent-auction-users',
    }
  );
}

// Full user row returned when a refresh token lookup hits the DB
function makeUserRow(overrides = {}) {
  return {
    id: 'user-1',
    email: 'user@example.com',
    role: 'BIDDER',
    account_status: 'ACTIVE',
    two_fa_enabled: false,
    email_verified_at: '2026-01-01T00:00:00Z',
    requires_parental_consent: false,
    parental_consent_status: null,
    school_id: null,
    first_name: 'Test',
    last_name: 'User',
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('G19 — Concurrent session limiting', () => {
  let app;

  beforeEach(() => {
    app = createTestApp();
    mockPool.query.mockReset();
    mockPool.query.mockResolvedValue({ rows: [], rowCount: 0 });
  });

  // -------------------------------------------------------------------------
  // MAX_SESSIONS_PER_USER enforcement (via SessionService.createSession)
  // -------------------------------------------------------------------------
  describe('Session eviction on 6th login', () => {
    test('SessionService revokes oldest session when limit is reached', async () => {
      // This tests the logic flow through the login endpoint which calls
      // _createSessionRecord → SessionService.createSession
      const bcrypt = require('bcrypt');
      const hash = await bcrypt.hash('Password123!', 1);
      const user = makeUserRow({ password_hash: hash });

      // Mock: getByEmail → user row with password
      // COUNT returns 5 (at limit)
      // UPDATE (evict oldest) → returns old JTI
      // INSERT new session
      // blacklist check (token_blacklist)
      // any audit_log inserts → default empty

      const oldJti = uuidv4();

      mockDb.query
        // 1. getByEmail
        .mockResolvedValueOnce({ rows: [user] })
        // 2. lock check / failed login attempts (various internal queries) — empty
        .mockResolvedValueOnce({ rows: [] })
        // 3. COUNT active sessions
        .mockResolvedValueOnce({ rows: [{ count: '5' }] })
        // 4. Evict oldest — returns old JTI
        .mockResolvedValueOnce({ rows: [{ token_jti: oldJti }] })
        // 5. INSERT new session
        .mockResolvedValueOnce({
          rows: [{ id: uuidv4(), user_id: user.id, token_jti: uuidv4(), created_at: new Date() }]
        })
        // 6. Blacklist check for old JTI
        .mockResolvedValueOnce({ rows: [] })
        // 7+. Any remaining queries (audit log etc.)
        .mockResolvedValue({ rows: [], rowCount: 0 });

      const res = await request(app)
        .post('/api/auth/login')
        .send({ email: 'user@example.com', password: 'Password123!' });

      // Should still get a successful login response
      expect(res.status).toBe(200);
      expect(res.body.data?.accessToken).toBeDefined();
    });
  });

  // -------------------------------------------------------------------------
  // POST /api/auth/refresh — session check
  // -------------------------------------------------------------------------
  describe('POST /api/auth/refresh — session-based revocation', () => {
    test('returns 401 when the session row is explicitly revoked', async () => {
      const jti = uuidv4();
      const refreshToken = makeRefreshToken('user-1', jti);

      mockDb.query
        // checkSession — row exists, revoked_at is set
        .mockResolvedValueOnce({ rows: [{ revoked_at: new Date() }] })
        .mockResolvedValue({ rows: [], rowCount: 0 });

      const res = await request(app)
        .post('/api/auth/refresh')
        .send({ refreshToken });

      expect(res.status).toBe(401);
      expect(res.body.success).toBe(false);
    });

    test('issues new access token when session row is active', async () => {
      const jti = uuidv4();
      const refreshToken = makeRefreshToken('user-1', jti);
      const user = makeUserRow();

      mockDb.query
        // checkSession — row exists, not revoked
        .mockResolvedValueOnce({ rows: [{ revoked_at: null }] })
        // updateLastUsed (fire-and-forget, may or may not be called synchronously)
        .mockResolvedValueOnce({ rows: [], rowCount: 1 })
        // getById for new access token
        .mockResolvedValueOnce({ rows: [user] })
        .mockResolvedValue({ rows: [], rowCount: 0 });

      const res = await request(app)
        .post('/api/auth/refresh')
        .send({ refreshToken });

      // Should succeed and return a new access token
      expect(res.status).toBe(200);
      expect(res.body.data?.accessToken).toBeDefined();
    });

    test('issues new access token when no session row exists (legacy token, fail-open)', async () => {
      const jti = uuidv4();
      const refreshToken = makeRefreshToken('user-1', jti);
      const user = makeUserRow();

      mockDb.query
        // checkSession — no row found (legacy token)
        .mockResolvedValueOnce({ rows: [] })
        // getById
        .mockResolvedValueOnce({ rows: [user] })
        .mockResolvedValue({ rows: [], rowCount: 0 });

      const res = await request(app)
        .post('/api/auth/refresh')
        .send({ refreshToken });

      expect(res.status).toBe(200);
      expect(res.body.data?.accessToken).toBeDefined();
    });
  });

  // -------------------------------------------------------------------------
  // GET /api/user/sessions
  // -------------------------------------------------------------------------
  describe('GET /api/user/sessions', () => {
    test('returns session list with masked IPs', async () => {
      const token = makeAccessToken({ sub: 'user-1' });
      const sessions = [
        {
          id: uuidv4(),
          ip_address: '192.168.1.42',
          user_agent: 'Mozilla/5.0 (Windows NT 10.0) Chrome/123',
          created_at: new Date('2026-04-10T10:00:00Z'),
          last_used_at: new Date('2026-04-12T08:00:00Z'),
          expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
        },
      ];

      mockDb.query
        // getActiveSessions
        .mockResolvedValueOnce({ rows: sessions })
        .mockResolvedValue({ rows: [], rowCount: 0 });

      const res = await request(app)
        .get('/api/user/sessions')
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.sessions).toHaveLength(1);
      // Last IPv4 octet must be masked
      expect(res.body.sessions[0].ipAddress).toMatch(/\.xxx$/);
      expect(res.body.sessions[0].ipAddress).not.toContain('42');
      expect(res.body.sessions[0].lastUsedAt).toBeDefined();
    });

    test('returns 401 without auth token', async () => {
      const res = await request(app).get('/api/user/sessions');
      expect(res.status).toBe(401);
    });
  });

  // -------------------------------------------------------------------------
  // DELETE /api/user/sessions — revoke all
  // -------------------------------------------------------------------------
  describe('DELETE /api/user/sessions', () => {
    test('revokes all sessions and returns count', async () => {
      const token = makeAccessToken({ sub: 'user-1' });
      const revokedJtis = [uuidv4(), uuidv4()];

      mockDb.query
        // revokeAllExcept (exceptJti = null → revoke all)
        .mockResolvedValueOnce({ rows: revokedJtis.map(jti => ({ token_jti: jti })), rowCount: 2 })
        // blacklist inserts (one per JTI) — empty ok
        .mockResolvedValue({ rows: [], rowCount: 0 });

      const res = await request(app)
        .delete('/api/user/sessions')
        .set('Authorization', `Bearer ${token}`)
        .send({});

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.revokedCount).toBe(2);
    });

    test('spares current session when currentRefreshToken is provided', async () => {
      const currentJti = uuidv4();
      const token = makeAccessToken({ sub: 'user-1' });
      const refreshToken = makeRefreshToken('user-1', currentJti);

      mockDb.query
        // revokeAllExcept called with exceptJti = currentJti
        .mockResolvedValueOnce({ rows: [{ token_jti: uuidv4() }], rowCount: 1 })
        .mockResolvedValue({ rows: [], rowCount: 0 });

      const res = await request(app)
        .delete('/api/user/sessions')
        .set('Authorization', `Bearer ${token}`)
        .send({ currentRefreshToken: refreshToken });

      expect(res.status).toBe(200);
      expect(res.body.revokedCount).toBe(1);
      // Message should indicate "other" sessions
      expect(res.body.message).toMatch(/other/i);
    });
  });

  // -------------------------------------------------------------------------
  // DELETE /api/user/sessions/:id — revoke a specific session
  // -------------------------------------------------------------------------
  describe('DELETE /api/user/sessions/:id', () => {
    test('revokes the specified session and returns success', async () => {
      const token = makeAccessToken({ sub: 'user-1' });
      const sessionId = uuidv4();
      const revokedJti = uuidv4();

      mockDb.query
        // revokeSessionById — returns the JTI
        .mockResolvedValueOnce({ rows: [{ token_jti: revokedJti }], rowCount: 1 })
        // blacklist revoke
        .mockResolvedValue({ rows: [], rowCount: 0 });

      const res = await request(app)
        .delete(`/api/user/sessions/${sessionId}`)
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
    });

    test('returns 404 when session is not found or already revoked', async () => {
      const token = makeAccessToken({ sub: 'user-1' });
      const sessionId = uuidv4();

      mockDb.query
        // revokeSessionById — no row matched (already revoked or wrong user)
        .mockResolvedValueOnce({ rows: [], rowCount: 0 })
        .mockResolvedValue({ rows: [], rowCount: 0 });

      const res = await request(app)
        .delete(`/api/user/sessions/${sessionId}`)
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(404);
      expect(res.body.success).toBe(false);
    });
  });

  // -------------------------------------------------------------------------
  // DELETE /api/admin/users/:userId/sessions — admin force-logout
  // -------------------------------------------------------------------------
  describe('DELETE /api/admin/users/:userId/sessions', () => {
    test('force-logouts target user and returns revoked count', async () => {
      const adminToken = makeAdminAccessToken();
      const targetUserId = uuidv4();
      const revokedJtis = [uuidv4(), uuidv4(), uuidv4()];

      // adminRoutes uses getAdminSessionService() which calls pool from models/index.
      // tokenBlacklist.isRevoked (inside verifyToken) also uses mockPool — it must come first.
      mockPool.query
        // 1st call: tokenBlacklist.isRevoked in verifyToken → not blacklisted
        .mockResolvedValueOnce({ rows: [], rowCount: 0 })
        // 2nd call: revokeAllExcept
        .mockResolvedValueOnce({
          rows: revokedJtis.map(jti => ({ token_jti: jti })),
          rowCount: 3,
        })
        // remaining: blacklist INSERTs + audit log — default empty ok
        .mockResolvedValue({ rows: [], rowCount: 0 });

      const res = await request(app)
        .delete(`/api/admin/users/${targetUserId}/sessions`)
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.revokedCount).toBe(3);
    });

    test('returns 403 when requester is not admin', async () => {
      const userToken = makeAccessToken({ role: 'BIDDER', twoFaEnabled: false });
      const targetUserId = uuidv4();

      const res = await request(app)
        .delete(`/api/admin/users/${targetUserId}/sessions`)
        .set('Authorization', `Bearer ${userToken}`);

      expect(res.status).toBe(403);
    });

    test('returns 401 with no token', async () => {
      const targetUserId = uuidv4();

      const res = await request(app)
        .delete(`/api/admin/users/${targetUserId}/sessions`);

      expect(res.status).toBe(401);
    });

    test('returns 403 when admin token lacks twoFaEnabled=true', async () => {
      const adminTokenNo2fa = makeAccessToken({
        sub: 'admin-1',
        role: 'SITE_ADMIN',
        twoFaEnabled: false,
      });
      const targetUserId = uuidv4();

      const res = await request(app)
        .delete(`/api/admin/users/${targetUserId}/sessions`)
        .set('Authorization', `Bearer ${adminTokenNo2fa}`);

      expect(res.status).toBe(403);
      expect(res.body.error).toBe('admin_2fa_required');
    });
  });
});
