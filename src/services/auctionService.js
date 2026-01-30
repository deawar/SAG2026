/**
 * Auction Service
 * Handles all auction lifecycle operations, creation, management, and closure
 * Implements auto-extend, winner determination, and platform fee calculations
 */

const { pool } = require('../models/index');
const QRCode = require('qrcode');
const { v4: uuidv4 } = require('uuid');

class AuctionService {
  /**
   * Create a new auction
   * @param {Object} auctionData - Auction creation data
   * @returns {Object} Created auction with details
   */
  async createAuction(auctionData) {
    const client = await pool.connect();

    try {
      await client.query('BEGIN');

      const {
        title,
        description,
        schoolId,
        charityId,
        startTime,
        endTime,
        platformFeePercentage = 3,
        autoExtendEnabled = false,
        autoExtendMinutes = 10,
        artworkIds = []
      } = auctionData;

      // Validate inputs
      this._validateAuctionInputs(auctionData);

      // Verify school exists
      const schoolResult = await client.query(
        'SELECT id FROM schools WHERE id = $1',
        [schoolId]
      );

      if (schoolResult.rows.length === 0) {
        throw new Error('School not found');
      }

      // Create auction record
      const auctionResult = await client.query(
        `INSERT INTO auctions (
          title, description, school_id, charity_id, 
          start_time, end_time, status, 
          platform_fee_percentage, auto_extend_enabled, auto_extend_minutes,
          created_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, NOW())
         RETURNING *`,
        [
          title,
          description,
          schoolId,
          charityId,
          startTime,
          endTime,
          'draft',
          platformFeePercentage,
          autoExtendEnabled,
          autoExtendMinutes
        ]
      );

      const auction = auctionResult.rows[0];

      // Add artwork to auction if provided
      if (artworkIds && artworkIds.length > 0) {
        const placeholders = artworkIds
          .map((_, i) => `($1, $${i + 2})`)
          .join(',');

        await client.query(
          `UPDATE artwork SET auction_id = $1 WHERE id IN (${artworkIds
            .map((_, i) => `$${i + 2}`)
            .join(',')})`,
          [auction.id, ...artworkIds]
        );
      }

      // Generate QR code for auction
      const qrCodeUrl = await this._generateQRCode(auction.id);

      // Log action
      await client.query(
        `INSERT INTO audit_logs (action, resource_type, resource_id, details, timestamp)
         VALUES ($1, $2, $3, $4, NOW())`,
        ['auction_created', 'auction', auction.id, JSON.stringify({ title, school_id: schoolId })]
      );

      await client.query('COMMIT');

      return {
        success: true,
        auctionId: auction.id,
        title: auction.title,
        description: auction.description,
        status: auction.status,
        schoolId: auction.school_id,
        startTime: auction.start_time,
        endTime: auction.end_time,
        platformFeePercentage: auction.platform_fee_percentage,
        autoExtendEnabled: auction.auto_extend_enabled,
        qrCode: qrCodeUrl,
        artworkCount: artworkIds?.length || 0
      };
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Get auction details with full information
   * @param {string} auctionId - ID of the auction
   * @returns {Object} Complete auction details
   */
  async getAuction(auctionId) {
    const result = await pool.query(
      `SELECT a.*, 
              (SELECT COUNT(*) FROM artwork WHERE auction_id = a.id) as artwork_count,
              (SELECT COUNT(*) FROM bids b JOIN artwork aw ON b.artwork_id = aw.id 
               WHERE aw.auction_id = a.id AND b.status = 'active') as total_bids,
              (SELECT SUM(current_bid) FROM auctions au JOIN artwork aw ON au.id = aw.auction_id
               WHERE au.id = a.id) as total_current_value
       FROM auctions a
       WHERE a.id = $1`,
      [auctionId]
    );

    if (result.rows.length === 0) {
      throw new Error('Auction not found');
    }

    const auction = result.rows[0];
    const now = new Date();
    const endTime = new Date(auction.end_time);
    const timeRemaining = Math.max(0, endTime - now);

    return {
      auctionId: auction.id,
      title: auction.title,
      description: auction.description,
      schoolId: auction.school_id,
      charityId: auction.charity_id,
      status: auction.status,
      startTime: auction.start_time,
      endTime: auction.end_time,
      timeRemaining: timeRemaining,
      isActive: auction.status === 'active' && endTime > now,
      artworkCount: parseInt(auction.artwork_count),
      totalBids: parseInt(auction.total_bids) || 0,
      totalCurrentValue: auction.total_current_value || 0,
      platformFeePercentage: auction.platform_fee_percentage,
      autoExtendEnabled: auction.auto_extend_enabled,
      autoExtendMinutes: auction.auto_extend_minutes,
      createdAt: auction.created_at,
      closedAt: auction.closed_at
    };
  }

  /**
   * Update auction details
   * @param {string} auctionId - ID of the auction
   * @param {Object} updates - Fields to update
   * @returns {Object} Updated auction
   */
  async updateAuction(auctionId, updates) {
    const client = await pool.connect();

    try {
      await client.query('BEGIN');

      // Get current auction
      const auctionResult = await client.query(
        'SELECT status FROM auctions WHERE id = $1 FOR UPDATE',
        [auctionId]
      );

      if (auctionResult.rows.length === 0) {
        throw new Error('Auction not found');
      }

      const auction = auctionResult.rows[0];

      // Only allow updates to draft auctions
      if (auction.status !== 'draft') {
        throw new Error(
          `Cannot update auction with status '${auction.status}'. Only draft auctions can be updated.`
        );
      }

      // Build update query dynamically
      const allowedFields = [
        'title',
        'description',
        'start_time',
        'end_time',
        'platform_fee_percentage',
        'auto_extend_enabled',
        'auto_extend_minutes'
      ];

      const updateFields = [];
      const values = [];
      let paramCount = 1;

      Object.keys(updates).forEach(key => {
        const snakeKey = key.replace(/([A-Z])/g, '_$1').toLowerCase();
        if (allowedFields.includes(snakeKey)) {
          updateFields.push(`${snakeKey} = $${paramCount}`);
          values.push(updates[key]);
          paramCount++;
        }
      });

      if (updateFields.length === 0) {
        throw new Error('No valid fields to update');
      }

      values.push(auctionId);

      const updateResult = await client.query(
        `UPDATE auctions SET ${updateFields.join(', ')}, updated_at = NOW()
         WHERE id = $${paramCount}
         RETURNING *`,
        values
      );

      const updated = updateResult.rows[0];

      // Log update
      await client.query(
        `INSERT INTO audit_logs (action, resource_type, resource_id, details, timestamp)
         VALUES ($1, $2, $3, $4, NOW())`,
        ['auction_updated', 'auction', auctionId, JSON.stringify(updates)]
      );

      await client.query('COMMIT');

      return {
        success: true,
        auctionId: updated.id,
        title: updated.title,
        status: updated.status,
        message: 'Auction updated successfully'
      };
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Start an auction (move from draft to active)
   * @param {string} auctionId - ID of the auction
   * @returns {Object} Auction activation result
   */
  async startAuction(auctionId) {
    const client = await pool.connect();

    try {
      await client.query('BEGIN');

      // Verify auction exists and is in draft status
      const auctionResult = await client.query(
        'SELECT * FROM auctions WHERE id = $1 FOR UPDATE',
        [auctionId]
      );

      if (auctionResult.rows.length === 0) {
        throw new Error('Auction not found');
      }

      const auction = auctionResult.rows[0];

      if (auction.status !== 'draft') {
        throw new Error(
          `Cannot start auction with status '${auction.status}'. Only draft auctions can be started.`
        );
      }

      // Verify auction has artwork
      const artworkResult = await client.query(
        'SELECT COUNT(*) as count FROM artwork WHERE auction_id = $1',
        [auctionId]
      );

      if (parseInt(artworkResult.rows[0].count) === 0) {
        throw new Error('Cannot start auction without artwork');
      }

      // Update auction status to active
      await client.query(
        `UPDATE auctions SET status = $1, started_at = NOW() WHERE id = $2`,
        ['active', auctionId]
      );

      // Log action
      await client.query(
        `INSERT INTO audit_logs (action, resource_type, resource_id, details, timestamp)
         VALUES ($1, $2, $3, $4, NOW())`,
        ['auction_started', 'auction', auctionId, JSON.stringify({ start_time: new Date() })]
      );

      await client.query('COMMIT');

      return {
        success: true,
        auctionId: auctionId,
        status: 'active',
        message: 'Auction started successfully'
      };
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * List auctions with filtering and pagination
   * @param {Object} options - Filter and pagination options
   * @returns {Object} Paginated auction list
   */
  async listAuctions(options = {}) {
    const {
      status = null,
      schoolId = null,
      limit = 20,
      offset = 0,
      sortBy = 'created_at',
      sortOrder = 'DESC'
    } = options;

    let query = 'SELECT * FROM auctions WHERE 1=1';
    const params = [];
    let paramCount = 1;

    if (status) {
      query += ` AND status = $${paramCount}`;
      params.push(status);
      paramCount++;
    }

    if (schoolId) {
      query += ` AND school_id = $${paramCount}`;
      params.push(schoolId);
      paramCount++;
    }

    const validSortFields = [
      'created_at',
      'start_time',
      'end_time',
      'title'
    ];
    const sortField = validSortFields.includes(sortBy) ? sortBy : 'created_at';
    const order = sortOrder.toUpperCase() === 'ASC' ? 'ASC' : 'DESC';

    query += ` ORDER BY ${sortField} ${order} LIMIT $${paramCount} OFFSET $${paramCount + 1}`;
    params.push(limit, offset);

    const result = await pool.query(query, params);

    // Get total count
    let countQuery = 'SELECT COUNT(*) as count FROM auctions WHERE 1=1';
    const countParams = [];
    if (status) {
      countQuery += ` AND status = $${countParams.length + 1}`;
      countParams.push(status);
    }
    if (schoolId) {
      countQuery += ` AND school_id = $${countParams.length + 1}`;
      countParams.push(schoolId);
    }

    const countResult = await pool.query(countQuery, countParams);
    const totalCount = parseInt(countResult.rows[0].count);

    return {
      success: true,
      auctions: result.rows.map(auction => ({
        auctionId: auction.id,
        title: auction.title,
        status: auction.status,
        schoolId: auction.school_id,
        startTime: auction.start_time,
        endTime: auction.end_time,
        createdAt: auction.created_at
      })),
      pagination: {
        limit,
        offset,
        total: totalCount,
        pages: Math.ceil(totalCount / limit),
        hasMore: offset + limit < totalCount
      }
    };
  }

  /**
   * Get all active auctions
   * @returns {Array} Active auctions with time remaining
   */
  async getActiveAuctions() {
    const result = await pool.query(
      `SELECT a.*, 
              (SELECT COUNT(*) FROM artwork WHERE auction_id = a.id) as artwork_count,
              (SELECT COUNT(DISTINCT bidder_id) FROM bids b 
               JOIN artwork aw ON b.artwork_id = aw.id 
               WHERE aw.auction_id = a.id AND b.status = 'active') as unique_bidders
       FROM auctions a
       WHERE a.status = $1 AND a.end_time > NOW()
       ORDER BY a.end_time ASC`,
      ['active']
    );

    return result.rows.map(auction => {
      const endTime = new Date(auction.end_time);
      const timeRemaining = endTime - new Date();

      return {
        auctionId: auction.id,
        title: auction.title,
        schoolId: auction.school_id,
        artworkCount: parseInt(auction.artwork_count),
        uniqueBidders: parseInt(auction.unique_bidders),
        endTime: auction.end_time,
        timeRemaining: Math.max(0, timeRemaining),
        status: auction.status
      };
    });
  }

  /**
   * End an auction and determine winner
   * @param {string} auctionId - ID of the auction
   * @returns {Object} Auction closure with winner information
   */
  async endAuction(auctionId) {
    const client = await pool.connect();

    try {
      await client.query('BEGIN');

      // Get auction with locking
      const auctionResult = await client.query(
        `SELECT a.*, 
                (SELECT COUNT(*) FROM artwork WHERE auction_id = a.id) as artwork_count
         FROM auctions a
         WHERE a.id = $1 FOR UPDATE`,
        [auctionId]
      );

      if (auctionResult.rows.length === 0) {
        throw new Error('Auction not found');
      }

      const auction = auctionResult.rows[0];

      if (auction.status === 'ended') {
        return {
          success: false,
          message: 'Auction is already ended'
        };
      }

      // Get all artwork in auction with highest bids
      const artworkResult = await pool.query(
        `SELECT a.id, a.title,
                (SELECT bidder_id FROM bids WHERE artwork_id = a.id ORDER BY bid_amount DESC LIMIT 1) as winner_id,
                (SELECT bid_amount FROM bids WHERE artwork_id = a.id ORDER BY bid_amount DESC LIMIT 1) as winning_bid
         FROM artwork a
         WHERE a.auction_id = $1`,
        [auctionId]
      );

      const artwork = artworkResult.rows;
      let totalRevenue = 0;
      const winners = [];

      // Process each artwork
      for (const piece of artwork) {
        if (piece.winner_id && piece.winning_bid) {
          totalRevenue += piece.winning_bid;

          // Create transaction record
          await client.query(
            `INSERT INTO transactions (
              auction_id, artwork_id, buyer_id, seller_id, amount, 
              transaction_type, status, created_at
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, NOW())`,
            [auctionId, piece.id, piece.winner_id, null, piece.winning_bid, 'bid_settlement', 'pending']
          );

          winners.push({
            artworkId: piece.id,
            artworkTitle: piece.title,
            winnerId: piece.winner_id,
            winningBid: piece.winning_bid
          });
        }
      }

      // Calculate platform fee
      const platformFee = this._calculatePlatformFee(totalRevenue, auction.platform_fee_percentage);

      // Update auction status
      await client.query(
        `UPDATE auctions SET 
          status = $1, 
          ended_at = NOW(),
          total_revenue = $2,
          platform_fee = $3
         WHERE id = $4`,
        ['ended', totalRevenue, platformFee, auctionId]
      );

      // Log action
      await client.query(
        `INSERT INTO audit_logs (action, resource_type, resource_id, details, timestamp)
         VALUES ($1, $2, $3, $4, NOW())`,
        [
          'auction_ended',
          'auction',
          auctionId,
          JSON.stringify({
            winners_count: winners.length,
            total_revenue: totalRevenue,
            platform_fee: platformFee
          })
        ]
      );

      await client.query('COMMIT');

      return {
        success: true,
        auctionId: auctionId,
        status: 'ended',
        totalRevenue: totalRevenue,
        platformFee: platformFee,
        charityRevenue: totalRevenue - platformFee,
        winnersCount: winners.length,
        winners: winners,
        message: `Auction ended with ${winners.length} winning bids`
      };
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Auto-extend auction if bid received near end time
   * @param {string} auctionId - ID of the auction
   * @param {number} minutesToExtend - Minutes to extend (default from auction settings)
   * @returns {Object} Extension result
   */
  async autoExtendAuction(auctionId, minutesToExtend = null) {
    const client = await pool.connect();

    try {
      await client.query('BEGIN');

      // Get auction
      const auctionResult = await client.query(
        `SELECT * FROM auctions WHERE id = $1 FOR UPDATE`,
        [auctionId]
      );

      if (auctionResult.rows.length === 0) {
        throw new Error('Auction not found');
      }

      const auction = auctionResult.rows[0];

      // Check if auto-extend is enabled
      if (!auction.auto_extend_enabled) {
        return {
          success: false,
          message: 'Auto-extend is not enabled for this auction'
        };
      }

      const extendMinutes = minutesToExtend || auction.auto_extend_minutes || 10;
      const currentEndTime = new Date(auction.end_time);
      const newEndTime = new Date(currentEndTime.getTime() + extendMinutes * 60000);

      // Update auction end time
      await client.query(
        `UPDATE auctions SET end_time = $1, auto_extend_count = auto_extend_count + 1 WHERE id = $2`,
        [newEndTime, auctionId]
      );

      // Log action
      await client.query(
        `INSERT INTO audit_logs (action, resource_type, resource_id, details, timestamp)
         VALUES ($1, $2, $3, $4, NOW())`,
        [
          'auction_auto_extended',
          'auction',
          auctionId,
          JSON.stringify({
            extended_by_minutes: extendMinutes,
            new_end_time: newEndTime
          })
        ]
      );

      await client.query('COMMIT');

      return {
        success: true,
        auctionId: auctionId,
        newEndTime: newEndTime,
        extendedByMinutes: extendMinutes,
        message: `Auction auto-extended by ${extendMinutes} minutes`
      };
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Delete a draft auction
   * @param {string} auctionId - ID of the auction
   * @returns {Object} Deletion result
   */
  async deleteAuction(auctionId) {
    const client = await pool.connect();

    try {
      await client.query('BEGIN');

      // Get auction
      const auctionResult = await client.query(
        'SELECT status FROM auctions WHERE id = $1 FOR UPDATE',
        [auctionId]
      );

      if (auctionResult.rows.length === 0) {
        throw new Error('Auction not found');
      }

      const auction = auctionResult.rows[0];

      // Only allow deletion of draft auctions
      if (auction.status !== 'draft') {
        throw new Error(
          `Cannot delete auction with status '${auction.status}'. Only draft auctions can be deleted.`
        );
      }

      // Remove artwork associations
      await client.query('UPDATE artwork SET auction_id = NULL WHERE auction_id = $1', [auctionId]);

      // Delete auction
      await client.query('DELETE FROM auctions WHERE id = $1', [auctionId]);

      // Log action
      await client.query(
        `INSERT INTO audit_logs (action, resource_type, resource_id, details, timestamp)
         VALUES ($1, $2, $3, $4, NOW())`,
        ['auction_deleted', 'auction', auctionId, JSON.stringify({ reason: 'user_delete' })]
      );

      await client.query('COMMIT');

      return {
        success: true,
        auctionId: auctionId,
        message: 'Auction deleted successfully'
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
   * @returns {Object} Winner details with artwork
   */
  async getAuctionWinner(auctionId) {
    const result = await pool.query(
      `SELECT 
        a.id as artwork_id, a.title,
        (SELECT bidder_id FROM bids WHERE artwork_id = a.id AND status = 'active' ORDER BY bid_amount DESC LIMIT 1) as winner_id,
        (SELECT bid_amount FROM bids WHERE artwork_id = a.id AND status = 'active' ORDER BY bid_amount DESC LIMIT 1) as winning_bid,
        u.first_name, u.last_name, u.email
       FROM artwork a
       LEFT JOIN users u ON (SELECT bidder_id FROM bids WHERE artwork_id = a.id AND status = 'active' ORDER BY bid_amount DESC LIMIT 1) = u.id
       WHERE a.auction_id = $1
       ORDER BY a.created_at ASC`,
      [auctionId]
    );

    const winners = result.rows
      .filter(row => row.winner_id)
      .map(row => ({
        artworkId: row.artwork_id,
        artworkTitle: row.title,
        winnerId: row.winner_id,
        winnerName: `${row.first_name} ${row.last_name}`,
        winnerEmail: row.email,
        winningBid: row.winning_bid
      }));

    return {
      success: true,
      auctionId: auctionId,
      winnerCount: winners.length,
      winners: winners,
      hasWinners: winners.length > 0
    };
  }

  /**
   * Calculate platform fee
   * @private
   */
  _calculatePlatformFee(amount, feePercentage = 3) {
    return Math.round(amount * (feePercentage / 100));
  }

  /**
   * Generate QR code for auction
   * @private
   */
  async _generateQRCode(auctionId) {
    try {
      const auctionUrl = `${process.env.APP_URL || 'http://localhost:5000'}/auctions/${auctionId}`;
      const qrCode = await QRCode.toDataURL(auctionUrl);
      return qrCode;
    } catch (error) {
      console.error('Error generating QR code:', error);
      return null;
    }
  }

  /**
   * Validate auction inputs
   * @private
   */
  _validateAuctionInputs(data) {
    const { title, description, schoolId, startTime, endTime, platformFeePercentage } = data;

    if (!title || typeof title !== 'string' || title.trim().length === 0) {
      throw new Error('Valid auction title is required');
    }

    if (!description || typeof description !== 'string' || description.trim().length === 0) {
      throw new Error('Valid auction description is required');
    }

    if (!schoolId || typeof schoolId !== 'string') {
      throw new Error('Valid school ID is required');
    }

    if (!startTime || isNaN(new Date(startTime).getTime())) {
      throw new Error('Valid start time is required');
    }

    if (!endTime || isNaN(new Date(endTime).getTime())) {
      throw new Error('Valid end time is required');
    }

    const start = new Date(startTime);
    const end = new Date(endTime);

    if (end <= start) {
      throw new Error('End time must be after start time');
    }

    if (platformFeePercentage !== undefined) {
      if (typeof platformFeePercentage !== 'number' || platformFeePercentage < 0 || platformFeePercentage > 100) {
        throw new Error('Platform fee percentage must be between 0 and 100');
      }
    }
  }
}

module.exports = new AuctionService();
