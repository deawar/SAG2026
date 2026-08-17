process.env.JWT_ACCESS_SECRET = 'test-access-secret';
process.env.JWT_REFRESH_SECRET = 'test-refresh-secret';
const UserController = require('../../../src/controllers/userController');

function fakeRes() {
  return { statusCode: 200, cookies: [], cleared: [], body: null,
    status(c) { this.statusCode = c; return this; },
    cookie(n, v, o) { this.cookies.push({ n, v, o }); return this; },
    clearCookie(n, o) { this.cleared.push({ n, o }); return this; },
    json(b) { this.body = b; return this; } };
}

describe('login sets access_token cookie and omits it from body', () => {
  test('cookie set, body has no accessToken', async () => {
    const authService = { jwtService: {
      generateAccessToken: jest.fn(() => ({ token: 'access-1', expiresIn: '15m' })),
      generateRefreshToken: jest.fn(() => ({ token: 'refresh-1', jti: 'j1' })) } };
    const userModel = {
      getByEmail: jest.fn().mockResolvedValue({ id: 'u1', email: 'u@e.com', password_hash: 'h', role: 'STUDENT',
        school_id: null, first_name: 'U', last_name: 'r', account_status: 'ACTIVE', email_verified_at: new Date(),
        requires_parental_consent: true, parental_consent_status: 'granted', two_fa_enabled: false }),
      checkPassword: jest.fn().mockResolvedValue(true), updateLastLogin: jest.fn().mockResolvedValue() };
    const ctrl = new UserController(userModel, authService);
    ctrl._createSessionRecord = jest.fn().mockResolvedValue();
    const res = fakeRes();
    await ctrl.login({ body: { email: 'u@e.com', password: 'pw' } }, res, jest.fn());
    expect(res.cookies.find(c => c.n === 'access_token').v).toBe('access-1');
    expect(res.body.data.accessToken).toBeUndefined();
    expect(res.body.data.expiresIn).toBe('15m');
  });
});

describe('logout clears the access_token cookie', () => {
  test('access_token cleared', async () => {
    const { tokenBlacklist } = require('../../../src/services/authenticationService');
    jest.spyOn(tokenBlacklist, 'revoke').mockResolvedValue();
    const ctrl = new UserController({}, { jwtService: {} });
    const res = fakeRes();
    await ctrl.logout({ user: { id: 'u1', jti: 'a1', exp: Math.floor(Date.now()/1000)+900 }, body: {} }, res, jest.fn());
    expect(res.cleared.find(c => c.n === 'access_token')).toBeTruthy();
    tokenBlacklist.revoke.mockRestore();
  });
});
