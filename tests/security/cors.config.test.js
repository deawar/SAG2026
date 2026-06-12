// tests/security/cors.config.test.js
describe('CORS configuration security', () => {
  it('app.js does not use origin wildcard (*)', () => {
    const fs = require('fs');
    const src = fs.readFileSync(
      require.resolve('../../src/app.js'),
      'utf8'
    );
    expect(src).not.toMatch(/origin\s*:\s*['"`]\*['"`]/);
  });

  it('app.js CORS uses a function-based origin check', () => {
    const fs = require('fs');
    const src = fs.readFileSync(
      require.resolve('../../src/app.js'),
      'utf8'
    );
    // The callback pattern: origin: (origin, callback) => {
    expect(src).toMatch(/origin\s*:\s*\(origin\s*,\s*callback\)\s*=>/);
  });
});
