process.env.NODE_ENV = 'test';
if (!process.env.JWT_ACCESS_SECRET) { process.env.JWT_ACCESS_SECRET = 'test-access-secret'; }
if (!process.env.JWT_REFRESH_SECRET) { process.env.JWT_REFRESH_SECRET = 'test-refresh-secret'; }

const request = require('supertest');
const jwt = require('jsonwebtoken');
const createTestApp = require('../../helpers/createTestApp');
const mockDb = require('../../helpers/mockDb');

const SECRET = process.env.JWT_ACCESS_SECRET;
function studentToken() {
  return jwt.sign({ userId: 'stu-1', role: 'STUDENT', schoolId: 'school-1', twoFaEnabled: true }, SECRET, { algorithm: 'HS256' });
}
const PNG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';

describe('Portfolio create + list', () => {
  let app;
  beforeEach(() => { app = createTestApp(); mockDb.query.mockReset(); mockDb.query.mockResolvedValue({ rows: [], rowCount: 0 }); });

  test('POST /api/portfolio creates a piece for the current student', async () => {
    mockDb.query.mockResolvedValueOnce({
      rows: [{ id: 'pi-1', title: 'Sunset', portfolio_status: 'IN_PROGRESS', submission_state: 'NOT_SUBMITTED', created_at: new Date() }],
      rowCount: 1
    });
    const res = await request(app).post('/api/portfolio')
      .set('Authorization', `Bearer ${studentToken()}`)
      .send({ title: 'Sunset', description: 'sky', medium: 'Oil', artistGrade: '9', imageData: PNG });
    expect(res.status).toBe(201);
    expect(res.body.item).toMatchObject({ id: 'pi-1', title: 'Sunset', portfolioStatus: 'IN_PROGRESS', submissionState: 'NOT_SUBMITTED' });
    // INSERT bound student_user_id + school_id from the token
    const insert = mockDb.query.mock.calls.find(c => /INSERT INTO portfolio_items/.test(c[0]));
    expect(insert[1]).toEqual(expect.arrayContaining(['stu-1', 'school-1', 'Sunset']));
  });

  test('POST /api/portfolio rejects a missing title with 400', async () => {
    const res = await request(app).post('/api/portfolio')
      .set('Authorization', `Bearer ${studentToken()}`).send({ description: 'no title' });
    expect(res.status).toBe(400);
  });

  test('GET /api/portfolio lists only the current student\'s pieces', async () => {
    mockDb.query.mockResolvedValueOnce({
      rows: [
        { id: 'pi-1', title: 'Sunset', description: null, medium: 'Oil', artist_grade: '9', image_url: PNG, portfolio_status: 'IN_PROGRESS', submission_state: 'NOT_SUBMITTED', created_at: new Date() }
      ], rowCount: 1
    });
    const res = await request(app).get('/api/portfolio').set('Authorization', `Bearer ${studentToken()}`);
    expect(res.status).toBe(200);
    expect(res.body.items).toHaveLength(1);
    expect(res.body.items[0]).toMatchObject({ id: 'pi-1', portfolioStatus: 'IN_PROGRESS', submissionState: 'NOT_SUBMITTED' });
    const select = mockDb.query.mock.calls.find(c => /FROM portfolio_items/.test(c[0]));
    expect(select[1]).toContain('stu-1');
  });

  test('unauthenticated request is rejected', async () => {
    const res = await request(app).get('/api/portfolio');
    expect(res.status).toBe(401);
  });
});
