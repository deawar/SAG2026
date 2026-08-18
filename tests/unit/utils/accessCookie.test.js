const { ACCESS_COOKIE_NAME, setAccessCookie, clearAccessCookie } = require('../../../src/utils/accessCookie');

function fakeRes() {
  return { set: [], cleared: [],
    cookie(n, v, o) { this.set.push({ n, v, o }); return this; },
    clearCookie(n, o) { this.cleared.push({ n, o }); return this; } };
}

describe('accessCookie', () => {
  test('setAccessCookie sets httpOnly/strict/path-root cookie with 15m maxAge', () => {
    const res = fakeRes();
    setAccessCookie(res, 'jwt-abc');
    expect(res.set[0]).toEqual({ n: 'access_token', v: 'jwt-abc',
      o: expect.objectContaining({ httpOnly: true, sameSite: 'strict', path: '/', maxAge: 900000 }) });
  });
  test('secure is false outside production', () => {
    const res = fakeRes(); setAccessCookie(res, 't');
    expect(res.set[0].o.secure).toBe(false);
  });
  test('clearAccessCookie clears with matching options', () => {
    const res = fakeRes(); clearAccessCookie(res);
    expect(res.cleared[0]).toEqual({ n: 'access_token',
      o: expect.objectContaining({ httpOnly: true, sameSite: 'strict', path: '/' }) });
  });
});
