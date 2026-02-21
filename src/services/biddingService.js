/**
 * Bidding Service
 * Handles all bidding operations, auction lifecycle, and bid validation
 * Implements PCI-DSS 3.2.1 compliance for payment-related operations
 */

const { pool } = require('../models/index');

class BiddingService {
  /**
   * Place a bid on artwork
   * @param {string} artworkId - ID of the artwork
   * @param {string} userId - ID of the bidder
   * @param {number} bidAmount - The bid amount in cents
   * @returns {Object} Bid result with confirmation and details
   */
  async placeBid(artworkId, userId, bidAmount) {
    const client = await pool.connect();

    try {
      await client.query('BEGIN');

      // Validate inputs
      this._validateBidInputs(artworkId, userId, bidAmount);

      // Get artwork and auction info
      const artworkResult = await client.query(
        `SELECT a.*, au.auction_status, au.ends_at, au.id as auction_id,
                (SELECT MAX(bid_amount) FROM bids WHERE artwork_id = a.id AND bid_status = 'ACTIVE') as current_bid
         FROM artwork a
         JOIN auctions au ON a.auction_id = au.id
         WHERE a.id = $1 FOR UPDATE`,
        [artworkId]
      );

      if (artworkResult.rows.length === 0) {
        throw new Error('Artwork not found');
      }

      const artwork = artworkResult.rows[0];

      // Validate auction is active
      if (artwork.auction_status !== 'LIVE') {
        throw new Error(`Auction is not active. Current status: ${artwork.auction_status}`);
      }

      // Validate auction hasn't ended
      const now = new Date();
      if (new Date(artwork.ends_at) <= now) {
        throw new Error('Auction has ended');
      }

      // Validate user is not the artist
      if (artwork.created_by_user_id === userId) {
        throw new Error('Artist cannot bid on their own artwork');
      }

      // Validate bid amount against current highest + minimum increment
      const currentBid = artwork.current_bid ? parseFloat(artwork.current_bid) : 0;
      const startingBid = artwork.starting_bid_amount ? parseFloat(artwork.starting_bid_amount) : 0;
      const minimumBid = currentBid > 0 ? currentBid + 100 : startingBid; // $1.00 default increment

      if (bidAmount < minimumBid) {
        throw new Error(`Bid amount $${(bidAmount / 100).toFixed(2)} is below minimum required $${(minimumBid / 100).toFixed(2)}`);
      }

      // Check for reserve price (if exists)
      if (artwork.reserve_bid_amount && bidAmount < parseFloat(artwork.reserve_bid_amount)) {
        throw new Error(`Bid does not meet reserve price of $${(parseFloat(artwork.reserve_bid_amount) / 100).toFixed(2)}`);
      }

      // Check user's account status
      const userResult = await client.query(
        'SELECT id, account_status FROM users WHERE id = $1',
        [userId]
      );

      if (userResult.rows.length === 0) {
        throw new Error('User not found');
      }

      if (userResult.rows[0].account_status !== 'ACTIVE') {
        throw new Error('User account is not active');
      }

      // Mark previous highest bid as OUTBID
      await client.query(
        `UPDATE bids SET bid_status = 'OUTBID'
         WHERE artwork_id = $1 AND bid_status = 'ACTIVE'`,
        [artworkId]
      );

      // Create bid record
      const bidResult = await client.query(
        `INSERT INTO bids (auction_id, artwork_id, placed_by_user_id, bid_amount, bid_status, placed_at, ip_address, user_agent)
         VALUES ($1, $2, $3, $4, 'ACTIVE', NOW(), $5, $6)
         RETURNING id, bid_amount, placed_at`,
        [artwork.auction_id, artworkId, userId, bidAmount, '0.0.0.0', 'unknown']
      );

      const bid = bidResult.rows[0];

      // Log bid activity for compliance
      await client.query(
        `INSERT INTO audit_logs (action_category, action_type, resource_type, resource_id, action_details, user_id)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        ['BID', 'bid_placed', 'artwork', artworkId, JSON.stringify({ bid_id: bid.id, amount: bidAmount }), userId]
      );

      await client.query('COMMIT');

      return {
        success: true,
        bidId: bid.id,
        artworkId: artworkId,
        bidAmount: bidAmount,
        timestamp: bid.placed_at,
        message: `Bid placed successfully for $${(bidAmount / 100).toFixed(2)}`
      };

    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Withdraw a bid (if allowed by auction rules)
   * @param {string} bidId - ID of the bid to withdraw
   * @param {string} userId - ID of the user withdrawing
   * @returns {Object} Withdrawal confirmation
   */
  async withdrawBid(bidId, userId) {
    const client = await pool.connect();

    try {
      await client.query('BEGIN');

      // Get bid information
      const bidResult = await client.query(
        `SELECT b.*, a.auction_id FROM bids b
         JOIN artwork a ON b.artwork_id = a.id
         WHERE b.id = $1 FOR UPDATE`,
        [bidId]
      );

      if (bidResult.rows.length === 0) {
        throw new Error('Bid not found');
      }

      const bid = bidResult.rows[0];

      // Verify user owns this bid
      if (bid.placed_by_user_id !== userId) {
        throw new Error('Unauthorized: Cannot withdraw another user\'s bid');
      }

      // Check if withdrawal is allowed
      const auctionResult = await client.query(
        'SELECT ends_at, auction_status FROM auctions WHERE id = $1',
        [bid.auction_id]
      );

      const auction = auctionResult.rows[0];
      const timeUntilEnd = new Date(auction.ends_at) - new Date();

      // Don't allow withdrawal if bid is highest and auction ends in less than 5 minutes
      if (bid.bid_status === 'ACTIVE' && timeUntilEnd < 5 * 60 * 1000) {
        throw new Error('Cannot withdraw the highest bid when auction is ending soon');
      }

      // Mark bid as cancelled
      await client.query(
        'UPDATE bids SET bid_status = $1 WHERE id = $2',
        ['CANCELLED', bidId]
      );

      // If this was the active (highest) bid, restore previous highest to ACTIVE
      if (bid.bid_status === 'ACTIVE') {
        const previousBidResult = await client.query(
          `SELECT id FROM bids
           WHERE artwork_id = $1 AND bid_status = 'OUTBID' AND id != $2
           ORDER BY bid_amount DESC LIMIT 1`,
          [bid.artwork_id, bidId]
        );

        if (previousBidResult.rows.length > 0) {
          await client.query(
            'UPDATE bids SET bid_status = $1 WHERE id = $2',
            ['ACTIVE', previousBidResult.rows[0].id]
          );
        }
      }

      // Log withdrawal for compliance
      await client.query(
        `INSERT INTO audit_logs (action_category, action_type, resource_type, resource_id, action_details, user_id)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        ['BID', 'bid_withdrawn', 'bid', bidId, JSON.stringify({ amount: bid.bid_amount }), userId]
      );

      await client.query('COMMIT');

      return {
        success: true,
        bidId: bidId,
        message: 'Bid withdrawn successfully'
      };

    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Get bid history for artwork
   * @param {string} artworkId - ID of the artwork
   * @returns {Array} Array of bid records sorted by timestamp
   */
  async getBidHistory(artworkId) {
    const result = await pool.query(
      `SELECT b.id, b.placed_by_user_id, b.bid_amount, b.placed_at, b.bid_status,
              u.first_name, u.last_name
       FROM bids b
       LEFT JOIN users u ON b.placed_by_user_id = u.id
       WHERE b.artwork_id = $1 AND b.bid_status IN ('ACTIVE', 'OUTBID', 'CANCELLED')
       ORDER BY b.placed_at DESC`,
      [artworkId]
    );

    return result.rows.map(row => ({
      bidId: row.id,
      bidder: {
        id: row.placed_by_user_id,
        displayName: `${row.first_name} ${row.last_name}`
      },
      amount: row.bid_amount,
      timestamp: row.placed_at,
      status: row.bid_status
    }));
  }

  /**
   * Get current state of artwork bidding
   * @param {string} artworkId - ID of the artwork
   * @returns {Object} Current bidding state
   */
  async getBiddingState(artworkId) {
    const result = await pool.query(
      `SELECT a.id, a.title, a.starting_bid_amount, a.reserve_bid_amount,
              au.id as auction_id, au.auction_status, au.ends_at,
              (SELECT MAX(bid_amount) FROM bids WHERE artwork_id = a.id AND bid_status = 'ACTIVE') as current_bid,
              (SELECT placed_by_user_id FROM bids WHERE artwork_id = a.id AND bid_status = 'ACTIVE' ORDER BY bid_amount DESC LIMIT 1) as current_bidder_id,
              (SELECT COUNT(*) FROM bids WHERE artwork_id = a.id AND bid_status IN ('ACTIVE', 'OUTBID')) as total_bids
       FROM artwork a
       JOIN auctions au ON a.auction_id = au.id
       WHERE a.id = $1`,
      [artworkId]
    );

    if (result.rows.length === 0) {
      throw new Error('Artwork not found');
    }

    const state = result.rows[0];
    const now = new Date();
    const endTime = new Date(state.ends_at);
    const timeRemaining = Math.max(0, endTime - now);

    return {
      artworkId: state.id,
      title: state.title,
      auctionId: state.auction_id,
      startingPrice: state.starting_bid_amount,
      reservePrice: state.reserve_bid_amount,
      currentBid: state.current_bid,
      currentBidderId: state.current_bidder_id,
      totalBids: parseInt(state.total_bids),
      auctionStatus: state.auction_status,
      endTime: state.ends_at,
      timeRemaining: timeRemaining,
      auctionActive: state.auction_status === 'LIVE' && endTime > now
    };
  }

  /**
   * Get user's bid history
   * @param {string} userId - ID of the user
   * @returns {Array} User's bids across all auctions
   */
  async getUserBidHistory(userId) {
    const result = await pool.query(
      `SELECT b.id, b.artwork_id, b.bid_amount, b.placed_at, b.bid_status,
              a.title, a.image_url,
              au.auction_status, au.ends_at,
              (SELECT MAX(bid_amount) FROM bids WHERE artwork_id = a.id AND bid_status = 'ACTIVE') as highest_bid
       FROM bids b
       JOIN artwork a ON b.artwork_id = a.id
       JOIN auctions au ON a.auction_id = au.id
       WHERE b.placed_by_user_id = $1
       ORDER BY b.placed_at DESC`,
      [userId]
    );

    return result.rows.map(row => ({
      bidId: row.id,
      artworkId: row.artwork_id,
      title: row.title,
      imageUrl: row.image_url,
      bidAmount: row.bid_amount,
      highestBid: row.highest_bid,
      isWinning: row.bid_status === 'ACTIVE',
      timestamp: row.placed_at,
      status: row.bid_status,
      auctionStatus: row.auction_status,
      auctionEndTime: row.ends_at
    }));
  }

  /**
   * Close an auction and determine winner
   * @param {string} auctionId - ID of the auction to close
   * @returns {Object} Closure result with winner info
   */
  async closeAuction(auctionId) {
    const client = await pool.connect();

    try {
      await client.query('BEGIN');

      // Get auction info
      const auctionResult = await client.query(
        'SELECT id, school_id, auction_status FROM auctions WHERE id = $1 FOR UPDATE',
        [auctionId]
      );

      if (auctionResult.rows.length === 0) {
        throw new Error('Auction not found');
      }

      const auction = auctionResult.rows[0];

      // Update auction status to ENDED
      await client.query(
        'UPDATE auctions SET auction_status = $1 WHERE id = $2',
        ['ENDED', auctionId]
      );

      // Find the highest active bid across all artwork in this auction
      const winnerResult = await client.query(
        `SELECT b.placed_by_user_id, b.bid_amount, b.artwork_id,
                u.first_name, u.last_name, u.email
         FROM bids b
         JOIN artwork a ON b.artwork_id = a.id
         JOIN users u ON b.placed_by_user_id = u.id
         WHERE a.auction_id = $1 AND b.bid_status = 'ACTIVE'
         ORDER BY b.bid_amount DESC LIMIT 1`,
        [auctionId]
      );

      let winner = null;

      if (winnerResult.rows.length > 0) {
        const row = winnerResult.rows[0];
        winner = {
          id: row.placed_by_user_id,
          name: `${row.first_name} ${row.last_name}`,
          email: row.email,
          bidAmount: row.bid_amount
        };

        // Mark winning bid as ACCEPTED
        await client.query(
          `UPDATE bids SET bid_status = 'ACCEPTED'
           WHERE artwork_id = $1 AND placed_by_user_id = $2 AND bid_status = 'ACTIVE'`,
          [row.artwork_id, row.placed_by_user_id]
        );
      }

      // Log auction closure
      await client.query(
        `INSERT INTO audit_logs (action_category, action_type, resource_type, resource_id, action_details)
         VALUES ($1, $2, $3, $4, $5)`,
        ['AUCTION', 'auction_closed', 'auction', auctionId,
         JSON.stringify({ winner_id: winner?.id || null, final_bid: winner?.bidAmount || null })]
      );

      await client.query('COMMIT');

      return {
        success: true,
        auctionId: auctionId,
        winner: winner,
        message: winner ? `Auction closed. Winner: ${winner.name}` : 'Auction closed with no winner'
      };

    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Get auction winner information
   * @param {string} auctionId - ID of the auction
   * @returns {Object} Winner details and artwork
   */
  async getAuctionWinner(auctionId) {
    const result = await pool.query(
      `SELECT b.placed_by_user_id, b.bid_amount, b.artwork_id,
              u.id, u.first_name, u.last_name, u.email,
              a.title as artwork_title
       FROM bids b
       JOIN artwork a ON b.artwork_id = a.id
       JOIN users u ON b.placed_by_user_id = u.id
       WHERE a.auction_id = $1 AND b.bid_status IN ('ACTIVE', 'ACCEPTED')
       ORDER BY b.bid_amount DESC LIMIT 1`,
      [auctionId]
    );

    if (result.rows.length === 0) {
      return {
        hasWinner: false,
        message: 'No winner - auction received no bids'
      };
    }

    const row = result.rows[0];

    return {
      hasWinner: true,
      winner: {
        id: row.placed_by_user_id,
        name: `${row.first_name} ${row.last_name}`,
        email: row.email,
        bidAmount: row.bid_amount
      },
      artwork: {
        id: row.artwork_id,
        title: row.artwork_title
      }
    };
  }

  /**
   * Get active auctions for a user
   * @param {string} userId - ID of the user
   * @returns {Array} User's active auctions with bid info
   */
  async getUserActiveAuctions(userId) {
    const result = await pool.query(
      `SELECT DISTINCT a.id, a.title, a.image_url, a.starting_bid_amount,
              au.auction_status, au.ends_at,
              (SELECT bid_amount FROM bids WHERE artwork_id = a.id AND placed_by_user_id = $1 ORDER BY bid_amount DESC LIMIT 1) as user_highest_bid,
              (SELECT MAX(bid_amount) FROM bids WHERE artwork_id = a.id AND bid_status = 'ACTIVE') as auction_highest_bid
       FROM artwork a
       JOIN auctions au ON a.auction_id = au.id
       JOIN bids b ON a.id = b.artwork_id
       WHERE b.placed_by_user_id = $1 AND au.auction_status = 'LIVE'
       ORDER BY au.ends_at ASC`,
      [userId]
    );

    return result.rows.map(row => ({
      auctionId: row.id,
      title: row.title,
      imageUrl: row.image_url,
      startingPrice: row.starting_bid_amount,
      currentBid: row.auction_highest_bid,
      userHighestBid: row.user_highest_bid,
      isWinning: row.user_highest_bid === row.auction_highest_bid,
      status: row.auction_status,
      endTime: row.ends_at
    }));
  }

  /**
   * Validate bid inputs
   * @private
   */
  _validateBidInputs(artworkId, userId, bidAmount) {
    if (!artworkId || typeof artworkId !== 'string') {
      throw new Error('Invalid artwork ID');
    }

    if (!userId || typeof userId !== 'string') {
      throw new Error('Invalid user ID');
    }

    if (!bidAmount || typeof bidAmount !== 'number' || bidAmount <= 0) {
      throw new Error('Invalid bid amount');
    }

    if (bidAmount > 999999999) { // Max $9,999,999.99
      throw new Error('Bid amount exceeds maximum allowed');
    }
  }
}

module.exports = new BiddingService();
