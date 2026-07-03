/**
 * Auction PII Exposure Integration Tests
 * Task 2: Public carousel must not expose student full name or grade.
 * Tasks 3/4/5 will extend this file with winner/bid/artwork PII checks.
 */

process.env.NODE_ENV = 'test';
if (!process.env.JWT_ACCESS_SECRET) { process.env.JWT_ACCESS_SECRET = 'test-access-secret'; }
if (!process.env.JWT_REFRESH_SECRET) { process.env.JWT_REFRESH_SECRET = 'test-refresh-secret'; }

jest.mock('../../../src/models/index', () => {
  const actual = jest.requireActual('../../../src/models/index');
  return { ...actual, pool: { query: jest.fn().mockResolvedValue({ rows: [], rowCount: 0 }) } };
});

const request = require('supertest');
const createApp = require('../../../src/app');
const mockDb = require('../../helpers/mockDb');
const { pool: mockPool } = require('../../../src/models/index');

describe('Public carousel PII', () => {
  let app;
  beforeAll(() => { mockDb.reset(); app = createApp(mockDb); });
  beforeEach(() => {
    mockPool.query.mockReset();
    mockPool.query.mockResolvedValue({ rows: [], rowCount: 0 });
    mockDb.reset();
  });

  test('carousel reduces artist name and never returns artistGrade', async () => {
    mockPool.query.mockResolvedValueOnce({ rows: [
      { id: 'a1', title: 'Burger Cat', artist_name: 'Joyce Chen', medium: 'Oil', image_url: 'data:image/jpeg;base64,xxx', auction_id: 'au1', artist_grade: 9 }
    ], rowCount: 1 });
    const res = await request(app).get('/api/auctions/carousel');
    expect(res.status).toBe(200);
    for (const art of res.body.artwork) {
      expect(art).not.toHaveProperty('artistGrade');
      expect(art.artistName).toBe('Joyce C.');
    }
  });
});
