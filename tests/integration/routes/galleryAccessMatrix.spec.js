process.env.NODE_ENV = 'test';
if (!process.env.JWT_ACCESS_SECRET) { process.env.JWT_ACCESS_SECRET = 'test-access-secret'; }
if (!process.env.JWT_REFRESH_SECRET) { process.env.JWT_REFRESH_SECRET = 'test-refresh-secret'; }
jest.mock('../../../src/models/index', () => {
  const actual = jest.requireActual('../../../src/models/index');
  return { ...actual, pool: { query: jest.fn().mockResolvedValue({ rows: [], rowCount: 0 }) } };
});
const request = require('supertest');
const jwt = require('jsonwebtoken');
const createApp = require('../../../src/app');
const mockDb = require('../../helpers/mockDb');
const { pool: mockPool } = require('../../../src/models/index');
const tok = (p) => jwt.sign(p, process.env.JWT_ACCESS_SECRET, { algorithm: 'HS256' });

describe('Gallery access matrix (deny-by-default)', () => {
  let app;
  beforeAll(() => { mockDb.reset(); app = createApp(mockDb); });
  beforeEach(() => { mockPool.query.mockReset(); mockPool.query.mockResolvedValue({ rows: [], rowCount: 0 }); mockDb.reset(); });

  // viewer-resolution query returns this row, then the content query returns []
  const asViewer = (row) => mockPool.query
    .mockResolvedValueOnce({ rows: [row], rowCount: 1 })   // resolveViewer
    .mockResolvedValueOnce({ rows: [], rowCount: 0 });     // getSchoolGalleryItems

  test('same-school STUDENT → 200', async () => {
    asViewer({ id: 'stu-1', role: 'STUDENT', school_id: 'school-1' });
    const res = await request(app).get('/api/gallery/school-1').set('Authorization', `Bearer ${tok({ userId: 'stu-1', role: 'STUDENT', schoolId: 'school-1' })}`);
    expect(res.status).toBe(200);
  });
  test('same-school TEACHER → 200', async () => {
    asViewer({ id: 't-1', role: 'TEACHER', school_id: 'school-1' });
    const res = await request(app).get('/api/gallery/school-1').set('Authorization', `Bearer ${tok({ userId: 't-1', role: 'TEACHER', schoolId: 'school-1' })}`);
    expect(res.status).toBe(200);
  });
  test('SITE_ADMIN → 200 (global)', async () => {
    asViewer({ id: 'sa-1', role: 'SITE_ADMIN', school_id: null });
    const res = await request(app).get('/api/gallery/school-1').set('Authorization', `Bearer ${tok({ userId: 'sa-1', role: 'SITE_ADMIN' })}`);
    expect(res.status).toBe(200);
  });
  test('OTHER-school STUDENT → 403 (deny-by-default)', async () => {
    mockPool.query.mockResolvedValueOnce({ rows: [{ id: 'x-1', role: 'STUDENT', school_id: 'school-2' }], rowCount: 1 }); // resolveViewer only
    const res = await request(app).get('/api/gallery/school-1').set('Authorization', `Bearer ${tok({ userId: 'x-1', role: 'STUDENT', schoolId: 'school-2' })}`);
    expect(res.status).toBe(403);
    expect(res.body.error).toBe('GALLERY_ACCESS_DENIED');
  });
  test('OTHER-school TEACHER → 403', async () => {
    mockPool.query.mockResolvedValueOnce({ rows: [{ id: 'x-2', role: 'TEACHER', school_id: 'school-2' }], rowCount: 1 });
    const res = await request(app).get('/api/gallery/school-1').set('Authorization', `Bearer ${tok({ userId: 'x-2', role: 'TEACHER', schoolId: 'school-2' })}`);
    expect(res.status).toBe(403);
    expect(res.body.error).toBe('GALLERY_ACCESS_DENIED');
  });
  test('no token → 401', async () => {
    const res = await request(app).get('/api/gallery/school-1');
    expect(res.status).toBe(401);
  });

  // --- Plan B: cross-school grant cases ---
  test('external TEACHER with ACCEPTED grant → 200', async () => {
    // resolveViewer → external teacher; getViewerGrantAccess teacher query → grant row; content query → []
    mockPool.query
      .mockResolvedValueOnce({ rows: [{ id: 'ext-t-1', role: 'TEACHER', school_id: 'school-2' }], rowCount: 1 }) // resolveViewer
      .mockResolvedValueOnce({ rows: [{ id: 'grant-1' }], rowCount: 1 })                                         // getViewerGrantAccess: ACCEPTED grant
      .mockResolvedValueOnce({ rows: [], rowCount: 0 });                                                          // audit COMPLIANCE (INSERT)
    // content query falls through to default mock (rows: [])
    const res = await request(app).get('/api/gallery/school-1').set('Authorization', `Bearer ${tok({ userId: 'ext-t-1', role: 'TEACHER', schoolId: 'school-2' })}`);
    expect(res.status).toBe(200);
  });

  test('external enabled STUDENT (member row) → 200', async () => {
    // resolveViewer → external student; getViewerGrantAccess student JOIN → grant row; content query → []
    mockPool.query
      .mockResolvedValueOnce({ rows: [{ id: 'ext-s-1', role: 'STUDENT', school_id: 'school-2' }], rowCount: 1 }) // resolveViewer
      .mockResolvedValueOnce({ rows: [{ id: 'grant-2' }], rowCount: 1 })                                          // getViewerGrantAccess: enabled member row
      .mockResolvedValueOnce({ rows: [], rowCount: 0 });                                                           // audit COMPLIANCE (INSERT)
    // content query falls through to default mock (rows: [])
    const res = await request(app).get('/api/gallery/school-1').set('Authorization', `Bearer ${tok({ userId: 'ext-s-1', role: 'STUDENT', schoolId: 'school-2' })}`);
    expect(res.status).toBe(200);
  });

  test('external STUDENT of invited school but NO member row → 403', async () => {
    // resolveViewer → external student; getViewerGrantAccess student JOIN → no row (not a member); deny
    mockPool.query
      .mockResolvedValueOnce({ rows: [{ id: 'ext-s-2', role: 'STUDENT', school_id: 'school-2' }], rowCount: 1 }) // resolveViewer
      .mockResolvedValueOnce({ rows: [], rowCount: 0 });                                                           // getViewerGrantAccess: no member row
    // audit GALLERY_ACCESS_DENIED falls through to default mock
    const res = await request(app).get('/api/gallery/school-1').set('Authorization', `Bearer ${tok({ userId: 'ext-s-2', role: 'STUDENT', schoolId: 'school-2' })}`);
    expect(res.status).toBe(403);
    expect(res.body.error).toBe('GALLERY_ACCESS_DENIED');
  });

  test('external TEACHER after REVOKE (no ACCEPTED grant) → 403', async () => {
    // resolveViewer → external teacher; getViewerGrantAccess teacher query → no row (revoked); deny
    mockPool.query
      .mockResolvedValueOnce({ rows: [{ id: 'ext-t-2', role: 'TEACHER', school_id: 'school-2' }], rowCount: 1 }) // resolveViewer
      .mockResolvedValueOnce({ rows: [], rowCount: 0 });                                                           // getViewerGrantAccess: no ACCEPTED grant
    // audit GALLERY_ACCESS_DENIED falls through to default mock
    const res = await request(app).get('/api/gallery/school-1').set('Authorization', `Bearer ${tok({ userId: 'ext-t-2', role: 'TEACHER', schoolId: 'school-2' })}`);
    expect(res.status).toBe(403);
    expect(res.body.error).toBe('GALLERY_ACCESS_DENIED');
  });
});
