process.env.NODE_ENV = 'test';
if (!process.env.JWT_ACCESS_SECRET) { process.env.JWT_ACCESS_SECRET = 'test-access-secret'; }
if (!process.env.JWT_REFRESH_SECRET) { process.env.JWT_REFRESH_SECRET = 'test-refresh-secret'; }

// Intercept pool.query used directly by auctionController + verifyToken.
jest.mock('../../../src/models/index', () => {
  const actual = jest.requireActual('../../../src/models/index');
  return { ...actual, pool: { query: jest.fn().mockResolvedValue({ rows: [], rowCount: 0 }) } };
});

const request = require('supertest');
const jwt = require('jsonwebtoken');
const createApp = require('../../../src/app');
const mockDb = require('../../helpers/mockDb');
const { pool: mockPool } = require('../../../src/models/index');
const { authCookie } = require('../../helpers/authCookie');

const SECRET = process.env.JWT_ACCESS_SECRET;
const schoolAdminA = () => jwt.sign({ sub: 'admin-A', role: 'SCHOOL_ADMIN', schoolId: 'school-A' }, SECRET, { algorithm: 'HS256' });

// Query-aware pool: verifyToken hydrates SCHOOL_ADMIN school from users; the
// guard reads the auction's school from auctions.
function wirePool(auctionSchoolId) {
  mockPool.query.mockImplementation((sql) => {
    if (/FROM users WHERE id/i.test(sql)) {
      return Promise.resolve({ rows: [{ school_id: 'school-A' }], rowCount: 1 });
    }
    if (/FROM auctions WHERE id/i.test(sql)) {
      return Promise.resolve({ rows: [{ school_id: auctionSchoolId }], rowCount: 1 });
    }
    return Promise.resolve({ rows: [], rowCount: 0 });
  });
}

describe('Auction tenant isolation — public actions', () => {
  let app;
  beforeAll(() => { mockDb.reset(); app = createApp(mockDb); });
  beforeEach(() => { mockPool.query.mockReset(); mockDb.reset(); });

  const actions = [
    ['put', '/api/auctions/auc-1'],
    ['post', '/api/auctions/auc-1/start'],
    ['post', '/api/auctions/auc-1/end'],
    ['post', '/api/auctions/auc-1/extend'],
    ['delete', '/api/auctions/auc-1']
  ];

  test.each(actions)('%s %s → 403 when SCHOOL_ADMIN acts on another school', async (method, path) => {
    wirePool('school-B'); // auction belongs to School B
    const res = await request(app)[method](path).set(authCookie(schoolAdminA())).send({});
    expect(res.status).toBe(403);
  });

  test('start → 404 when the auction does not exist', async () => {
    mockPool.query.mockImplementation((sql) =>
      /FROM users WHERE id/i.test(sql)
        ? Promise.resolve({ rows: [{ school_id: 'school-A' }], rowCount: 1 })
        : Promise.resolve({ rows: [], rowCount: 0 }));
    const res = await request(app).post('/api/auctions/nope/start').set(authCookie(schoolAdminA())).send({});
    expect(res.status).toBe(404);
  });

  test('same-school action is NOT blocked by the tenancy guard (not 403/404)', async () => {
    wirePool('school-A'); // auction belongs to School A (same as admin)
    const res = await request(app).post('/api/auctions/auc-1/start').set(authCookie(schoolAdminA())).send({});
    expect(res.status).not.toBe(403);
    expect(res.status).not.toBe(404);
  });
});
