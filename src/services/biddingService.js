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
      
      // Get artwork and current bid info
      const artworkResult = await client.query(
        'SELECT a.*, au.current_bid, au.current_bidder_id, au.status, au.end_time FROM artwork a JOIN auctions au ON a.auction_id = au.id WHERE a.id = $1 FOR UPDATE',
        [artworkId]
      );
      
      if (artworkResult.rows.length === 0) {
        throw new Error('Artwork not found');
      }
      
      const artwork = artworkResult.rows[0];
      
      // Validate auction is active
      if (artwork.status !== 'active') {
        throw new Error(`Auction is not active. Current status: ${artwork.status}`);
      }
      
      // Validate auction hasn't ended
      const now = new Date();
      if (new Date(artwork.end_time) <= now) {
        throw new Error('Auction has ended');
      }
      
      // Validate user is not the artist
      if (artwork.artist_id === userId) {
        throw new Error('Artist cannot bid on their own artwork');
      }
      
      // Get minimum bid increment
      const schoolResult = await client.query(
        'SELECT minimum_bid_increment FROM schools WHERE id = (SELECT school_id FROM auctions WHERE id = $1)',
        [artwork.auction_id]
      );
      
      const minIncrement = schoolResult.rows[0]?.minimum_bid_increment || 100; // $1.00 default
      
      // Validate bid amount
      const minimumBid = (artwork.current_bid || artwork.starting_price || 0) + minIncrement;
      if (bidAmount < minimumBid) {
        throw new Error(`Bid amount $${(bidAmount / 100).toFixed(2)} is below minimum required $${(minimumBid / 100).toFixed(2)}`);
      }
      
      // Check for reserve price (if exists)
      if (artwork.reserve_price && bidAmount < artwork.reserve_price) {
        throw new Error(`Bid does not meet reserve price of $${(artwork.reserve_price / 100).toFixed(2)}`);
      }
      
      // Check user's account status and payment methods
      const userResult = await client.query(
        'SELECT id, account_status FROM users WHERE id = $1',
        [userId]
      );
      
      if (userResult.rows.length === 0) {
        throw new Error('User not found');
      }
      
      if (userResult.rows[0].account_status !== 'active') {
        throw new Error('User account is not active');
      }
      
      // Verify user has valid payment method on file
      const paymentMethodResult = await client.query(
        'SELECT id FROM payment_methods WHERE user_id = $1 AND is_default = true AND is_valid = true LIMIT 1',
        [userId]
      );
      
      if (paymentMethodResult.rows.length === 0) {
        throw new Error('User must have a valid payment method on file to bid');
      }
      
      // Create bid record
      const bidResult = await client.query(
        `INSERT INTO bids (artwork_id, bidder_id, bid_amount, bid_timestamp, ip_address, user_agent)
         VALUES ($1, $2, $3, NOW(), $4, $5)
         RETURNING id, bid_amount, bid_timestamp`,
        [artworkId, userId, bidAmount, '0.0.0.0', 'unknown']
      );
      
      const bid = bidResult.rows[0];
      
      // Update auction with new highest bid
      await client.query(
        `UPDATE auctions SET current_bid = $1, current_bidder_id = $2, last_bid_time = NOW()
         WHERE id = $3`,
        [bidAmount, userId, artwork.auction_id]
      );
      
      // Check if bid reaches reserve and update reserve_met flag
      if (artwork.reserve_price && bidAmount >= artwork.reserve_price) {
        await client.query(
          'UPDATE artwork SET reserve_met = true WHERE id = $1',
          [artworkId]
        );
      }
      
      // Log bid activity for compliance
      await client.query(
        `INSERT INTO audit_logs (user_id, action, resource_type, resource_id, details, timestamp)
         VALUES ($1, $2, $3, $4, $5, NOW())`,
        [userId, 'bid_placed', 'artwork', artworkId, JSON.stringify({ bid_id: bid.id, amount: bidAmount })]
      );
      
      await client.query('COMMIT');
      
      return {
        success: true,
        bidId: bid.id,
        artworkId: artworkId,
        bidAmount: bidAmount,
        timestamp: bid.bid_timestamp,
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
      if (bid.bidder_id !== userId) {
        throw new Error('Unauthorized: Cannot withdraw another user\'s bid');
      }
      
      // Check if withdrawal is allowed (e.g., not the current highest bid if auction is close to ending)
      const auctionResult = await client.query(
        'SELECT end_time, status, current_bid FROM auctions WHERE id = $1',
        [bid.auction_id]
      );
      
      const auction = auctionResult.rows[0];
      const timeUntilEnd = new Date(auction.end_time) - new Date();
      
      // Don't allow withdrawal if bid is the highest and auction ends in less than 5 minutes
      if (bid.bid_amount === auction.current_bid && timeUntilEnd < 5 * 60 * 1000) {
        throw new Error('Cannot withdraw the highest bid when auction is ending soon');
      }
      
      // Mark bid as withdrawn
      await client.query(
        'UPDATE bids SET status = $1, withdrawn_at = NOW() WHERE id = $2',
        ['withdrawn', bidId]
      );
      
      // If this was the highest bid, find and update to previous highest
      if (bid.bid_amount === auction.current_bid) {
        const previousBidResult = await client.query(
          `SELECT bidder_id, bid_amount FROM bids
           WHERE artwork_id = $1 AND status = 'active' AND id != $2
           ORDER BY bid_amount DESC LIMIT 1`,
          [bid.artwork_id, bidId]
        );
        
        if (previousBidResult.rows.length > 0) {
          const prevBid = previousBidResult.rows[0];
          await client.query(
            'UPDATE auctions SET current_bid = $1, current_bidder_id = $2 WHERE id = $3',
            [prevBid.bid_amount, prevBid.bidder_id, bid.auction_id]
          );
        } else {
          // No other bids, reset to starting price
          await client.query(
            'UPDATE auctions SET current_bid = NULL, current_bidder_id = NULL WHERE id = $1',
            [bid.auction_id]
          );
        }
      }
      
      // Log withdrawal for compliance
      await client.query(
        `INSERT INTO audit_logs (user_id, action, resource_type, resource_id, details, timestamp)
         VALUES ($1, $2, $3, $4, $5, NOW())`,
        [userId, 'bid_withdrawn', 'bid', bidId, JSON.stringify({ amount: bid.bid_amount })]
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
      `SELECT b.id, b.bidder_id, b.bid_amount, b.bid_timestamp, b.status,
              u.first_name, u.last_name, u.username
       FROM bids b
       LEFT JOIN users u ON b.bidder_id = u.id
       WHERE b.artwork_id = $1 AND b.status IN ('active', 'withdrawn')
       ORDER BY b.bid_timestamp DESC`,
      [artworkId]
    );
    
    return result.rows.map(row => ({
      bidId: row.id,
      bidder: {
        id: row.bidder_id,
        username: row.username,
        displayName: `${row.first_name} ${row.last_name}`
      },
      amount: row.bid_amount,
      timestamp: row.bid_timestamp,
      status: row.status
    }));
  }

  /**
   * Get current state of artwork bidding
   * @param {string} artworkId - ID of the artwork
   * @returns {Object} Current bidding state
   */
  async getBiddingState(artworkId) {
    const result = await pool.query(
      `SELECT a.id, a.title, a.starting_price, a.reserve_price, a.reserve_met,
              au.id as auction_id, au.current_bid, au.current_bidder_id, au.status,
              au.end_time, au.last_bid_time,
              (SELECT COUNT(*) FROM bids WHERE artwork_id = a.id AND status = 'active') as total_bids
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
    const endTime = new Date(state.end_time);
    const timeRemaining = Math.max(0, endTime - now);
    
    return {
      artworkId: state.id,
      title: state.title,
      auctionId: state.auction_id,
      startingPrice: state.starting_price,
      reservePrice: state.reserve_price,
      reserveMet: state.reserve_met,
      currentBid: state.current_bid,
      currentBidderId: state.current_bidder_id,
      totalBids: parseInt(state.total_bids),
      auctionStatus: state.status,
      endTime: state.end_time,
      lastBidTime: state.last_bid_time,
      timeRemaining: timeRemaining,
      auctionActive: state.status === 'active' && endTime > now
    };
  }

  /**
   * Get user's bid history
   * @param {string} userId - ID of the user
   * @returns {Array} User's bids across all auctions
   */
  async getUserBidHistory(userId) {
    const result = await pool.query(
      `SELECT b.id, b.artwork_id, b.bid_amount, b.bid_timestamp, b.status,
              a.title, a.image_url,
              au.status as auction_status, au.end_time,
              (SELECT MAX(bid_amount) FROM bids WHERE artwork_id = a.id AND status = 'active') as highest_bid
       FROM bids b
       JOIN artwork a ON b.artwork_id = a.id
       JOIN auctions au ON a.auction_id = au.id
       WHERE b.bidder_id = $1
       ORDER BY b.bid_timestamp DESC`,
      [userId]
    );
    
    return result.rows.map(row => ({
      bidId: row.id,
      artworkId: row.artwork_id,
      title: row.title,
      imageUrl: row.image_url,
      bidAmount: row.bid_amount,
      highestBid: row.highest_bid,
      isWinning: row.bid_amount === row.highest_bid && row.auction_status === 'closed',
      timestamp: row.bid_timestamp,
      status: row.status,
      auctionStatus: row.auction_status,
      auctionEndTime: row.end_time
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
        'SELECT id, current_bid, current_bidder_id, school_id FROM auctions WHERE id = $1 FOR UPDATE',
        [auctionId]
      );
      
      if (auctionResult.rows.length === 0) {
        throw new Error('Auction not found');
      }
      
      const auction = auctionResult.rows[0];
      
      // Update auction status
      await client.query(
        'UPDATE auctions SET status = $1, closed_at = NOW() WHERE id = $2',
        ['closed', auctionId]
      );
      
      let winner = null;
      
      // If there are bids, create transaction for the winning bid
      if (auction.current_bid && auction.current_bidder_id) {
        // Create transaction record
        const transactionResult = await client.query(
          `INSERT INTO transactions (auction_id, buyer_id, seller_id, amount, transaction_type, status, created_at)
           VALUES ($1, $2, (SELECT artist_id FROM artwork WHERE auction_id = $1 LIMIT 1), $3, $4, $5, NOW())
           RETURNING id`,
          [auctionId, auction.current_bidder_id, auction.current_bid, 'bid_settlement', 'pending']
        );
        
        // Get winner details
        const winnerResult = await client.query(
          'SELECT id, first_name, last_name, email FROM users WHERE id = $1',
          [auction.current_bidder_id]
        );
        
        winner = {
          id: auction.current_bidder_id,
          name: `${winnerResult.rows[0].first_name} ${winnerResult.rows[0].last_name}`,
          email: winnerResult.rows[0].email,
          bidAmount: auction.current_bid
        };
        
        // Log auction closure
        await client.query(
          `INSERT INTO audit_logs (action, resource_type, resource_id, details, timestamp)
           VALUES ($1, $2, $3, $4, NOW())`,
          ['auction_closed', 'auction', auctionId, JSON.stringify({ winner_id: auction.current_bidder_id, final_bid: auction.current_bid })]
        );
      } else {
        // No bids - auction failed
        await client.query(
          `INSERT INTO audit_logs (action, resource_type, resource_id, details, timestamp)
           VALUES ($1, $2, $3, $4, NOW())`,
          ['auction_closed', 'auction', auctionId, JSON.stringify({ winner_id: null, reason: 'no_bids' })]
        );
      }
      
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
      `SELECT au.current_bidder_id, au.current_bid,
              u.id, u.first_name, u.last_name, u.email,
              a.id as artwork_id, a.title
       FROM auctions au
       LEFT JOIN users u ON au.current_bidder_id = u.id
       LEFT JOIN artwork a ON a.auction_id = au.id
       WHERE au.id = $1`,
      [auctionId]
    );
    
    if (result.rows.length === 0) {
      throw new Error('Auction not found');
    }
    
    const row = result.rows[0];
    
    if (!row.current_bidder_id) {
      return {
        hasWinner: false,
        message: 'No winner - auction received no bids'
      };
    }
    
    return {
      hasWinner: true,
      winner: {
        id: row.id,
        name: `${row.first_name} ${row.last_name}`,
        email: row.email,
        bidAmount: row.current_bid
      },
      artwork: {
        id: row.artwork_id,
        title: row.title
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
      `SELECT DISTINCT a.id, a.title, a.image_url, a.starting_price,
              au.status, au.current_bid, au.end_time,
              (SELECT bid_amount FROM bids WHERE artwork_id = a.id AND bidder_id = $1 ORDER BY bid_amount DESC LIMIT 1) as user_highest_bid,
              (SELECT MAX(bid_amount) FROM bids WHERE artwork_id = a.id) as auction_highest_bid
       FROM artwork a
       JOIN auctions au ON a.auction_id = au.id
       JOIN bids b ON a.id = b.artwork_id
       WHERE b.bidder_id = $1 AND au.status IN ('active', 'ending_soon')
       ORDER BY au.end_time ASC`,
      [userId]
    );
    
    return result.rows.map(row => ({
      auctionId: row.id,
      title: row.title,
      imageUrl: row.image_url,
      startingPrice: row.starting_price,
      currentBid: row.auction_highest_bid,
      userHighestBid: row.user_highest_bid,
      isWinning: row.user_highest_bid === row.auction_highest_bid,
      status: row.status,
      endTime: row.end_time
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
