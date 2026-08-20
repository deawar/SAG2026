/** @jest-environment jsdom */

/**
 * Regression test for the "one-click logout" bug.
 *
 * After Phase 2 the access/refresh/2FA tokens are httpOnly cookies cleared ONLY
 * by the server's POST /api/auth/logout response. authManager.logout() awaits
 * that request. The navbar handler used to fire it and navigate synchronously,
 * which aborted the in-flight request — the cookies survived, so the user was
 * still logged in and had to click Logout a second time. The handler must await
 * authManager.logout() before navigating.
 */
const UIComponents = require('../../../public/js/ui-components.js');

describe('navbar logout awaits authManager.logout() before navigating', () => {
  let resolveLogout;

  beforeEach(() => {
    document.body.innerHTML = '<button id="logout-btn">Logout</button>';
    Object.defineProperty(window, 'location', {
      writable: true,
      configurable: true,
      value: { href: '/teacher-dashboard.html' }
    });
    const logout = jest.fn(() => new Promise((r) => { resolveLogout = r; }));
    global.authManager = { logout };
    window.authManager = global.authManager;
  });

  test('defers navigation until the server logout resolves (single click logs out)', async () => {
    UIComponents.setupNavbarEventListeners();
    document.getElementById('logout-btn').click();

    // Logout kicked off, but navigation must NOT have happened yet —
    // navigating now would abort the cookie-clearing request.
    expect(global.authManager.logout).toHaveBeenCalledTimes(1);
    expect(window.location.href).toBe('/teacher-dashboard.html');

    // Server logout completes → only now do we navigate home.
    resolveLogout();
    await Promise.resolve();
    await Promise.resolve();

    expect(window.location.href).toBe('/');
  });
});
