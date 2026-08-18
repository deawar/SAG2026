process.env.NODE_ENV = 'test';
if (!process.env.JWT_ACCESS_SECRET) { process.env.JWT_ACCESS_SECRET = 'test-access-secret'; }

const UserController = require('../../../src/controllers/userController');
const { TwoFactorService } = require('../../../src/services/authenticationService');

function fakeRes() {
  return {
    statusCode: 200, body: null,
    status(c) { this.statusCode = c; return this; },
    cookie() { return this; },
    clearCookie() { return this; },
    json(p) { this.body = p; return this; }
  };
}

// Build a controller whose verify2FA reaches the TOTP check. twoFactorService is
// a real TwoFactorService (so decryptSecret works); verifyToken is spied so we
// can assert it receives the DECRYPTED secret.
function setup(storedSecret) {
  const twoFactorService = new TwoFactorService({ db: { query: jest.fn() } });
  const verifySpy = jest.spyOn(twoFactorService, 'verifyToken').mockReturnValue(true);
  const authService = {
    twoFactorService,
    jwtService: {
      verifyAccessToken: jest.fn(() => ({ sub: 'user-1', purpose: '2fa_challenge' })),
      generateAccessToken: jest.fn(() => ({ token: 'access-tok', expiresIn: 900 })),
      generateRefreshToken: jest.fn(() => ({ token: 'refresh-tok', jti: 'jti-1' }))
    }
  };
  const userModel = {
    getById: jest.fn().mockResolvedValue({
      id: 'user-1', email: 'u@e.com', role: 'TEACHER', school_id: 's1',
      first_name: 'U', last_name: 'Ser', two_fa_enabled: true, two_fa_secret: storedSecret
    }),
    updateLastLogin: jest.fn().mockResolvedValue(undefined)
  };
  const ctrl = new UserController(userModel, authService);
  ctrl._createSessionRecord = jest.fn().mockResolvedValue(undefined);
  return { ctrl, verifySpy, twoFactorService };
}

async function callVerify(ctrl) {
  const jwt = require('jsonwebtoken');
  const tempToken = jwt.sign(
    { sub: 'user-1', purpose: '2fa_challenge' },
    process.env.JWT_ACCESS_SECRET,
    { algorithm: 'HS256' }
  );
  const res = fakeRes();
  await ctrl.verify2FA(
    { body: { code: '123456' }, cookies: { twofa_token: tempToken }, headers: {} },
    res, jest.fn()
  );
  return res;
}

describe('verify2FA decrypts the stored TOTP secret', () => {
  test('encrypted stored secret → verifyToken receives the decrypted secret', async () => {
    const plaintext = 'JBSWY3DPEHPK3PXP';
    const tfs = new TwoFactorService({ db: { query: jest.fn() } });
    const encrypted = tfs.encryptSecret(plaintext);

    const { ctrl, verifySpy } = setup(encrypted);
    const res = await callVerify(ctrl);

    expect(verifySpy).toHaveBeenCalledWith(plaintext, '123456');
    expect(res.body.success).toBe(true);
  });

  test('legacy plaintext stored secret still verifies (fallback)', async () => {
    const { ctrl, verifySpy } = setup('JBSWY3DPEHPK3PXP');
    const res = await callVerify(ctrl);

    expect(verifySpy).toHaveBeenCalledWith('JBSWY3DPEHPK3PXP', '123456');
    expect(res.body.success).toBe(true);
  });
});
