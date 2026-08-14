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
