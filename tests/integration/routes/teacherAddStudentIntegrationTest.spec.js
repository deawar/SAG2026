/**
 * Teacher Add Individual Student — Integration Tests
 *
 * POST /api/teacher/students creates one registration_tokens invite (same model as CSV),
 * with duplicate detection, and sends the invite email immediately (best-effort).
 *
 * Harness mirrors teacherApprovalIntegrationTest.spec.js:
 *  - pool.query mocked at module level
 *  - Auth via locally-signed JWT
 *  - The controller's emailProvider is a real SMTP transport (host undefined in test),
 *    so any path that sends spies TeacherController._sendRegistrationInvite to avoid a
 *    live SMTP attempt and keep inviteSent deterministic.
 */

process.env.NODE_ENV = 'test';
if (!process.env.JWT_ACCESS_SECRET) { process.env.JWT_ACCESS_SECRET = 'test-access-secret'; }
if (!process.env.JWT_REFRESH_SECRET) { process.env.JWT_REFRESH_SECRET = 'test-refresh-secret'; }

jest.mock('../../../src/models/index', () => {
  const actual = jest.requireActual('../../../src/models/index');
  return {
    ...actual,
    pool: { query: jest.fn().mockResolvedValue({ rows: [], rowCount: 0 }) }
  };
});

const request = require('supertest');
const jwt = require('jsonwebtoken');
const createApp = require('../../../src/app');
const mockDb = require('../../helpers/mockDb');
const { pool: mockPool } = require('../../../src/models/index');
const TeacherController = require('../../../src/controllers/teacherController');

const SECRET = process.env.JWT_ACCESS_SECRET;
function makeToken(payload) {
  return jwt.sign(payload, SECRET, { algorithm: 'HS256' });
}

const TEACHER = { userId: 'teacher-1', role: 'TEACHER', schoolId: 'school-1', twoFaEnabled: false };

describe('Teacher add individual student (POST /api/teacher/students)', () => {
  let app;

  beforeAll(() => {
    mockDb.reset();
    app = createApp(mockDb);
  });

  beforeEach(() => {
    mockPool.query.mockReset();
    mockPool.query.mockResolvedValue({ rows: [], rowCount: 0 });
    mockDb.reset();
    jest.restoreAllMocks();
  });

  test('teacher adds a student — 201, invite created and sent', async () => {
    const token = makeToken(TEACHER);
    jest.spyOn(TeacherController, '_sendRegistrationInvite').mockResolvedValue(); // avoid live SMTP
    mockPool.query
      .mockResolvedValueOnce({ rows: [], rowCount: 0 })                                    // pending-dup check
      .mockResolvedValueOnce({ rows: [], rowCount: 0 })                                    // registered-dup check
      .mockResolvedValueOnce({ rows: [{ id: 'tok-1', created_at: new Date('2026-07-12') }], rowCount: 1 }) // INSERT token
      .mockResolvedValueOnce({ rows: [{ first_name: 'Pat', last_name: 'Teacher', school_name: 'Test School' }], rowCount: 1 }) // identity
      .mockResolvedValueOnce({ rows: [], rowCount: 0 });                                   // audit log

    const res = await request(app)
      .post('/api/teacher/students')
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'Jordan Lee', email: 'Jordan@Example.com' });

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.inviteSent).toBe(true);
    expect(res.body.student.studentEmail).toBe('jordan@example.com'); // lowercased
    expect(res.body.student.studentName).toBe('Jordan Lee');
    expect(res.body.student.used).toBe(false);
  });

  test('duplicate pending invite — 409 ALREADY_INVITED', async () => {
    const token = makeToken(TEACHER);
    mockPool.query.mockResolvedValueOnce({ rows: [{ exists: 1 }], rowCount: 1 }); // pending-dup found

    const res = await request(app)
      .post('/api/teacher/students')
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'Jordan Lee', email: 'jordan@example.com' });

    expect(res.status).toBe(409);
    expect(res.body.error).toBe('ALREADY_INVITED');
  });

  test('already-registered student — 409 ALREADY_REGISTERED', async () => {
    const token = makeToken(TEACHER);
    mockPool.query
      .mockResolvedValueOnce({ rows: [], rowCount: 0 })              // pending-dup: none
      .mockResolvedValueOnce({ rows: [{ exists: 1 }], rowCount: 1 }); // registered-dup: found

    const res = await request(app)
      .post('/api/teacher/students')
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'Jordan Lee', email: 'jordan@example.com' });

    expect(res.status).toBe(409);
    expect(res.body.error).toBe('ALREADY_REGISTERED');
  });

  test('invalid email — 400', async () => {
    const token = makeToken(TEACHER);
    const res = await request(app)
      .post('/api/teacher/students')
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'Jordan Lee', email: 'not-an-email' });

    expect(res.status).toBe(400);
    expect(res.body.error).toBe('INVALID_EMAIL');
  });

  test('missing name — 400', async () => {
    const token = makeToken(TEACHER);
    const res = await request(app)
      .post('/api/teacher/students')
      .set('Authorization', `Bearer ${token}`)
      .send({ name: '   ', email: 'jordan@example.com' });

    expect(res.status).toBe(400);
    expect(res.body.error).toBe('INVALID_NAME');
  });

  test('non-teacher token is rejected — 403', async () => {
    const token = makeToken({ userId: 'student-1', role: 'STUDENT', twoFaEnabled: false });
    const res = await request(app)
      .post('/api/teacher/students')
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'Jordan Lee', email: 'jordan@example.com' });

    expect(res.status).toBe(403);
  });

  test('SMTP failure still adds the student — 201 with inviteSent:false', async () => {
    const token = makeToken(TEACHER);
    jest.spyOn(TeacherController, '_sendRegistrationInvite').mockRejectedValueOnce(new Error('SMTP down'));
    mockPool.query
      .mockResolvedValueOnce({ rows: [], rowCount: 0 })                                    // pending-dup
      .mockResolvedValueOnce({ rows: [], rowCount: 0 })                                    // registered-dup
      .mockResolvedValueOnce({ rows: [{ id: 'tok-2', created_at: new Date('2026-07-12') }], rowCount: 1 }) // INSERT
      .mockResolvedValueOnce({ rows: [{ first_name: 'Pat', last_name: 'Teacher', school_name: 'Test School' }], rowCount: 1 }) // identity
      .mockResolvedValueOnce({ rows: [], rowCount: 0 });                                   // audit

    const res = await request(app)
      .post('/api/teacher/students')
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'Jordan Lee', email: 'jordan@example.com' });

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.inviteSent).toBe(false);
  });
});
