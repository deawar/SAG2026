process.env.JWT_ACCESS_SECRET = process.env.JWT_ACCESS_SECRET || 'test-access-secret';
const jwt = require('jsonwebtoken');
const authMiddleware = require('../../../src/middleware/authMiddleware');

function tokenFor(claims) {
  return jwt.sign({ sub: 'u1', role: 'TEACHER', ...claims }, process.env.JWT_ACCESS_SECRET, { algorithm: 'HS256' });
}
function mkRes() {
  return { statusCode: 200, body: null, status(c) { this.statusCode = c; return this; }, json(b) { this.body = b; return this; } };
}

describe('verifyToken reads the access_token cookie', () => {
  test('valid cookie authenticates and populates req.user', async () => {
    const req = { cookies: { access_token: tokenFor({}) }, headers: {} };
    const res = mkRes(); let nexted = false;
    await authMiddleware.verifyToken(req, res, () => { nexted = true; });
    expect(nexted).toBe(true);
    expect(req.user.role).toBe('TEACHER');
  });
  test('missing cookie → 401', async () => {
    const req = { cookies: {}, headers: {} };
    const res = mkRes();
    await authMiddleware.verifyToken(req, res, () => {});
    expect(res.statusCode).toBe(401);
  });
  test('Authorization header is IGNORED (no fallback)', async () => {
    const req = { cookies: {}, headers: { authorization: `Bearer ${tokenFor({})}` } };
    const res = mkRes();
    await authMiddleware.verifyToken(req, res, () => {});
    expect(res.statusCode).toBe(401);
  });
  test('optionalVerifyToken populates from cookie, no-ops without it', async () => {
    const req1 = { cookies: { access_token: tokenFor({}) }, headers: {} }; const res1 = mkRes(); let n1 = false;
    await authMiddleware.optionalVerifyToken(req1, res1, () => { n1 = true; });
    expect(n1).toBe(true); expect(req1.user.role).toBe('TEACHER');
    const req2 = { cookies: {}, headers: {} }; const res2 = mkRes(); let n2 = false;
    await authMiddleware.optionalVerifyToken(req2, res2, () => { n2 = true; });
    expect(n2).toBe(true); expect(req2.user).toBeUndefined();
  });
});
