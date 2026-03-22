/**
 * Auction Model Unit Tests
 * Tests create() validation and status transition methods directly.
 * Uses MockDatabase — no real DB connection required.
 */

const { AuctionModel } = require('../../../src/models');

// ---------------------------------------------------------------------------
// MockDatabase — returns queued responses in order per call
// ---------------------------------------------------------------------------
class MockDatabase {
  constructor(responses = []) {
    this._responses = responses;
    this._callIndex = 0;
  }

  async query() {
    const response = this._responses[this._callIndex] || { rows: [], rowCount: 0 };
    this._callIndex++;
    return response;
  }

  async transaction(cb) { return cb(this); }
}

// Helpers
const future = (offsetMs) => new Date(Date.now() + offsetMs);
const DAY = 86400000;

// Shared base auction — spread and override per test
const BASE_AUCTION = {
  schoolId: 'school-uuid-1',
  title: 'Spring Art Auction',
  description: 'Annual art auction',
  startsAt: future(DAY),
  endsAt: future(DAY * 7),
  platformFeePercentage: 3.5,
  visibility: 'PUBLIC',
};

// ---------------------------------------------------------------------------
// validate required fields
// ---------------------------------------------------------------------------
describe('Auction Model', () => {
  let auctionModel;

  beforeEach(() => {
    auctionModel = new AuctionModel(new MockDatabase());
  });

  describe('validate required fields', () => {
    test('should throw INVALID_AUCTION_TITLE when title is empty string', async () => {
      await expect(auctionModel.create({ ...BASE_AUCTION, title: '' }, 'user-id'))
        .rejects.toThrow('INVALID_AUCTION_TITLE');
    });

    test('should throw INVALID_AUCTION_TITLE when title is null', async () => {
      await expect(auctionModel.create({ ...BASE_AUCTION, title: null }, 'user-id'))
        .rejects.toThrow('INVALID_AUCTION_TITLE');
    });

    test('should throw INVALID_AUCTION_TITLE when title is less than 3 characters', async () => {
      await expect(auctionModel.create({ ...BASE_AUCTION, title: 'AB' }, 'user-id'))
        .rejects.toThrow('INVALID_AUCTION_TITLE');
    });

    test('should throw INVALID_AUCTION_DATES when startsAt is null', async () => {
      await expect(auctionModel.create({ ...BASE_AUCTION, startsAt: null }, 'user-id'))
        .rejects.toThrow('INVALID_AUCTION_DATES');
    });

    test('should throw INVALID_AUCTION_DATES when endsAt is null', async () => {
      await expect(auctionModel.create({ ...BASE_AUCTION, endsAt: null }, 'user-id'))
        .rejects.toThrow('INVALID_AUCTION_DATES');
    });

    test('should throw INVALID_AUCTION_DATES when startsAt is undefined', async () => {
      const { startsAt: _s, ...noStart } = BASE_AUCTION;
      await expect(auctionModel.create(noStart, 'user-id'))
        .rejects.toThrow('INVALID_AUCTION_DATES');
    });

    test('should throw INVALID_PLATFORM_FEE for negative fee', async () => {
      await expect(auctionModel.create({ ...BASE_AUCTION, platformFeePercentage: -1 }, 'user-id'))
        .rejects.toThrow('INVALID_PLATFORM_FEE');
    });

    test('should throw INVALID_PLATFORM_FEE for fee over 100', async () => {
      await expect(auctionModel.create({ ...BASE_AUCTION, platformFeePercentage: 101 }, 'user-id'))
        .rejects.toThrow('INVALID_PLATFORM_FEE');
    });

    test('should accept fee of exactly 0', async () => {
      const db = new MockDatabase([
        { rows: [{ id: 'new-id', title: 'Spring Art Auction', auction_status: 'DRAFT' }], rowCount: 1 },
      ]);
      const model = new AuctionModel(db);
      const result = await model.create({ ...BASE_AUCTION, platformFeePercentage: 0 }, 'user-id');
      expect(result.auction_status).toBe('DRAFT');
    });

    test('should accept fee of exactly 100', async () => {
      const db = new MockDatabase([
        { rows: [{ id: 'new-id', title: 'Spring Art Auction', auction_status: 'DRAFT' }], rowCount: 1 },
      ]);
      const model = new AuctionModel(db);
      const result = await model.create({ ...BASE_AUCTION, platformFeePercentage: 100 }, 'user-id');
      expect(result.auction_status).toBe('DRAFT');
    });

    test('should create auction with DRAFT status', async () => {
      const db = new MockDatabase([
        { rows: [{ id: 'auction-id', title: 'Spring Art Auction', auction_status: 'DRAFT' }], rowCount: 1 },
      ]);
      const model = new AuctionModel(db);
      const result = await model.create(BASE_AUCTION, 'user-id');
      expect(result.auction_status).toBe('DRAFT');
    });
  });

  // ---------------------------------------------------------------------------
  // enforce valid status transitions
  // ---------------------------------------------------------------------------
  describe('enforce valid status transitions', () => {
    test('submit() should throw AUCTION_NOT_IN_DRAFT_STATE when not in DRAFT', async () => {
      const model = new AuctionModel(new MockDatabase([{ rows: [], rowCount: 0 }]));
      await expect(model.submit('auction-id'))
        .rejects.toThrow('AUCTION_NOT_IN_DRAFT_STATE');
    });

    test('submit() should succeed and return PENDING_APPROVAL', async () => {
      const db = new MockDatabase([
        { rows: [{ id: 'auction-id', auction_status: 'PENDING_APPROVAL' }], rowCount: 1 },
      ]);
      const result = await new AuctionModel(db).submit('auction-id');
      expect(result.auction_status).toBe('PENDING_APPROVAL');
    });

    test('approve() should throw AUCTION_NOT_PENDING_APPROVAL when not pending', async () => {
      const model = new AuctionModel(new MockDatabase([{ rows: [], rowCount: 0 }]));
      await expect(model.approve('auction-id', 'admin-id'))
        .rejects.toThrow('AUCTION_NOT_PENDING_APPROVAL');
    });

    test('approve() should succeed and return APPROVED', async () => {
      const db = new MockDatabase([
        { rows: [{ id: 'auction-id', auction_status: 'APPROVED' }], rowCount: 1 },
      ]);
      const result = await new AuctionModel(db).approve('auction-id', 'admin-id');
      expect(result.auction_status).toBe('APPROVED');
    });

    test('start() should throw AUCTION_NOT_APPROVED when not in APPROVED state', async () => {
      const model = new AuctionModel(new MockDatabase([{ rows: [], rowCount: 0 }]));
      await expect(model.start('auction-id'))
        .rejects.toThrow('AUCTION_NOT_APPROVED');
    });

    test('start() should succeed and return LIVE', async () => {
      const db = new MockDatabase([
        { rows: [{ id: 'auction-id', auction_status: 'LIVE' }], rowCount: 1 },
      ]);
      const result = await new AuctionModel(db).start('auction-id');
      expect(result.auction_status).toBe('LIVE');
    });

    test('end() should throw AUCTION_NOT_LIVE when not in LIVE state', async () => {
      const model = new AuctionModel(new MockDatabase([{ rows: [], rowCount: 0 }]));
      await expect(model.end('auction-id'))
        .rejects.toThrow('AUCTION_NOT_LIVE');
    });

    test('end() should succeed and return ENDED', async () => {
      const db = new MockDatabase([
        { rows: [{ id: 'auction-id', auction_status: 'ENDED' }], rowCount: 1 },
      ]);
      const result = await new AuctionModel(db).end('auction-id');
      expect(result.auction_status).toBe('ENDED');
    });

    test('full lifecycle: DRAFT → PENDING_APPROVAL → APPROVED → LIVE → ENDED', async () => {
      const db = new MockDatabase([
        { rows: [{ id: 'a', auction_status: 'PENDING_APPROVAL' }], rowCount: 1 }, // submit
        { rows: [{ id: 'a', auction_status: 'APPROVED' }],          rowCount: 1 }, // approve
        { rows: [{ id: 'a', auction_status: 'LIVE' }],              rowCount: 1 }, // start
        { rows: [{ id: 'a', auction_status: 'ENDED' }],             rowCount: 1 }, // end
      ]);
      const model = new AuctionModel(db);

      const submitted = await model.submit('a');
      expect(submitted.auction_status).toBe('PENDING_APPROVAL');

      const approved = await model.approve('a', 'admin-id');
      expect(approved.auction_status).toBe('APPROVED');

      const live = await model.start('a');
      expect(live.auction_status).toBe('LIVE');

      const ended = await model.end('a');
      expect(ended.auction_status).toBe('ENDED');
    });
  });

  // ---------------------------------------------------------------------------
  // validate date range logic
  // ---------------------------------------------------------------------------
  describe('validate date range logic', () => {
    test('should throw INVALID_DATE_RANGE when start equals end', async () => {
      const sameTime = future(DAY);
      await expect(auctionModel.create({ ...BASE_AUCTION, startsAt: sameTime, endsAt: sameTime }, 'user-id'))
        .rejects.toThrow('INVALID_DATE_RANGE');
    });

    test('should throw INVALID_DATE_RANGE when start is after end', async () => {
      await expect(auctionModel.create({ ...BASE_AUCTION, startsAt: future(DAY * 7), endsAt: future(DAY) }, 'user-id'))
        .rejects.toThrow('INVALID_DATE_RANGE');
    });

    test('should throw INVALID_DATE_RANGE when start is 1ms after end', async () => {
      const end = future(DAY);
      const start = new Date(end.getTime() + 1);
      await expect(auctionModel.create({ ...BASE_AUCTION, startsAt: start, endsAt: end }, 'user-id'))
        .rejects.toThrow('INVALID_DATE_RANGE');
    });

    test('should accept start date 1ms before end date', async () => {
      const start = future(DAY);
      const end = new Date(start.getTime() + 1);
      const db = new MockDatabase([
        { rows: [{ id: 'new-id', auction_status: 'DRAFT' }], rowCount: 1 },
      ]);
      const result = await new AuctionModel(db).create({ ...BASE_AUCTION, startsAt: start, endsAt: end }, 'user-id');
      expect(result.auction_status).toBe('DRAFT');
    });

    test('should accept a multi-day auction window', async () => {
      const db = new MockDatabase([
        { rows: [{ id: 'new-id', auction_status: 'DRAFT' }], rowCount: 1 },
      ]);
      const result = await new AuctionModel(db).create(BASE_AUCTION, 'user-id');
      expect(result.auction_status).toBe('DRAFT');
    });

    test('update() should throw NO_VALID_UPDATES when no allowed fields are provided', async () => {
      await expect(auctionModel.update('auction-id', { school_id: 'new-school', starts_at: new Date() }))
        .rejects.toThrow('NO_VALID_UPDATES');
    });

    test('update() should throw AUCTION_NOT_FOUND_OR_NOT_DRAFT when auction is not in DRAFT', async () => {
      const model = new AuctionModel(new MockDatabase([{ rows: [], rowCount: 0 }]));
      await expect(model.update('auction-id', { title: 'New Title' }))
        .rejects.toThrow('AUCTION_NOT_FOUND_OR_NOT_DRAFT');
    });

    test('update() should succeed with allowed fields on a DRAFT auction', async () => {
      const updated = { id: 'auction-id', title: 'New Title', auction_status: 'DRAFT' };
      const db = new MockDatabase([{ rows: [updated], rowCount: 1 }]);
      const result = await new AuctionModel(db).update('auction-id', { title: 'New Title' });
      expect(result.title).toBe('New Title');
    });

    test('getById() should throw AUCTION_NOT_FOUND for unknown id', async () => {
      const model = new AuctionModel(new MockDatabase([{ rows: [], rowCount: 0 }]));
      await expect(model.getById('unknown-id'))
        .rejects.toThrow('AUCTION_NOT_FOUND');
    });

    test('getById() should return auction when found', async () => {
      const auction = { id: 'auction-id', title: 'Spring Art Auction', auction_status: 'LIVE' };
      const db = new MockDatabase([{ rows: [auction], rowCount: 1 }]);
      const result = await new AuctionModel(db).getById('auction-id');
      expect(result.id).toBe('auction-id');
      expect(result.auction_status).toBe('LIVE');
    });
  });
});
