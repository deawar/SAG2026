process.env.NODE_ENV = 'test';
if (!process.env.JWT_ACCESS_SECRET) { process.env.JWT_ACCESS_SECRET = 'test-access-secret'; }
if (!process.env.JWT_REFRESH_SECRET) { process.env.JWT_REFRESH_SECRET = 'test-refresh-secret'; }

const UserController = require('../../../src/controllers/userController');

function fakeRes() {
  const res = {
    statusCode: 200,
    cookies: [], cleared: [], body: null,
    status(c) { this.statusCode = c; return this; },
    cookie(name, val, opts) { this.cookies.push({ name, val, opts }); return this; },
    clearCookie(name, opts) { this.cleared.push({ name, opts }); return this; },
    json(payload) { this.body = payload; return this; }
  };
  return res;
}

// Minimal authService + userModel doubles for the refresh happy path.
function makeController() {
  const authService = {
    jwtService: {
      verifyRefreshToken: jest.fn(() => ({ sub: 'user-1', jti: 'old-jti', exp: Math.floor(Date.now() / 1000) + 3600 })),
      generateAccessToken: jest.fn(() => ({ token: 'new-access', expiresIn: '15m' })),
      generateRefreshToken: jest.fn(() => ({ token: 'new-refresh', jti: 'new-jti' }))
    },
    sessionService: {
      checkSession: jest.fn().mockResolvedValue(null),
      updateLastUsed: jest.fn().mockResolvedValue(undefined),
      revokeSession: jest.fn().mockResolvedValue(undefined)
    }
  };
  const userModel = { getById: jest.fn().mockResolvedValue({ id: 'user-1', email: 'u@e.com', role: 'STUDENT', school_id: null, two_fa_enabled: false }) };
  const ctrl = new UserController(userModel, authService);
  ctrl._createSessionRecord = jest.fn().mockResolvedValue(undefined);
  return ctrl;
}

describe('UserController.login — sets cookie, omits refresh token from body', () => {
  function makeLoginController() {
    const authService = {
      jwtService: {
        generateAccessToken: jest.fn(() => ({ token: 'access-1', expiresIn: '15m' })),
        generateRefreshToken: jest.fn(() => ({ token: 'refresh-1', jti: 'jti-1' }))
      }
    };
    const userModel = {
      getByEmail: jest.fn().mockResolvedValue({
        // Under-13 student: the only role exempt from forced 2FA, so login
        // issues tokens directly (what this cookie test exercises).
        id: 'user-1', email: 'u@e.com', password_hash: 'hash', role: 'STUDENT',
        school_id: null, first_name: 'U', last_name: 'Ser',
        account_status: 'ACTIVE', email_verified_at: new Date(),
        requires_parental_consent: true, parental_consent_status: 'granted',
        two_fa_enabled: false
      }),
      checkPassword: jest.fn().mockResolvedValue(true),
      updateLastLogin: jest.fn().mockResolvedValue(undefined)
    };
    const ctrl = new UserController(userModel, authService);
    ctrl._createSessionRecord = jest.fn().mockResolvedValue(undefined);
    return ctrl;
  }

  test('login sets refresh_token cookie and body has no refreshToken', async () => {
    const ctrl = makeLoginController();
    const res = fakeRes();
    await ctrl.login({ body: { email: 'u@e.com', password: 'pw' } }, res, jest.fn());

    expect(res.body.success).toBe(true);
    expect(res.body.data.accessToken).toBe('access-1');
    expect(res.body.data.refreshToken).toBeUndefined();
    const set = res.cookies.find(c => c.name === 'refresh_token');
    expect(set.val).toBe('refresh-1');
    expect(set.opts).toEqual(expect.objectContaining({ httpOnly: true, sameSite: 'strict', path: '/api/auth' }));
  });
});

describe('UserController.verify2FA — sets cookie, omits refresh token from body', () => {
  test('verify2FA sets refresh_token cookie and body has no refreshToken', async () => {
    const authService = {
      jwtService: {
        verifyAccessToken: jest.fn(() => ({ sub: 'user-1', purpose: '2fa_challenge' })),
        generateAccessToken: jest.fn(() => ({ token: 'access-2', expiresIn: '15m' })),
        generateRefreshToken: jest.fn(() => ({ token: 'refresh-2', jti: 'jti-2' }))
      },
      twoFactorService: { verifyToken: jest.fn(() => true), decryptSecret: jest.fn(s => s) }
    };
    const userModel = {
      getById: jest.fn().mockResolvedValue({
        id: 'user-1', email: 'u@e.com', role: 'STUDENT', school_id: null,
        first_name: 'U', last_name: 'Ser', two_fa_enabled: true, two_fa_secret: 'SECRET'
      }),
      updateLastLogin: jest.fn().mockResolvedValue(undefined)
    };
    const ctrl = new UserController(userModel, authService);
    ctrl._createSessionRecord = jest.fn().mockResolvedValue(undefined);
    const res = fakeRes();
    await ctrl.verify2FA({ body: { code: '123456' }, headers: { authorization: 'Bearer temp' } }, res, jest.fn());

    expect(res.body.data.accessToken).toBe('access-2');
    expect(res.body.data.refreshToken).toBeUndefined();
    const set = res.cookies.find(c => c.name === 'refresh_token');
    expect(set.val).toBe('refresh-2');
  });
});

describe('UserController.refreshToken — cookie-based', () => {
  test('401 when no refresh cookie is present', async () => {
    const ctrl = makeController();
    const res = fakeRes();
    await ctrl.refreshToken({ cookies: {}, body: {} }, res, jest.fn());
    expect(res.statusCode).toBe(401);
  });

  test('reads the cookie, sets a rotated cookie, and returns no refresh token in the body', async () => {
    const ctrl = makeController();
    const res = fakeRes();
    await ctrl.refreshToken({ cookies: { refresh_token: 'the-cookie-token' }, body: {} }, res, jest.fn());

    expect(ctrl.authService.jwtService.verifyRefreshToken).toHaveBeenCalledWith('the-cookie-token');
    expect(res.body.data.accessToken).toBe('new-access');
    expect(res.body.data.refreshToken).toBeUndefined();
    const set = res.cookies.find(c => c.name === 'refresh_token');
    expect(set).toBeTruthy();
    expect(set.val).toBe('new-refresh');
    expect(set.opts).toEqual(expect.objectContaining({ httpOnly: true, sameSite: 'strict', path: '/api/auth' }));
  });
});

describe('UserController.logout clears the refresh cookie', () => {
  test('logout clears refresh_token with the matching path', async () => {
    // Mock tokenBlacklist for this test
    const { tokenBlacklist } = require('../../../src/services/authenticationService');
    jest.spyOn(tokenBlacklist, 'revoke').mockResolvedValue(undefined);

    const ctrl = new UserController({}, { jwtService: {} });
    const res = fakeRes();
    // req.user carries the access token's jti/exp (set by verifyToken middleware).
    await ctrl.logout({ user: { id: 'user-1', jti: 'access-jti', exp: Math.floor(Date.now() / 1000) + 900 }, body: {} }, res, jest.fn());

    expect(res.body.success).toBe(true);
    const cleared = res.cleared.find(c => c.name === 'refresh_token');
    expect(cleared).toBeTruthy();
    expect(cleared.opts).toEqual(expect.objectContaining({ path: '/api/auth' }));

    tokenBlacklist.revoke.mockRestore();
  });
});
