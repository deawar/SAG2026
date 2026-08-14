/** @jest-environment jsdom */

/**
 * Regression tests for AuthManager.refreshAccessToken()
 *
 * Bug: the old guard was `if (!this.refreshToken)` but this.refreshToken is
 * ALWAYS null (refresh token is now an httpOnly cookie, not JS-readable).
 * That meant the method short-circuited to clearAuth() on every call, logging
 * the user out before ever hitting /api/auth/refresh.
 *
 * Fix: gate on `this.token` (the access token) instead.
 */

// --- Globals required before auth-manager.js is loaded ---

const localStorageStore = {};
const localStorageMock = {
  getItem: jest.fn((key) => localStorageStore[key] ?? null),
  setItem: jest.fn((key, value) => { localStorageStore[key] = String(value); }),
  removeItem: jest.fn((key) => { delete localStorageStore[key]; })
};
Object.defineProperty(global, 'localStorage', { value: localStorageMock, writable: true });

const apiClientMock = {
  setToken: jest.fn(),
  refreshToken: jest.fn()
};
global.apiClient = apiClientMock;

// auth-manager.js calls `window.dispatchEvent(new CustomEvent(...))` in
// emitUserChange() and `window.addEventListener(...)` at module level.
// jsdom provides window, but we need CustomEvent available on global.
// jest-environment jsdom already provides both — no extra setup needed.

// Load the module (executes `window.authManager = new AuthManager()` globally)
const AuthManager = require('../../../public/js/auth-manager.js');

// ─── helpers ────────────────────────────────────────────────────────────────

function makeManager({ token = null } = {}) {
  // Reset localStorage mock state
  Object.keys(localStorageStore).forEach((k) => delete localStorageStore[k]);
  localStorageMock.getItem.mockImplementation((key) => localStorageStore[key] ?? null);

  // Pre-seed an access token if requested
  if (token) {
    localStorageStore.auth_token = token;
  }

  return new AuthManager();
}

// ─── tests ──────────────────────────────────────────────────────────────────

describe('AuthManager.refreshAccessToken() — httpOnly cookie path', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    // Re-wire the mock so getItem sees the current store after clearAllMocks
    localStorageMock.getItem.mockImplementation((key) => localStorageStore[key] ?? null);
  });

  // ── REGRESSION: the core bug ──────────────────────────────────────────────
  test(
    'REGRESSION: with access token set and refreshToken===null, calls apiClient.refreshToken() and returns true',
    async () => {
      // GIVEN: manager has an access token (user is logged in) but NO in-memory
      // refresh token (it's an httpOnly cookie — always null in JS).
      const mgr = makeManager({ token: 'old-access-token' });
      expect(mgr.token).toBe('old-access-token');
      expect(mgr.refreshToken).toBeNull(); // always null now

      // Stub: server returns a new access token (cookie was valid)
      apiClientMock.refreshToken.mockResolvedValueOnce({
        data: { accessToken: 'new-access' }
      });

      // WHEN
      const result = await mgr.refreshAccessToken();

      // THEN: cookie drove the refresh — must have called the endpoint
      expect(apiClientMock.refreshToken).toHaveBeenCalledTimes(1);
      // New access token stored
      expect(mgr.token).toBe('new-access');
      // Did NOT clear auth
      expect(mgr.user).toBeNull(); // user was null to start; just confirm clearAuth not called destructively
      expect(result).toBe(true);

      // Verify the OLD bug: the old guard `if (!this.refreshToken)` would have
      // returned false here without calling apiClient.refreshToken().
      // The test above would fail against the buggy version because
      // apiClientMock.refreshToken would have 0 calls and result would be false.
    }
  );

  // ── success path: token stored ────────────────────────────────────────────
  test('stores the new access token on success', async () => {
    const mgr = makeManager({ token: 'old-access' });

    apiClientMock.refreshToken.mockResolvedValueOnce({
      data: { accessToken: 'fresh-token' }
    });

    await mgr.refreshAccessToken();

    expect(mgr.token).toBe('fresh-token');
    expect(localStorageMock.setItem).toHaveBeenCalledWith('auth_token', 'fresh-token');
    expect(apiClientMock.setToken).toHaveBeenCalledWith('fresh-token');
  });

  // ── no in-memory access token → clearAuth immediately ────────────────────
  test('returns false and calls clearAuth when this.token is falsy', async () => {
    const mgr = makeManager(); // no token
    expect(mgr.token).toBeNull();

    const result = await mgr.refreshAccessToken();

    expect(result).toBe(false);
    expect(apiClientMock.refreshToken).not.toHaveBeenCalled();
    // clearAuth zeros out state
    expect(mgr.token).toBeNull();
    expect(mgr.user).toBeNull();
  });

  // ── server returns no token in body → clearAuth ──────────────────────────
  test('returns false and clears auth when response carries no accessToken', async () => {
    const mgr = makeManager({ token: 'old-access' });

    apiClientMock.refreshToken.mockResolvedValueOnce({ data: {} }); // no accessToken

    const result = await mgr.refreshAccessToken();

    expect(result).toBe(false);
    expect(mgr.token).toBeNull();
  });

  // ── network / 401 error → clearAuth ──────────────────────────────────────
  test('returns false and clears auth when apiClient.refreshToken() rejects', async () => {
    const mgr = makeManager({ token: 'old-access' });

    apiClientMock.refreshToken.mockRejectedValueOnce(new Error('401 Unauthorized'));

    const result = await mgr.refreshAccessToken();

    expect(result).toBe(false);
    expect(mgr.token).toBeNull();
  });

  // ── no newRefresh block: response body must NOT call setRefreshToken ──────
  test('does not call setRefreshToken even if response body contained a refreshToken field', async () => {
    const mgr = makeManager({ token: 'old-access' });
    const setRefreshSpy = jest.spyOn(mgr, 'setRefreshToken');

    // Server accidentally (or in old-compat mode) sends a refresh token body field
    apiClientMock.refreshToken.mockResolvedValueOnce({
      data: { accessToken: 'new-access', refreshToken: 'should-be-ignored' }
    });

    const result = await mgr.refreshAccessToken();

    expect(result).toBe(true);
    // setRefreshToken must NOT be called — the dead code block was removed
    expect(setRefreshSpy).not.toHaveBeenCalled();
  });
});
