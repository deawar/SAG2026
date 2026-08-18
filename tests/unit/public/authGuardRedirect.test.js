/** @jest-environment jsdom */
/**
 * Task 14: Auth-gate guards now use window.authManager.isAuthenticated()
 * instead of localStorage.getItem('auth_token').
 *
 * This file contains:
 *   1. Source-assertion tests confirming no localStorage auth_token guard
 *      remains in the migrated files.
 *   2. A representative jsdom behavioural test for checkout.js: the guard
 *      redirects to /login.html when isAuthenticated() is false, and does
 *      not redirect when true.
 */

const fs   = require('fs');
const path = require('path');

const jsDir = path.join(__dirname, '../../../public/js');

function src(file) {
  return fs.readFileSync(path.join(jsDir, file), 'utf8');
}

// ── 1. Source assertions ────────────────────────────────────────────────────

describe('auth-gate guard files no longer read auth_token as a guard', () => {
  // For each migrated file, assert the specific guard pattern is gone.
  // (Header-build reads are separately tracked and deliberately left in place
  //  because fetch-guard.js strips them at runtime — they are inert.)

  const GUARD_RE = /localStorage\.getItem\(['"]auth_token['"]\)\s*;?\s*\n\s*if\s*\(!token\)/;

  test('admin-dashboard.js: checkAdminAccess no longer uses token guard', () => {
    const s = src('admin-dashboard.js');
    // The old guard read a token then checked !token — ensure that pattern is gone
    expect(s).not.toMatch(GUARD_RE);
    // The replacement must use authManager
    expect(s).toMatch(/authManager.*isAuthenticated/);
  });

  test('auction-labels.js: checkAuth uses authManager, not token guard', () => {
    const s = src('auction-labels.js');
    expect(s).not.toMatch(GUARD_RE);
    expect(s).toMatch(/authManager.*isAuthenticated/);
  });

  test('auction-detail.js: loadAuction guard uses authManager', () => {
    const s = src('auction-detail.js');
    // The loadAuction guard (if (!token) return _loadPublicPreview()) is gone
    expect(s).not.toMatch(/const token = localStorage\.getItem\(['"]auth_token['"]\);\s*\n\s*if \(!token\)/);
    expect(s).toMatch(/authManager.*isAuthenticated/);
  });

  test('auction-detail.js: checkLoginStatus uses authManager, not token', () => {
    const s = src('auction-detail.js');
    expect(s).not.toMatch(/checkLoginStatus[\s\S]{0,120}localStorage\.getItem\(['"]auth_token['"]\)/);
  });

  test('checkout.js: DOMContentLoaded guard uses authManager, not getToken()', () => {
    const s = src('checkout.js');
    // The old getToken() function is removed
    expect(s).not.toMatch(/function getToken\(\)/);
    // The guard uses authManager
    expect(s).toMatch(/authManager.*isAuthenticated/);
  });
});

// ── 2. Behavioural jsdom test for checkout.js guard ─────────────────────────
//
// checkout.js is an IIFE that attaches a DOMContentLoaded listener.
// We stub window.authManager.isAuthenticated() and fire the event, then assert
// whether window.location.href was set to the login URL.

describe('checkout.js DOMContentLoaded auth guard (jsdom)', () => {
  let origHref;

  beforeEach(() => {
    jest.resetModules();
    // Capture location.href assignments
    origHref = window.location.href;
    // jsdom does not allow direct assignment to location so we use defineProperty
    Object.defineProperty(window, 'location', {
      writable: true,
      value: { href: 'http://localhost/checkout.html', search: '?auctionId=42' }
    });
    // Stub URLSearchParams so window.location.search is parsed correctly
    window.URLSearchParams = global.URLSearchParams;
  });

  afterEach(() => {
    // Restore so subsequent tests aren't affected
    Object.defineProperty(window, 'location', { writable: true, value: { href: origHref } });
  });

  test('redirects to /login.html when isAuthenticated() is false', () => {
    window.authManager = { isAuthenticated: () => false };

    // Load the module — its IIFE registers the DOMContentLoaded handler
    require('../../../public/js/checkout.js');

    // Fire DOMContentLoaded synchronously
    document.dispatchEvent(new Event('DOMContentLoaded'));

    expect(window.location.href).toMatch(/\/login\.html/);
  });

  test('does NOT redirect when isAuthenticated() is true', async () => {
    // Provide a minimal fetch stub so the DOMContentLoaded async path can run
    // without hitting the network (it will fail on the wins fetch, that's fine —
    // what matters is that it did NOT redirect to login first).
    window.fetch = jest.fn().mockRejectedValue(new Error('network'));
    window.authManager = { isAuthenticated: () => true };

    require('../../../public/js/checkout.js');
    document.dispatchEvent(new Event('DOMContentLoaded'));

    // Allow microtasks to settle
    await Promise.resolve();

    expect(window.location.href).not.toMatch(/\/login\.html/);
  });
});
