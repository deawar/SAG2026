/**
 * 2FA required for all accounts except under-13 students.
 * Covers the requiresTwoFactor decision matrix + the login-gate integration.
 */
process.env.NODE_ENV = 'test';
if (!process.env.JWT_ACCESS_SECRET) { process.env.JWT_ACCESS_SECRET = 'test-access-secret'; }
if (!process.env.JWT_REFRESH_SECRET) { process.env.JWT_REFRESH_SECRET = 'test-refresh-secret'; }

const UserController = require('../../../src/controllers/userController');
const { requiresTwoFactor } = UserController;

describe('requiresTwoFactor decision matrix', () => {
  test('required for staff and bidders', () => {
    for (const role of ['SITE_ADMIN', 'SCHOOL_ADMIN', 'TEACHER', 'BIDDER']) {
      expect(requiresTwoFactor({ role })).toBe(true);
    }
  });

  test('required for students 13+ (no parental consent flag)', () => {
    expect(requiresTwoFactor({ role: 'STUDENT', requires_parental_consent: false })).toBe(true);
  });

  test('NOT required for under-13 students (requires_parental_consent)', () => {
    expect(requiresTwoFactor({ role: 'STUDENT', requires_parental_consent: true })).toBe(false);
  });
});

// ----- Login-gate integration -----

function fakeRes() {
  return {
    statusCode: 200, body: null,
    status(c) { this.statusCode = c; return this; },
    cookie() { return this; },
    json(p) { this.body = p; return this; }
  };
}

function makeController(userRow) {
  const authService = {
    jwtService: {
      generateAccessToken: jest.fn(() => ({ token: 'access-1', expiresIn: '15m' })),
      generateRefreshToken: jest.fn(() => ({ token: 'refresh-1', jti: 'jti-1' }))
    }
  };
  const userModel = {
    getByEmail: jest.fn().mockResolvedValue(userRow),
    checkPassword: jest.fn().mockResolvedValue(true),
    updateLastLogin: jest.fn().mockResolvedValue(undefined)
  };
  const ctrl = new UserController(userModel, authService);
  ctrl._createSessionRecord = jest.fn().mockResolvedValue(undefined);
  return ctrl;
}

// A login-eligible user (identity proven, email verified, active, consent granted).
function baseUser(overrides) {
  return {
    id: 'u1', email: 'u@e.com', password_hash: 'h', role: 'BIDDER',
    school_id: null, first_name: 'U', last_name: 'Ser',
    account_status: 'ACTIVE', email_verified_at: new Date(),
    requires_parental_consent: false, parental_consent_status: 'granted',
    two_fa_enabled: false,
    ...overrides
  };
}

describe('login gate — 2FA enforcement', () => {
  test('bidder without 2FA is forced to set it up', async () => {
    const ctrl = makeController(baseUser({ role: 'BIDDER' }));
    const res = fakeRes();
    await ctrl.login({ body: { email: 'u@e.com', password: 'pw' } }, res, jest.fn());
    expect(res.body.data.requiresTwoFactorSetup).toBe(true);
    expect(res.body.data.accessToken).toBeUndefined();
  });

  test('student 13+ without 2FA is forced to set it up', async () => {
    const ctrl = makeController(baseUser({ role: 'STUDENT', requires_parental_consent: false }));
    const res = fakeRes();
    await ctrl.login({ body: { email: 'u@e.com', password: 'pw' } }, res, jest.fn());
    expect(res.body.data.requiresTwoFactorSetup).toBe(true);
  });

  test('under-13 student without 2FA logs in normally (exempt, not forced)', async () => {
    const ctrl = makeController(baseUser({ role: 'STUDENT', requires_parental_consent: true }));
    const res = fakeRes();
    await ctrl.login({ body: { email: 'u@e.com', password: 'pw' } }, res, jest.fn());
    expect(res.body.data.requiresTwoFactorSetup).toBeUndefined();
    expect(res.body.data.accessToken).toBe('access-1');
  });

  test('a user WITH 2FA gets the MFA challenge, not forced setup', async () => {
    const ctrl = makeController(baseUser({ role: 'BIDDER', two_fa_enabled: true }));
    const res = fakeRes();
    await ctrl.login({ body: { email: 'u@e.com', password: 'pw' } }, res, jest.fn());
    expect(res.body.data.requiresMfa).toBe(true);
    expect(res.body.data.requiresTwoFactorSetup).toBeUndefined();
  });
});
