'use strict';
jest.mock('../../../src/models/index', () => ({
  pool: { query: jest.fn().mockResolvedValue({ rows: [], rowCount: 0 }) }
}));
jest.mock('../../../src/services/auctionService', () => ({
  endAuction: jest.fn().mockResolvedValue({ success: true })
}));

const { pool } = require('../../../src/models/index');
const auctionService = require('../../../src/services/auctionService');
const scheduler = require('../../../src/services/auctionScheduler');

beforeEach(() => {
  pool.query.mockReset();
  pool.query.mockResolvedValue({ rows: [], rowCount: 0 });
  auctionService.endAuction.mockClear();
  scheduler.stop();
});
afterAll(() => scheduler.stop());

describe('auctionScheduler.sweep', () => {
  test('promotes due APPROVED auctions to LIVE and audits each', async () => {
    pool.query
      .mockResolvedValueOnce({ rows: [{ id: 'a1' }, { id: 'a2' }], rowCount: 2 }) // auto-start UPDATE
      .mockResolvedValueOnce({ rows: [], rowCount: 1 })                            // audit a1
      .mockResolvedValueOnce({ rows: [], rowCount: 1 })                            // audit a2
      .mockResolvedValueOnce({ rows: [], rowCount: 0 });                           // due-LIVE select
    const out = await scheduler.sweep();
    expect(out.started).toBe(2);
    // Normalize whitespace so SQL reformatting can't silently break the test.
    const startSql = pool.query.mock.calls[0][0].replace(/\s+/g, ' ');
    expect(startSql).toContain("auction_status = 'APPROVED'");
    expect(startSql).toContain('starts_at <= NOW()');
    expect(startSql).toContain('ends_at > NOW()');
    expect(startSql).toContain('deleted_at IS NULL');
    const auditSql = pool.query.mock.calls[1][0];
    expect(auditSql).toContain('INSERT INTO audit_logs');
    expect(pool.query.mock.calls[1][1]).toEqual(expect.arrayContaining(['AUCTION', 'auction_auto_started', 'a1']));
  });

  test('ends every due LIVE auction via auctionService.endAuction', async () => {
    pool.query
      .mockResolvedValueOnce({ rows: [], rowCount: 0 })                          // auto-start
      .mockResolvedValueOnce({ rows: [{ id: 'L1' }, { id: 'L2' }], rowCount: 2 }); // due-LIVE select
    const out = await scheduler.sweep();
    expect(out.ended).toBe(2);
    expect(auctionService.endAuction).toHaveBeenCalledWith('L1');
    expect(auctionService.endAuction).toHaveBeenCalledWith('L2');
    const dueSql = pool.query.mock.calls[1][0];
    expect(dueSql).toContain("auction_status = 'LIVE'");
    expect(dueSql).toContain('ends_at <= NOW()');
  });

  test('one failing endAuction does not stop the rest', async () => {
    pool.query
      .mockResolvedValueOnce({ rows: [], rowCount: 0 })
      .mockResolvedValueOnce({ rows: [{ id: 'L1' }, { id: 'L2' }], rowCount: 2 });
    auctionService.endAuction
      .mockRejectedValueOnce(new Error('boom'))
      .mockResolvedValueOnce({ success: true });
    const out = await scheduler.sweep();
    expect(out.ended).toBe(1);
    expect(auctionService.endAuction).toHaveBeenCalledTimes(2);
  });

  test('nothing due → no endAuction calls, zero counts', async () => {
    const out = await scheduler.sweep();
    expect(out).toEqual({ started: 0, ended: 0 });
    expect(auctionService.endAuction).not.toHaveBeenCalled();
  });

  test('start() is idempotent and stop() clears the timer', () => {
    // Real timers (the real timer object has unref); assert via spies.
    const setSpy = jest.spyOn(global, 'setInterval');
    const clearSpy = jest.spyOn(global, 'clearInterval');
    scheduler.start(60000);
    scheduler.start(60000); // second call must be a no-op
    expect(setSpy).toHaveBeenCalledTimes(1);
    scheduler.stop();
    scheduler.stop(); // second stop must be a no-op
    expect(clearSpy).toHaveBeenCalledTimes(1);
    setSpy.mockRestore();
    clearSpy.mockRestore();
  });
});
