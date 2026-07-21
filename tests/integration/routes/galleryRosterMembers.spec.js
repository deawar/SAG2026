process.env.NODE_ENV = 'test';
if (!process.env.JWT_ACCESS_SECRET) { process.env.JWT_ACCESS_SECRET = 'test-access-secret'; }
if (!process.env.JWT_REFRESH_SECRET) { process.env.JWT_REFRESH_SECRET = 'test-refresh-secret'; }
jest.mock('../../../src/models/index', () => {
  const actual = jest.requireActual('../../../src/models/index');
  return { ...actual, pool: { query: jest.fn().mockResolvedValue({ rows: [], rowCount: 0 }) } };
});
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
const GRANT_ID = 'grant-1';

const hostTeacherTok = tok({ userId: 'teach-host', role: 'TEACHER', schoolId: HOST_SCHOOL });
const studentTok = tok({ userId: 'stud-1', role: 'STUDENT', schoolId: HOST_SCHOOL });
const invTeacherTok = tok({ userId: 'teach-inv', role: 'TEACHER', schoolId: 'school-ext' });

describe('Gallery roster + grant member listings (Plan D enablers)', () => {
  let app;
  beforeAll(() => { mockDb.reset(); app = createApp(mockDb); });
  beforeEach(() => {
    mockPool.query.mockReset();
    mockPool.query.mockResolvedValue({ rows: [], rowCount: 0 });
    mockDb.reset();
  });

  test('host TEACHER GET /api/gallery/roster → 200 with roster rows', async () => {
    mockPool.query
      .mockResolvedValueOnce({ rows: [{ id: 'teach-host', role: 'TEACHER', school_id: HOST_SCHOOL, grade_level: null }], rowCount: 1 }) // resolveViewer
      .mockResolvedValueOnce({ rows: [{ studentUserId: 'stud-1', firstName: 'Ana', lastName: 'Lee', gradeLevel: '10' }], rowCount: 1 }); // listRoster
    const res = await request(app).get('/api/gallery/roster')
      .set('Authorization', `Bearer ${hostTeacherTok}`);
    expect(res.status).toBe(200);
    expect(res.body.roster).toEqual([{ studentUserId: 'stud-1', firstName: 'Ana', lastName: 'Lee', gradeLevel: '10' }]);
    expect(mockPool.query.mock.calls[1][1]).toEqual([HOST_SCHOOL]);
  });

  test('STUDENT GET /api/gallery/roster → 403', async () => {
    const res = await request(app).get('/api/gallery/roster')
      .set('Authorization', `Bearer ${studentTok}`);
    expect(res.status).toBe(403);
  });

  test('bound invited TEACHER GET /api/gallery/grants/:id/members → 200', async () => {
    mockPool.query
      .mockResolvedValueOnce({ rows: [{ id: 'teach-inv', role: 'TEACHER', school_id: 'school-ext', grade_level: null }], rowCount: 1 }) // resolveViewer
      .mockResolvedValueOnce({ rows: [{ id: GRANT_ID, host_school_id: HOST_SCHOOL, invited_school_id: 'school-ext', invited_teacher_user_id: 'teach-inv', status: 'ACCEPTED' }], rowCount: 1 }) // getGrantForRevoker
      .mockResolvedValueOnce({ rows: [{ studentUserId: 'stud-9' }], rowCount: 1 }); // listMembers
    const res = await request(app).get(`/api/gallery/grants/${GRANT_ID}/members`)
      .set('Authorization', `Bearer ${invTeacherTok}`);
    expect(res.status).toBe(200);
    expect(res.body.members).toEqual([{ studentUserId: 'stud-9' }]);
  });

  test('non-bound TEACHER GET members → 403', async () => {
    mockPool.query
      .mockResolvedValueOnce({ rows: [{ id: 'teach-host', role: 'TEACHER', school_id: HOST_SCHOOL, grade_level: null }], rowCount: 1 })
      .mockResolvedValueOnce({ rows: [{ id: GRANT_ID, host_school_id: HOST_SCHOOL, invited_school_id: 'school-ext', invited_teacher_user_id: 'teach-inv', status: 'ACCEPTED' }], rowCount: 1 });
    const res = await request(app).get(`/api/gallery/grants/${GRANT_ID}/members`)
      .set('Authorization', `Bearer ${hostTeacherTok}`);
    expect(res.status).toBe(403);
  });
});
