/** @jest-environment jsdom */
const store = {};
Object.defineProperty(global, 'localStorage', { writable: true, value: {
  getItem: (k) => store[k] ?? null, setItem: (k, v) => { store[k] = String(v); }, removeItem: (k) => { delete store[k]; } } });
global.apiClient = { refreshToken: jest.fn() };
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
