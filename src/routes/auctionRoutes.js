/**
 * Auction Routes
 * Defines all auction-related REST API endpoints
 */

const express = require('express');
const router = express.Router();
const auctionController = require('../controllers/auctionController');
const authMiddleware = require('../middleware/authMiddleware');

/**
 * POST /api/auctions
 * Create a new auction
 * Access: site_admin, school_admin only
 */
router.post(
  '/',
  authMiddleware.verifyToken,
  authMiddleware.requireRole(['site_admin', 'school_admin']),
  (req, res) => auctionController.createAuction(req, res)
);

/**
 * GET /api/auctions
 * List auctions with filtering and pagination
 * Query params: status, schoolId, limit, offset, sortBy, sortOrder
 * Access: Public (authenticated users)
 */
router.get(
  '/',
  authMiddleware.verifyToken,
  (req, res) => auctionController.listAuctions(req, res)
);

/**
 * GET /api/auctions/active/list
 * Get all currently active auctions
 * Access: Public (authenticated users)
 */
router.get(
  '/active/list',
  authMiddleware.verifyToken,
  (req, res) => auctionController.getActiveAuctions(req, res)
);

/**
 * GET /api/auctions/:auctionId
 * Get auction details
 * Access: Public (authenticated users)
 */
router.get(
  '/:auctionId',
  authMiddleware.verifyToken,
  (req, res) => auctionController.getAuction(req, res)
);

/**
 * GET /api/auctions/:auctionId/artwork
 * Get all artwork in an auction
 * Access: Public (authenticated users)
 */
router.get(
  '/:auctionId/artwork',
  authMiddleware.verifyToken,
  (req, res) => auctionController.getAuctionArtwork(req, res)
);

/**
 * GET /api/auctions/:auctionId/winner
 * Get auction winner information
 * Access: Public (authenticated users)
 */
router.get(
  '/:auctionId/winner',
  authMiddleware.verifyToken,
  (req, res) => auctionController.getAuctionWinner(req, res)
);

/**
 * PUT /api/auctions/:auctionId
 * Update auction details (draft auctions only)
 * Access: site_admin, school_admin only
 */
router.put(
  '/:auctionId',
  authMiddleware.verifyToken,
  authMiddleware.requireRole(['site_admin', 'school_admin']),
  (req, res) => auctionController.updateAuction(req, res)
);

/**
 * POST /api/auctions/:auctionId/start
 * Start an auction (move from draft to active)
 * Access: site_admin, school_admin only
 */
router.post(
  '/:auctionId/start',
  authMiddleware.verifyToken,
  authMiddleware.requireRole(['site_admin', 'school_admin']),
  (req, res) => auctionController.startAuction(req, res)
);

/**
 * POST /api/auctions/:auctionId/end
 * End an auction and determine winner
 * Access: site_admin, school_admin only
 */
router.post(
  '/:auctionId/end',
  authMiddleware.verifyToken,
  authMiddleware.requireRole(['site_admin', 'school_admin']),
  (req, res) => auctionController.endAuction(req, res)
);

/**
 * POST /api/auctions/:auctionId/extend
 * Manually extend auction end time
 * Access: site_admin, school_admin only
 */
router.post(
  '/:auctionId/extend',
  authMiddleware.verifyToken,
  authMiddleware.requireRole(['site_admin', 'school_admin']),
  (req, res) => auctionController.extendAuction(req, res)
);

/**
 * DELETE /api/auctions/:auctionId
 * Delete a draft auction
 * Access: site_admin, school_admin only
 */
router.delete(
  '/:auctionId',
  authMiddleware.verifyToken,
  authMiddleware.requireRole(['site_admin', 'school_admin']),
  (req, res) => auctionController.deleteAuction(req, res)
);

module.exports = router;
