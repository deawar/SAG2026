process.env.NODE_ENV = 'test';
if (!process.env.JWT_ACCESS_SECRET) { process.env.JWT_ACCESS_SECRET = 'test-access-secret'; }
if (!process.env.JWT_REFRESH_SECRET) { process.env.JWT_REFRESH_SECRET = 'test-refresh-secret'; }
jest.mock('../../../src/models/index', () => {
  const actual = jest.requireActual('../../../src/models/index');
  return { ...actual, pool: { query: jest.fn().mockResolvedValue({ rows: [], rowCount: 0 }) } };
});
// Mock notificationService so EmailProvider construction does not require SMTP
jest.mock('../../../src/services/notificationService', () => ({
  EmailProvider: jest.fn().mockImplementation(() => ({ send: jest.fn().mockResolvedValue(undefined) })),
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

const HOST_SCHOOL = 'school-host';
const EXT_SCHOOL  = 'school-ext';
const ITEM_ID     = 'item-1';
const COMMENT_ID  = 'comment-1';

const sameStudentTok  = tok({ userId: 'stud-same', role: 'STUDENT', schoolId: HOST_SCHOOL });
const extStudentTok   = tok({ userId: 'stud-ext',  role: 'STUDENT', schoolId: EXT_SCHOOL });
const hostTeacherTok  = tok({ userId: 'teach-host', role: 'TEACHER', schoolId: HOST_SCHOOL });

// getCommentableItem row for a live, comments-allowed grade-10 piece
const liveItem = (over = {}) => ({
  id: ITEM_ID, student_user_id: 'artist-1', owner_school_id: HOST_SCHOOL,
  gallery_comments_allowed: true, artist_grade: '10', ...over
});

describe('Gallery comments — submit & read', () => {
  let app;
  beforeAll(() => { mockDb.reset(); app = createApp(mockDb); });
  beforeEach(() => {
    mockPool.query.mockReset();
    mockPool.query.mockResolvedValue({ rows: [], rowCount: 0 });
    mockDb.reset();
  });

  test('same-school STUDENT comments → 201 PENDING (no grade check)', async () => {
    mockPool.query
      .mockResolvedValueOnce({ rows: [liveItem()], rowCount: 1 })                                            // getCommentableItem
      .mockResolvedValueOnce({ rows: [{ id: 'stud-same', role: 'STUDENT', school_id: HOST_SCHOOL, grade_level: null }], rowCount: 1 }) // resolveViewer
      .mockResolvedValueOnce({ rows: [{ id: COMMENT_ID, status: 'PENDING', created_at: 't' }], rowCount: 1 }) // createComment
      .mockResolvedValueOnce({ rows: [], rowCount: 1 });                                                     // audit SUBMITTED
    const res = await request(app).post(`/api/gallery/items/${ITEM_ID}/comments`)
      .set('Authorization', `Bearer ${sameStudentTok}`).send({ body: 'Great colors!' });
    expect(res.status).toBe(201);
    expect(res.body.comment).toEqual({ id: COMMENT_ID, status: 'PENDING' });
  });

  test('cross-school enabled STUDENT with matching grade → 201 PENDING', async () => {
    mockPool.query
      .mockResolvedValueOnce({ rows: [liveItem()], rowCount: 1 })                                            // getCommentableItem
      .mockResolvedValueOnce({ rows: [{ id: 'stud-ext', role: 'STUDENT', school_id: EXT_SCHOOL, grade_level: '10' }], rowCount: 1 }) // resolveViewer
      .mockResolvedValueOnce({ rows: [{ id: 'grant-1' }], rowCount: 1 })                                     // getViewerGrantAccess (student branch)
      .mockResolvedValueOnce({ rows: [], rowCount: 1 })                                                      // audit CROSS_SCHOOL_VIEW
      .mockResolvedValueOnce({ rows: [{ id: COMMENT_ID, status: 'PENDING', created_at: 't' }], rowCount: 1 }) // createComment
      .mockResolvedValueOnce({ rows: [], rowCount: 1 });                                                     // audit SUBMITTED
    const res = await request(app).post(`/api/gallery/items/${ITEM_ID}/comments`)
      .set('Authorization', `Bearer ${extStudentTok}`).send({ body: 'So cool' });
    expect(res.status).toBe(201);
  });

  test('cross-school STUDENT with grade mismatch → 403 GRADE_MISMATCH', async () => {
    mockPool.query
      .mockResolvedValueOnce({ rows: [liveItem()], rowCount: 1 })
      .mockResolvedValueOnce({ rows: [{ id: 'stud-ext', role: 'STUDENT', school_id: EXT_SCHOOL, grade_level: '9' }], rowCount: 1 })
      .mockResolvedValueOnce({ rows: [{ id: 'grant-1' }], rowCount: 1 })
      .mockResolvedValueOnce({ rows: [], rowCount: 1 })   // audit CROSS_SCHOOL_VIEW
      .mockResolvedValueOnce({ rows: [], rowCount: 1 });  // audit SECURITY GALLERY_COMMENT_DENIED
    const res = await request(app).post(`/api/gallery/items/${ITEM_ID}/comments`)
      .set('Authorization', `Bearer ${extStudentTok}`).send({ body: 'hello' });
    expect(res.status).toBe(403);
    expect(res.body.error).toBe('GRADE_MISMATCH');
  });

  test('cross-school STUDENT without enablement → 403 at the guard (deny-by-default)', async () => {
    mockPool.query
      .mockResolvedValueOnce({ rows: [liveItem()], rowCount: 1 })
      .mockResolvedValueOnce({ rows: [{ id: 'stud-ext', role: 'STUDENT', school_id: EXT_SCHOOL, grade_level: '10' }], rowCount: 1 })
      .mockResolvedValueOnce({ rows: [], rowCount: 0 })   // getViewerGrantAccess → no row
      .mockResolvedValueOnce({ rows: [], rowCount: 1 });  // audit SECURITY GALLERY_ACCESS_DENIED
    const res = await request(app).post(`/api/gallery/items/${ITEM_ID}/comments`)
      .set('Authorization', `Bearer ${extStudentTok}`).send({ body: 'hello' });
    expect(res.status).toBe(403);
    expect(res.body.error).toBe('GALLERY_ACCESS_DENIED');
  });

  test('TEACHER cannot comment → 403 STUDENTS_ONLY', async () => {
    mockPool.query
      .mockResolvedValueOnce({ rows: [liveItem()], rowCount: 1 })
      .mockResolvedValueOnce({ rows: [{ id: 'teach-host', role: 'TEACHER', school_id: HOST_SCHOOL, grade_level: null }], rowCount: 1 });
    const res = await request(app).post(`/api/gallery/items/${ITEM_ID}/comments`)
      .set('Authorization', `Bearer ${hostTeacherTok}`).send({ body: 'nice work' });
    expect(res.status).toBe(403);
    expect(res.body.error).toBe('STUDENTS_ONLY');
  });

  test('owner disabled comments → 403 COMMENTS_DISABLED', async () => {
    mockPool.query
      .mockResolvedValueOnce({ rows: [liveItem({ gallery_comments_allowed: false })], rowCount: 1 })
      .mockResolvedValueOnce({ rows: [{ id: 'stud-same', role: 'STUDENT', school_id: HOST_SCHOOL, grade_level: null }], rowCount: 1 });
    const res = await request(app).post(`/api/gallery/items/${ITEM_ID}/comments`)
      .set('Authorization', `Bearer ${sameStudentTok}`).send({ body: 'hi' });
    expect(res.status).toBe(403);
    expect(res.body.error).toBe('COMMENTS_DISABLED');
  });

  test('item not in gallery → 404 ITEM_NOT_IN_GALLERY', async () => {
    mockPool.query.mockResolvedValueOnce({ rows: [], rowCount: 0 }); // getCommentableItem → none
    const res = await request(app).post(`/api/gallery/items/${ITEM_ID}/comments`)
      .set('Authorization', `Bearer ${sameStudentTok}`).send({ body: 'hi' });
    expect(res.status).toBe(404);
    expect(res.body.error).toBe('ITEM_NOT_IN_GALLERY');
  });

  test('empty / oversized body → 400 INVALID_BODY', async () => {
    mockPool.query
      .mockResolvedValueOnce({ rows: [liveItem()], rowCount: 1 })
      .mockResolvedValueOnce({ rows: [{ id: 'stud-same', role: 'STUDENT', school_id: HOST_SCHOOL, grade_level: null }], rowCount: 1 });
    const res = await request(app).post(`/api/gallery/items/${ITEM_ID}/comments`)
      .set('Authorization', `Bearer ${sameStudentTok}`).send({ body: '   ' });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('INVALID_BODY');
  });

  test('GET item comments returns APPROVED list for a gallery viewer', async () => {
    mockPool.query
      .mockResolvedValueOnce({ rows: [liveItem()], rowCount: 1 })  // getCommentableItem
      .mockResolvedValueOnce({ rows: [{ id: 'stud-same', role: 'STUDENT', school_id: HOST_SCHOOL, grade_level: null }], rowCount: 1 }) // resolveViewer
      .mockResolvedValueOnce({ rows: [{ id: COMMENT_ID, body: 'Great colors!', createdAt: 't', authorFirstName: 'Ana' }], rowCount: 1 }); // listApprovedForItem
    const res = await request(app).get(`/api/gallery/items/${ITEM_ID}/comments`)
      .set('Authorization', `Bearer ${sameStudentTok}`);
    expect(res.status).toBe(200);
    expect(res.body.comments).toEqual([{ id: COMMENT_ID, body: 'Great colors!', createdAt: 't', authorFirstName: 'Ana' }]);
    const listCall = mockPool.query.mock.calls[2][0];
    expect(listCall).toContain("c.status = 'APPROVED'");
  });
});

describe('Gallery comments — host moderation', () => {
  let app;
  beforeAll(() => { mockDb.reset(); app = createApp(mockDb); });
  beforeEach(() => {
    mockPool.query.mockReset();
    mockPool.query.mockResolvedValue({ rows: [], rowCount: 0 });
    mockDb.reset();
  });

  test('host TEACHER lists pending queue → 200', async () => {
    mockPool.query
      .mockResolvedValueOnce({ rows: [{ id: 'teach-host', role: 'TEACHER', school_id: HOST_SCHOOL, grade_level: null }], rowCount: 1 }) // resolveViewer
      .mockResolvedValueOnce({ rows: [{ id: COMMENT_ID, body: 'hi', createdAt: 't', portfolioItemId: ITEM_ID, itemTitle: 'Sunset', authorFirstName: 'Ana', authorOrigin: 'SAME_SCHOOL' }], rowCount: 1 }); // listPendingForSchool
    const res = await request(app).get('/api/gallery/comments/pending')
      .set('Authorization', `Bearer ${hostTeacherTok}`);
    expect(res.status).toBe(200);
    expect(res.body.comments).toHaveLength(1);
    expect(mockPool.query.mock.calls[1][1]).toEqual([HOST_SCHOOL]);
  });

  test('STUDENT hits pending queue → 403 (role gate)', async () => {
    const res = await request(app).get('/api/gallery/comments/pending')
      .set('Authorization', `Bearer ${sameStudentTok}`);
    expect(res.status).toBe(403);
  });

  test('host TEACHER approves → 200 APPROVED + audit', async () => {
    mockPool.query
      .mockResolvedValueOnce({ rows: [{ id: 'teach-host', role: 'TEACHER', school_id: HOST_SCHOOL, grade_level: null }], rowCount: 1 }) // resolveViewer
      .mockResolvedValueOnce({ rows: [{ id: COMMENT_ID, status: 'APPROVED' }], rowCount: 1 })  // moderateComment
      .mockResolvedValueOnce({ rows: [], rowCount: 1 });                                        // audit APPROVED
    const res = await request(app).post(`/api/gallery/comments/${COMMENT_ID}/approve`)
      .set('Authorization', `Bearer ${hostTeacherTok}`);
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('APPROVED');
    const modCall = mockPool.query.mock.calls[1];
    expect(modCall[1]).toEqual([COMMENT_ID, HOST_SCHOOL, 'APPROVED', 'teach-host']);
  });

  test('host TEACHER rejects → 200 REJECTED', async () => {
    mockPool.query
      .mockResolvedValueOnce({ rows: [{ id: 'teach-host', role: 'TEACHER', school_id: HOST_SCHOOL, grade_level: null }], rowCount: 1 })
      .mockResolvedValueOnce({ rows: [{ id: COMMENT_ID, status: 'REJECTED' }], rowCount: 1 })
      .mockResolvedValueOnce({ rows: [], rowCount: 1 });
    const res = await request(app).post(`/api/gallery/comments/${COMMENT_ID}/reject`)
      .set('Authorization', `Bearer ${hostTeacherTok}`);
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('REJECTED');
  });

  test('guest-school TEACHER cannot approve → 404 (school-scoped update matches no row)', async () => {
    const guestTok = tok({ userId: 'teach-guest', role: 'TEACHER', schoolId: EXT_SCHOOL });
    mockPool.query
      .mockResolvedValueOnce({ rows: [{ id: 'teach-guest', role: 'TEACHER', school_id: EXT_SCHOOL, grade_level: null }], rowCount: 1 })
      .mockResolvedValueOnce({ rows: [], rowCount: 0 }); // moderateComment → no row
    const res = await request(app).post(`/api/gallery/comments/${COMMENT_ID}/approve`)
      .set('Authorization', `Bearer ${guestTok}`);
    expect(res.status).toBe(404);
    expect(res.body.error).toBe('COMMENT_NOT_FOUND');
  });
});
