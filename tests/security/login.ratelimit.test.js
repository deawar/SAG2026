// tests/security/login.ratelimit.test.js
describe('login routes use loginLimiter', () => {
  it('authRoutes.js imports loginLimiter', () => {
    const fs = require('fs');
    const src = fs.readFileSync(
      require.resolve('../../src/routes/authRoutes.js'),
      'utf8'
    );
    expect(src).toContain('loginLimiter');
  });

  it('loginLimiter appears before the /login route handler', () => {
    const fs = require('fs');
    const src = fs.readFileSync(
      require.resolve('../../src/routes/authRoutes.js'),
      'utf8'
    );
    const loginRouteIdx   = src.indexOf("router.post('/login'");
    const limiterIdx      = src.indexOf('loginLimiter', loginRouteIdx);
    const nextRouteIdx    = src.indexOf("router.post('", loginRouteIdx + 1);
    expect(limiterIdx).toBeGreaterThan(loginRouteIdx);
    expect(limiterIdx).toBeLessThan(nextRouteIdx);
  });

  it('loginLimiter appears before the /verify-2fa route handler', () => {
    const fs = require('fs');
    const src = fs.readFileSync(
      require.resolve('../../src/routes/authRoutes.js'),
      'utf8'
    );
    const verifyRouteIdx  = src.indexOf("router.post('/verify-2fa'");
    const limiterIdx      = src.indexOf('loginLimiter', verifyRouteIdx);
    const nextRouteIdx    = src.indexOf("router.post('", verifyRouteIdx + 1);
    expect(limiterIdx).toBeGreaterThan(verifyRouteIdx);
    expect(limiterIdx).toBeLessThan(nextRouteIdx);
  });
});
