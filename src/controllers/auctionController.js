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

      // Validate user is admin or school admin
      if (!['SITE_ADMIN', 'SCHOOL_ADMIN'].includes(req.user?.role)) {
        return res.status(403).json({
          success: false,
          message: 'Only admins can create auctions'
        });
      }

      const resolvedSchoolId = schoolId || req.user.schoolId || req.user.school_id;

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
          message: 'No payment gateway configured for this school. Please set up a payment gateway first.'
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

      // Validate user is admin or school admin
      if (!['SITE_ADMIN', 'SCHOOL_ADMIN'].includes(req.user?.role)) {
        return res.status(403).json({
          success: false,
          message: 'Only admins can update auctions'
        });
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
      const filteredAuctions = roleHierarchyUtils.filterAuctionsByRole(
        req.user,
        result.auctions || []
      );

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
        `SELECT a.*,
                (SELECT MAX(bid_amount) FROM bids WHERE artwork_id = a.id AND bid_status = 'ACTIVE') as current_bid,
                (SELECT COUNT(*) FROM bids WHERE artwork_id = a.id AND bid_status = 'ACTIVE') as bid_count
         FROM artwork a
         WHERE a.auction_id = $1
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
          artworkId: piece.id,
          title: piece.title,
          description: piece.description,
          imageUrl: piece.image_url,
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
