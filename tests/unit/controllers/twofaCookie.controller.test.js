/**
 * Task 6: 2FA pre-auth token → twofa_token cookie
 *
 * Verifies:
 *  - login challenge branch sets twofa_token cookie, not tempToken in body
 *  - verify2FA reads twofa_token cookie and clears it on success
 */

process.env.JWT_ACCESS_SECRET = 'test-access-secret';
const UserController = require('../../../src/controllers/userController');

function fakeRes() {
  return {
    statusCode: 200,
    cookies: [],
    cleared: [],
    body: null,
    status(c) { this.statusCode = c; return this; },
    cookie(n, v, o) { this.cookies.push({ n, v, o }); return this; },
    clearCookie(n, o) { this.cleared.push({ n, o }); return this; },
    json(b) { this.body = b; return this; }
  };
}

describe('login with 2FA sets twofa_token cookie, not a body token', () => {
  test('challenge branch', async () => {
    const authService = {
      jwtService: { generateAccessToken: jest.fn(() => ({ token: 'temp-1' })) }
    };
    const userModel = {
      getByEmail: jest.fn().mockResolvedValue({
        id: 'u1',
        email: 'u@e.com',
        password_hash: 'h',
        role: 'TEACHER',
        school_id: 's1',
        account_status: 'ACTIVE',
        email_verified_at: new Date(),
        requires_parental_consent: false,
        two_fa_enabled: true
      }),
      checkPassword: jest.fn().mockResolvedValue(true)
    };
    const ctrl = new UserController(userModel, authService);
    const res = fakeRes();
    await ctrl.login({ body: { email: 'u@e.com', password: 'pw' } }, res, jest.fn());
    expect(res.cookies.find(c => c.n === 'twofa_token').v).toBe('temp-1');
    expect(res.body.data.tempToken).toBeUndefined();
    expect(res.body.data.requiresMfa).toBe(true);
  });
});

describe('verify2FA reads twofa_token cookie and clears it on success', () => {
  test('reads cookie, clears on success', async () => {
    const jwt = require('jsonwebtoken');
    const temp = jwt.sign(
      { sub: 'u1', purpose: '2fa_challenge' },
      process.env.JWT_ACCESS_SECRET,
      { algorithm: 'HS256' }
    );
    const authService = {
      jwtService: {
        verifyAccessToken: jest.fn(() => ({ sub: 'u1', purpose: '2fa_challenge' })),
        generateAccessToken: jest.fn(() => ({ token: 'access-2', expiresIn: '15m' })),
        generateRefreshToken: jest.fn(() => ({ token: 'refresh-2', jti: 'j2' }))
      },
      twoFactorService: {
        decryptSecret: jest.fn(s => s),
        verifyToken: jest.fn(() => true)
      }
    };
    const userModel = {
      getById: jest.fn().mockResolvedValue({
        id: 'u1',
        email: 'u@e.com',
        role: 'TEACHER',
        school_id: 's1',
        first_name: 'U',
        last_name: 'r',
        two_fa_enabled: true,
        two_fa_secret: 'SECRET'
      }),
      updateLastLogin: jest.fn().mockResolvedValue()
    };
    const ctrl = new UserController(userModel, authService);
    ctrl._createSessionRecord = jest.fn().mockResolvedValue();
    const res = fakeRes();
    await ctrl.verify2FA(
      { body: { code: '123456' }, cookies: { twofa_token: temp }, headers: {} },
      res,
      jest.fn()
    );
    expect(res.body.data.accessToken).toBeUndefined();
    expect(res.cookies.find(c => c.n === 'access_token').v).toBe('access-2');
    expect(res.cleared.find(c => c.n === 'twofa_token')).toBeTruthy();
  });
});
