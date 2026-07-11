/**
 * Teacher Portfolio Integration Tests
 * Tests for Task 7: teacher/school-admin portfolio viewing API.
 */
process.env.NODE_ENV = 'test';
if (!process.env.JWT_ACCESS_SECRET) { process.env.JWT_ACCESS_SECRET = 'test-access-secret'; }

jest.mock('../../../src/models/index', () => {
  const actual = jest.requireActual('../../../src/models/index');
  return { ...actual, pool: { query: jest.fn().mockResolvedValue({ rows: [], rowCount: 0 }), connect: jest.fn() } };
});

const request = require('supertest');
const jwt = require('jsonwebtoken');
const createApp = require('../../../src/app');
const mockDb = require('../../helpers/mockDb');
const { pool: mockPool } = require('../../../src/models/index');

const SECRET = process.env.JWT_ACCESS_SECRET;

function teacherToken() { return jwt.sign({ userId: 'tea-1', role: 'TEACHER', schoolId: 'school-1', twoFaEnabled: true }, SECRET, { algorithm: 'HS256' }); }
function otherTeacherToken() { return jwt.sign({ userId: 'tea-2', role: 'TEACHER', schoolId: 'school-1', twoFaEnabled: true }, SECRET, { algorithm: 'HS256' }); }
function schoolAdminToken() { return jwt.sign({ userId: 'sa-1', role: 'SCHOOL_ADMIN', schoolId: 'school-1', twoFaEnabled: true }, SECRET, { algorithm: 'HS256' }); }

describe('Teacher portfolio viewing', () => {
  let app;
  beforeAll(() => { mockDb.reset(); app = createApp(mockDb); });
  beforeEach(() => { mockPool.query.mockReset(); mockPool.query.mockResolvedValue({ rows: [], rowCount: 0 }); });

  test('GET /portfolios lists the teacher\'s students with counts', async () => {
    mockPool.query.mockResolvedValueOnce({
      rows: [{ student_id: 'stu-1', first_name: 'Ava', last_name: 'Reed', in_progress: '3', completed: '2', in_auction: '1' }],
      rowCount: 1
    });
    const res = await request(app).get('/api/teacher/portfolios').set('Authorization', `Bearer ${teacherToken()}`);
    expect(res.status).toBe(200);
    expect(res.body.students[0]).toMatchObject({ studentId: 'stu-1', inProgress: 3, completed: 2, inAuction: 1 });
  });

  test('GET /portfolios/:studentId returns items when the teacher is the inviting teacher', async () => {
    mockPool.query
      .mockResolvedValueOnce({ rows: [{ ok: 1 }], rowCount: 1 }) // scope check: registration_tokens match
      .mockResolvedValueOnce({ rows: [{ id: 'pi-1', title: 'Sunset', image_url: null, portfolio_status: 'COMPLETED', submission_state: 'IN_AUCTION', created_at: new Date() }], rowCount: 1 });
    const res = await request(app).get('/api/teacher/portfolios/stu-1').set('Authorization', `Bearer ${teacherToken()}`);
    expect(res.status).toBe(200);
    expect(res.body.items).toHaveLength(1);
  });

  test('a different teacher (not the inviter) gets 403', async () => {
    mockPool.query.mockResolvedValueOnce({ rows: [], rowCount: 0 }); // scope check fails
    const res = await request(app).get('/api/teacher/portfolios/stu-1').set('Authorization', `Bearer ${otherTeacherToken()}`);
    expect(res.status).toBe(403);
  });

  test('a same-school SCHOOL_ADMIN can view any student in the school', async () => {
    mockPool.query
      .mockResolvedValueOnce({ rows: [{ school_id: 'school-1' }], rowCount: 1 }) // (1) authMiddleware hydrates the ADMIN's own school -> req.user.schoolId='school-1'
      .mockResolvedValueOnce({ rows: [{ school_id: 'school-1' }], rowCount: 1 }) // (2) controller: SELECT school_id FROM users WHERE id=studentId (the viewed student)
      .mockResolvedValueOnce({ rows: [], rowCount: 0 });                         // (3) controller: items query (empty is fine)
    const res = await request(app).get('/api/teacher/portfolios/stu-1').set('Authorization', `Bearer ${schoolAdminToken()}`);
    expect(res.status).toBe(200);
  });

  test('a SCHOOL_ADMIN from another school is denied (403)', async () => {
    mockPool.query
      .mockResolvedValueOnce({ rows: [{ school_id: 'school-2' }], rowCount: 1 }) // (1) authMiddleware hydrates the ADMIN's OWN school -> req.user.schoolId='school-2'
      .mockResolvedValueOnce({ rows: [{ school_id: 'school-1' }], rowCount: 1 }); // (2) controller: viewed student's school = school-1 (mismatch -> 403, no items query)
    const res = await request(app).get('/api/teacher/portfolios/stu-1').set('Authorization', `Bearer ${otherSchoolAdminToken()}`);
    expect(res.status).toBe(403);
  });
});

function otherSchoolAdminToken() {
  return jwt.sign({ userId: 'sa-2', role: 'SCHOOL_ADMIN', schoolId: 'school-2', twoFaEnabled: true }, SECRET, { algorithm: 'HS256' });
}
