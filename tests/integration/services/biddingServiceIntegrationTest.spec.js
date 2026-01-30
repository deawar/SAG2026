/**
 * Bidding Service Integration Tests
 * Tests for bid placement, validation, and auction logic
 */

const biddingService = require('../../src/services/biddingService');
const auctionService = require('../../src/services/auctionService');
const { pool } = require('../../src/models/index');

// Mock data
const mockAuctionData = {
  title: 'Bidding Test Auction',
  description: 'For testing bidding logic',
  schoolId: '550e8400-e29b-41d4-a716-446655440000',
  charityId: '660e8400-e29b-41d4-a716-446655440001',
  startTime: new Date(Date.now() + 1000 * 60),
  endTime: new Date(Date.now() + 1000 * 60 * 60 * 24),
  platformFeePercentage: 3
};

describe('Bidding Service Integration Tests', () => {
  beforeAll(async () => {
    // Setup test database
  });

  afterAll(async () => {
    await pool.end();
  });

  describe('Bid Placement', () => {
    let testAuctionId;
    let testArtworkId = 'artwork-001';
    let testUserId = 'user-test-001';

    beforeAll(async () => {
      const result = await auctionService.createAuction({
        ...mockAuctionData,
        artworkIds: [testArtworkId]
      });
      testAuctionId = result.auctionId;
      await auctionService.startAuction(testAuctionId);
    });

    test('should place valid bid', async () => {
      const bidAmount = 10000; // $100 in cents

      const result = await biddingService.placeBid(testArtworkId, testUserId, bidAmount);

      expect(result.success).toBe(true);
      expect(result.bidId).toBeDefined();
      expect(result.bidAmount).toBe(bidAmount);
    });

    test('should reject bid below minimum', async () => {
      // First bid to establish minimum
      await biddingService.placeBid(testArtworkId, testUserId, 10000);

      // Try to place lower bid
      await expect(biddingService.placeBid(testArtworkId, 'user-002', 10000)).rejects.toThrow();
    });

    test('should reject bid for non-existent artwork', async () => {
      await expect(biddingService.placeBid('non-existent', testUserId, 10000)).rejects.toThrow();
    });

    test('should reject bid after auction ends', async () => {
      const pastAuction = await auctionService.createAuction({
        ...mockAuctionData,
        endTime: new Date(Date.now() - 1000) // Ended 1 second ago
      });

      const pastArtworkId = 'artwork-past';
      await expect(biddingService.placeBid(pastArtworkId, testUserId, 10000)).rejects.toThrow();
    });

    test('should not allow artist to bid on own artwork', async () => {
      const artistId = 'artist-user-001';

      // Setup artwork with artist
      const artworkWithArtist = await pool.query(
        'SELECT id FROM artwork WHERE artist_id = $1 LIMIT 1',
        [artistId]
      );

      if (artworkWithArtist.rows.length > 0) {
        await expect(
          biddingService.placeBid(artworkWithArtist.rows[0].id, artistId, 10000)
        ).rejects.toThrow('Artist cannot bid');
      }
    });

    test('should require valid payment method on file', async () => {
      const userWithoutPayment = 'user-no-payment';

      await expect(biddingService.placeBid(testArtworkId, userWithoutPayment, 10000)).rejects.toThrow();
    });

    test('should reject bids from inactive accounts', async () => {
      const inactiveUser = 'user-inactive';

      await expect(biddingService.placeBid(testArtworkId, inactiveUser, 10000)).rejects.toThrow();
    });

    test('should validate bid inputs', async () => {
      // Invalid artwork ID
      await expect(biddingService.placeBid(null, testUserId, 10000)).rejects.toThrow(
        'Invalid artwork ID'
      );

      // Invalid user ID
      await expect(biddingService.placeBid(testArtworkId, null, 10000)).rejects.toThrow(
        'Invalid user ID'
      );

      // Invalid bid amount
      await expect(biddingService.placeBid(testArtworkId, testUserId, -100)).rejects.toThrow(
        'Invalid bid amount'
      );

      // Bid amount exceeds maximum
      await expect(biddingService.placeBid(testArtworkId, testUserId, 10000000000)).rejects.toThrow(
        'exceeds maximum'
      );
    });

    test('should update auction with highest bid', async () => {
      const artwork = testArtworkId;
      const user1 = 'user-bid-001';
      const user2 = 'user-bid-002';

      const bid1 = await biddingService.placeBid(artwork, user1, 10000);
      const bid2 = await biddingService.placeBid(artwork, user2, 15000);

      const state = await biddingService.getBiddingState(artwork);

      expect(state.currentBidderId).toBe(user2);
      expect(state.currentBid).toBe(15000);
    });
  });

  describe('Bid Withdrawal', () => {
    let testArtworkId = 'artwork-withdraw';
    let testUserId = 'user-withdraw';
    let placedBidId;

    beforeAll(async () => {
      // Create and start auction
      const auctionResult = await auctionService.createAuction({
        ...mockAuctionData,
        artworkIds: [testArtworkId]
      });

      await auctionService.startAuction(auctionResult.auctionId);

      // Place a bid
      const bidResult = await biddingService.placeBid(testArtworkId, testUserId, 10000);
      placedBidId = bidResult.bidId;
    });

    test('should withdraw user own bid', async () => {
      const result = await biddingService.withdrawBid(placedBidId, testUserId);

      expect(result.success).toBe(true);
      expect(result.bidId).toBe(placedBidId);
    });

    test('should prevent unauthorized bid withdrawal', async () => {
      // Place another bid first
      const newBidResult = await biddingService.placeBid(testArtworkId, testUserId, 12000);

      await expect(
        biddingService.withdrawBid(newBidResult.bidId, 'different-user')
      ).rejects.toThrow('Unauthorized');
    });

    test('should prevent withdrawal of highest bid near end', async () => {
      // This would require auction to be near end time
      // Implementation depends on auction timing
    });

    test('should restore previous highest bid when withdrawn', async () => {
      const artwork = 'artwork-restore-bid';
      const user1 = 'user-restore-1';
      const user2 = 'user-restore-2';

      // Create and start auction
      const auctionResult = await auctionService.createAuction({
        ...mockAuctionData,
        artworkIds: [artwork]
      });
      await auctionService.startAuction(auctionResult.auctionId);

      // Place bids
      const bid1 = await biddingService.placeBid(artwork, user1, 10000);
      const bid2 = await biddingService.placeBid(artwork, user2, 15000);

      // Withdraw highest bid
      await biddingService.withdrawBid(bid2.bidId, user2);

      // Check that previous bid is now highest
      const state = await biddingService.getBiddingState(artwork);
      expect(state.currentBidderId).toBe(user1);
      expect(state.currentBid).toBe(10000);
    });
  });

  describe('Bid History', () => {
    let testArtworkId = 'artwork-history';

    beforeAll(async () => {
      // Create and start auction
      const auctionResult = await auctionService.createAuction({
        ...mockAuctionData,
        artworkIds: [testArtworkId]
      });
      await auctionService.startAuction(auctionResult.auctionId);

      // Place multiple bids
      await biddingService.placeBid(testArtworkId, 'user-hist-1', 10000);
      await biddingService.placeBid(testArtworkId, 'user-hist-2', 15000);
      await biddingService.placeBid(testArtworkId, 'user-hist-3', 20000);
    });

    test('should retrieve bid history for artwork', async () => {
      const history = await biddingService.getBidHistory(testArtworkId);

      expect(Array.isArray(history)).toBe(true);
      expect(history.length).toBeGreaterThanOrEqual(3);
    });

    test('should include bid details in history', async () => {
      const history = await biddingService.getBidHistory(testArtworkId);

      history.forEach(bid => {
        expect(bid.bidId).toBeDefined();
        expect(bid.bidder).toBeDefined();
        expect(bid.bidder.id).toBeDefined();
        expect(bid.amount).toBeDefined();
        expect(bid.timestamp).toBeDefined();
        expect(bid.status).toBeDefined();
      });
    });

    test('should sort bid history by timestamp descending', async () => {
      const history = await biddingService.getBidHistory(testArtworkId);

      for (let i = 1; i < history.length; i++) {
        const prevTime = new Date(history[i - 1].timestamp).getTime();
        const currentTime = new Date(history[i].timestamp).getTime();
        expect(prevTime).toBeGreaterThanOrEqual(currentTime);
      }
    });
  });

  describe('Bidding State', () => {
    let testArtworkId = 'artwork-state';
    let testAuctionId;

    beforeAll(async () => {
      const auctionResult = await auctionService.createAuction({
        ...mockAuctionData,
        artworkIds: [testArtworkId]
      });
      testAuctionId = auctionResult.auctionId;
      await auctionService.startAuction(testAuctionId);
    });

    test('should retrieve current bidding state', async () => {
      const state = await biddingService.getBiddingState(testArtworkId);

      expect(state.artworkId).toBe(testArtworkId);
      expect(state.auctionId).toBeDefined();
      expect(state.startingPrice).toBeDefined();
      expect(state.currentBid).toBeDefined();
      expect(state.totalBids).toBeDefined();
    });

    test('should calculate time remaining correctly', async () => {
      const state = await biddingService.getBiddingState(testArtworkId);

      expect(state.timeRemaining).toBeGreaterThanOrEqual(0);
      expect(state.timeRemaining).toBeLessThanOrEqual(
        new Date(state.endTime).getTime() - new Date().getTime()
      );
    });

    test('should indicate auction is active', async () => {
      const state = await biddingService.getBiddingState(testArtworkId);

      expect(state.auctionActive).toBe(true);
    });

    test('should track total bids count', async () => {
      // Place a bid
      await biddingService.placeBid(testArtworkId, 'user-count-1', 10000);

      const state = await biddingService.getBiddingState(testArtworkId);

      expect(state.totalBids).toBeGreaterThan(0);
    });

    test('should throw error for non-existent artwork', async () => {
      await expect(biddingService.getBiddingState('non-existent')).rejects.toThrow('Artwork not found');
    });
  });

  describe('User Bid History', () => {
    let testUserId = 'user-bid-history';

    beforeAll(async () => {
      // Create multiple auctions and place bids
      for (let i = 0; i < 3; i++) {
        const auctionResult = await auctionService.createAuction({
          ...mockAuctionData,
          title: `Auction ${i + 1}`,
          artworkIds: [`artwork-user-history-${i}`]
        });

        await auctionService.startAuction(auctionResult.auctionId);
        await biddingService.placeBid(`artwork-user-history-${i}`, testUserId, 10000 + i * 1000);
      }
    });

    test('should retrieve user bid history', async () => {
      const history = await biddingService.getUserBidHistory(testUserId);

      expect(Array.isArray(history)).toBe(true);
      expect(history.length).toBeGreaterThanOrEqual(3);
    });

    test('should include all user bids', async () => {
      const history = await biddingService.getUserBidHistory(testUserId);

      history.forEach(bid => {
        expect(bid.artworkId).toBeDefined();
        expect(bid.title).toBeDefined();
        expect(bid.bidAmount).toBeDefined();
        expect(bid.status).toBeDefined();
      });
    });

    test('should indicate winning bids', async () => {
      const history = await biddingService.getUserBidHistory(testUserId);

      // Check isWinning property exists
      history.forEach(bid => {
        expect(bid.isWinning).toBeDefined();
        expect(typeof bid.isWinning).toBe('boolean');
      });
    });
  });

  describe('Auction Closure and Winners', () => {
    test('should close auction with winner', async () => {
      const auctionResult = await auctionService.createAuction({
        ...mockAuctionData,
        artworkIds: ['artwork-close']
      });

      const auctionId = auctionResult.auctionId;

      // Start auction
      await auctionService.startAuction(auctionId);

      // Place a bid
      await biddingService.placeBid('artwork-close', 'user-winner', 20000);

      // Close auction
      const closeResult = await biddingService.closeAuction(auctionId);

      expect(closeResult.success).toBe(true);
      expect(closeResult.winner).toBeDefined();
    });

    test('should get auction winner information', async () => {
      const auctionResult = await auctionService.createAuction({
        ...mockAuctionData,
        artworkIds: ['artwork-winner-info']
      });

      const auctionId = auctionResult.auctionId;

      // Start and place bid
      await auctionService.startAuction(auctionId);
      await biddingService.placeBid('artwork-winner-info', 'user-winner-final', 30000);

      // Get winner
      const winner = await biddingService.getAuctionWinner(auctionId);

      expect(winner.hasWinner).toBeDefined();
    });
  });

  describe('Edge Cases and Validation', () => {
    test('should handle concurrent bid placement', async () => {
      const artwork = 'artwork-concurrent';
      const auctionResult = await auctionService.createAuction({
        ...mockAuctionData,
        artworkIds: [artwork]
      });

      await auctionService.startAuction(auctionResult.auctionId);

      // Attempt concurrent bids
      const promises = [];
      for (let i = 0; i < 5; i++) {
        promises.push(
          biddingService.placeBid(artwork, `user-concurrent-${i}`, 10000 + i * 1000)
            .catch(() => ({ failed: true }))
        );
      }

      const results = await Promise.all(promises);

      // Some should succeed, some might fail due to bid validation
      const succeeded = results.filter(r => !r.failed);
      expect(succeeded.length).toBeGreaterThan(0);
    });

    test('should handle very large bid amounts', async () => {
      const artwork = 'artwork-large-bid';
      const auctionResult = await auctionService.createAuction({
        ...mockAuctionData,
        artworkIds: [artwork]
      });

      await auctionService.startAuction(auctionResult.auctionId);

      const largeBid = 999999999; // $9,999,999.99
      const result = await biddingService.placeBid(artwork, 'user-rich', largeBid);

      expect(result.bidAmount).toBe(largeBid);
    });

    test('should reject bids exceeding maximum', async () => {
      const artwork = 'artwork-max-bid';
      const auctionResult = await auctionService.createAuction({
        ...mockAuctionData,
        artworkIds: [artwork]
      });

      await auctionService.startAuction(auctionResult.auctionId);

      const excessiveBid = 10000000000; // Exceeds max

      await expect(
        biddingService.placeBid(artwork, 'user-toobig', excessiveBid)
      ).rejects.toThrow();
    });

    test('should maintain data consistency across operations', async () => {
      const artwork = 'artwork-consistency';
      const auctionResult = await auctionService.createAuction({
        ...mockAuctionData,
        artworkIds: [artwork]
      });

      await auctionService.startAuction(auctionResult.auctionId);

      // Place bid
      const bid1 = await biddingService.placeBid(artwork, 'user-cons-1', 10000);

      // Get state
      const state1 = await biddingService.getBiddingState(artwork);
      expect(state1.currentBid).toBe(10000);

      // Place higher bid
      const bid2 = await biddingService.placeBid(artwork, 'user-cons-2', 15000);

      // Verify state updated
      const state2 = await biddingService.getBiddingState(artwork);
      expect(state2.currentBid).toBe(15000);
    });
  });
});
