/**
 * Auction Controller
 * Handles HTTP requests for auction creation, management, and retrieval
 * CRITICAL: All responses filtered by user role + visibility rules
 */

const auctionService = require('../services/auctionService');
const { pool } = require('../models/index');
const roleHierarchyUtils = require('../utils/roleHierarchyUtils');

class AuctionController {
  /**
   * POST /api/auctions
   * Create a new auction
   */
  async createAuction(req, res) {
    try {
      const { title, description, schoolId, charityBeneficiaryName, startTime, endTime, platformFeePercentage, autoExtendMinutes, artworkIds, paymentGatewayId } = req.body;

      // Validate user role
      if (!['SITE_ADMIN', 'SCHOOL_ADMIN', 'TEACHER'].includes(req.user?.role)) {
        return res.status(403).json({
          success: false,
          message: 'You do not have permission to create auctions'
        });
      }

      // Teachers can only create auctions for their own school
      const userSchoolId = req.user.schoolId || req.user.school_id;
      const resolvedSchoolId = req.user.role === 'TEACHER' ? userSchoolId : (schoolId || userSchoolId);

      // TEACHER with no school assigned — tell them clearly
      if (req.user.role === 'TEACHER' && !resolvedSchoolId) {
        return res.status(400).json({
          success: false,
          message: 'Your teacher account has no school assigned. Please ask a school administrator to link your account to a school, then log out and back in.'
        });
      }

      // If no paymentGatewayId provided, look up the primary gateway for the school
      let resolvedGatewayId = paymentGatewayId;
      if (!resolvedGatewayId && resolvedSchoolId) {
        const gwResult = await pool.query(
          'SELECT id FROM payment_gateways WHERE school_id = $1 AND is_primary = TRUE AND is_active = TRUE LIMIT 1',
          [resolvedSchoolId]
        );
        if (gwResult.rows.length > 0) {
          resolvedGatewayId = gwResult.rows[0].id;
        }
      }

      // If still no gateway, try any active gateway for the school
      if (!resolvedGatewayId && resolvedSchoolId) {
        const gwResult = await pool.query(
          'SELECT id FROM payment_gateways WHERE school_id = $1 AND is_active = TRUE LIMIT 1',
          [resolvedSchoolId]
        );
        if (gwResult.rows.length > 0) {
          resolvedGatewayId = gwResult.rows[0].id;
        }
      }

      if (!resolvedGatewayId) {
        return res.status(400).json({
          success: false,
          message: resolvedSchoolId
            ? 'No payment gateway is configured for this school. A school administrator must set up payment processing before auctions can be created.'
            : 'No school selected and no default payment gateway found. Please select a school.'
        });
      }

      const result = await auctionService.createAuction({
        title,
        description,
        schoolId: resolvedSchoolId,
        charityBeneficiaryName,
        startTime,
        endTime,
        platformFeePercentage,
        autoExtendMinutes,
        artworkIds,
        createdByUserId: req.user.id,
        paymentGatewayId: resolvedGatewayId
      });

      return res.status(201).json(result);
    } catch (error) {
      console.error('Error creating auction:', error);
      return res.status(400).json({
        success: false,
        message: error.message || 'Error creating auction'
      });
    }
  }

  /**
   * GET /api/auctions/:auctionId/public
   * Unauthenticated read-only preview.
   * Returns title, description, status, times, schoolName, and a safe artwork list
   * (image, title, medium, dimensions, startingPrice, currentHighBid only).
   * Never exposes bidder identities or bid history.
   */
  async getAuctionPublic(req, res) {
    try {
      const { auctionId } = req.params;

      const auctionResult = await pool.query(
        `SELECT a.id, a.title, a.description, a.auction_status,
                a.starts_at, a.ends_at, a.school_id,
                s.name AS school_name
         FROM   auctions a
         LEFT JOIN schools s ON s.id = a.school_id
         WHERE  a.id = $1 AND a.deleted_at IS NULL`,
        [auctionId]
      );

      if (auctionResult.rows.length === 0) {
        return res.status(404).json({ success: false, message: 'Auction not found' });
      }

      const a = auctionResult.rows[0];
      const now = new Date();
      const endTime = new Date(a.ends_at);

      const artworkResult = await pool.query(
        `SELECT aw.id, aw.title, aw.image_url, aw.medium,
                aw.dimensions_width_cm, aw.dimensions_height_cm,
                aw.starting_bid_amount,
                (SELECT MAX(bid_amount) FROM bids
                 WHERE artwork_id = aw.id AND bid_status = 'ACTIVE') AS current_high_bid
         FROM   artwork aw
         WHERE  aw.auction_id = $1
           AND  aw.deleted_at IS NULL
           AND  aw.artwork_status = 'APPROVED'
         ORDER  BY aw.created_at ASC`,
        [auctionId]
      );

      return res.json({
        success: true,
        auction: {
          title:        a.title,
          description:  a.description,
          status:       a.auction_status,
          startTime:    a.starts_at,
          endTime:      a.ends_at,
          timeRemaining: Math.max(0, endTime - now),
          isActive:     a.auction_status === 'LIVE' && endTime > now,
          schoolId:     a.school_id,
          schoolName:   a.school_name || null,
          totalBids:    0
        },
        artworks: artworkResult.rows.map(aw => ({
          id:            aw.id,
          artworkId:     aw.id,  // consistent with authenticated endpoint
          title:         aw.title,
          imageUrl:      aw.image_url,
          medium:        aw.medium || null,
          dimensions:    (aw.dimensions_width_cm && aw.dimensions_height_cm)
            ? `${aw.dimensions_width_cm} × ${aw.dimensions_height_cm} cm`
            : null,
          startingPrice: aw.starting_bid_amount,
          currentBid:    aw.current_high_bid || null,
          bidCount:      null
        }))
      });
    } catch (error) {
      console.error('Error retrieving public auction:', error);
      return res.status(500).json({ success: false, message: 'Failed to load auction' });
    }
  }

  /**
   * GET /api/auctions/:auctionId
   * Get auction details
   * VISIBILITY: Filtered by user role (SITE_ADMIN > SCHOOL_ADMIN > TEACHER > STUDENT)
   */
  async getAuction(req, res) {
    try {
      const { auctionId } = req.params;

      const result = await auctionService.getAuction(auctionId);

      // ===== CRITICAL: Apply visibility filtering =====
      if (!roleHierarchyUtils.canViewAuction(req.user, result)) {
        return res.status(403).json({
          success: false,
          message: 'You do not have permission to view this auction'
        });
      }

      return res.status(200).json({
        success: true,
        auction: result
      });
    } catch (error) {
      console.error('Error retrieving auction:', error);
      return res.status(404).json({
        success: false,
        message: error.message || 'Auction not found'
      });
    }
  }

  /**
   * PUT /api/auctions/:auctionId
   * Update auction details
   */
  async updateAuction(req, res) {
    try {
      const { auctionId } = req.params;

      // Validate user role
      if (!['SITE_ADMIN', 'SCHOOL_ADMIN', 'TEACHER'].includes(req.user?.role)) {
        return res.status(403).json({
          success: false,
          message: 'You do not have permission to update auctions'
        });
      }

      // Teachers may only update their own DRAFT auctions
      if (req.user.role === 'TEACHER') {
        const ownerCheck = await pool.query(
          'SELECT created_by_user_id, auction_status FROM auctions WHERE id = $1',
          [auctionId]
        );
        if (ownerCheck.rows.length === 0) {
          return res.status(404).json({ success: false, message: 'Auction not found' });
        }
        const row = ownerCheck.rows[0];
        if (row.created_by_user_id !== req.user.id) {
          return res.status(403).json({ success: false, message: 'You can only edit your own auctions' });
        }
        if (row.auction_status !== 'DRAFT') {
          return res.status(403).json({ success: false, message: 'Only draft auctions can be edited' });
        }
      }

      const result = await auctionService.updateAuction(auctionId, req.body);

      return res.status(200).json(result);
    } catch (error) {
      console.error('Error updating auction:', error);
      return res.status(400).json({
        success: false,
        message: error.message || 'Error updating auction'
      });
    }
  }

  /**
   * POST /api/auctions/:auctionId/start
   * Start an auction (draft -> active)
   */
  async startAuction(req, res) {
    try {
      const { auctionId } = req.params;

      // Validate user is admin or school admin
      if (!['SITE_ADMIN', 'SCHOOL_ADMIN'].includes(req.user?.role)) {
        return res.status(403).json({
          success: false,
          message: 'Only admins can start auctions'
        });
      }

      const result = await auctionService.startAuction(auctionId);

      return res.status(200).json(result);
    } catch (error) {
      console.error('Error starting auction:', error);
      return res.status(400).json({
        success: false,
        message: error.message || 'Error starting auction'
      });
    }
  }

  /**
   * POST /api/auctions/:auctionId/end
   * End an auction and determine winner
   */
  async endAuction(req, res) {
    try {
      const { auctionId } = req.params;

      // Validate user is admin or school admin
      if (!['SITE_ADMIN', 'SCHOOL_ADMIN'].includes(req.user?.role)) {
        return res.status(403).json({
          success: false,
          message: 'Only admins can end auctions'
        });
      }

      const result = await auctionService.endAuction(auctionId);

      return res.status(200).json(result);
    } catch (error) {
      console.error('Error ending auction:', error);
      return res.status(400).json({
        success: false,
        message: error.message || 'Error ending auction'
      });
    }
  }

  /**
   * POST /api/auctions/:auctionId/extend
   * Auto-extend auction end time
   */
  async extendAuction(req, res) {
    try {
      const { auctionId } = req.params;
      const { minutesToExtend } = req.body;

      // Validate user is admin or school admin
      if (!['SITE_ADMIN', 'SCHOOL_ADMIN'].includes(req.user?.role)) {
        return res.status(403).json({
          success: false,
          message: 'Only admins can extend auctions'
        });
      }

      const result = await auctionService.autoExtendAuction(auctionId, minutesToExtend);

      return res.status(200).json(result);
    } catch (error) {
      console.error('Error extending auction:', error);
      return res.status(400).json({
        success: false,
        message: error.message || 'Error extending auction'
      });
    }
  }

  /**
   * DELETE /api/auctions/:auctionId
   * Delete a draft auction
   */
  async deleteAuction(req, res) {
    try {
      const { auctionId } = req.params;

      // Validate user is admin or school admin
      if (!['SITE_ADMIN', 'SCHOOL_ADMIN'].includes(req.user?.role)) {
        return res.status(403).json({
          success: false,
          message: 'Only admins can delete auctions'
        });
      }

      const result = await auctionService.deleteAuction(auctionId);

      return res.status(200).json(result);
    } catch (error) {
      console.error('Error deleting auction:', error);
      return res.status(400).json({
        success: false,
        message: error.message || 'Error deleting auction'
      });
    }
  }

  /**
   * GET /api/auctions
   * List auctions with filtering and pagination
   * VISIBILITY: Filtered by user role
   * - SITE_ADMIN: all auctions
   * - SCHOOL_ADMIN: own school only
   * - TEACHER: approved auctions in own school
   * - STUDENT/BIDDER: approved auctions in own school
   */
  async listAuctions(req, res) {
    try {
      const { status, schoolId, limit = 20, offset = 0, sortBy, sortOrder } = req.query;

      const result = await auctionService.listAuctions({
        status,
        schoolId,
        limit: parseInt(limit),
        offset: parseInt(offset),
        sortBy,
        sortOrder
      });

      // ===== CRITICAL: Apply role-based visibility filtering =====
      let filteredAuctions;
      if (req.user) {
        filteredAuctions = roleHierarchyUtils.filterAuctionsByRole(
          req.user,
          result.auctions || []
        );
      } else {
        // Unauthenticated public access: show only APPROVED/LIVE auctions
        filteredAuctions = (result.auctions || []).filter(a =>
          ['APPROVED', 'LIVE'].includes(a.auction_status || a.status)
        );
      }

      return res.status(200).json({
        success: true,
        count: filteredAuctions.length,
        total: result.total,
        auctions: filteredAuctions
      });
    } catch (error) {
      console.error('Error listing auctions:', error);
      return res.status(400).json({
        success: false,
        message: error.message || 'Error listing auctions'
      });
    }
  }

  /**
   * GET /api/auctions/active/list
   * Get all currently active auctions
   */
  async getActiveAuctions(req, res) {
    try {
      const result = await auctionService.getActiveAuctions();

      return res.status(200).json({
        success: true,
        count: result.length,
        auctions: result
      });
    } catch (error) {
      console.error('Error retrieving active auctions:', error);
      return res.status(400).json({
        success: false,
        message: error.message || 'Error retrieving active auctions'
      });
    }
  }

  /**
   * GET /api/auctions/:auctionId/winner
   * Get auction winner information
   */
  async getAuctionWinner(req, res) {
    try {
      const { auctionId } = req.params;

      const result = await auctionService.getAuctionWinner(auctionId);

      return res.status(200).json(result);
    } catch (error) {
      console.error('Error retrieving auction winner:', error);
      return res.status(404).json({
        success: false,
        message: error.message || 'Auction not found'
      });
    }
  }

  /**
   * GET /api/auctions/:auctionId/bids
   * Get all bids across every artwork in an auction (recent bids sidebar)
   * Access: any authenticated user in the auction's school (SITE_ADMIN: all)
   */
  async getBidsForAuction(req, res) {
    try {
      const { auctionId } = req.params;

      // Verify auction exists and get school
      const auctionResult = await pool.query(
        'SELECT id, school_id FROM auctions WHERE id = $1',
        [auctionId]
      );
      if (auctionResult.rows.length === 0) {
        return res.status(404).json({ success: false, message: 'Auction not found' });
      }
      const auction = auctionResult.rows[0];

      // School-scoped access: non-SITE_ADMINs must belong to the auction's school
      if (req.user.role !== 'SITE_ADMIN' && req.user.schoolId !== auction.school_id) {
        return res.status(403).json({ success: false, message: 'You do not have permission to view bids for this auction' });
      }

      const bidsResult = await pool.query(
        `SELECT b.id, b.artwork_id, aw.title AS artwork_title,
                b.bid_amount, b.placed_at,
                u.first_name, u.last_name
         FROM bids b
         JOIN artwork aw ON aw.id = b.artwork_id
         JOIN users u ON u.id = b.placed_by_user_id
         WHERE aw.auction_id = $1 AND b.bid_status = 'ACTIVE'
         ORDER BY b.placed_at DESC
         LIMIT 50`,
        [auctionId]
      );

      return res.status(200).json({
        success: true,
        bids: bidsResult.rows.map(row => ({
          id: row.id,
          artworkId: row.artwork_id,
          artworkTitle: row.artwork_title,
          bidderName: `${row.first_name} ${row.last_name}`,
          amount: row.bid_amount,
          createdAt: row.placed_at
        }))
      });
    } catch (error) {
      console.error('Error retrieving bids for auction:', error);
      return res.status(500).json({ success: false, message: error.message || 'Error retrieving bids' });
    }
  }

  /**
   * GET /api/auctions/:auctionId/artwork
   * Get all artwork in an auction
   * VISIBILITY: Filtered by approval status
   * - SITE_ADMIN/SCHOOL_ADMIN: all artwork
   * - TEACHER: own submissions + approved artwork
   * - STUDENT/BIDDER: approved artwork only
   */
  async getAuctionArtwork(req, res) {
    try {
      const { auctionId } = req.params;

      const result = await pool.query(
        `SELECT a.*, au.school_id,
                (SELECT MAX(bid_amount) FROM bids WHERE artwork_id = a.id AND bid_status = 'ACTIVE') as current_bid,
                (SELECT COUNT(*) FROM bids WHERE artwork_id = a.id AND bid_status = 'ACTIVE') as bid_count
         FROM artwork a
         JOIN auctions au ON au.id = a.auction_id
         WHERE a.auction_id = $1
           AND a.deleted_at IS NULL
         ORDER BY a.created_at ASC`,
        [auctionId]
      );

      if (result.rows.length === 0) {
        return res.status(404).json({
          success: false,
          message: 'No artwork found for this auction'
        });
      }

      // ===== CRITICAL: Filter artwork by role + approval status =====
      const filteredArtwork = roleHierarchyUtils.filterArtworkByRole(
        req.user,
        result.rows
      );

      // ===== CRITICAL: Sanitize sensitive fields for STUDENT/BIDDER =====
      const sanitizedArtwork = roleHierarchyUtils.sanitizeArrayByRole(
        filteredArtwork,
        req.user.role
      );

      return res.status(200).json({
        success: true,
        count: sanitizedArtwork.length,
        artwork: sanitizedArtwork.map(piece => ({
          id: piece.id,         // used by submitBid (this.currentPiece?.id)
          artworkId: piece.id,  // kept for any callers using the old key
          title: piece.title,
          description: piece.description,
          imageUrl: piece.image_url,
          medium: piece.medium || null,
          dimensions: (piece.dimensions_width_cm && piece.dimensions_height_cm)
            ? `${piece.dimensions_width_cm} × ${piece.dimensions_height_cm} cm`
            : null,
          startingPrice: piece.starting_bid_amount,
          currentBid: piece.current_bid,
          bidCount: parseInt(piece.bid_count),
          artistName: piece.artist_name,
          createdByUserId: piece.created_by_user_id
        }))
      });
    } catch (error) {
      console.error('Error retrieving auction artwork:', error);
      return res.status(400).json({
        success: false,
        message: error.message || 'Error retrieving auction artwork'
      });
    }
  }
}

module.exports = new AuctionController();
