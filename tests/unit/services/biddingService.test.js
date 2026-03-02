/**
 * Bidding Service Tests
 * Unit tests for bidding operations, validation, and auction lifecycle
 */

const biddingService = require('../../../src/services/biddingService');
const { pool } = require('../../../src/models/index');

// Mock pool queries
jest.mock('../../../src/models/index', () => ({
  pool: {
    connect: jest.fn(),
    query: jest.fn()
  }
}));

describe('BiddingService', () => {
  let mockClient;

  beforeEach(() => {
    // Reset all mocks
    jest.clearAllMocks();

    // Setup mock client
    mockClient = {
      query: jest.fn(),
      release: jest.fn()
    };

    pool.connect.mockResolvedValue(mockClient);
  });

  describe('placeBid', () => {
    it('should successfully place a valid bid', async () => {
      const artworkId = 'art-123';
      const userId = 'user-456';
      const bidAmount = 50000; // $500.00

      // Service queries: BEGIN, SELECT artwork+auction, SELECT user,
      //   UPDATE bids OUTBID, INSERT bid, INSERT audit_log, COMMIT
      mockClient.query
        .mockResolvedValueOnce({})  // BEGIN
        .mockResolvedValueOnce({ rows: [{ id: 'art-123', starting_bid_amount: 10000, current_bid: 40000, auction_status: 'LIVE', ends_at: new Date(Date.now() + 3600000), created_by_user_id: 'artist-789', auction_id: 'auction-123' }] })
        .mockResolvedValueOnce({ rows: [{ id: 'user-456', account_status: 'ACTIVE' }] })
        .mockResolvedValueOnce({})  // UPDATE bids OUTBID
        .mockResolvedValueOnce({ rows: [{ id: 'bid-999', bid_amount: 50000, placed_at: new Date() }] })
        .mockResolvedValueOnce({})  // INSERT audit_log
        .mockResolvedValueOnce({});  // COMMIT

      const result = await biddingService.placeBid(artworkId, userId, bidAmount);

      expect(result.success).toBe(true);
      expect(result.bidAmount).toBe(50000);
      expect(mockClient.query).toHaveBeenCalledWith('BEGIN');
      expect(mockClient.query).toHaveBeenCalledWith('COMMIT');
    });

    it('should reject bid that is below minimum increment', async () => {
      const artworkId = 'art-123';
      const userId = 'user-456';
      const bidAmount = 40050; // Only $0.50 above current bid (minimum is current + 100 = 40100)

      mockClient.query
        .mockResolvedValueOnce({})  // BEGIN
        .mockResolvedValueOnce({ rows: [{ id: 'art-123', starting_bid_amount: 10000, current_bid: 40000, auction_status: 'LIVE', ends_at: new Date(Date.now() + 3600000), created_by_user_id: 'artist-789', auction_id: 'auction-123' }] });

      await expect(biddingService.placeBid(artworkId, userId, bidAmount)).rejects.toThrow('below minimum');

      expect(mockClient.query).toHaveBeenCalledWith('ROLLBACK');
    });

    it('should reject bid on ended auction', async () => {
      const artworkId = 'art-123';
      const userId = 'user-456';
      const bidAmount = 50000;

      mockClient.query
        .mockResolvedValueOnce({})  // BEGIN
        .mockResolvedValueOnce({
          rows: [{
            id: 'art-123',
            auction_status: 'LIVE',
            ends_at: new Date(Date.now() - 1000), // Already ended
            created_by_user_id: 'artist-789',
            starting_bid_amount: 10000,
            current_bid: null
          }]
        });

      await expect(biddingService.placeBid(artworkId, userId, bidAmount)).rejects.toThrow('ended');

      expect(mockClient.query).toHaveBeenCalledWith('ROLLBACK');
    });

    it('should reject artist bidding on their own artwork', async () => {
      const artworkId = 'art-123';
      const userId = 'artist-789'; // Same as created_by_user_id
      const bidAmount = 50000;

      mockClient.query
        .mockResolvedValueOnce({})  // BEGIN
        .mockResolvedValueOnce({
          rows: [{
            id: 'art-123',
            auction_status: 'LIVE',
            ends_at: new Date(Date.now() + 3600000),
            created_by_user_id: 'artist-789',
            starting_bid_amount: 10000,
            current_bid: null
          }]
        });

      await expect(biddingService.placeBid(artworkId, userId, bidAmount)).rejects.toThrow('Artist cannot bid');

      expect(mockClient.query).toHaveBeenCalledWith('ROLLBACK');
    });

    it('should reject bid from a suspended user account', async () => {
      const artworkId = 'art-123';
      const userId = 'user-456';
      const bidAmount = 50000;

      mockClient.query
        .mockResolvedValueOnce({})  // BEGIN
        .mockResolvedValueOnce({ rows: [{ id: 'art-123', starting_bid_amount: 10000, current_bid: 40000, auction_status: 'LIVE', ends_at: new Date(Date.now() + 3600000), created_by_user_id: 'artist-789', auction_id: 'auction-123' }] })
        .mockResolvedValueOnce({ rows: [{ id: 'user-456', account_status: 'SUSPENDED' }] });  // Suspended user

      await expect(biddingService.placeBid(artworkId, userId, bidAmount)).rejects.toThrow('not active');

      expect(mockClient.query).toHaveBeenCalledWith('ROLLBACK');
    });

    it('should validate bid inputs', async () => {
      await expect(biddingService.placeBid('', 'user-456', 50000)).rejects.toThrow('Invalid artwork ID');
      await expect(biddingService.placeBid('art-123', '', 50000)).rejects.toThrow('Invalid user ID');
      await expect(biddingService.placeBid('art-123', 'user-456', -100)).rejects.toThrow('Invalid bid amount');
      await expect(biddingService.placeBid('art-123', 'user-456', 0)).rejects.toThrow('Invalid bid amount');
      await expect(biddingService.placeBid('art-123', 'user-456', 10000000000)).rejects.toThrow('exceeds maximum');
    });
  });

  describe('withdrawBid', () => {
    it('should successfully withdraw a bid', async () => {
      const bidId = 'bid-123';
      const userId = 'user-456';

      // Service queries: BEGIN, SELECT bid, SELECT auction, UPDATE bid CANCELLED,
      //   SELECT previous bid, INSERT audit_log, COMMIT
      mockClient.query
        .mockResolvedValueOnce({})  // BEGIN
        .mockResolvedValueOnce({ rows: [{ id: 'bid-123', placed_by_user_id: 'user-456', bid_amount: 50000, auction_id: 'auction-123', artwork_id: 'art-123', bid_status: 'ACTIVE' }] })
        .mockResolvedValueOnce({ rows: [{ ends_at: new Date(Date.now() + 600000), auction_status: 'LIVE' }] })
        .mockResolvedValueOnce({})  // UPDATE bid to CANCELLED
        .mockResolvedValueOnce({ rows: [] })  // SELECT previous bid (none)
        .mockResolvedValueOnce({})  // INSERT audit_log
        .mockResolvedValueOnce({});  // COMMIT

      const result = await biddingService.withdrawBid(bidId, userId);

      expect(result.success).toBe(true);
      expect(result.bidId).toBe('bid-123');
    });

    it('should reject withdrawal of another user\'s bid', async () => {
      const bidId = 'bid-123';
      const userId = 'user-789';

      mockClient.query
        .mockResolvedValueOnce({})  // BEGIN
        .mockResolvedValueOnce({
          rows: [{ id: 'bid-123', placed_by_user_id: 'user-456', bid_amount: 50000, auction_id: 'auction-123', artwork_id: 'art-123', bid_status: 'ACTIVE' }]
        });

      await expect(biddingService.withdrawBid(bidId, userId)).rejects.toThrow('Unauthorized');

      expect(mockClient.query).toHaveBeenCalledWith('ROLLBACK');
    });

    it('should reject withdrawal of highest bid when auction is ending soon', async () => {
      const bidId = 'bid-123';
      const userId = 'user-456';

      mockClient.query
        .mockResolvedValueOnce({})  // BEGIN
        .mockResolvedValueOnce({ rows: [{ id: 'bid-123', placed_by_user_id: 'user-456', bid_amount: 50000, auction_id: 'auction-123', artwork_id: 'art-123', bid_status: 'ACTIVE' }] })
        .mockResolvedValueOnce({ rows: [{ ends_at: new Date(Date.now() + 60000), auction_status: 'LIVE' }] }); // Ends in 1 minute

      await expect(biddingService.withdrawBid(bidId, userId)).rejects.toThrow('ending soon');

      expect(mockClient.query).toHaveBeenCalledWith('ROLLBACK');
    });
  });

  describe('getBidHistory', () => {
    it('should retrieve bid history for artwork', async () => {
      const artworkId = 'art-123';

      pool.query = jest.fn().mockResolvedValue({
        rows: [
          { id: 'bid-1', placed_by_user_id: 'user-1', bid_amount: 50000, placed_at: new Date(), bid_status: 'ACTIVE', first_name: 'John', last_name: 'Doe' },
          { id: 'bid-2', placed_by_user_id: 'user-2', bid_amount: 40000, placed_at: new Date(), bid_status: 'OUTBID', first_name: 'Jane', last_name: 'Smith' }
        ]
      });

      const history = await biddingService.getBidHistory(artworkId);

      expect(history).toHaveLength(2);
      expect(history[0].amount).toBe(50000);
      expect(history[0].bidder.displayName).toBe('John Doe');
    });

    it('should return empty array if no bids exist', async () => {
      const artworkId = 'art-123';

      pool.query = jest.fn().mockResolvedValue({ rows: [] });

      const history = await biddingService.getBidHistory(artworkId);

      expect(history).toHaveLength(0);
    });
  });

  describe('getBiddingState', () => {
    it('should return current bidding state', async () => {
      const artworkId = 'art-123';

      pool.query = jest.fn().mockResolvedValue({
        rows: [{
          id: 'art-123',
          title: 'Beautiful Painting',
          starting_bid_amount: 10000,
          reserve_bid_amount: 25000,
          auction_id: 'auction-123',
          current_bid: 50000,
          current_bidder_id: 'user-456',
          auction_status: 'LIVE',
          ends_at: new Date(Date.now() + 3600000),
          total_bids: '5'
        }]
      });

      const state = await biddingService.getBiddingState(artworkId);

      expect(state.artworkId).toBe('art-123');
      expect(state.currentBid).toBe(50000);
      expect(state.auctionActive).toBe(true);
      expect(state.totalBids).toBe(5);
    });

    it('should throw error if artwork not found', async () => {
      pool.query = jest.fn().mockResolvedValue({ rows: [] });

      await expect(biddingService.getBiddingState('nonexistent')).rejects.toThrow('not found');
    });
  });

  describe('getUserBidHistory', () => {
    it('should retrieve user\'s bid history', async () => {
      const userId = 'user-456';

      pool.query = jest.fn().mockResolvedValue({
        rows: [
          { id: 'bid-1', artwork_id: 'art-1', bid_amount: 50000, placed_at: new Date(), bid_status: 'OUTBID', title: 'Painting 1', image_url: 'url1', auction_status: 'LIVE', ends_at: new Date(), highest_bid: 55000 },
          { id: 'bid-2', artwork_id: 'art-2', bid_amount: 30000, placed_at: new Date(), bid_status: 'ACTIVE', title: 'Painting 2', image_url: 'url2', auction_status: 'LIVE', ends_at: new Date(), highest_bid: 30000 }
        ]
      });

      const history = await biddingService.getUserBidHistory(userId);

      expect(history).toHaveLength(2);
      expect(history[1].isWinning).toBe(true);
    });
  });

  describe('closeAuction', () => {
    it('should close auction with winner', async () => {
      const auctionId = 'auction-123';

      // Service queries: BEGIN, SELECT auction, UPDATE auction status,
      //   SELECT winner (bids JOIN artwork JOIN users), UPDATE bid ACCEPTED,
      //   INSERT audit_log, COMMIT
      mockClient.query
        .mockResolvedValueOnce({})  // BEGIN
        .mockResolvedValueOnce({ rows: [{ id: 'auction-123', school_id: 'school-1', auction_status: 'LIVE' }] })
        .mockResolvedValueOnce({})  // UPDATE auction status = ENDED
        .mockResolvedValueOnce({ rows: [{ placed_by_user_id: 'user-456', bid_amount: 50000, artwork_id: 'art-123', first_name: 'John', last_name: 'Doe', email: 'john@example.com' }] })
        .mockResolvedValueOnce({})  // UPDATE bid status = ACCEPTED
        .mockResolvedValueOnce({})  // INSERT audit_log
        .mockResolvedValueOnce({});  // COMMIT

      const result = await biddingService.closeAuction(auctionId);

      expect(result.success).toBe(true);
      expect(result.winner).not.toBeNull();
      expect(result.winner.name).toBe('John Doe');
    });

    it('should close auction with no winner if no bids', async () => {
      const auctionId = 'auction-123';

      mockClient.query
        .mockResolvedValueOnce({})  // BEGIN
        .mockResolvedValueOnce({ rows: [{ id: 'auction-123', school_id: 'school-1', auction_status: 'LIVE' }] })
        .mockResolvedValueOnce({})  // UPDATE auction status = ENDED
        .mockResolvedValueOnce({ rows: [] })  // SELECT winner — no bids
        .mockResolvedValueOnce({})  // INSERT audit_log
        .mockResolvedValueOnce({});  // COMMIT

      const result = await biddingService.closeAuction(auctionId);

      expect(result.success).toBe(true);
      expect(result.winner).toBeNull();
    });
  });

  describe('getAuctionWinner', () => {
    it('should retrieve auction winner', async () => {
      const auctionId = 'auction-123';

      pool.query = jest.fn().mockResolvedValue({
        rows: [{
          placed_by_user_id: 'user-456',
          bid_amount: 50000,
          artwork_id: 'art-123',
          first_name: 'John',
          last_name: 'Doe',
          email: 'john@example.com',
          artwork_title: 'Beautiful Painting'
        }]
      });

      const result = await biddingService.getAuctionWinner(auctionId);

      expect(result.hasWinner).toBe(true);
      expect(result.winner.name).toBe('John Doe');
    });

    it('should return no winner if auction has no bids', async () => {
      pool.query = jest.fn().mockResolvedValue({ rows: [] });

      const result = await biddingService.getAuctionWinner('auction-123');

      expect(result.hasWinner).toBe(false);
    });
  });

  describe('getUserActiveAuctions', () => {
    it('should retrieve user\'s active auctions', async () => {
      const userId = 'user-456';

      pool.query = jest.fn().mockResolvedValue({
        rows: [
          { id: 'auction-1', title: 'Painting 1', image_url: 'url1', starting_bid_amount: 10000, auction_status: 'LIVE', ends_at: new Date(), user_highest_bid: 50000, auction_highest_bid: 50000 },
          { id: 'auction-2', title: 'Painting 2', image_url: 'url2', starting_bid_amount: 20000, auction_status: 'LIVE', ends_at: new Date(), user_highest_bid: 30000, auction_highest_bid: 35000 }
        ]
      });

      const auctions = await biddingService.getUserActiveAuctions(userId);

      expect(auctions).toHaveLength(2);
      expect(auctions[0].isWinning).toBe(true);
      expect(auctions[1].isWinning).toBe(false);
    });
  });
});
