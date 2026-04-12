/**
 * Password Reset Routes Integration Tests
 * Tests for POST /api/auth/password-reset/send-code (G3)
 */

process.env.NODE_ENV = 'test';
if (!process.env.JWT_ACCESS_SECRET) process.env.JWT_ACCESS_SECRET = 'test-access-secret';
if (!process.env.JWT_REFRESH_SECRET) process.env.JWT_REFRESH_SECRET = 'test-refresh-secret';

const request = require('supertest');
const createTestApp = require('../../helpers/createTestApp');
const mockDb = require('../../helpers/mockDb');

describe('POST /api/auth/password-reset/send-code', () => {
  let app;

  beforeEach(() => {
    app = createTestApp();
  });

  test('returns 200 for an unknown email (prevents enumeration)', async () => {
    // mockDb returns { rows: [] } by default → user not found → silent return
    const res = await request(app)
      .post('/api/auth/password-reset/send-code')
      .send({ email: 'nobody@example.com' });

    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
  });

  test('returns 400 for missing email', async () => {
    const res = await request(app)
      .post('/api/auth/password-reset/send-code')
      .send({});

    expect(res.status).toBe(400);
  });

  test('returns 400 for malformed email', async () => {
    const res = await request(app)
      .post('/api/auth/password-reset/send-code')
      .send({ email: 'not-an-email' });

    expect(res.status).toBe(400);
  });

  test('returns 200 and writes hashed code when user exists', async () => {
    // getByEmail query → return a user row
    mockDb.query
      .mockResolvedValueOnce({
        rows: [{
          id: 'user-uuid-1',
          email: 'alice@example.com',
          first_name: 'Alice',
          last_name: 'Smith',
          account_status: 'ACTIVE'
        }],
        rowCount: 1
      })
      // DELETE old tokens
      .mockResolvedValueOnce({ rows: [], rowCount: 0 })
      // INSERT new token
      .mockResolvedValueOnce({ rows: [], rowCount: 1 })
      // audit_logs INSERT
      .mockResolvedValueOnce({ rows: [], rowCount: 1 });

    const res = await request(app)
      .post('/api/auth/password-reset/send-code')
      .send({ email: 'alice@example.com' });

    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);

    // Verify the INSERT into password_reset_tokens was called
    const insertCall = mockDb.query.mock.calls.find(
      ([sql]) => sql && sql.includes('INSERT INTO password_reset_tokens')
    );
    expect(insertCall).toBeDefined();

    // The hash (second param) should be a 64-char hex string (sha256 of 6-digit code)
    const codeHash = insertCall[1][1];
    expect(codeHash).toMatch(/^[0-9a-f]{64}$/);
  });

  test('DELETE for old codes is called before INSERT', async () => {
    mockDb.query
      .mockResolvedValueOnce({ rows: [{ id: 'u1', email: 'bob@example.com', first_name: 'Bob', account_status: 'ACTIVE' }], rowCount: 1 })
      .mockResolvedValueOnce({ rows: [], rowCount: 0 })
      .mockResolvedValueOnce({ rows: [], rowCount: 1 })
      .mockResolvedValueOnce({ rows: [], rowCount: 1 });

    await request(app)
      .post('/api/auth/password-reset/send-code')
      .send({ email: 'bob@example.com' });

    const deleteCall = mockDb.query.mock.calls.find(
      ([sql]) => sql && sql.includes('DELETE FROM password_reset_tokens')
    );
    expect(deleteCall).toBeDefined();
    expect(deleteCall[1][0]).toBe('u1'); // scoped to user id
  });
});
