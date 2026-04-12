/**
 * 2FA Disable Route Integration Tests
 * Tests for POST /api/auth/2fa/disable (G5)
 */

process.env.NODE_ENV = 'test';
if (!process.env.JWT_ACCESS_SECRET) process.env.JWT_ACCESS_SECRET = 'test-access-secret';
if (!process.env.JWT_REFRESH_SECRET) process.env.JWT_REFRESH_SECRET = 'test-refresh-secret';

const request = require('supertest');
const jwt = require('jsonwebtoken');
const createTestApp = require('../../helpers/createTestApp');
const mockDb = require('../../helpers/mockDb');

const SECRET = process.env.JWT_ACCESS_SECRET;

function makeToken(payload) {
  return jwt.sign(payload, SECRET, { algorithm: 'HS256' });
}

describe('POST /api/auth/2fa/disable', () => {
  let app;

  beforeEach(() => {
    app = createTestApp();
  });

  test('returns 401 without a token (unauthenticated)', async () => {
    const res = await request(app).post('/api/auth/2fa/disable');
    expect(res.status).toBe(401);
  });

  test('returns 401 with an invalid token (wrong code)', async () => {
    const res = await request(app)
      .post('/api/auth/2fa/disable')
      .set('Authorization', 'Bearer invalid.jwt.token');
    expect(res.status).toBe(401);
  });

  test('returns 200 and clears 2FA fields for authenticated user', async () => {
    const token = makeToken({ userId: 'user-1', role: 'TEACHER', schoolId: 'school-1' });

    // UPDATE users → success
    mockDb.query
      .mockResolvedValueOnce({ rows: [], rowCount: 1 })
      // audit_logs INSERT → success
      .mockResolvedValueOnce({ rows: [], rowCount: 1 });

    const res = await request(app)
      .post('/api/auth/2fa/disable')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
  });

  test('UPDATE clears two_fa_enabled, two_fa_secret, and backup_codes', async () => {
    const token = makeToken({ userId: 'user-1', role: 'TEACHER', schoolId: 'school-1' });

    mockDb.query
      .mockResolvedValueOnce({ rows: [], rowCount: 1 })
      .mockResolvedValueOnce({ rows: [], rowCount: 1 });

    await request(app)
      .post('/api/auth/2fa/disable')
      .set('Authorization', `Bearer ${token}`);

    const updateCall = mockDb.query.mock.calls.find(
      ([sql]) => sql && sql.includes('UPDATE users') && sql.includes('two_fa_enabled')
    );
    expect(updateCall).toBeDefined();
    expect(updateCall[0]).toMatch(/two_fa_enabled\s*=\s*FALSE/i);
    expect(updateCall[0]).toMatch(/two_fa_secret\s*=\s*NULL/i);
    expect(updateCall[0]).toMatch(/backup_codes\s*=\s*NULL/i);
    expect(updateCall[1][0]).toBe('user-1');
  });

  test('logs a SECURITY audit event on success', async () => {
    const token = makeToken({ userId: 'user-2', role: 'BIDDER', schoolId: null });

    mockDb.query
      .mockResolvedValueOnce({ rows: [], rowCount: 1 })
      .mockResolvedValueOnce({ rows: [], rowCount: 1 });

    await request(app)
      .post('/api/auth/2fa/disable')
      .set('Authorization', `Bearer ${token}`);

    const auditCall = mockDb.query.mock.calls.find(
      ([sql]) => sql && sql.includes('INSERT INTO audit_logs')
    );
    expect(auditCall).toBeDefined();
    expect(auditCall[1][1]).toBe('SECURITY');
    expect(auditCall[1][2]).toBe('2FA_DISABLED');
  });

  test('does not update DB when unauthenticated', async () => {
    await request(app).post('/api/auth/2fa/disable');

    const updateCall = mockDb.query.mock.calls.find(
      ([sql]) => sql && sql.includes('UPDATE users')
    );
    expect(updateCall).toBeUndefined();
  });
});
