/**
 * Bidding Routes
 * REST API endpoints for bidding operations
 */

const express = require('express');
const router = express.Router();
const biddingService = require('../services/biddingService');
const realtimeService = require('../services/realtimeService');
const authMiddleware = require('../middleware/authMiddleware');

/**
 * POST /api/bidding/place
 * Place a bid on artwork
 */
router.post('/place', authMiddleware.verifyToken, async (req, res) => {
  try {
    const { artworkId, bidAmount } = req.body;
    const userId = req.user.id;

    // Validate inputs
    if (!artworkId || !bidAmount) {
      return res.status(400).json({
        success: false,
        message: 'Artwork ID and bid amount are required'
      });
    }

    if (typeof bidAmount !== 'number' || bidAmount <= 0) {
      return res.status(400).json({
        success: false,
        message: 'Bid amount must be a positive number'
      });
    }

    const result = await biddingService.placeBid(artworkId, userId, bidAmount);

    // Get updated bidding state
    const state = await biddingService.getBiddingState(artworkId);

    // Broadcast bid update via WebSocket
    realtimeService.broadcastBidUpdate(state.auctionId, {
      bidId: result.bidId,
      artworkId: artworkId,
      bidder: userId,
      amount: bidAmount,
      totalBids: state.totalBids
    });

    res.status(200).json({
      success: true,
      data: result,
      biddingState: state
    });
  } catch (error) {
    console.error('Error placing bid:', error);
    res.status(400).json({
      success: false,
      message: error.message
    });
  }
});

/**
 * POST /api/bidding/withdraw
 * Withdraw a bid
 */
router.post('/withdraw', authMiddleware.verifyToken, async (req, res) => {
  try {
    const { bidId } = req.body;
    const userId = req.user.id;

    if (!bidId) {
      return res.status(400).json({
        success: false,
        message: 'Bid ID is required'
      });
    }

    const result = await biddingService.withdrawBid(bidId, userId);

    res.status(200).json({
      success: true,
      data: result
    });
  } catch (error) {
    console.error('Error withdrawing bid:', error);
    res.status(400).json({
      success: false,
      message: error.message
    });
  }
});

/**
 * GET /api/bidding/artwork/:artworkId/history
 * Get bid history for artwork
 */
router.get('/artwork/:artworkId/history', async (req, res) => {
  try {
    const { artworkId } = req.params;

    const history = await biddingService.getBidHistory(artworkId);

    res.status(200).json({
      success: true,
      data: history,
      count: history.length
    });
  } catch (error) {
    console.error('Error fetching bid history:', error);
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
});

/**
 * GET /api/bidding/artwork/:artworkId/state
 * Get current bidding state for artwork
 */
router.get('/artwork/:artworkId/state', async (req, res) => {
  try {
    const { artworkId } = req.params;

    const state = await biddingService.getBiddingState(artworkId);

    res.status(200).json({
      success: true,
      data: state
    });
  } catch (error) {
    console.error('Error fetching bidding state:', error);
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
});

/**
 * GET /api/bidding/user/history
 * Get user's bid history
 */
router.get('/user/history', authMiddleware.verifyToken, async (req, res) => {
  try {
    const userId = req.user.id;

    const history = await biddingService.getUserBidHistory(userId);

    res.status(200).json({
      success: true,
      data: history,
      count: history.length
    });
  } catch (error) {
    console.error('Error fetching user bid history:', error);
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
});

/**
 * GET /api/bidding/user/active
 * Get user's active auctions (where they're bidding)
 */
router.get('/user/active', authMiddleware.verifyToken, async (req, res) => {
  try {
    const userId = req.user.id;

    const auctions = await biddingService.getUserActiveAuctions(userId);

    res.status(200).json({
      success: true,
      data: auctions,
      count: auctions.length
    });
  } catch (error) {
    console.error('Error fetching active auctions:', error);
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
});

/**
 * GET /api/bidding/auction/:auctionId/winner
 * Get auction winner information
 */
router.get('/auction/:auctionId/winner', async (req, res) => {
  try {
    const { auctionId } = req.params;

    const winner = await biddingService.getAuctionWinner(auctionId);

    res.status(200).json({
      success: true,
      data: winner
    });
  } catch (error) {
    console.error('Error fetching auction winner:', error);
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
});

/**
 * POST /api/bidding/auction/:auctionId/close
 * Close an auction (admin only)
 */
router.post('/auction/:auctionId/close', authMiddleware.verifyToken, authMiddleware.verifyRole('SITE_ADMIN', 'SCHOOL_ADMIN'), async (req, res) => {
  try {
    const { auctionId } = req.params;

    const result = await biddingService.closeAuction(auctionId);

    // Broadcast auction closure
    realtimeService.broadcastAuctionStatusChange(auctionId, 'closed', {
      winner: result.winner
    });

    res.status(200).json({
      success: true,
      data: result
    });
  } catch (error) {
    console.error('Error closing auction:', error);
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
});

/**
 * GET /api/bidding/stats
 * Get real-time statistics
 */
router.get('/stats', authMiddleware.verifyToken, authMiddleware.verifyRole('SITE_ADMIN', 'SCHOOL_ADMIN'), (req, res) => {
  try {
    const stats = realtimeService.getStats();

    res.status(200).json({
      success: true,
      data: stats
    });
  } catch (error) {
    console.error('Error fetching stats:', error);
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
});

module.exports = router;
