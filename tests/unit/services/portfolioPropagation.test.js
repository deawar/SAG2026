/**
 * Portfolio Propagation Tests
 * Tests for Task 6: teacher pricing on approve, reject/close propagation to portfolio items.
 */
process.env.NODE_ENV = 'test';
if (!process.env.JWT_ACCESS_SECRET) { process.env.JWT_ACCESS_SECRET = 'test-access-secret'; }

jest.mock('../../../src/models/index', () => {
  const actual = jest.requireActual('../../../src/models/index');
  return { ...actual, pool: { query: jest.fn().mockResolvedValue({ rows: [], rowCount: 0 }), connect: jest.fn() } };
});

const request = require('supertest');
const jwt = require('jsonwebtoken');
const createApp = require('../../../src/app');
const mockDb = require('../../helpers/mockDb');
const { pool: mockPool } = require('../../../src/models/index');

const SECRET = process.env.JWT_ACCESS_SECRET;

function teacherToken() {
  return jwt.sign(
    { userId: 'tea-1', role: 'TEACHER', schoolId: 'school-1', twoFaEnabled: true },
    SECRET,
    { algorithm: 'HS256' }
  );
}

describe('Teacher approve sets pricing and propagates IN_AUCTION', () => {
  let app;

  beforeAll(() => {
    mockDb.reset();
    app = createApp(mockDb);
  });

  beforeEach(() => {
    mockPool.query.mockReset();
    mockPool.query.mockResolvedValue({ rows: [], rowCount: 0 });
  });

  test('approve writes starting_bid/reserve and flips linked portfolio item to IN_AUCTION', async () => {
    // Stub the query sequence the handler actually runs:
    // 1. _resolveSchoolId SELECT
    // 2. UPDATE artwork SET approved + pricing
    // 3. UPDATE portfolio_items SET IN_AUCTION
    mockPool.query
      .mockResolvedValueOnce({ rows: [{ school_id: 'school-1' }], rowCount: 1 }) // _resolveSchoolId
      .mockResolvedValueOnce({ rows: [{ id: 'art-1' }], rowCount: 1 })           // UPDATE artwork
      .mockResolvedValueOnce({ rows: [], rowCount: 0 });                          // UPDATE portfolio_items

    const res = await request(app)
      .put('/api/teacher/submissions/art-1/approve')
      .set('Authorization', `Bearer ${teacherToken()}`)
      .send({ startingBid: 25, reserve: 50 });

    expect(res.status).toBe(200);
    const sqls = mockPool.query.mock.calls.map(c => c[0]).join('\n');
    expect(sqls).toMatch(/UPDATE artwork[\s\S]*starting_bid_amount/i);
    expect(sqls).toMatch(/UPDATE portfolio_items[\s\S]*IN_AUCTION/i);
  });

  test('approve returns 400 when startingBid is negative', async () => {
    // No DB write should occur beyond _resolveSchoolId (if any), validation is before query
    const res = await request(app)
      .put('/api/teacher/submissions/art-1/approve')
      .set('Authorization', `Bearer ${teacherToken()}`)
      .send({ startingBid: -5 });

    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
    expect(res.body.message).toMatch(/startingBid must be a non-negative number/i);
  });
});

describe('Teacher reject propagates REJECTED to linked portfolio item', () => {
  let app;

  beforeAll(() => {
    mockDb.reset();
    app = createApp(mockDb);
  });

  beforeEach(() => {
    mockPool.query.mockReset();
    mockPool.query.mockResolvedValue({ rows: [], rowCount: 0 });
  });

  test('reject flips linked portfolio item to REJECTED', async () => {
    mockPool.query
      .mockResolvedValueOnce({ rows: [{ school_id: 'school-1' }], rowCount: 1 }) // _resolveSchoolId
      .mockResolvedValueOnce({ rows: [{ id: 'art-1' }], rowCount: 1 })           // UPDATE artwork
      .mockResolvedValueOnce({ rows: [], rowCount: 0 });                          // UPDATE portfolio_items

    const res = await request(app)
      .put('/api/teacher/submissions/art-1/reject')
      .set('Authorization', `Bearer ${teacherToken()}`)
      .send({ reason: 'blurry' });

    expect(res.status).toBe(200);
    const sqls = mockPool.query.mock.calls.map(c => c[0]).join('\n');
    expect(sqls).toMatch(/UPDATE portfolio_items[\s\S]*REJECTED/i);
  });
});

describe('Auction close propagates SOLD/UNSOLD to linked portfolio items', () => {
  let mockClient;

  beforeEach(() => {
    jest.clearAllMocks();

    mockClient = {
      query: jest.fn().mockResolvedValue({ rows: [], rowCount: 0 }),
      release: jest.fn()
    };

    mockPool.connect.mockResolvedValue(mockClient);
  });

  test('closeAuction issues UPDATE portfolio_items with SOLD/UNSOLD CASE statement', async () => {
    // Sequence: BEGIN, SELECT auction FOR UPDATE, UPDATE auction ENDED,
    //   SELECT winners (no bids), UPDATE portfolio_items SOLD/UNSOLD, INSERT audit_log, COMMIT
    mockClient.query
      .mockResolvedValueOnce({})                                                                          // BEGIN
      .mockResolvedValueOnce({ rows: [{ id: 'auc-1', school_id: 'school-1', auction_status: 'LIVE' }] }) // SELECT auction
      .mockResolvedValueOnce({})                                                                          // UPDATE auction ENDED
      .mockResolvedValueOnce({ rows: [] })                                                                // SELECT winners
      .mockResolvedValueOnce({})                                                                          // UPDATE portfolio_items
      .mockResolvedValueOnce({})                                                                          // INSERT audit_log
      .mockResolvedValueOnce({});                                                                         // COMMIT

    const biddingService = require('../../../src/services/biddingService');
    const result = await biddingService.closeAuction('auc-1');

    expect(result.success).toBe(true);

    const sqls = mockClient.query.mock.calls.map(c => (typeof c[0] === 'string' ? c[0] : '')).join('\n');
    expect(sqls).toMatch(/UPDATE portfolio_items[\s\S]*submission_state = CASE/i);
  });
});
