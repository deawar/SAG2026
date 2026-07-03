/**
 * Auth Safety Integration Tests — Task 6
 *
 * Verifies two security properties:
 *  A. Login does not disclose account state before the password is verified.
 *     Wrong-password attempts must always return 401 Invalid credentials,
 *     even for accounts that have a special state (unverified, COPPA-pending, etc.).
 *  B. Duplicate-email registration returns a generic neutral message so an
 *     attacker cannot determine whether an address is already registered.
 *
 * Uses the real test harness (createTestApp / mockDb) — no live DB required.
 */

process.env.NODE_ENV = 'test';
if (!process.env.JWT_ACCESS_SECRET) { process.env.JWT_ACCESS_SECRET = 'test-access-secret'; }
if (!process.env.JWT_REFRESH_SECRET) { process.env.JWT_REFRESH_SECRET = 'test-refresh-secret'; }

const request = require('supertest');
const createTestApp = require('../../helpers/createTestApp');
const mockDb = require('../../helpers/mockDb');

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * A user row for an account that has NOT verified its email.
 * password_hash is a bcrypt-invalid sentinel — bcrypt.compare will return
 * false for any input against this value, so a wrong-password attempt will
 * correctly receive 401.
 */
const UNVERIFIED_USER_ROW = {
  id: 'user-safety-1',
  email: 'unverified@example.com',
  password_hash: '$2b$12$placeholder_that_never_matches',
  first_name: 'Safety',
  last_name: 'Test',
  role: 'STUDENT',
  account_status: 'PENDING',
  email_verified_at: null,         // not yet verified
  two_fa_enabled: false,
  requires_parental_consent: false,
  parental_consent_status: 'not_required',
  school_id: null,
  created_at: new Date()
};

// ---------------------------------------------------------------------------
// Test suite A: no account-state disclosure before password check
// ---------------------------------------------------------------------------

describe('Login does not disclose account state pre-password (Task 6)', () => {
  let app;

  beforeEach(() => {
    app = createTestApp();
  });

  test('unverified account + wrong password returns generic 401, no error field', async () => {
    // getByEmail returns an unverified user.
    // The supplied password is wrong, so checkPassword (bcrypt.compare) returns false.
    // BEFORE Task 6 the handler returned 403 email_not_verified before checking the
    // password — leaking account state. After Task 6 it must return 401.
    mockDb.query.mockResolvedValueOnce({
      rows: [UNVERIFIED_USER_ROW],
      rowCount: 1
    });

    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: 'unverified@example.com', password: 'DefinitelyWrong123!' });

    expect(res.status).toBe(401);
    expect(res.body.message).toBe('Invalid credentials');
    // Must NOT leak account state in any field
    expect(res.body.error).toBeUndefined();
    expect(res.body.success).toBe(false);
  });

  test('COPPA-pending account + wrong password returns generic 401, no error field', async () => {
    // Same guarantee for COPPA accounts — wrong password must not leak
    // "parental_consent_required" before identity is proven.
    mockDb.query.mockResolvedValueOnce({
      rows: [{
        ...UNVERIFIED_USER_ROW,
        id: 'user-coppa-1',
        email: 'coppa@example.com',
        requires_parental_consent: true,
        parental_consent_status: 'pending'
      }],
      rowCount: 1
    });

    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: 'coppa@example.com', password: 'DefinitelyWrong123!' });

    expect(res.status).toBe(401);
    expect(res.body.message).toBe('Invalid credentials');
    expect(res.body.error).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// Test suite B: duplicate registration returns generic neutral message
// ---------------------------------------------------------------------------

describe('Duplicate-email registration returns neutral message (Task 6)', () => {
  let app;

  beforeEach(() => {
    app = createTestApp();
  });

  test('duplicate email (EMAIL_ALREADY_EXISTS) returns 409 with neutral message', async () => {
    // userModel.create: email uniqueness check finds an existing user → throws EMAIL_ALREADY_EXISTS.
    mockDb.query
      .mockResolvedValueOnce({ rows: [{ id: 'existing-1' }], rowCount: 1 }); // email exists check

    const res = await request(app)
      .post('/api/auth/register')
      .send({
        firstName: 'Dup',
        lastName: 'User',
        email: 'existing@example.com',
        password: 'ValidPass123!@#',
        accountType: 'bidder'
      });

    expect(res.status).toBe(409);
    expect(res.body.message).toBe(
      'If this email is available, your account has been created. Check your inbox to verify.'
    );
    // Must NOT hint at account existence
    expect(res.body.code).toBeUndefined();
    expect(res.body.message).not.toMatch(/already have an account/i);
    expect(res.body.message).not.toMatch(/already registered/i);
  });

  test('duplicate email (DB 23505 constraint) returns 409 with neutral message', async () => {
    // Simulate a race condition where the INSERT itself hits the unique constraint.
    mockDb.query
      .mockResolvedValueOnce({ rows: [], rowCount: 0 })  // uniqueness check passes
      .mockRejectedValueOnce(
        Object.assign(new Error('duplicate key value violates unique constraint'), { code: '23505' })
      );

    const res = await request(app)
      .post('/api/auth/register')
      .send({
        firstName: 'Race',
        lastName: 'Condition',
        email: 'race@example.com',
        password: 'ValidPass123!@#',
        accountType: 'bidder'
      });

    expect(res.status).toBe(409);
    expect(res.body.message).toBe(
      'If this email is available, your account has been created. Check your inbox to verify.'
    );
    expect(res.body.code).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// Test suite C: raw link logging gated to development only (Task 7)
//
// Approach: unit-test the two helper methods directly rather than driving the
// full register flow.  A full integration path would need bcrypt (slow, ~12
// rounds), correct mockDb query sequences, and must survive rate limiters —
// all of which add fragility without exercising the security-critical code
// path any more thoroughly.  The guard is a single if-condition in each
// helper; a focused unit test is the right level.
// ---------------------------------------------------------------------------

describe('Consent/verification link logging gated to development (Task 7)', () => {
  const UserController = require('../../../src/controllers/userController');

  // Minimal stub — the helpers only need the class instantiated; they do not
  // call any userModel or authService methods themselves.
  function makeController() {
    return new UserController({}, {});
  }

  test('_sendParentConsentEmail does NOT log the consent link when NODE_ENV=production', async () => {
    const prev = process.env.NODE_ENV;
    const spy = jest.spyOn(console, 'log').mockImplementation(() => {});
    process.env.NODE_ENV = 'production';
    try {
      await makeController()._sendParentConsentEmail(
        'parent@example.com', 'Kid', 'user-id-123', 'rawtoken123'
      );
      const logged = spy.mock.calls.flat().join(' ');
      expect(logged).not.toMatch(/consent|verify|token=|http/i);
    } finally {
      spy.mockRestore();
      process.env.NODE_ENV = prev;
    }
  });

  test('_sendVerificationEmail does NOT log the verify link when NODE_ENV=production', async () => {
    const prev = process.env.NODE_ENV;
    const spy = jest.spyOn(console, 'log').mockImplementation(() => {});
    process.env.NODE_ENV = 'production';
    try {
      await makeController()._sendVerificationEmail(
        'user@example.com', 'User', 'user-id-456', 'rawtoken456'
      );
      const logged = spy.mock.calls.flat().join(' ');
      expect(logged).not.toMatch(/consent|verify|token=|http/i);
    } finally {
      spy.mockRestore();
      process.env.NODE_ENV = prev;
    }
  });

  test('_sendParentConsentEmail DOES log the consent link when NODE_ENV=development', async () => {
    const prev = process.env.NODE_ENV;
    const spy = jest.spyOn(console, 'log').mockImplementation(() => {});
    process.env.NODE_ENV = 'development';
    try {
      await makeController()._sendParentConsentEmail(
        'parent@example.com', 'Kid', 'user-id-789', 'rawtoken789'
      );
      const logged = spy.mock.calls.flat().join(' ');
      expect(logged).toMatch(/consent/i);
    } finally {
      spy.mockRestore();
      process.env.NODE_ENV = prev;
    }
  });

  test('_sendVerificationEmail DOES log the verify link when NODE_ENV=development', async () => {
    const prev = process.env.NODE_ENV;
    const spy = jest.spyOn(console, 'log').mockImplementation(() => {});
    process.env.NODE_ENV = 'development';
    try {
      await makeController()._sendVerificationEmail(
        'user@example.com', 'User', 'user-id-abc', 'rawtokenabc'
      );
      const logged = spy.mock.calls.flat().join(' ');
      expect(logged).toMatch(/verify/i);
    } finally {
      spy.mockRestore();
      process.env.NODE_ENV = prev;
    }
  });
});
