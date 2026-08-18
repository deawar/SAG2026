/** @jest-environment jsdom */
global.fetch = jest.fn().mockResolvedValue({
  ok: true, headers: { get: () => 'application/json' }, json: async () => ({ ok: true }) });
const APIClient = require('../../../public/js/api-client.js');

describe('APIClient sends no Authorization header', () => {
  test('request omits Authorization and includes credentials', async () => {
    const c = new APIClient('http://localhost');
    await c.get('/api/x');
    const [, config] = global.fetch.mock.calls[0];
    expect(config.credentials).toBe('include');
    expect(config.headers.Authorization).toBeUndefined();
  });
  test('getToken/setToken no longer exist', () => {
    const c = new APIClient();
    expect(c.getToken).toBeUndefined();
    expect(c.setToken).toBeUndefined();
  });
});
