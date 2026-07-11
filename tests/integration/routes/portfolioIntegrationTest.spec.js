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

describe('Portfolio edit / status / delete', () => {
  let app;
  beforeEach(() => { app = createTestApp(); mockDb.query.mockReset(); mockDb.query.mockResolvedValue({ rows: [], rowCount: 0 }); });

  test('PUT edits an own, unlocked piece', async () => {
    mockDb.query
      .mockResolvedValueOnce({ rows: [{ id: 'pi-1', student_user_id: 'stu-1', submission_state: 'NOT_SUBMITTED' }], rowCount: 1 }) // ownership+state lookup
      .mockResolvedValueOnce({ rows: [{ id: 'pi-1', title: 'New', description: null, medium: null, artist_grade: null, image_url: null, portfolio_status: 'IN_PROGRESS', submission_state: 'NOT_SUBMITTED', created_at: new Date() }], rowCount: 1 }); // update
    const res = await request(app).put('/api/portfolio/pi-1')
      .set('Authorization', `Bearer ${studentToken()}`).send({ title: 'New' });
    expect(res.status).toBe(200);
    expect(res.body.item.title).toBe('New');
  });

  test('PUT on another student\'s piece returns 404', async () => {
    mockDb.query.mockResolvedValueOnce({ rows: [], rowCount: 0 }); // ownership lookup finds nothing for this student
    const res = await request(app).put('/api/portfolio/pi-x')
      .set('Authorization', `Bearer ${studentToken()}`).send({ title: 'Hack' });
    expect(res.status).toBe(404);
  });

  test('PUT is blocked (409) while PENDING_REVIEW', async () => {
    mockDb.query.mockResolvedValueOnce({ rows: [{ id: 'pi-1', student_user_id: 'stu-1', submission_state: 'PENDING_REVIEW' }], rowCount: 1 });
    const res = await request(app).put('/api/portfolio/pi-1')
      .set('Authorization', `Bearer ${studentToken()}`).send({ title: 'Nope' });
    expect(res.status).toBe(409);
  });

  test('PATCH status toggles IN_PROGRESS -> COMPLETED', async () => {
    mockDb.query
      .mockResolvedValueOnce({ rows: [{ id: 'pi-1', student_user_id: 'stu-1', submission_state: 'NOT_SUBMITTED' }], rowCount: 1 })
      .mockResolvedValueOnce({ rows: [{ id: 'pi-1', title: 'X', description: null, medium: null, artist_grade: null, image_url: null, portfolio_status: 'COMPLETED', submission_state: 'NOT_SUBMITTED', created_at: new Date() }], rowCount: 1 });
    const res = await request(app).patch('/api/portfolio/pi-1/status')
      .set('Authorization', `Bearer ${studentToken()}`).send({ portfolioStatus: 'COMPLETED' });
    expect(res.status).toBe(200);
    expect(res.body.item.portfolioStatus).toBe('COMPLETED');
  });

  test('PATCH rejects an invalid status with 400', async () => {
    const res = await request(app).patch('/api/portfolio/pi-1/status')
      .set('Authorization', `Bearer ${studentToken()}`).send({ portfolioStatus: 'BOGUS' });
    expect(res.status).toBe(400);
  });

  test('DELETE soft-deletes an own, unlocked piece', async () => {
    mockDb.query
      .mockResolvedValueOnce({ rows: [{ id: 'pi-1', student_user_id: 'stu-1', submission_state: 'NOT_SUBMITTED' }], rowCount: 1 })
      .mockResolvedValueOnce({ rows: [{ id: 'pi-1' }], rowCount: 1 });
    const res = await request(app).delete('/api/portfolio/pi-1').set('Authorization', `Bearer ${studentToken()}`);
    expect(res.status).toBe(200);
    const deleteCall = mockDb.query.mock.calls.find(c => /deleted_at/.test(c[0]));
    expect(deleteCall).toBeDefined();
  });

  test('PATCH /status on another student\'s piece returns 404', async () => {
    mockDb.query.mockResolvedValueOnce({ rows: [], rowCount: 0 }); // ownership lookup finds nothing for this student
    const res = await request(app).patch('/api/portfolio/pi-x/status')
      .set('Authorization', `Bearer ${studentToken()}`).send({ portfolioStatus: 'COMPLETED' });
    expect(res.status).toBe(404);
  });

  test('DELETE is blocked (409) while IN_AUCTION', async () => {
    mockDb.query.mockResolvedValueOnce({ rows: [{ id: 'pi-1', student_user_id: 'stu-1', submission_state: 'IN_AUCTION' }], rowCount: 1 });
    const res = await request(app).delete('/api/portfolio/pi-1').set('Authorization', `Bearer ${studentToken()}`);
    expect(res.status).toBe(409);
  });
});

describe('Portfolio submit / withdraw', () => {
  let app;
  beforeEach(() => { app = createTestApp(); mockDb.query.mockReset(); mockDb.query.mockResolvedValue({ rows: [], rowCount: 0 }); });

  test('submit a COMPLETED piece creates an artwork snapshot and sets PENDING_REVIEW', async () => {
    mockDb.query
      // full item load (own, COMPLETED, NOT_SUBMITTED)
      .mockResolvedValueOnce({ rows: [{ id: 'pi-1', student_user_id: 'stu-1', portfolio_status: 'COMPLETED', submission_state: 'NOT_SUBMITTED', title: 'Sunset', description: 'sky', medium: 'Oil', artist_grade: '9', dimensions_width_cm: null, dimensions_height_cm: null, image_url: 'data:image/png;base64,iVBOR==' }], rowCount: 1 })
      // auction eligibility (same school, open)
      .mockResolvedValueOnce({ rows: [{ id: 'auc-1' }], rowCount: 1 })
      // student name lookup
      .mockResolvedValueOnce({ rows: [{ first_name: 'Ava', last_name: 'Reed' }], rowCount: 1 })
      // INSERT artwork snapshot
      .mockResolvedValueOnce({ rows: [{ id: 'art-1' }], rowCount: 1 })
      // UPDATE portfolio item -> PENDING_REVIEW
      .mockResolvedValueOnce({ rows: [{ id: 'pi-1' }], rowCount: 1 });

    const res = await request(app).post('/api/portfolio/pi-1/submit')
      .set('Authorization', `Bearer ${studentToken()}`).send({ auctionId: 'auc-1' });
    expect(res.status).toBe(200);
    expect(res.body.submissionState).toBe('PENDING_REVIEW');
    const insertArt = mockDb.query.mock.calls.find(c => /INSERT INTO artwork/.test(c[0]));
    expect(insertArt[0]).toMatch(/portfolio_item_id/);
    expect(insertArt[1]).toEqual(expect.arrayContaining(['auc-1', 'pi-1', 'stu-1']));
  });

  test('cannot submit an IN_PROGRESS piece (409)', async () => {
    mockDb.query.mockResolvedValueOnce({ rows: [{ id: 'pi-1', student_user_id: 'stu-1', portfolio_status: 'IN_PROGRESS', submission_state: 'NOT_SUBMITTED' }], rowCount: 1 });
    const res = await request(app).post('/api/portfolio/pi-1/submit')
      .set('Authorization', `Bearer ${studentToken()}`).send({ auctionId: 'auc-1' });
    expect(res.status).toBe(409);
  });

  test('submit with no auctionId returns 400', async () => {
    const res = await request(app).post('/api/portfolio/pi-1/submit')
      .set('Authorization', `Bearer ${studentToken()}`).send({});
    expect(res.status).toBe(400);
  });

  test('submit to an auction outside the student\'s school returns 403', async () => {
    mockDb.query
      .mockResolvedValueOnce({ rows: [{ id: 'pi-1', student_user_id: 'stu-1', portfolio_status: 'COMPLETED', submission_state: 'NOT_SUBMITTED', title: 'X', image_url: null }], rowCount: 1 })
      .mockResolvedValueOnce({ rows: [], rowCount: 0 }); // auction eligibility fails
    const res = await request(app).post('/api/portfolio/pi-1/submit')
      .set('Authorization', `Bearer ${studentToken()}`).send({ auctionId: 'auc-x' });
    expect(res.status).toBe(403);
  });

  test('withdraw a pending submission returns WITHDRAWN', async () => {
    mockDb.query
      .mockResolvedValueOnce({ rows: [{ id: 'pi-1', student_user_id: 'stu-1', submission_state: 'PENDING_REVIEW' }], rowCount: 1 }) // loadOwnItem
      .mockResolvedValueOnce({ rows: [{ id: 'art-1' }], rowCount: 1 }) // soft-delete linked SUBMITTED artwork
      .mockResolvedValueOnce({ rows: [{ id: 'pi-1' }], rowCount: 1 }); // update item -> WITHDRAWN
    const res = await request(app).post('/api/portfolio/pi-1/withdraw').set('Authorization', `Bearer ${studentToken()}`);
    expect(res.status).toBe(200);
    expect(res.body.submissionState).toBe('WITHDRAWN');
  });
});

describe('Portfolio moderation notices', () => {
  let app;
  beforeEach(() => { app = createTestApp(); mockDb.query.mockReset(); mockDb.query.mockResolvedValue({ rows: [], rowCount: 0 }); });

  test('GET /removed lists the student\'s removed pieces', async () => {
    mockDb.query.mockResolvedValueOnce({ rows: [{ id: 'pi-9', title: 'Old', moderation_reason: 'PII', moderated_at: new Date() }], rowCount: 1 });
    const res = await request(app).get('/api/portfolio/removed').set('Authorization', `Bearer ${studentToken()}`);
    expect(res.status).toBe(200);
    expect(res.body.removed[0]).toMatchObject({ id: 'pi-9', moderationReason: 'PII' });
  });

  test('list query filters to VISIBLE', async () => {
    mockDb.query.mockResolvedValueOnce({ rows: [], rowCount: 0 });
    await request(app).get('/api/portfolio').set('Authorization', `Bearer ${studentToken()}`);
    const listCall = mockDb.query.mock.calls.find(c => /FROM portfolio_items[\s\S]*ORDER BY created_at/i.test(c[0]));
    expect(listCall[0]).toMatch(/moderation_status = 'VISIBLE'/);
  });
});
