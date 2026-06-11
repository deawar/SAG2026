// tests/security/jwt.secrets.test.js
// Regression guard: ensures the hardcoded 'dev-secret' fallback has been
// removed from both auth and user routes so a missing env var causes a fatal
// startup error rather than silently using a well-known secret.

describe('JWT secret environment guards', () => {
  it('authRoutes.js source does not contain the string dev-secret', () => {
    const fs = require('fs');
    const src = fs.readFileSync(
      require.resolve('../../src/routes/authRoutes.js'),
      'utf8'
    );
    expect(src).not.toContain("'dev-secret'");
    expect(src).not.toContain('"dev-secret"');
  });

  it('userRoutes.js source does not contain the string dev-secret', () => {
    const fs = require('fs');
    const src = fs.readFileSync(
      require.resolve('../../src/routes/userRoutes.js'),
      'utf8'
    );
    expect(src).not.toContain("'dev-secret'");
    expect(src).not.toContain('"dev-secret"');
  });
});
