/**
 * Regression test for the real userRoutes factory wiring.
 *
 * Bug: the factory built `authService` WITHOUT a `db` property, but
 * UserController.getProfile() looks up the school name via
 * `this.authService.db`. So schoolName was always null in production and the
 * Account Settings "School" row stayed hidden — even though the getProfile
 * UNIT test passed (it hand-built the controller with `{ db }` present,
 * bypassing the factory). This test drives the REAL factory via createTestApp
 * so the wiring itself is covered.
 */
const request = require('supertest');
const jwt = require('jsonwebtoken');
const createTestApp = require('../../helpers/createTestApp');
const mockDb = require('../../helpers/mockDb');
const { authCookie } = require('../../helpers/authCookie');

function accessToken() {
  return jwt.sign(
    { sub: 'stu-1', role: 'STUDENT' },
    process.env.JWT_ACCESS_SECRET || 'test-access-secret',
    { algorithm: 'HS256' }
  );
}

describe('GET /api/user/profile — school-name wiring (real userRoutes factory)', () => {
  test('returns schoolName for a student who has a school_id', async () => {
    const app = createTestApp(); // wires the real userRoutes(mockDb)

    mockDb.query.mockImplementation((sql) => {
      if (/FROM users WHERE id/i.test(sql)) {
        return Promise.resolve({
          rows: [{
            id: 'stu-1', email: 's@e.com', first_name: 'Stu', last_name: 'Dent',
            phone_number: null, role: 'STUDENT', school_id: 'school-1',
            account_status: 'ACTIVE', two_fa_enabled: false, created_at: null, last_login: null
          }],
          rowCount: 1
        });
      }
      if (/FROM schools WHERE id/i.test(sql)) {
        return Promise.resolve({ rows: [{ name: 'Northview High School' }], rowCount: 1 });
      }
      return Promise.resolve({ rows: [], rowCount: 0 });
    });

    const res = await request(app).get('/api/user/profile').set(authCookie(accessToken()));

    expect(res.status).toBe(200);
    expect(res.body.data.schoolName).toBe('Northview High School');
    // The schools lookup must actually run — proves authService.db is wired.
    expect(mockDb.query).toHaveBeenCalledWith('SELECT name FROM schools WHERE id = $1', ['school-1']);
  });
});
