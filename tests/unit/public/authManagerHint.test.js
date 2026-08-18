/** @jest-environment jsdom */
const store = {};
Object.defineProperty(global, 'localStorage', { writable: true, value: {
  getItem: (k) => store[k] ?? null, setItem: (k, v) => { store[k] = String(v); }, removeItem: (k) => { delete store[k]; } } });
global.apiClient = { refreshToken: jest.fn(), verify2FA: jest.fn() };
const AuthManager = require('../../../public/js/auth-manager.js');

function fresh() { Object.keys(store).forEach(k => delete store[k]); return new AuthManager(); }

describe('AuthManager hint-based state', () => {
  test('isAuthenticated false without a user', () => {
    expect(fresh().isAuthenticated()).toBe(false);
  });
  test('isAuthenticated true with user + future expiry hint', () => {
    const m = fresh();
    m.setUser({ id: 'u1', role: 'STUDENT' });
    m._setAuthExpiry('15m');
    expect(m.isAuthenticated()).toBe(true);
  });
  test('isAuthenticated false when hint expired', () => {
    const m = fresh();
    m.setUser({ id: 'u1' });
    store.auth_expires_at = String(Date.now() - 1000);
    expect(m.isAuthenticated()).toBe(false);
  });
  test('no token API remains', () => {
    const m = fresh();
    expect(m.decodeToken).toBeUndefined();
    expect(m.isTokenExpired).toBeUndefined();
    expect(m.token).toBeUndefined();
  });
  test('clearAuth wipes user + hint', () => {
    const m = fresh(); m.setUser({ id: 'u1' }); m._setAuthExpiry('15m');
    m.clearAuth();
    expect(m.user).toBeNull();
    expect(store.auth_expires_at).toBeUndefined();
  });
});

describe('AuthManager.verify2FA — cookie-auth hint migration', () => {
  beforeEach(() => { Object.keys(store).forEach(k => delete store[k]); jest.clearAllMocks(); });

  test('on success sets expiry hint, stores user, clears 2FA flags', async () => {
    const m = new AuthManager();
    store['2fa_required'] = 'true';
    store['2fa_token'] = 'tok';
    global.apiClient.verify2FA.mockResolvedValueOnce({
      success: true,
      data: {
        expiresIn: 900,
        userId: 'u42',
        email: 'alice@example.com',
        firstName: 'Alice',
        lastName: 'Smith',
        role: 'STUDENT',
        schoolId: 'school-1'
      }
    });
    const result = await m.verify2FA('123456');
    expect(result.success).toBe(true);
    expect(result.user).toMatchObject({ id: 'u42', email: 'alice@example.com', role: 'STUDENT', schoolId: 'school-1' });
    expect(Number(store.auth_expires_at)).toBeGreaterThan(Date.now());
    expect(store['2fa_required']).toBeUndefined();
    expect(store['2fa_token']).toBeUndefined();
    expect(m.user).toMatchObject({ id: 'u42' });
    expect(m.require2FA).toBe(false);
  });

  test('on failure returns success:false without touching hint', async () => {
    const m = new AuthManager();
    global.apiClient.verify2FA.mockResolvedValueOnce({ success: false, message: 'Bad code' });
    const result = await m.verify2FA('000000');
    expect(result.success).toBe(false);
    expect(result.error).toBe('Bad code');
    expect(m.user).toBeNull();
  });

  test('does not reference response.token', async () => {
    const m = new AuthManager();
    // If the old branch were alive, a response with only `.token` would set the user.
    global.apiClient.verify2FA.mockResolvedValueOnce({ token: 'old-style-token', user: { id: 'evil' } });
    const result = await m.verify2FA('111111');
    // New code gates on response.success — absent here — so returns failure
    expect(result.success).toBe(false);
    expect(m.user).toBeNull();
  });
});
