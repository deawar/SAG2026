/**
 * Password Reset Verify Integration Tests
 * Tests for POST /api/auth/password-reset (G4)
 */

process.env.NODE_ENV = 'test';
if (!process.env.JWT_ACCESS_SECRET) process.env.JWT_ACCESS_SECRET = 'test-access-secret';
if (!process.env.JWT_REFRESH_SECRET) process.env.JWT_REFRESH_SECRET = 'test-refresh-secret';

const crypto = require('crypto');
const request = require('supertest');
const createTestApp = require('../../helpers/createTestApp');
const mockDb = require('../../helpers/mockDb');

const STRONG_PASSWORD = 'Str0ng!Password99';

// sha256 of the 6-digit code we'll use in tests
const TEST_CODE = '123456';
const TEST_CODE_HASH = crypto.createHash('sha256').update(TEST_CODE).digest('hex');

describe('POST /api/auth/password-reset', () => {
  let app;

  beforeEach(() => {
    app = createTestApp();
  });

  test('returns 400 for missing fields', async () => {
    const res = await request(app)
      .post('/api/auth/password-reset')
      .send({ email: 'user@example.com' }); // missing code + newPassword

    expect(res.status).toBe(400);
  });

  test('returns 400 for invalid email format', async () => {
    const res = await request(app)
      .post('/api/auth/password-reset')
      .send({ email: 'not-email', code: TEST_CODE, newPassword: STRONG_PASSWORD });

    expect(res.status).toBe(400);
  });

  test('returns 400 with weak password', async () => {
    const res = await request(app)
      .post('/api/auth/password-reset')
      .send({ email: 'user@example.com', code: TEST_CODE, newPassword: 'weak' });

    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/password/i);
  });

  test('returns 400 with invalid_or_expired_code for unknown email', async () => {
    // mockDb returns [] by default → user not found
    const res = await request(app)
      .post('/api/auth/password-reset')
      .send({ email: 'nobody@example.com', code: TEST_CODE, newPassword: STRONG_PASSWORD });

    expect(res.status).toBe(400);
    expect(res.body.error).toBe('invalid_or_expired_code');
  });

  test('returns 400 with invalid_or_expired_code for bad code', async () => {
    // User found, but token lookup returns empty (wrong code or expired)
    mockDb.query
      .mockResolvedValueOnce({ rows: [{ id: 'u1', email: 'user@example.com', first_name: 'Alice', account_status: 'ACTIVE' }], rowCount: 1 })
      .mockResolvedValueOnce({ rows: [], rowCount: 0 }); // token not found

    const res = await request(app)
      .post('/api/auth/password-reset')
      .send({ email: 'user@example.com', code: '000000', newPassword: STRONG_PASSWORD });

    expect(res.status).toBe(400);
    expect(res.body.error).toBe('invalid_or_expired_code');
  });

  test('returns 200 and updates password on valid code', async () => {
    mockDb.query
      // getByEmail
      .mockResolvedValueOnce({ rows: [{ id: 'u1', email: 'user@example.com', first_name: 'Alice', account_status: 'ACTIVE' }], rowCount: 1 })
      // token lookup — found
      .mockResolvedValueOnce({ rows: [{ 1: 1 }], rowCount: 1 })
      // UPDATE users password
      .mockResolvedValueOnce({ rows: [], rowCount: 1 })
      // UPDATE password_reset_tokens used_at
      .mockResolvedValueOnce({ rows: [], rowCount: 1 })
      // revokeAllSessions
      .mockResolvedValueOnce({ rows: [], rowCount: 0 })
      // audit_log
      .mockResolvedValueOnce({ rows: [], rowCount: 1 });

    const res = await request(app)
      .post('/api/auth/password-reset')
      .send({ email: 'user@example.com', code: TEST_CODE, newPassword: STRONG_PASSWORD });

    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);

    // Verify UPDATE users was called
    const updateUsers = mockDb.query.mock.calls.find(
      ([sql]) => sql && sql.includes('UPDATE users SET password_hash')
    );
    expect(updateUsers).toBeDefined();

    // Verify token marked used
    const markUsed = mockDb.query.mock.calls.find(
      ([sql]) => sql && sql.includes('UPDATE password_reset_tokens SET used_at')
    );
    expect(markUsed).toBeDefined();

    // Verify sessions revoked
    const revokeSessions = mockDb.query.mock.calls.find(
      ([sql]) => sql && sql.includes('UPDATE user_sessions SET revoked_at')
    );
    expect(revokeSessions).toBeDefined();
  });

  test('token lookup uses both user_id and code_hash (scoped lookup)', async () => {
    mockDb.query
      .mockResolvedValueOnce({ rows: [{ id: 'u1', email: 'user@example.com', first_name: 'Alice', account_status: 'ACTIVE' }], rowCount: 1 })
      .mockResolvedValueOnce({ rows: [], rowCount: 0 }); // expired/missing

    await request(app)
      .post('/api/auth/password-reset')
      .send({ email: 'user@example.com', code: TEST_CODE, newPassword: STRONG_PASSWORD });

    const tokenLookup = mockDb.query.mock.calls.find(
      ([sql]) => sql && sql.includes('password_reset_tokens') && sql.includes('SELECT')
    );
    expect(tokenLookup).toBeDefined();
    // Both user_id and token_hash are passed as params (prevents cross-user code guessing)
    expect(tokenLookup[1]).toContain('u1');
    expect(tokenLookup[1]).toContain(TEST_CODE_HASH);
  });
});
