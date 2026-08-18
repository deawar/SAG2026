/** @jest-environment jsdom */
describe('fetch-guard', () => {
  let nativeFetch;
  beforeEach(() => {
    jest.resetModules();
    nativeFetch = jest.fn().mockResolvedValue({ ok: true });
    window.fetch = nativeFetch;
    // jsdom origin is http://localhost
    require('../../../public/js/fetch-guard.js');
  });
  test('adds X-Requested-With and strips Authorization on same-origin', async () => {
    await window.fetch('/api/x', { method: 'POST', headers: { Authorization: 'Bearer old' } });
    const [, init] = nativeFetch.mock.calls[0];
    const h = new Headers(init.headers);
    expect(h.get('X-Requested-With')).toBe('XMLHttpRequest');
    expect(h.get('Authorization')).toBeNull();
  });
  test('passes cross-origin requests through untouched', async () => {
    await window.fetch('https://api.stripe.com/v1/x', { method: 'POST', headers: { Authorization: 'Bearer keep' } });
    const [, init] = nativeFetch.mock.calls[0];
    const h = new Headers(init.headers);
    expect(h.get('X-Requested-With')).toBeNull();
    expect(h.get('Authorization')).toBe('Bearer keep');
  });
});
