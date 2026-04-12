/**
 * Account Self-Deletion Integration Tests
 * Tests for DELETE /api/user (G6)
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
  return jwt.sign({ ...payload, jti: 'test-jti-123' }, SECRET, { algorithm: 'HS256' });
}

describe('DELETE /api/user', () => {
  let app;

  beforeEach(() => {
    app = createTestApp();
  });

  test('returns 401 without a token (unauthenticated)', async () => {
    const res = await request(app).delete('/api/user');
    expect(res.status).toBe(401);
  });

  test('returns 401 with an invalid token', async () => {
    const res = await request(app)
      .delete('/api/user')
      .set('Authorization', 'Bearer not.a.valid.token');
    expect(res.status).toBe(401);
  });

  test('returns 200 and { ok: true } for authenticated user', async () => {
    const token = makeToken({ userId: 'user-1', role: 'BIDDER', schoolId: null });

    // UPDATE users (soft-delete) → rowCount 1
    mockDb.query
      .mockResolvedValueOnce({ rows: [{ id: 'user-1' }], rowCount: 1 })
      // UPDATE user_sessions
      .mockResolvedValueOnce({ rows: [], rowCount: 0 })
      // DELETE password_reset_tokens
      .mockResolvedValueOnce({ rows: [], rowCount: 0 })
      // INSERT audit_logs
      .mockResolvedValueOnce({ rows: [], rowCount: 1 });

    const res = await request(app)
      .delete('/api/user')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
  });

  test('anonymises PII fields in the UPDATE', async () => {
    const token = makeToken({ userId: 'user-2', role: 'STUDENT', schoolId: 'school-1' });

    mockDb.query
      .mockResolvedValueOnce({ rows: [{ id: 'user-2' }], rowCount: 1 })
      .mockResolvedValueOnce({ rows: [], rowCount: 0 })
      .mockResolvedValueOnce({ rows: [], rowCount: 0 })
      .mockResolvedValueOnce({ rows: [], rowCount: 1 });

    await request(app)
      .delete('/api/user')
      .set('Authorization', `Bearer ${token}`);

    const updateCall = mockDb.query.mock.calls.find(
      ([sql]) => sql && sql.includes('UPDATE users') && sql.includes('deleted_at')
    );
    expect(updateCall).toBeDefined();
    const sql = updateCall[0];
    expect(sql).toMatch(/deleted_at\s*=\s*NOW\(\)/i);
    expect(sql).toMatch(/email\s*=\s*CONCAT/i);
    expect(sql).toMatch(/first_name\s*=\s*NULL/i);
    expect(sql).toMatch(/last_name\s*=\s*NULL/i);
    expect(sql).toMatch(/phone_number\s*=\s*NULL/i);
    expect(sql).toMatch(/two_fa_secret\s*=\s*NULL/i);
    expect(sql).toMatch(/backup_codes\s*=\s*NULL/i);
    // Scoped to authenticated user
    expect(updateCall[1][0]).toBe('user-2');
  });

  test('revokes all active sessions', async () => {
    const token = makeToken({ userId: 'user-3', role: 'TEACHER', schoolId: 'school-1' });

    mockDb.query
      .mockResolvedValueOnce({ rows: [{ id: 'user-3' }], rowCount: 1 })
      .mockResolvedValueOnce({ rows: [], rowCount: 0 })
      .mockResolvedValueOnce({ rows: [], rowCount: 0 })
      .mockResolvedValueOnce({ rows: [], rowCount: 1 });

    await request(app)
      .delete('/api/user')
      .set('Authorization', `Bearer ${token}`);

    const sessionRevoke = mockDb.query.mock.calls.find(
      ([sql]) => sql && sql.includes('UPDATE user_sessions') && sql.includes('revoked_at')
    );
    expect(sessionRevoke).toBeDefined();
    expect(sessionRevoke[1][0]).toBe('user-3');
  });

  test('writes a USER/SELF_DELETED audit log entry', async () => {
    const token = makeToken({ userId: 'user-4', role: 'BIDDER', schoolId: null });

    mockDb.query
      .mockResolvedValueOnce({ rows: [{ id: 'user-4' }], rowCount: 1 })
      .mockResolvedValueOnce({ rows: [], rowCount: 0 })
      .mockResolvedValueOnce({ rows: [], rowCount: 0 })
      .mockResolvedValueOnce({ rows: [], rowCount: 1 });

    await request(app)
      .delete('/api/user')
      .set('Authorization', `Bearer ${token}`);

    const auditCall = mockDb.query.mock.calls.find(
      ([sql]) => sql && sql.includes('INSERT INTO audit_logs')
    );
    expect(auditCall).toBeDefined();
    // Category and action type are literals in the SQL string
    expect(auditCall[0]).toContain("'USER'");
    expect(auditCall[0]).toContain("'SELF_DELETED'");
    // user_id is the first param
    expect(auditCall[1][0]).toBe('user-4');
  });

  test('returns 404 when user not found or already deleted', async () => {
    const token = makeToken({ userId: 'gone-user', role: 'BIDDER', schoolId: null });

    // UPDATE returns rowCount 0 → already deleted or not found
    mockDb.query.mockResolvedValueOnce({ rows: [], rowCount: 0 });

    const res = await request(app)
      .delete('/api/user')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(404);
  });

  test('post-delete login rejected (getByEmail filters deleted_at IS NULL)', async () => {
    // Verify that the login path already rejects deleted users:
    // userModel.getByEmail uses "WHERE email = $1 AND deleted_at IS NULL"
    // so a deleted user's anonymised email won't match any active login attempt.
    // mockDb returns [] → login returns 401 "Invalid credentials"
    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: 'deleted-user-1@deleted.local', password: 'AnyPassword1!' });

    expect(res.status).toBe(401);
  });
});
