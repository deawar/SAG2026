process.env.NODE_ENV = 'test';
if (!process.env.JWT_ACCESS_SECRET) { process.env.JWT_ACCESS_SECRET = 'test-access-secret'; }
if (!process.env.JWT_REFRESH_SECRET) { process.env.JWT_REFRESH_SECRET = 'test-refresh-secret'; }

const request = require('supertest');
const jwt = require('jsonwebtoken');
const createTestApp = require('../../helpers/createTestApp');
const mockDb = require('../../helpers/mockDb');

const SECRET = process.env.JWT_ACCESS_SECRET;
function studentToken(id = 'stu-1') { return jwt.sign({ userId: id, role: 'STUDENT', schoolId: 'school-1', twoFaEnabled: true }, SECRET, { algorithm: 'HS256' }); }
function teacherToken() { return jwt.sign({ userId: 'tea-1', role: 'TEACHER', schoolId: 'school-1', twoFaEnabled: true }, SECRET, { algorithm: 'HS256' }); }
function otherTeacherToken() { return jwt.sign({ userId: 'tea-2', role: 'TEACHER', schoolId: 'school-1', twoFaEnabled: true }, SECRET, { algorithm: 'HS256' }); }
function adminToken() { return jwt.sign({ userId: 'sa-1', role: 'SCHOOL_ADMIN', schoolId: 'school-1', twoFaEnabled: true }, SECRET, { algorithm: 'HS256' }); }
const PIECE = { id: 'pi-1', student_user_id: 'stu-1', school_id: 'school-1' };

describe('Portfolio comments — list + create', () => {
  let app;
  beforeEach(() => { app = createTestApp(); mockDb.query.mockReset(); mockDb.query.mockResolvedValue({ rows: [], rowCount: 0 }); });

  test('owner student lists comments and the read row is upserted', async () => {
    mockDb.query
      .mockResolvedValueOnce({ rows: [PIECE], rowCount: 1 })                 // load piece (resolveAccess)
      .mockResolvedValueOnce({ rows: [{ id: 'c-1', body: 'Nice work', author_user_id: 'tea-1', author_role: 'TEACHER', created_at: new Date(), first_name: 'Ada', last_name: 'Lee' }], rowCount: 1 }) // comments
      .mockResolvedValueOnce({ rows: [], rowCount: 1 });                     // upsert read
    const res = await request(app).get('/api/portfolio-comments/item/pi-1').set('Authorization', `Bearer ${studentToken()}`);
    expect(res.status).toBe(200);
    expect(res.body.comments[0]).toMatchObject({ id: 'c-1', authorName: 'Ada Lee', authorRole: 'TEACHER', isOwnByViewer: false });
    const upsert = mockDb.query.mock.calls.find(c => /portfolio_comment_reads/.test(c[0]));
    expect(upsert[0]).toMatch(/ON CONFLICT/i);
  });

  test('inviting teacher can post a comment (201)', async () => {
    mockDb.query
      .mockResolvedValueOnce({ rows: [PIECE], rowCount: 1 })                 // load piece
      .mockResolvedValueOnce({ rows: [{ ok: 1 }], rowCount: 1 })             // registration_tokens inviter check
      .mockResolvedValueOnce({ rows: [{ id: 'c-9', body: 'Add more contrast', author_role: 'TEACHER', created_at: new Date() }], rowCount: 1 }); // insert
    const res = await request(app).post('/api/portfolio-comments/item/pi-1')
      .set('Authorization', `Bearer ${teacherToken()}`).send({ body: 'Add more contrast' });
    expect(res.status).toBe(201);
    const insert = mockDb.query.mock.calls.find(c => /INSERT INTO portfolio_comments/.test(c[0]));
    expect(insert[1]).toEqual(expect.arrayContaining(['pi-1', 'school-1', 'tea-1', 'TEACHER']));
  });

  test('a non-inviting teacher is denied (403)', async () => {
    mockDb.query
      .mockResolvedValueOnce({ rows: [PIECE], rowCount: 1 })                 // load piece
      .mockResolvedValueOnce({ rows: [], rowCount: 0 });                     // inviter check fails
    const res = await request(app).post('/api/portfolio-comments/item/pi-1')
      .set('Authorization', `Bearer ${otherTeacherToken()}`).send({ body: 'hi' });
    expect(res.status).toBe(403);
  });

  test('missing piece is 404', async () => {
    mockDb.query.mockResolvedValueOnce({ rows: [], rowCount: 0 });           // load piece: none
    const res = await request(app).get('/api/portfolio-comments/item/pi-x').set('Authorization', `Bearer ${studentToken()}`);
    expect(res.status).toBe(404);
  });

  test('empty body is rejected 400', async () => {
    mockDb.query.mockResolvedValueOnce({ rows: [PIECE], rowCount: 1 });      // load piece (owner short-circuits access)
    const res = await request(app).post('/api/portfolio-comments/item/pi-1')
      .set('Authorization', `Bearer ${studentToken()}`).send({ body: '   ' });
    expect(res.status).toBe(400);
  });

  test('same-school SCHOOL_ADMIN can read comments (200, canModerate true)', async () => {
    mockDb.query
      .mockResolvedValueOnce({ rows: [PIECE], rowCount: 1 })     // load piece
      .mockResolvedValueOnce({ rows: [], rowCount: 0 })          // comments (empty ok)
      .mockResolvedValueOnce({ rows: [], rowCount: 1 });         // upsert read
    const res = await request(app).get('/api/portfolio-comments/item/pi-1').set('Authorization', `Bearer ${adminToken()}`);
    expect(res.status).toBe(200);
    expect(res.body.canModerate).toBe(true);
  });
});
