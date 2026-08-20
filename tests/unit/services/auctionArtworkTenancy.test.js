process.env.NODE_ENV = 'test';

// Replace pool.connect with a query-aware fake client so we can drive rowCounts.
jest.mock('../../../src/models/index', () => {
  const actual = jest.requireActual('../../../src/models/index');
  return { ...actual, pool: { connect: jest.fn() } };
});
const { pool } = require('../../../src/models/index');
const auctionService = require('../../../src/services/auctionService');

function fakeClient(handlers) {
  return {
    query: jest.fn((sql) => {
      if (/^BEGIN|^COMMIT|^ROLLBACK/i.test(sql.trim())) { return Promise.resolve({ rows: [] }); }
      if (/FROM schools WHERE id/i.test(sql)) { return Promise.resolve({ rows: [{ id: 'school-A' }], rowCount: 1 }); }
      if (/INSERT INTO auctions/i.test(sql)) { return Promise.resolve({ rows: [{ id: 'auc-new', title: 'T', description: '', auction_status: 'DRAFT' }], rowCount: 1 }); }
      if (/UPDATE artwork SET auction_id/i.test(sql)) { return Promise.resolve(handlers.artworkUpdate); }
      if (/INSERT INTO audit_logs/i.test(sql)) { return Promise.resolve({ rows: [] }); }
      return Promise.resolve({ rows: [], rowCount: 0 });
    }),
    release: jest.fn()
  };
}

const baseData = {
  title: 'Spring Show', description: 'd', schoolId: 'school-A',
  startTime: new Date(Date.now() + 3600000).toISOString(),
  endTime: new Date(Date.now() + 7200000).toISOString(),
  platformFeePercentage: 3.5, autoExtendMinutes: 0,
  createdByUserId: 'admin-A', paymentGatewayId: 'gw-1'
};

describe('createAuction artwork tenancy', () => {
  beforeEach(() => {
    // _generateQRCode does I/O — stub it.
    jest.spyOn(auctionService, '_generateQRCode').mockResolvedValue('qr://stub');
  });
  afterEach(() => jest.restoreAllMocks());

  test('rejects when a requested artwork is not in the auction school (rowCount < requested)', async () => {
    // 2 ids requested, only 1 owned by school-A → mismatch → reject + rollback
    const client = fakeClient({ artworkUpdate: { rowCount: 1 } });
    pool.connect.mockResolvedValue(client);

    await expect(
      auctionService.createAuction({ ...baseData, artworkIds: ['art-A', 'art-foreign'] })
    ).rejects.toThrow('ARTWORK_NOT_IN_SCHOOL');

    // transaction rolled back, not committed
    const calls = client.query.mock.calls.map(c => c[0]);
    expect(calls.some(s => /ROLLBACK/i.test(s))).toBe(true);
    expect(calls.some(s => /COMMIT/i.test(s))).toBe(false);
  });

  test('succeeds when all requested artwork belong to the school (rowCount === requested)', async () => {
    const client = fakeClient({ artworkUpdate: { rowCount: 2 } });
    pool.connect.mockResolvedValue(client);

    const res = await auctionService.createAuction({ ...baseData, artworkIds: ['art-A1', 'art-A2'] });
    expect(res.success).toBe(true);
    const calls = client.query.mock.calls.map(c => c[0]);
    expect(calls.some(s => /COMMIT/i.test(s))).toBe(true);
  });
});
