/**
 * Unit tests for the rate-limit key generator.
 *
 * Classroom NAT problem: many students share ONE public IP, so an IP-keyed
 * limiter throttles the whole class as a single client. userOrIpKey keys by the
 * authenticated user id instead, falling back to IP only when there is no valid
 * token — and an invalid/garbage token must NOT mint a fresh user bucket.
 */
process.env.NODE_ENV = 'test';
if (!process.env.JWT_ACCESS_SECRET) { process.env.JWT_ACCESS_SECRET = 'test-access-secret'; }

const jwt = require('jsonwebtoken');
const { userOrIpKey } = require('../../../src/middleware/rateLimitMiddleware');

const SECRET = process.env.JWT_ACCESS_SECRET;
function req(headers = {}, ip = '203.0.113.7') { return { headers, ip }; }

describe('userOrIpKey — per-user rate-limit keying', () => {
  test('a valid access token keys by user id (shared-IP classrooms get independent budgets)', () => {
    const token = jwt.sign({ userId: 'stu-42', role: 'STUDENT' }, SECRET, { algorithm: 'HS256' });
    expect(userOrIpKey(req({ authorization: `Bearer ${token}` }))).toBe('user:stu-42');
  });

  test('two different users behind the SAME ip get different keys', () => {
    const t1 = jwt.sign({ userId: 'stu-1' }, SECRET, { algorithm: 'HS256' });
    const t2 = jwt.sign({ userId: 'stu-2' }, SECRET, { algorithm: 'HS256' });
    const a = userOrIpKey(req({ authorization: `Bearer ${t1}` }, '198.51.100.5'));
    const b = userOrIpKey(req({ authorization: `Bearer ${t2}` }, '198.51.100.5'));
    expect(a).toBe('user:stu-1');
    expect(b).toBe('user:stu-2');
    expect(a).not.toBe(b);
  });

  test('no Authorization header falls back to IP', () => {
    expect(userOrIpKey(req({}, '203.0.113.9'))).toBe('203.0.113.9');
  });

  test('an invalid/garbage token falls back to IP (cannot mint fresh buckets)', () => {
    expect(userOrIpKey(req({ authorization: 'Bearer not.a.jwt' }, '203.0.113.11'))).toBe('203.0.113.11');
  });

  test('a token signed with the wrong secret falls back to IP', () => {
    const forged = jwt.sign({ userId: 'attacker' }, 'wrong-secret', { algorithm: 'HS256' });
    expect(userOrIpKey(req({ authorization: `Bearer ${forged}` }, '203.0.113.13'))).toBe('203.0.113.13');
  });
});
