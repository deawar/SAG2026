process.env.NODE_ENV = 'test';
if (!process.env.JWT_ACCESS_SECRET) { process.env.JWT_ACCESS_SECRET = 'test-access-secret'; }
if (!process.env.JWT_REFRESH_SECRET) { process.env.JWT_REFRESH_SECRET = 'test-refresh-secret'; }
jest.mock('../../../src/models/index', () => {
  const actual = jest.requireActual('../../../src/models/index');
  return { ...actual, pool: { query: jest.fn().mockResolvedValue({ rows: [], rowCount: 0 }) } };
});
// Mock notificationService so EmailProvider construction does not require SMTP
jest.mock('../../../src/services/notificationService', () => ({
  EmailProvider: jest.fn().mockImplementation(() => ({
    send: jest.fn().mockResolvedValue(undefined)
  })),
  EmailTemplateService: jest.fn(),
  getSharedEmailProvider: jest.fn(),
  notifyArtworkStatusChanged: jest.fn()
}));

const request = require('supertest');
const jwt = require('jsonwebtoken');
const createApp = require('../../../src/app');
const mockDb = require('../../helpers/mockDb');
const { pool: mockPool } = require('../../../src/models/index');
const tok = (p) => jwt.sign(p, process.env.JWT_ACCESS_SECRET, { algorithm: 'HS256' });

// Fixed IDs used throughout
const HOST_SCHOOL   = 'school-host';
const INVITED_SCHOOL = 'school-invited';
const HOST_TEACHER  = 'teacher-host';
const INV_TEACHER   = 'teacher-invited';
const GRANT_ID      = 'grant-uuid-1';
const STUDENT_ID    = 'student-1';

const hostToken    = tok({ userId: HOST_TEACHER,  role: 'TEACHER', schoolId: HOST_SCHOOL });
const invitedToken = tok({ userId: INV_TEACHER,   role: 'TEACHER', schoolId: INVITED_SCHOOL });
const studentToken = tok({ userId: STUDENT_ID,    role: 'STUDENT', schoolId: INVITED_SCHOOL });

describe('Gallery grant endpoints', () => {
  let app;
  beforeAll(() => { mockDb.reset(); app = createApp(mockDb); });
  beforeEach(() => {
    mockPool.query.mockReset();
    mockPool.query.mockResolvedValue({ rows: [], rowCount: 0 });
    mockDb.reset();
  });

  // ──────────────────────────────────────────────────────────────────
  // 1. POST /api/gallery/grants  — host teacher invites → 201
  // ──────────────────────────────────────────────────────────────────
  test('host TEACHER invites → 201 with grantId', async () => {
    // 1) resolveViewer → host teacher
    mockPool.query.mockResolvedValueOnce({ rows: [{ id: HOST_TEACHER, role: 'TEACHER', school_id: HOST_SCHOOL }], rowCount: 1 });
    // 2) _schoolBand SELECT → HIGH band
    mockPool.query.mockResolvedValueOnce({ rows: [{ grade_band: 'HIGH' }], rowCount: 1 });
    // 3) grants.createGrant INSERT RETURNING id
    mockPool.query.mockResolvedValueOnce({ rows: [{ id: GRANT_ID }], rowCount: 1 });
    // 4) auditGallery INSERT (best-effort)
    mockPool.query.mockResolvedValueOnce({ rows: [], rowCount: 1 });

    const res = await request(app)
      .post('/api/gallery/grants')
      .set('Authorization', `Bearer ${hostToken}`)
      .send({ invitedEmail: 'invited@school.edu' });

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.grantId).toBe(GRANT_ID);
    // Verify that the INSERT grant query was called
    const calls = mockPool.query.mock.calls;
    const insertCall = calls.find(c => typeof c[0] === 'string' && c[0].includes('INSERT INTO gallery_grants'));
    expect(insertCall).toBeTruthy();
  });

  // ──────────────────────────────────────────────────────────────────
  // 2. invite when host grade_band IS NULL → 400 SCHOOL_BAND_NOT_SET
  // ──────────────────────────────────────────────────────────────────
  test('invite when host grade_band IS NULL → 400 SCHOOL_BAND_NOT_SET', async () => {
    // 1) resolveViewer → host teacher
    mockPool.query.mockResolvedValueOnce({ rows: [{ id: HOST_TEACHER, role: 'TEACHER', school_id: HOST_SCHOOL }], rowCount: 1 });
    // 2) _schoolBand SELECT → no band
    mockPool.query.mockResolvedValueOnce({ rows: [{ grade_band: null }], rowCount: 1 });

    const res = await request(app)
      .post('/api/gallery/grants')
      .set('Authorization', `Bearer ${hostToken}`)
      .send({ invitedEmail: 'someone@school.edu' });

    expect(res.status).toBe(400);
    expect(res.body.error).toBe('SCHOOL_BAND_NOT_SET');
  });

  // ──────────────────────────────────────────────────────────────────
  // 3. POST /api/gallery/grants/:id/accept — matching band → 200
  // ──────────────────────────────────────────────────────────────────
  test('accept with matching band → 200 ACCEPTED', async () => {
    const rawToken = 'a'.repeat(64); // 64-char hex string
    // 1) resolveViewer → invited teacher
    mockPool.query.mockResolvedValueOnce({ rows: [{ id: INV_TEACHER, role: 'TEACHER', school_id: INVITED_SCHOOL }], rowCount: 1 });
    // 2) grants.getPendingByTokenHash SELECT → grant with host_band HIGH, id matches
    mockPool.query.mockResolvedValueOnce({ rows: [{ id: GRANT_ID, host_band: 'HIGH', host_school_id: HOST_SCHOOL, status: 'PENDING' }], rowCount: 1 });
    // 3) _schoolBand SELECT → invited school also HIGH
    mockPool.query.mockResolvedValueOnce({ rows: [{ grade_band: 'HIGH' }], rowCount: 1 });
    // 4) grants.acceptGrant UPDATE RETURNING
    mockPool.query.mockResolvedValueOnce({ rows: [{ id: GRANT_ID, status: 'ACCEPTED' }], rowCount: 1 });
    // 5) auditGallery INSERT
    mockPool.query.mockResolvedValueOnce({ rows: [], rowCount: 1 });

    const res = await request(app)
      .post(`/api/gallery/grants/${GRANT_ID}/accept`)
      .set('Authorization', `Bearer ${invitedToken}`)
      .send({ token: rawToken });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.status).toBe('ACCEPTED');
  });

  // ──────────────────────────────────────────────────────────────────
  // 4. accept with band mismatch → 409 BAND_MISMATCH
  // ──────────────────────────────────────────────────────────────────
  test('accept with band mismatch (invited MIDDLE vs host HIGH) → 409 BAND_MISMATCH', async () => {
    const rawToken = 'b'.repeat(64);
    // 1) resolveViewer → invited teacher
    mockPool.query.mockResolvedValueOnce({ rows: [{ id: INV_TEACHER, role: 'TEACHER', school_id: INVITED_SCHOOL }], rowCount: 1 });
    // 2) getPendingByTokenHash → grant with host_band HIGH
    mockPool.query.mockResolvedValueOnce({ rows: [{ id: GRANT_ID, host_band: 'HIGH', host_school_id: HOST_SCHOOL, status: 'PENDING' }], rowCount: 1 });
    // 3) _schoolBand → invited school is MIDDLE
    mockPool.query.mockResolvedValueOnce({ rows: [{ grade_band: 'MIDDLE' }], rowCount: 1 });
    // 4) auditGallery SECURITY INSERT
    mockPool.query.mockResolvedValueOnce({ rows: [], rowCount: 1 });

    const res = await request(app)
      .post(`/api/gallery/grants/${GRANT_ID}/accept`)
      .set('Authorization', `Bearer ${invitedToken}`)
      .send({ token: rawToken });

    expect(res.status).toBe(409);
    expect(res.body.error).toBe('BAND_MISMATCH');
    expect(res.body.message).toMatch(/HIGH/);
    expect(res.body.message).toMatch(/MIDDLE/);
  });

  // ──────────────────────────────────────────────────────────────────
  // 5. accept bad/expired token → 404 INVALID_TOKEN
  // ──────────────────────────────────────────────────────────────────
  test('accept bad/expired token → 404 INVALID_TOKEN', async () => {
    // 1) resolveViewer → invited teacher
    mockPool.query.mockResolvedValueOnce({ rows: [{ id: INV_TEACHER, role: 'TEACHER', school_id: INVITED_SCHOOL }], rowCount: 1 });
    // 2) getPendingByTokenHash → no rows (token not found / expired)
    mockPool.query.mockResolvedValueOnce({ rows: [], rowCount: 0 });

    const res = await request(app)
      .post(`/api/gallery/grants/${GRANT_ID}/accept`)
      .set('Authorization', `Bearer ${invitedToken}`)
      .send({ token: 'badtoken' });

    expect(res.status).toBe(404);
    expect(res.body.error).toBe('INVALID_TOKEN');
  });

  // ──────────────────────────────────────────────────────────────────
  // 6a. enable member: invited teacher enables student of invited school → 201
  // ──────────────────────────────────────────────────────────────────
  test('enable member: invited teacher enables student of invited school → 201', async () => {
    // 1) resolveViewer → invited teacher (for enableMember actor check)
    mockPool.query.mockResolvedValueOnce({ rows: [{ id: INV_TEACHER, role: 'TEACHER', school_id: INVITED_SCHOOL }], rowCount: 1 });
    // 2) getGrantForRevoker → ACCEPTED grant where invited_teacher_user_id = INV_TEACHER
    mockPool.query.mockResolvedValueOnce({ rows: [{ id: GRANT_ID, host_school_id: HOST_SCHOOL, invited_school_id: INVITED_SCHOOL, invited_teacher_user_id: INV_TEACHER, status: 'ACCEPTED' }], rowCount: 1 });
    // 3) resolveViewer for target student (same invited school)
    mockPool.query.mockResolvedValueOnce({ rows: [{ id: STUDENT_ID, role: 'STUDENT', school_id: INVITED_SCHOOL }], rowCount: 1 });
    // 4) grants.addMember INSERT
    mockPool.query.mockResolvedValueOnce({ rows: [], rowCount: 1 });
    // 5) auditGallery INSERT
    mockPool.query.mockResolvedValueOnce({ rows: [], rowCount: 1 });

    const res = await request(app)
      .post(`/api/gallery/grants/${GRANT_ID}/members`)
      .set('Authorization', `Bearer ${invitedToken}`)
      .send({ studentUserId: STUDENT_ID });

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
  });

  // ──────────────────────────────────────────────────────────────────
  // 6b. enable member: student from ANOTHER school → 403 CROSS_SCHOOL_DENIED
  // ──────────────────────────────────────────────────────────────────
  test('enable member: student from another school → 403 CROSS_SCHOOL_DENIED', async () => {
    // 1) resolveViewer → invited teacher
    mockPool.query.mockResolvedValueOnce({ rows: [{ id: INV_TEACHER, role: 'TEACHER', school_id: INVITED_SCHOOL }], rowCount: 1 });
    // 2) getGrantForRevoker → ACCEPTED grant
    mockPool.query.mockResolvedValueOnce({ rows: [{ id: GRANT_ID, host_school_id: HOST_SCHOOL, invited_school_id: INVITED_SCHOOL, invited_teacher_user_id: INV_TEACHER, status: 'ACCEPTED' }], rowCount: 1 });
    // 3) resolveViewer for target student (DIFFERENT school)
    mockPool.query.mockResolvedValueOnce({ rows: [{ id: 'stu-other', role: 'STUDENT', school_id: 'school-other' }], rowCount: 1 });

    const res = await request(app)
      .post(`/api/gallery/grants/${GRANT_ID}/members`)
      .set('Authorization', `Bearer ${invitedToken}`)
      .send({ studentUserId: 'stu-other' });

    expect(res.status).toBe(403);
    expect(res.body.error).toBe('CROSS_SCHOOL_DENIED');
  });

  // ──────────────────────────────────────────────────────────────────
  // 7a. revoke by host → 200 REVOKED
  // ──────────────────────────────────────────────────────────────────
  test('revoke by host teacher → 200 REVOKED', async () => {
    // 1) resolveViewer → host teacher
    mockPool.query.mockResolvedValueOnce({ rows: [{ id: HOST_TEACHER, role: 'TEACHER', school_id: HOST_SCHOOL }], rowCount: 1 });
    // 2) getGrantForRevoker → grant with host_school_id = HOST_SCHOOL
    mockPool.query.mockResolvedValueOnce({ rows: [{ id: GRANT_ID, host_school_id: HOST_SCHOOL, invited_school_id: INVITED_SCHOOL, invited_teacher_user_id: INV_TEACHER, status: 'ACCEPTED' }], rowCount: 1 });
    // 3) revokeGrant UPDATE RETURNING
    mockPool.query.mockResolvedValueOnce({ rows: [{ id: GRANT_ID, status: 'REVOKED' }], rowCount: 1 });
    // 4) auditGallery INSERT
    mockPool.query.mockResolvedValueOnce({ rows: [], rowCount: 1 });

    const res = await request(app)
      .post(`/api/gallery/grants/${GRANT_ID}/revoke`)
      .set('Authorization', `Bearer ${hostToken}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.status).toBe('REVOKED');
  });

  // ──────────────────────────────────────────────────────────────────
  // 7b. revoke by unrelated user → 403 NOT_A_PARTY
  // ──────────────────────────────────────────────────────────────────
  test('revoke by unrelated user → 403 NOT_A_PARTY', async () => {
    const unrelatedToken = tok({ userId: 'teacher-unrelated', role: 'TEACHER', schoolId: 'school-other' });
    // 1) resolveViewer → unrelated teacher
    mockPool.query.mockResolvedValueOnce({ rows: [{ id: 'teacher-unrelated', role: 'TEACHER', school_id: 'school-other' }], rowCount: 1 });
    // 2) getGrantForRevoker → grant (neither host nor invited matches)
    mockPool.query.mockResolvedValueOnce({ rows: [{ id: GRANT_ID, host_school_id: HOST_SCHOOL, invited_school_id: INVITED_SCHOOL, invited_teacher_user_id: INV_TEACHER, status: 'ACCEPTED' }], rowCount: 1 });

    const res = await request(app)
      .post(`/api/gallery/grants/${GRANT_ID}/revoke`)
      .set('Authorization', `Bearer ${unrelatedToken}`);

    expect(res.status).toBe(403);
    expect(res.body.error).toBe('NOT_A_PARTY');
  });

  // ──────────────────────────────────────────────────────────────────
  // 8a. disable member: invited teacher, ACCEPTED grant → 200
  // ──────────────────────────────────────────────────────────────────
  test('disable member: invited teacher on ACCEPTED grant → 200', async () => {
    // 1) resolveViewer → invited teacher
    mockPool.query.mockResolvedValueOnce({ rows: [{ id: 't-1', role: 'TEACHER', school_id: 'school-2' }], rowCount: 1 });
    // 2) getGrantForRevoker → ACCEPTED grant with invited_teacher_user_id matching actor
    mockPool.query.mockResolvedValueOnce({ rows: [{ id: 'grant-1', host_school_id: 'school-1', invited_school_id: 'school-2', invited_teacher_user_id: 't-1', status: 'ACCEPTED' }], rowCount: 1 });
    // 3) grants.removeMember DELETE
    mockPool.query.mockResolvedValueOnce({ rowCount: 1 });
    // 4) auditGallery INSERT
    mockPool.query.mockResolvedValueOnce({ rows: [] });

    const actorToken = tok({ userId: 't-1', role: 'TEACHER', schoolId: 'school-2' });
    const res = await request(app)
      .delete('/api/gallery/grants/grant-1/members/some-student')
      .set('Authorization', `Bearer ${actorToken}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });

  // ──────────────────────────────────────────────────────────────────
  // 8b. disable member: non-ACCEPTED grant (REVOKED) → 403
  // ──────────────────────────────────────────────────────────────────
  test('disable member: non-ACCEPTED grant (REVOKED) → 403', async () => {
    // 1) resolveViewer → invited teacher
    mockPool.query.mockResolvedValueOnce({ rows: [{ id: 't-1', role: 'TEACHER', school_id: 'school-2' }], rowCount: 1 });
    // 2) getGrantForRevoker → REVOKED grant — guard fires before removeMember
    mockPool.query.mockResolvedValueOnce({ rows: [{ id: 'grant-1', host_school_id: 'school-1', invited_school_id: 'school-2', invited_teacher_user_id: 't-1', status: 'REVOKED' }], rowCount: 1 });

    const actorToken = tok({ userId: 't-1', role: 'TEACHER', schoolId: 'school-2' });
    const res = await request(app)
      .delete('/api/gallery/grants/grant-1/members/some-student')
      .set('Authorization', `Bearer ${actorToken}`);

    expect(res.status).toBe(403);
    expect(res.body.success).toBe(false);
  });
});
