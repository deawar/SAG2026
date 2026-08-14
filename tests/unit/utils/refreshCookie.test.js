const { REFRESH_COOKIE_NAME, setRefreshCookie, clearRefreshCookie } = require('../../../src/utils/refreshCookie');

function fakeRes() {
  return { cookie: jest.fn(), clearCookie: jest.fn() };
}

describe('refreshCookie helper', () => {
  const OLD_ENV = process.env.NODE_ENV;
  afterEach(() => { process.env.NODE_ENV = OLD_ENV; });

  test('name is refresh_token', () => {
    expect(REFRESH_COOKIE_NAME).toBe('refresh_token');
  });

  test('setRefreshCookie sets httpOnly/strict/path/maxAge, secure in production', () => {
    process.env.NODE_ENV = 'production';
    const res = fakeRes();
    setRefreshCookie(res, 'the-token');
    expect(res.cookie).toHaveBeenCalledWith('refresh_token', 'the-token', expect.objectContaining({
      httpOnly: true,
      sameSite: 'strict',
      secure: true,
      path: '/api/auth',
      maxAge: 7 * 24 * 60 * 60 * 1000
    }));
  });

  test('setRefreshCookie omits secure outside production', () => {
    process.env.NODE_ENV = 'test';
    const res = fakeRes();
    setRefreshCookie(res, 'the-token');
    expect(res.cookie.mock.calls[0][2].secure).toBe(false);
  });

  test('clearRefreshCookie clears with matching path/sameSite/httpOnly', () => {
    const res = fakeRes();
    clearRefreshCookie(res);
    expect(res.clearCookie).toHaveBeenCalledWith('refresh_token', expect.objectContaining({
      httpOnly: true,
      sameSite: 'strict',
      path: '/api/auth'
    }));
  });
});
