/** @jest-environment jsdom */
const store = {};
Object.defineProperty(global, 'localStorage', { writable: true, value: {
  getItem: (k) => store[k] ?? null, setItem: (k, v) => { store[k] = String(v); }, removeItem: (k) => { delete store[k]; } } });
global.apiClient = { refreshToken: jest.fn() };
const AuthManager = require('../../../public/js/auth-manager.js');
function fresh() { Object.keys(store).forEach(k => delete store[k]); return new AuthManager(); }

describe('refreshAccessToken (cookie-driven)', () => {
  beforeEach(() => jest.clearAllMocks());
  test('with a user, calls refresh and updates hint on success', async () => {
    const m = fresh(); m.setUser({ id: 'u1' });
    global.apiClient.refreshToken.mockResolvedValueOnce({ data: { expiresIn: '15m' } });
    const ok = await m.refreshAccessToken();
    expect(global.apiClient.refreshToken).toHaveBeenCalledTimes(1);
    expect(ok).toBe(true);
    expect(Number(store.auth_expires_at)).toBeGreaterThan(Date.now());
  });
  test('without a user, clears auth and does not call refresh', async () => {
    const m = fresh();
    const ok = await m.refreshAccessToken();
    expect(ok).toBe(false);
    expect(global.apiClient.refreshToken).not.toHaveBeenCalled();
  });
  test('on reject, clears auth', async () => {
    const m = fresh(); m.setUser({ id: 'u1' });
    global.apiClient.refreshToken.mockRejectedValueOnce(new Error('401'));
    const ok = await m.refreshAccessToken();
    expect(ok).toBe(false);
    expect(m.user).toBeNull();
  });
});
