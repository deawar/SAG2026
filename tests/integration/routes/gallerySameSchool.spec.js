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

const SECRET = process.env.JWT_ACCESS_SECRET;
const tok = (p) => jwt.sign(p, SECRET, { algorithm: 'HS256' });

const SCHOOL_ID = 'school-1';
const STU_ID = 'stu-1';
const TEACHER_ID = 'tea-1';

const studentToken = tok({ userId: STU_ID, role: 'STUDENT', schoolId: SCHOOL_ID });
const teacherToken = tok({ userId: TEACHER_ID, role: 'TEACHER', schoolId: SCHOOL_ID });

describe('Gallery same-school interactions', () => {
  let app;
  beforeAll(() => { mockDb.reset(); app = createApp(mockDb); });
  beforeEach(() => {
    mockPool.query.mockReset();
    mockPool.query.mockResolvedValue({ rows: [], rowCount: 0 });
    mockDb.reset();
  });

  test('same-school student views gallery with items returned', async () => {
    // 1: resolveViewer for the guard
    mockPool.query.mockResolvedValueOnce({ rows: [{ id: STU_ID, role: 'STUDENT', school_id: SCHOOL_ID }], rowCount: 1 });
    // 2: getSchoolGalleryItems content query
    mockPool.query.mockResolvedValueOnce({
      rows: [
        { id: 'pi-1', title: 'Sunset', medium: 'Watercolour', imageUrl: null, artistGrade: '7', artistFirstName: 'Ava', commentsAllowed: true, createdAt: new Date().toISOString() }
      ],
      rowCount: 1
    });
    const res = await request(app).get(`/api/gallery/${SCHOOL_ID}`).set('Authorization', `Bearer ${studentToken}`);
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.schoolId).toBe(SCHOOL_ID);
    expect(res.body.items).toHaveLength(1);
    expect(res.body.items[0].title).toBe('Sunset');
  });

  test('same-school student toggles sharedToGallery on own item → 200 + audit', async () => {
    // PATCH /items/:id/share — no guard (verifyRole STUDENT only), just the UPDATE RETURNING
    mockPool.query.mockResolvedValueOnce({
      rows: [{ id: 'pi-1', shared_to_gallery: true, gallery_comments_allowed: false }],
      rowCount: 1
    }); // setItemGalleryFlags
    mockPool.query.mockResolvedValueOnce({ rows: [], rowCount: 1 }); // auditGallery INSERT (best-effort)

    const res = await request(app)
      .patch('/api/gallery/items/pi-1/share')
      .set('Authorization', `Bearer ${studentToken}`)
      .send({ sharedToGallery: true });
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.item.sharedToGallery).toBe(true);
  });

  test('cross-school roster-add attempt → 403 CROSS_SCHOOL_DENIED', async () => {
    // POST /roster — teacher from school-1 trying to add student from school-2
    // resolveViewer for teacher (actor check in controller)
    mockPool.query.mockResolvedValueOnce({ rows: [{ id: TEACHER_ID, role: 'TEACHER', school_id: SCHOOL_ID }], rowCount: 1 });
    // resolveViewer for target student (different school)
    mockPool.query.mockResolvedValueOnce({ rows: [{ id: 'stu-x', role: 'STUDENT', school_id: 'school-2' }], rowCount: 1 });

    const res = await request(app)
      .post('/api/gallery/roster')
      .set('Authorization', `Bearer ${teacherToken}`)
      .send({ studentUserId: 'stu-x' });
    expect(res.status).toBe(403);
    expect(res.body.error).toBe('CROSS_SCHOOL_DENIED');
  });
});
