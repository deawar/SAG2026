const request = require('supertest');
const createTestApp = require('../../helpers/createTestApp');
const jwt = require('jsonwebtoken');

function accessToken() {
  return jwt.sign({ sub: 'u1', role: 'STUDENT' }, process.env.JWT_ACCESS_SECRET || 'test-access-secret', { algorithm: 'HS256' });
}

describe('CSRF enforcement', () => {
  const app = createTestApp();
  test('cookie-authed POST without X-Requested-With → 403', async () => {
    const res = await request(app).post('/api/portfolio')
      .set('Cookie', `access_token=${accessToken()}`).send({ title: 'x' });
    expect(res.status).toBe(403);
    expect(res.body).toEqual(expect.objectContaining({ message: 'CSRF check failed' }));
  });
  test('cookie-authed POST WITH header passes CSRF (not 403)', async () => {
    const res = await request(app).post('/api/portfolio')
      .set('Cookie', `access_token=${accessToken()}`).set('X-Requested-With', 'XMLHttpRequest').send({ title: 'x' });
    expect(res.status).not.toBe(403);
  });
  test('credential-less POST is not CSRF-blocked (401/400, not 403)', async () => {
    const res = await request(app).post('/api/portfolio').send({ title: 'x' });
    expect(res.status).not.toBe(403);
  });
});
