/**
 * Portfolio Public Exposure Guard (Task 8)
 *
 * Proves that portfolio_items data cannot leak through any public /
 * unauthenticated auction route, and that all portfolio + teacher-portfolio
 * endpoints reject unauthenticated requests with 401.
 */
process.env.NODE_ENV = 'test';
if (!process.env.JWT_ACCESS_SECRET) { process.env.JWT_ACCESS_SECRET = 'test-access-secret'; }

jest.mock('../../../src/models/index', () => {
  const actual = jest.requireActual('../../../src/models/index');
  return { ...actual, pool: { query: jest.fn().mockResolvedValue({ rows: [], rowCount: 0 }) } };
});

const request = require('supertest');
const createApp = require('../../../src/app');
const mockDb = require('../../helpers/mockDb');
const { pool: mockPool } = require('../../../src/models/index');

describe('Portfolio is never publicly exposed', () => {
  let app;
  beforeAll(() => { mockDb.reset(); app = createApp(mockDb); });
  beforeEach(() => {
    mockPool.query.mockReset();
    mockPool.query.mockResolvedValue({ rows: [], rowCount: 0 });
    mockDb.reset();
  });

  test('no unauthenticated public route reads portfolio_items', async () => {
    // Exercise all three genuinely-public auction endpoints in turn.
    // The highest-risk one is the /public preview because it fetches artworks.
    await request(app).get('/api/auctions/carousel');
    await request(app).get('/api/auctions');
    await request(app).get('/api/auctions/00000000-0000-0000-0000-000000000001/public');

    // Collect SQL from BOTH possible query sources so the guard is robust
    // regardless of which client (pool vs mockDb) the controller uses.
    const sql = [
      ...mockPool.query.mock.calls,
      ...(mockDb.query && mockDb.query.mock ? mockDb.query.mock.calls : [])
    ].map(c => c[0]).join('\n');

    expect(sql).not.toMatch(/portfolio_items/i);
  });

  test('portfolio + teacher-portfolio endpoints reject unauthenticated access with 401', async () => {
    expect((await request(app).get('/api/portfolio')).status).toBe(401);
    expect((await request(app).post('/api/portfolio').send({ title: 'x' })).status).toBe(401);
    expect((await request(app).get('/api/portfolio/some-id')).status).toBe(401);
    expect((await request(app).get('/api/teacher/portfolios')).status).toBe(401);
    expect((await request(app).get('/api/teacher/portfolios/some-student')).status).toBe(401);
  });
});
