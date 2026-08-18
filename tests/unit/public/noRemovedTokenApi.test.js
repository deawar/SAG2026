/**
 * Regression guard for Phase 2 (access token → httpOnly cookie).
 *
 * auth-manager.js and api-client.js intentionally removed the token accessors
 * getToken/setToken/setRefreshToken/decodeToken/isTokenExpired/getTokenExpiration
 * and getAuthHeaders. Any client script that still CALLS one of those on
 * `authManager`/`apiClient` throws a TypeError at runtime — which is exactly
 * how the SuperAdmin user-menu button broke (updateAuthUI() threw before the
 * navbar click handlers were attached).
 *
 * This test fails if any public/js file reintroduces such a call.
 */
const fs = require('fs');
const path = require('path');

const PUBLIC_JS = path.join(__dirname, '..', '..', '..', 'public', 'js');

// Calls that would throw because the method no longer exists.
const FORBIDDEN = /\b(?:authManager|apiClient|this\.authManager)\s*\.\s*(?:getToken|setToken|setRefreshToken|decodeToken|isTokenExpired|getTokenExpiration|getAuthHeaders)\s*\(/;

describe('no calls to removed token accessors remain in public/js', () => {
  const files = fs.readdirSync(PUBLIC_JS).filter((f) => f.endsWith('.js'));

  test.each(files)('%s has no removed token-accessor calls', (file) => {
    const src = fs.readFileSync(path.join(PUBLIC_JS, file), 'utf8');
    const match = src.match(FORBIDDEN);
    expect(match ? `${file}: ${match[0]}` : null).toBeNull();
  });
});
