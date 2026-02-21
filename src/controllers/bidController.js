/**
 * Bid Controller
 * Handles HTTP requests for bid placement, retrieval, and management
 */

const biddingService = require('../services/biddingService');
const { pool } = require('../models/index');

class BidController {
  /**
   * POST /api/bids/place
   * Place a bid on artwork (handled in biddingRoutes)
   */
  async placeBid(req, res) {
    try {
      const { artworkId, bidAmount } = req.body;
      const userId = req.user?.id;

      // Validate token
      if (!userId) {
        return res.status(401).json({
          success: false,
          message: 'Authentication required'
        });
      }

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

      // Convert to cents if needed
      const bidAmountCents = typeof bidAmount === 'number' ? Math.round(bidAmount * 100) : bidAmount;

      const result = await biddingService.placeBid(artworkId, userId, bidAmountCents);

      return res.status(201).json(result);
    } catch (error) {
      console.error('Error placing bid:', error);
      return res.status(400).json({
        success: false,
        message: error.message || 'Error placing bid'
      });
    }
  }

  /**
   * POST /api/bids/:bidId/withdraw
   * Withdraw a bid
   */
  async withdrawBid(req, res) {
    try {
      const { bidId } = req.params;
      const userId = req.user?.id;

      if (!userId) {
        return res.status(401).json({
          success: false,
          message: 'Authentication required'
        });
      }

      const result = await biddingService.withdrawBid(bidId, userId);

      return res.status(200).json(result);
    } catch (error) {
      console.error('Error withdrawing bid:', error);
      return res.status(400).json({
        success: false,
        message: error.message || 'Error withdrawing bid'
      });
    }
  }

  /**
   * GET /api/bids/artwork/:artworkId
   * Get bid history for artwork
   */
  async getBidHistory(req, res) {
    try {
      const { artworkId } = req.params;

      const result = await biddingService.getBidHistory(artworkId);

      return res.status(200).json({
        success: true,
        count: result.length,
        bids: result
      });
    } catch (error) {
      console.error('Error retrieving bid history:', error);
      return res.status(400).json({
        success: false,
        message: error.message || 'Error retrieving bid history'
      });
    }
  }

  /**
   * GET /api/bids/artwork/:artworkId/state
   * Get current bidding state for artwork
   */
  async getBiddingState(req, res) {
    try {
      const { artworkId } = req.params;

      const result = await biddingService.getBiddingState(artworkId);

      return res.status(200).json({
        success: true,
        state: result
      });
    } catch (error) {
      console.error('Error retrieving bidding state:', error);
      return res.status(404).json({
        success: false,
        message: error.message || 'Artwork not found'
      });
    }
  }

  /**
   * GET /api/bids/user/:userId/history
   * Get user's bid history
   */
  async getUserBidHistory(req, res) {
    try {
      const { userId } = req.params;
      const requestingUserId = req.user?.id;

      // Users can only view their own history unless they're admin
      if (userId !== requestingUserId && !['SITE_ADMIN', 'SCHOOL_ADMIN'].includes(req.user?.role)) {
        return res.status(403).json({
          success: false,
          message: 'Access denied'
        });
      }

      const result = await biddingService.getUserBidHistory(userId);

      return res.status(200).json({
        success: true,
        count: result.length,
        bids: result
      });
    } catch (error) {
      console.error('Error retrieving user bid history:', error);
      return res.status(400).json({
        success: false,
        message: error.message || 'Error retrieving bid history'
      });
    }
  }

  /**
   * GET /api/bids/user/:userId/active
   * Get user's active auctions (ones they're bidding on)
   */
  async getUserActiveAuctions(req, res) {
    try {
      const { userId } = req.params;
      const requestingUserId = req.user?.id;

      // Users can only view their own auctions unless they're admin
      if (userId !== requestingUserId && !['SITE_ADMIN', 'SCHOOL_ADMIN'].includes(req.user?.role)) {
        return res.status(403).json({
          success: false,
          message: 'Access denied'
        });
      }

      const result = await biddingService.getUserActiveAuctions(userId);

      return res.status(200).json({
        success: true,
        count: result.length,
        auctions: result
      });
    } catch (error) {
      console.error('Error retrieving user active auctions:', error);
      return res.status(400).json({
        success: false,
        message: error.message || 'Error retrieving active auctions'
      });
    }
  }

  /**
   * GET /api/bids/:bidId
   * Get bid details
   */
  async getBid(req, res) {
    try {
      const { bidId } = req.params;

      const result = await pool.query(
        `SELECT b.*, u.first_name, u.last_name, u.email,
                a.title as artwork_title
         FROM bids b
         LEFT JOIN users u ON b.placed_by_user_id = u.id
         LEFT JOIN artwork a ON b.artwork_id = a.id
         WHERE b.id = $1`,
        [bidId]
      );

      if (result.rows.length === 0) {
        return res.status(404).json({
          success: false,
          message: 'Bid not found'
        });
      }

      const bid = result.rows[0];

      return res.status(200).json({
        success: true,
        bid: {
          bidId: bid.id,
          artworkId: bid.artwork_id,
          artworkTitle: bid.artwork_title,
          bidderId: bid.placed_by_user_id,
          bidderName: `${bid.first_name} ${bid.last_name}`,
          bidderEmail: bid.email,
          amount: bid.bid_amount,
          timestamp: bid.placed_at,
          status: bid.bid_status
        }
      });
    } catch (error) {
      console.error('Error retrieving bid:', error);
      return res.status(400).json({
        success: false,
        message: error.message || 'Error retrieving bid'
      });
    }
  }

  /**
   * POST /api/bids/validate
   * Validate bid amount before placement
   */
  async validateBid(req, res) {
    try {
      const { artworkId, bidAmount } = req.body;

      if (!artworkId || !bidAmount) {
        return res.status(400).json({
          success: false,
          valid: false,
          message: 'Artwork ID and bid amount are required'
        });
      }

      // Get artwork and current bid info
      const result = await pool.query(
        `SELECT a.starting_bid_amount, au.auction_status, au.ends_at,
                (SELECT MAX(bid_amount) FROM bids WHERE artwork_id = a.id AND bid_status = 'ACTIVE') as current_bid
         FROM artwork a
         JOIN auctions au ON a.auction_id = au.id
         WHERE a.id = $1`,
        [artworkId]
      );

      if (result.rows.length === 0) {
        return res.status(404).json({
          success: false,
          valid: false,
          message: 'Artwork not found'
        });
      }

      const artwork = result.rows[0];
      const now = new Date();
      const endTime = new Date(artwork.ends_at);

      // Check if auction is active
      if (artwork.auction_status !== 'LIVE' || endTime <= now) {
        return res.status(200).json({
          success: false,
          valid: false,
          message: 'Auction is not active'
        });
      }

      const minIncrement = 100; // $1.00 default increment
      const currentBid = artwork.current_bid ? parseFloat(artwork.current_bid) : 0;
      const startingBid = artwork.starting_bid_amount ? parseFloat(artwork.starting_bid_amount) : 0;
      const minimumBid = currentBid > 0 ? currentBid + minIncrement : startingBid;
      const bidAmountCents = typeof bidAmount === 'number' ? Math.round(bidAmount * 100) : bidAmount;

      if (bidAmountCents < minimumBid) {
        return res.status(200).json({
          success: true,
          valid: false,
          message: `Bid must be at least $${(minimumBid / 100).toFixed(2)}`,
          minimumBid: minimumBid / 100,
          currentBid: (currentBid || startingBid) / 100
        });
      }

      return res.status(200).json({
        success: true,
        valid: true,
        message: 'Bid amount is valid',
        minimumBid: minimumBid / 100,
        currentBid: (currentBid || startingBid) / 100
      });
    } catch (error) {
      console.error('Error validating bid:', error);
      return res.status(400).json({
        success: false,
        valid: false,
        message: error.message || 'Error validating bid'
      });
    }
  }
}

module.exports = new BidController();
