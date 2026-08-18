const { setTwofaCookie, clearTwofaCookie } = require('../../../src/utils/twofaCookie');
function fakeRes() {
  return { set: [], cleared: [],
    cookie(n, v, o) { this.set.push({ n, v, o }); return this; },
    clearCookie(n, o) { this.cleared.push({ n, o }); return this; } };
}
describe('twofaCookie', () => {
  test('sets short-lived httpOnly cookie scoped to /api/auth', () => {
    const res = fakeRes(); setTwofaCookie(res, 'temp-jwt');
    expect(res.set[0]).toEqual({ n: 'twofa_token', v: 'temp-jwt',
      o: expect.objectContaining({ httpOnly: true, sameSite: 'strict', path: '/api/auth', maxAge: 600000 }) });
  });
  test('clear uses matching options', () => {
    const res = fakeRes(); clearTwofaCookie(res);
    expect(res.cleared[0].o).toEqual(expect.objectContaining({ path: '/api/auth', httpOnly: true }));
  });
});
