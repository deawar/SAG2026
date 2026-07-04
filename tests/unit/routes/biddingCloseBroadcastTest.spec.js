/**
 * Finding 2 — Auction-close broadcast winner reduction
 *
 * Verifies that when POST /api/bidding/auction/:id/close fires the realtime
 * broadcast, the winner payload carries only a reduced "First L." name and
 * bidAmount — never the raw userId or the full last name.
 *
 * Wiring the full closeAuction DB path (BEGIN/COMMIT, audit_log INSERT, etc.)
 * would make this test heavy and brittle. Instead we mock biddingService at
 * the module level and spy on realtimeService so we can inspect exactly what
 * broadcastAuctionStatusChange receives. This keeps the test laser-focused on
 * the Finding-2 invariant while remaining deterministic.
 */

process.env.NODE_ENV = 'test';
if (!process.env.JWT_ACCESS_SECRET) { process.env.JWT_ACCESS_SECRET = 'test-access-secret'; }
if (!process.env.JWT_REFRESH_SECRET) { process.env.JWT_REFRESH_SECRET = 'test-refresh-secret'; }

// Mock pool (required by many imported modules at load time)
jest.mock('../../../src/models/index', () => {
  const actual = jest.requireActual('../../../src/models/index');
  return { ...actual, pool: { query: jest.fn().mockResolvedValue({ rows: [], rowCount: 0 }) } };
});

// Mock biddingService so closeAuction returns a controlled winner object
// with a FULL name + raw id (as the DB path would produce).
jest.mock('../../../src/services/biddingService', () => ({
  closeAuction: jest.fn()
}));

// Mock realtimeService so we can spy on broadcastAuctionStatusChange
jest.mock('../../../src/services/realtimeService', () => ({
  broadcastAuctionStatusChange: jest.fn(),
  broadcastBidUpdate: jest.fn(),
  getStats: jest.fn().mockReturnValue({})
}));

const request = require('supertest');
const jwt = require('jsonwebtoken');
const createApp = require('../../../src/app');
const mockDb = require('../../helpers/mockDb');
const biddingService = require('../../../src/services/biddingService');
const realtimeService = require('../../../src/services/realtimeService');

const SECRET = process.env.JWT_ACCESS_SECRET;

function makeAdminToken() {
  return jwt.sign({ userId: 'admin-1', role: 'SITE_ADMIN', schoolId: null }, SECRET, { algorithm: 'HS256', expiresIn: '15m' });
}

describe('Finding 2 — auction-close broadcast winner reduction', () => {
  let app;

  beforeAll(() => {
    mockDb.reset();
    app = createApp(mockDb);
  });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('broadcast winner has reduced name and no id when a winner exists', async () => {
    // closeAuction returns a winner with FULL identity (as the DB path produces)
    biddingService.closeAuction.mockResolvedValue({
      success: true,
      auctionId: 'auction-99',
      winner: {
        id: 'user-secret-id',
        name: 'Sophia Williams',
        email: 'sophia@example.com',
        bidAmount: '350.00',
        artworkId: 'art-1'
      },
      winners: [],
      message: 'Auction closed. 1 winner(s) determined.'
    });

    const res = await request(app)
      .post('/api/bidding/auction/auction-99/close')
      .set('Authorization', `Bearer ${makeAdminToken()}`);

    expect(res.status).toBe(200);

    // broadcastAuctionStatusChange must have been called exactly once
    expect(realtimeService.broadcastAuctionStatusChange).toHaveBeenCalledTimes(1);

    const [broadcastAuctionId, broadcastStatus, broadcastPayload] =
      realtimeService.broadcastAuctionStatusChange.mock.calls[0];

    expect(broadcastAuctionId).toBe('auction-99');
    expect(broadcastStatus).toBe('closed');

    const broadcastWinner = broadcastPayload.winner;

    // Must carry reduced name "First L."
    expect(broadcastWinner.name).toBe('Sophia W.');
    expect(broadcastWinner.name).not.toContain('Williams');

    // Must carry bidAmount
    expect(broadcastWinner.bidAmount).toBe('350.00');

    // Must NOT carry raw userId or email
    expect(broadcastWinner).not.toHaveProperty('id');
    expect(broadcastWinner).not.toHaveProperty('email');
  });

  test('broadcast winner is null when auction has no winner', async () => {
    biddingService.closeAuction.mockResolvedValue({
      success: true,
      auctionId: 'auction-100',
      winner: null,
      winners: [],
      message: 'Auction closed with no winner'
    });

    const res = await request(app)
      .post('/api/bidding/auction/auction-100/close')
      .set('Authorization', `Bearer ${makeAdminToken()}`);

    expect(res.status).toBe(200);
    expect(realtimeService.broadcastAuctionStatusChange).toHaveBeenCalledTimes(1);

    const [, , broadcastPayload] =
      realtimeService.broadcastAuctionStatusChange.mock.calls[0];

    expect(broadcastPayload.winner).toBeNull();
  });

  test('HTTP response for admin still carries full winner identity (not reduced)', async () => {
    const fullWinner = {
      id: 'user-secret-id',
      name: 'Sophia Williams',
      email: 'sophia@example.com',
      bidAmount: '350.00',
      artworkId: 'art-1'
    };
    biddingService.closeAuction.mockResolvedValue({
      success: true,
      auctionId: 'auction-99',
      winner: fullWinner,
      winners: [fullWinner],
      message: 'Auction closed. 1 winner(s) determined.'
    });

    const res = await request(app)
      .post('/api/bidding/auction/auction-99/close')
      .set('Authorization', `Bearer ${makeAdminToken()}`);

    expect(res.status).toBe(200);
    // Admin HTTP response keeps the full winner object untouched
    expect(res.body.data.winner.name).toBe('Sophia Williams');
    expect(res.body.data.winner.id).toBe('user-secret-id');
  });
});
