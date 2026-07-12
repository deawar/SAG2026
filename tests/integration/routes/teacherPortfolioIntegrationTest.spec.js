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

  test('items include commentCount and unreadCount', async () => {
    mockPool.query
      .mockResolvedValueOnce({ rows: [{ ok: 1 }], rowCount: 1 }) // scope check: registration_tokens match
      .mockResolvedValueOnce({ rows: [{
        id: 'pi-1', title: 'Sunset', description: null, medium: null, artist_grade: null, image_url: null,
        portfolio_status: 'COMPLETED', submission_state: 'IN_AUCTION', created_at: new Date(),
        moderation_status: 'VISIBLE', moderation_reason: null, moderated_at: null,
        comment_count: '3', unread_count: '2'
      }], rowCount: 1 });
    const res = await request(app).get('/api/teacher/portfolios/stu-1').set('Authorization', `Bearer ${teacherToken()}`);
    expect(res.status).toBe(200);
    expect(res.body.items[0]).toMatchObject({ commentCount: 3, unreadCount: 2 });
  });

  test('SCHOOL_ADMIN sees a REMOVED item with moderationStatus and reason exposed', async () => {
    // SCHOOL_ADMIN path: (1) auth hydration, (2) controller school check, (3) items query
    mockPool.query
      .mockResolvedValueOnce({ rows: [{ school_id: 'school-1' }], rowCount: 1 }) // (1) auth hydration
      .mockResolvedValueOnce({ rows: [{ school_id: 'school-1' }], rowCount: 1 }) // (2) controller school check
      .mockResolvedValueOnce({ rows: [{
        id: 'pi-2', title: 'Removed Art', description: null, medium: null, artist_grade: null, image_url: null,
        portfolio_status: 'COMPLETED', submission_state: 'NOT_SUBMITTED', created_at: new Date(),
        moderation_status: 'REMOVED', moderation_reason: 'Contains personal info', moderated_at: new Date(),
        moderated_by_name: 'Ada Admin',
        comment_count: '0', unread_count: '0'
      }], rowCount: 1 }); // (3) items query — REMOVED piece returned to admin
    const res = await request(app).get('/api/teacher/portfolios/stu-1').set('Authorization', `Bearer ${schoolAdminToken()}`);
    expect(res.status).toBe(200);
    expect(res.body.items).toHaveLength(1);
    expect(res.body.items[0]).toMatchObject({
      moderationStatus: 'REMOVED',
      moderationReason: 'Contains personal info',
      moderatedByName: 'Ada Admin'
    });
  });

  test('TEACHER does not receive REMOVED items (filter applied)', async () => {
    // TEACHER path: (1) registration_tokens scope check, (2) items query — only VISIBLE
    mockPool.query
      .mockResolvedValueOnce({ rows: [{ ok: 1 }], rowCount: 1 }) // (1) scope check
      .mockResolvedValueOnce({ rows: [], rowCount: 0 });           // (2) items query returns empty (REMOVED filtered out)
    const res = await request(app).get('/api/teacher/portfolios/stu-1').set('Authorization', `Bearer ${teacherToken()}`);
    expect(res.status).toBe(200);
    expect(res.body.items).toHaveLength(0);
    // Verify the SQL used the VISIBLE filter
    const itemsCall = mockPool.query.mock.calls[1];
    expect(itemsCall[0]).toMatch(/moderation_status\s*=\s*'VISIBLE'/);
  });
});

function otherSchoolAdminToken() {
  return jwt.sign({ userId: 'sa-2', role: 'SCHOOL_ADMIN', schoolId: 'school-2', twoFaEnabled: true }, SECRET, { algorithm: 'HS256' });
}
function adminToken() { return jwt.sign({ userId: 'sa-1', role: 'SCHOOL_ADMIN', schoolId: 'school-1', twoFaEnabled: true }, SECRET, { algorithm: 'HS256' }); }

describe('Portfolio moderation — remove / restore', () => {
  let app;
  beforeAll(() => { mockDb.reset(); app = createApp(mockDb); });
  beforeEach(() => { mockPool.query.mockReset(); mockPool.query.mockResolvedValue({ rows: [], rowCount: 0 }); });

  test('inviting teacher removes a VISIBLE piece with a reason (200) + audit', async () => {
    mockPool.query
      .mockResolvedValueOnce({ rows: [{ ok: 1 }], rowCount: 1 })   // teacher inviter scope check
      .mockResolvedValueOnce({ rows: [{ id: 'pi-1', submission_state: 'COMPLETED' }], rowCount: 1 }) // UPDATE portfolio_items -> REMOVED RETURNING
      .mockResolvedValueOnce({ rows: [], rowCount: 1 });           // audit
    const res = await request(app).post('/api/teacher/portfolios/stu-1/items/pi-1/remove')
      .set('Authorization', `Bearer ${teacherToken()}`).send({ reason: 'Contains personal info' });
    expect(res.status).toBe(200);
    const upd = mockPool.query.mock.calls.find(c => /UPDATE portfolio_items[\s\S]*REMOVED/i.test(c[0]));
    expect(upd[1]).toEqual(expect.arrayContaining(['Contains personal info']));
    // Audit row must use an allowed action_category (audit_logs CHECK excludes 'PORTFOLIO')
    const audit = mockPool.query.mock.calls.find(c => /INSERT INTO audit_logs/i.test(c[0]));
    expect(audit[1]).toEqual(expect.arrayContaining(['COMPLIANCE']));
    expect(audit[1]).not.toContain('PORTFOLIO');
  });

  test('remove requires a reason (400)', async () => {
    mockPool.query.mockResolvedValueOnce({ rows: [{ ok: 1 }], rowCount: 1 }); // unused — 400 returns before any query
    const res = await request(app).post('/api/teacher/portfolios/stu-1/items/pi-1/remove')
      .set('Authorization', `Bearer ${teacherToken()}`).send({ reason: '  ' });
    expect(res.status).toBe(400);
  });

  test('remove rejects a reason longer than 500 chars (400)', async () => {
    const res = await request(app).post('/api/teacher/portfolios/stu-1/items/pi-1/remove')
      .set('Authorization', `Bearer ${teacherToken()}`).send({ reason: 'x'.repeat(501) });
    expect(res.status).toBe(400);
  });

  test('a non-inviting teacher cannot remove a piece (403)', async () => {
    mockPool.query.mockResolvedValueOnce({ rows: [], rowCount: 0 }); // inviter check: no match
    const res = await request(app).post('/api/teacher/portfolios/stu-1/items/pi-1/remove')
      .set('Authorization', `Bearer ${teacherToken()}`).send({ reason: 'test' });
    expect(res.status).toBe(403);
  });

  test('a SCHOOL_ADMIN from another school cannot remove (403)', async () => {
    mockPool.query
      .mockResolvedValueOnce({ rows: [{ school_id: 'school-1' }], rowCount: 1 }) // (auth) admin's own school hydration
      .mockResolvedValueOnce({ rows: [{ school_id: 'school-2' }], rowCount: 1 }); // student's school (mismatch -> false)
    const res = await request(app).post('/api/teacher/portfolios/stu-1/items/pi-1/remove')
      .set('Authorization', `Bearer ${adminToken()}`).send({ reason: 'test' });
    expect(res.status).toBe(403);
  });

  test('a teacher cannot restore — 403 (admin only)', async () => {
    const res = await request(app).post('/api/teacher/portfolios/stu-1/items/pi-1/restore')
      .set('Authorization', `Bearer ${teacherToken()}`).send();
    expect(res.status).toBe(403);
  });

  test('same-school admin restores (200)', async () => {
    mockPool.query
      .mockResolvedValueOnce({ rows: [{ school_id: 'school-1' }], rowCount: 1 }) // (auth) admin school hydration
      .mockResolvedValueOnce({ rows: [{ school_id: 'school-1' }], rowCount: 1 }) // student school lookup (scope)
      .mockResolvedValueOnce({ rows: [{ id: 'pi-1' }], rowCount: 1 })            // UPDATE -> VISIBLE
      .mockResolvedValueOnce({ rows: [], rowCount: 1 });                         // audit
    const res = await request(app).post('/api/teacher/portfolios/stu-1/items/pi-1/restore')
      .set('Authorization', `Bearer ${adminToken()}`).send();
    expect(res.status).toBe(200);
  });
});
