const { requireCsrfHeader } = require('../../../src/middleware/csrfMiddleware');

function run({ method = 'POST', cookies = {}, xrw } = {}) {
  const req = { method, cookies, get: (h) => (h === 'X-Requested-With' ? xrw : undefined) };
  let status = null, body = null, nextCalled = false;
  const res = { status(c) { status = c; return this; }, json(b) { body = b; return this; } };
  requireCsrfHeader(req, res, () => { nextCalled = true; });
  return { status, body, nextCalled };
}

describe('requireCsrfHeader', () => {
  test('GET passes without header', () => {
    expect(run({ method: 'GET', cookies: { access_token: 't' } }).nextCalled).toBe(true);
  });
  test('mutation WITHOUT access_token cookie passes (no ambient credential)', () => {
    expect(run({ method: 'POST', cookies: {} }).nextCalled).toBe(true);
  });
  test('cookie-authed mutation WITHOUT header is rejected 403', () => {
    const r = run({ method: 'POST', cookies: { access_token: 't' } });
    expect(r.nextCalled).toBe(false);
    expect(r.status).toBe(403);
    expect(r.body).toEqual({ success: false, message: 'CSRF check failed' });
  });
  test('cookie-authed mutation WITH header passes', () => {
    expect(run({ method: 'POST', cookies: { access_token: 't' }, xrw: 'XMLHttpRequest' }).nextCalled).toBe(true);
  });
});
