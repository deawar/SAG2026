'use strict';
jest.mock('../../../src/models/index', () => ({
  pool: { connect: jest.fn(), query: jest.fn().mockResolvedValue({ rows: [], rowCount: 0 }) }
}));
jest.mock('../../../src/services/notificationService', () => ({
  getSharedEmailProvider: jest.fn(() => ({ send: jest.fn() })),
  notifyAuctionWon: jest.fn().mockResolvedValue(undefined)
}));

const { pool } = require('../../../src/models/index');
const auctionService = require('../../../src/services/auctionService');

describe('endAuction winning-bid update', () => {
  test('marks the winner via a valid subselect (no UPDATE ... ORDER BY)', async () => {
    const client = { query: jest.fn(), release: jest.fn() };
    pool.connect.mockResolvedValue(client);
    client.query.mockImplementation((sql) => {
      if (sql === 'BEGIN' || sql === 'COMMIT' || sql === 'ROLLBACK') { return Promise.resolve({}); }
      if (/FROM auctions a/.test(sql)) {
        return Promise.resolve({ rows: [{ id: 'auc-1', auction_status: 'LIVE', platform_fee_percentage: 10, artwork_count: 1 }] });
      }
      if (/FROM artwork a/.test(sql)) {
        return Promise.resolve({ rows: [{ id: 'art-1', title: 'Sunset', winner_id: 'user-9', winning_bid: '50.00' }] });
      }
      return Promise.resolve({ rows: [], rowCount: 1 });
    });

    const result = await auctionService.endAuction('auc-1');
    expect(result.success).toBe(true);
    expect(result.winnersCount).toBe(1);

    // Flush the post-commit setImmediate winner-email block so any rejection
    // surfaces here (user lookup returns empty rows → path exits via continue).
    await new Promise((resolve) => { setImmediate(resolve); });

    const updateBids = client.query.mock.calls.find(c => typeof c[0] === 'string' && c[0].includes('UPDATE bids'));
    expect(updateBids).toBeTruthy();
    // Valid Postgres: UPDATE has no ORDER BY/LIMIT — the winner must be picked in a subselect.
    expect(updateBids[0]).toContain('(SELECT id FROM bids');
    expect(updateBids[0]).toContain('ORDER BY bid_amount DESC, placed_at ASC');
    expect(updateBids[1]).toEqual(['art-1']); // old broken code passed [piece.id, piece.winner_id]
  });

  test('endAuction refuses a non-LIVE auction (cannot resurrect CANCELLED/APPROVED)', async () => {
    const client = { query: jest.fn(), release: jest.fn() };
    pool.connect.mockResolvedValue(client);
    client.query.mockImplementation((sql) => {
      if (sql === 'BEGIN' || sql === 'COMMIT' || sql === 'ROLLBACK') { return Promise.resolve({}); }
      if (/FROM auctions a/.test(sql)) {
        return Promise.resolve({ rows: [{ id: 'auc-2', auction_status: 'CANCELLED', artwork_count: 0 }] });
      }
      return Promise.resolve({ rows: [], rowCount: 0 });
    });
    const result = await auctionService.endAuction('auc-2');
    expect(result.success).toBe(false);
    const updates = client.query.mock.calls.filter(c => typeof c[0] === 'string' && c[0].includes('UPDATE auctions'));
    expect(updates).toHaveLength(0);
    // The early return must close the transaction — releasing a pooled client
    // mid-BEGIN leaks "idle in transaction" and keeps the FOR UPDATE row lock.
    expect(client.query).toHaveBeenCalledWith('ROLLBACK');
    expect(client.release).toHaveBeenCalled();
  });

  test('winner determination locks artwork rows (serializes with placeBid)', async () => {
    const client = { query: jest.fn(), release: jest.fn() };
    pool.connect.mockResolvedValue(client);
    client.query.mockImplementation((sql) => {
      if (sql === 'BEGIN' || sql === 'COMMIT' || sql === 'ROLLBACK') { return Promise.resolve({}); }
      if (/FROM auctions a/.test(sql)) {
        return Promise.resolve({ rows: [{ id: 'auc-1', auction_status: 'LIVE', platform_fee_percentage: 10, artwork_count: 1 }] });
      }
      if (/FROM artwork a/.test(sql)) {
        return Promise.resolve({ rows: [] });
      }
      return Promise.resolve({ rows: [], rowCount: 1 });
    });
    await auctionService.endAuction('auc-1');
    const artworkCall = client.query.mock.calls.find(c => typeof c[0] === 'string' && /FROM artwork a/.test(c[0]));
    expect(artworkCall[0]).toContain('FOR UPDATE OF a');
  });
});
