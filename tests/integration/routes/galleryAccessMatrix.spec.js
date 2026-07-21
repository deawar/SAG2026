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
  });
  test('no token → 401', async () => {
    const res = await request(app).get('/api/gallery/school-1');
    expect(res.status).toBe(401);
  });
});
