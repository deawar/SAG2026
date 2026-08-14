/**
 * Regression lock: password reset must revoke all sessions.
 *
 * Both reset paths already call this.sessionService.revokeAllSessions(userId).
 * This test locks that behaviour in so a future refactor can't silently remove it
 * (a stolen refresh token must be killed when a user resets their password).
 *
 * NO production code was changed for this test.
 */

process.env.NODE_ENV = 'test';
if (!process.env.JWT_ACCESS_SECRET) { process.env.JWT_ACCESS_SECRET = 'test-access-secret'; }
if (!process.env.JWT_REFRESH_SECRET) { process.env.JWT_REFRESH_SECRET = 'test-refresh-secret'; }

const { AuthenticationService } = require('../../../src/services/authenticationService');

/**
 * Build a minimal AuthenticationService with mocked dependencies.
 *
 * Constructor signature (options object):
 *   { db, userModel, jwtService, twoFactorService, rbacService, sessionService,
 *     maxLoginAttempts, lockoutDuration }
 *
 * completePasswordReset db.query sequence:
 *   1. SELECT token from password_reset_tokens  → { rows: [{ user_id }] }
 *   2. UPDATE users (password_hash)              → { rows: [], rowCount: 1 }
 *   3. UPDATE password_reset_tokens (used_at)   → { rows: [], rowCount: 1 }
 *   (then revokeAllSessions is called)
 *   4. INSERT audit_logs (via _recordAuditLog)  → stubbed out on the instance
 *
 * verifyPasswordResetCode db.query sequence:
 *   1. SELECT 1 from password_reset_tokens      → { rows: [{}] }
 *   2. UPDATE users (password_hash)              → { rows: [], rowCount: 1 }
 *   3. UPDATE password_reset_tokens (used_at)   → { rows: [], rowCount: 1 }
 *   (then revokeAllSessions is called)
 *   4. INSERT audit_logs (via _recordAuditLog)  → stubbed out on the instance
 */
function makeService(dbQuerySetup) {
  const revokeAllSessions = jest.fn().mockResolvedValue(undefined);

  const db = { query: jest.fn() };
  dbQuerySetup(db.query);

  const svc = new AuthenticationService({
    db,
    sessionService: { revokeAllSessions },
    userModel: { getByEmail: jest.fn().mockResolvedValue({ id: 'user-1', email: 'test@example.com' }) },
    jwtService: null,
    twoFactorService: null,
    rbacService: null
  });

  // Stub _recordAuditLog so the 4th db.query (INSERT audit_logs) is never reached;
  // the stub returns silently just like the production catch-all would.
  svc._recordAuditLog = jest.fn().mockResolvedValue(undefined);

  return { svc, revokeAllSessions };
}

describe('password reset revokes all sessions (regression lock)', () => {
  test('completePasswordReset calls revokeAllSessions with the user id', async () => {
    const { svc, revokeAllSessions } = makeService((mockQuery) => {
      // Query 1: SELECT token → found
      mockQuery.mockResolvedValueOnce({ rows: [{ user_id: 'user-1' }] });
      // Query 2: UPDATE users password → ok
      mockQuery.mockResolvedValueOnce({ rows: [], rowCount: 1 });
      // Query 3: UPDATE token used_at → ok
      mockQuery.mockResolvedValueOnce({ rows: [], rowCount: 1 });
    });

    await svc.completePasswordReset('raw-reset-token', 'NewValidPass123!@#');

    expect(revokeAllSessions).toHaveBeenCalledTimes(1);
    expect(revokeAllSessions).toHaveBeenCalledWith('user-1');
  });

  test('verifyPasswordResetCode calls revokeAllSessions with the user id', async () => {
    const { svc, revokeAllSessions } = makeService((mockQuery) => {
      // Query 1: SELECT 1 from password_reset_tokens → found
      mockQuery.mockResolvedValueOnce({ rows: [{}] });
      // Query 2: UPDATE users password → ok
      mockQuery.mockResolvedValueOnce({ rows: [], rowCount: 1 });
      // Query 3: UPDATE token used_at → ok
      mockQuery.mockResolvedValueOnce({ rows: [], rowCount: 1 });
    });

    await svc.verifyPasswordResetCode('test@example.com', '123456', 'NewValidPass123!@#');

    expect(revokeAllSessions).toHaveBeenCalledTimes(1);
    expect(revokeAllSessions).toHaveBeenCalledWith('user-1');
  });
});
