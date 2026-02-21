/**
 * Admin Routes - Section 8
 * All routes require SITE_ADMIN or SCHOOL_ADMIN role
 * All routes log administrative actions via adminService
 */

const express = require('express');
const router = express.Router();
const adminController = require('../controllers/adminController');
const { verifyToken, verifyRole } = require('../middleware/authMiddleware');

/**
 * CRITICAL: All admin routes require:
 * 1. verifyToken (JWT validation)
 * 2. verifyRole(['SITE_ADMIN', 'SCHOOL_ADMIN']) (RBAC check)
 */

// ============================================================================
// User Management Routes (5 routes)
// ============================================================================

/**
 * GET /api/admin/users/:userId
 * Get user details
 * RBAC: SITE_ADMIN (all users), SCHOOL_ADMIN (own school)
 */
router.get(
  '/users/:userId',
  verifyToken,
  verifyRole(['SITE_ADMIN', 'SCHOOL_ADMIN']),
  adminController.getUserById
);

/**
 * GET /api/admin/users
 * List users with pagination
 * Query: role, status, search, page, limit
 */
router.get(
  '/users',
  verifyToken,
  verifyRole(['SITE_ADMIN', 'SCHOOL_ADMIN']),
  adminController.listUsers
);

/**
 * PUT /api/admin/users/:userId/profile
 * Update user name and/or email
 * Body: { firstName?, lastName?, email? }
 * RBAC: SITE_ADMIN (any user), SCHOOL_ADMIN (own school)
 */
router.put(
  '/users/:userId/profile',
  verifyToken,
  verifyRole(['SITE_ADMIN', 'SCHOOL_ADMIN']),
  adminController.updateUserProfile
);

/**
 * PUT /api/admin/users/:userId/status
 * Change account status
 * Body: { newStatus: 'ACTIVE' | 'SUSPENDED' | 'INACTIVE' }
 * RBAC: SITE_ADMIN (any user), SCHOOL_ADMIN (own school)
 */
router.put(
  '/users/:userId/status',
  verifyToken,
  verifyRole(['SITE_ADMIN', 'SCHOOL_ADMIN']),
  adminController.updateUserStatus
);

/**
 * POST /api/admin/users/:userId/reset-mfa
 * Reset user MFA (clears 2FA secret and backup codes)
 * RBAC: SITE_ADMIN only
 */
router.post(
  '/users/:userId/reset-mfa',
  verifyToken,
  verifyRole(['SITE_ADMIN']),
  adminController.resetUserMFA
);

/**
 * PUT /api/admin/users/:userId/role
 * Change user role
 * Body: { newRole: 'SITE_ADMIN' | 'SCHOOL_ADMIN' | 'TEACHER' | 'STUDENT' | 'BIDDER' }
 * RBAC: SITE_ADMIN only
 */
router.put(
  '/users/:userId/role',
  verifyToken,
  verifyRole(['SITE_ADMIN']),
  adminController.updateUserRole
);

/**
 * DELETE /api/admin/users/:userId
 * Deactivate user (soft delete)
 * Body: { reason: 'string' }
 */
router.delete(
  '/users/:userId',
  verifyToken,
  verifyRole(['SITE_ADMIN', 'SCHOOL_ADMIN']),
  adminController.deactivateUser
);

/**
 * GET /api/admin/users/:userId/data
 * Export user data (GDPR format)
 * Returns: JSON file download
 */
router.get(
  '/users/:userId/data',
  verifyToken,
  verifyRole(['SITE_ADMIN']),
  adminController.exportUserData
);

// ============================================================================
// Auction Management Routes (7 routes)
// ============================================================================

/**
 * GET /api/admin/auctions/:auctionId
 * Get auction details
 */
router.get(
  '/auctions/:auctionId',
  verifyToken,
  verifyRole(['SITE_ADMIN', 'SCHOOL_ADMIN']),
  adminController.getAuctionById
);

/**
 * GET /api/admin/auctions
 * List auctions by status
 * Query: status (DRAFT, PENDING_APPROVAL, APPROVED, LIVE, CLOSED, CANCELLED)
 */
router.get(
  '/auctions',
  verifyToken,
  verifyRole(['SITE_ADMIN', 'SCHOOL_ADMIN']),
  adminController.listAuctionsByStatus
);

/**
 * DELETE /api/admin/auctions/:auctionId
 * Soft-delete a DRAFT, CANCELLED, or ENDED auction
 */
router.delete(
  '/auctions/:auctionId',
  verifyToken,
  verifyRole(['SITE_ADMIN', 'SCHOOL_ADMIN']),
  adminController.deleteAuction
);

/**
 * POST /api/admin/auctions/:auctionId/approve
 * Approve auction (PENDING_APPROVAL -> APPROVED)
 */
router.post(
  '/auctions/:auctionId/approve',
  verifyToken,
  verifyRole(['SITE_ADMIN', 'SCHOOL_ADMIN']),
  adminController.approveAuction
);

/**
 * POST /api/admin/auctions/:auctionId/reject
 * Reject auction (PENDING_APPROVAL -> REJECTED)
 * Body: { reason: 'string' }
 */
router.post(
  '/auctions/:auctionId/reject',
  verifyToken,
  verifyRole(['SITE_ADMIN', 'SCHOOL_ADMIN']),
  adminController.rejectAuction
);

/**
 * PUT /api/admin/auctions/:auctionId/fee
 * Set custom auction fee
 * Body: { feePercent: number (0-100) }
 */
router.put(
  '/auctions/:auctionId/fee',
  verifyToken,
  verifyRole(['SITE_ADMIN', 'SCHOOL_ADMIN']),
  adminController.setAuctionFee
);

/**
 * PUT /api/admin/auctions/:auctionId/extend
 * Extend auction end time
 * Body: { hours: number (1-720) }
 */
router.put(
  '/auctions/:auctionId/extend',
  verifyToken,
  verifyRole(['SITE_ADMIN', 'SCHOOL_ADMIN']),
  adminController.extendAuction
);

/**
 * POST /api/admin/auctions/:auctionId/close
 * Force close auction
 * Body: { reason: 'string' }
 */
router.post(
  '/auctions/:auctionId/close',
  verifyToken,
  verifyRole(['SITE_ADMIN', 'SCHOOL_ADMIN']),
  adminController.closeForcibly
);

// ============================================================================
// Payment Management Routes (4 routes)
// ============================================================================

/**
 * GET /api/admin/payments/:paymentId
 * Get payment details
 */
router.get(
  '/payments/:paymentId',
  verifyToken,
  verifyRole(['SITE_ADMIN', 'SCHOOL_ADMIN']),
  adminController.getPaymentById
);

/**
 * GET /api/admin/payments
 * List payments with filtering
 * Query: status, gateway, minAmount, maxAmount, page, limit
 */
router.get(
  '/payments',
  verifyToken,
  verifyRole(['SITE_ADMIN', 'SCHOOL_ADMIN']),
  adminController.listPayments
);

/**
 * POST /api/admin/payments/:paymentId/refund
 * Process refund
 * Body: { amount: number, reason: 'string' }
 */
router.post(
  '/payments/:paymentId/refund',
  verifyToken,
  verifyRole(['SITE_ADMIN', 'SCHOOL_ADMIN']),
  adminController.processRefund
);

/**
 * GET /api/admin/payments/statistics
 * Get payment statistics
 * Query: period (day, week, month, year)
 */
router.get(
  '/payments/statistics',
  verifyToken,
  verifyRole(['SITE_ADMIN', 'SCHOOL_ADMIN']),
  adminController.getPaymentStatistics
);

// ============================================================================
// Compliance Reporting Routes (4 routes)
// ============================================================================

/**
 * GET /api/admin/reports/gdpr
 * Generate GDPR compliance report
 * Query: startDate, endDate, schoolId (optional)
 * Returns: GDPR audit report with user deletion/export counts
 */
router.get(
  '/reports/gdpr',
  verifyToken,
  verifyRole(['SITE_ADMIN', 'SCHOOL_ADMIN']),
  adminController.generateGDPRReport
);

/**
 * GET /api/admin/reports/coppa
 * Generate COPPA compliance report
 * Query: startDate, endDate, schoolId (optional)
 * Returns: COPPA audit report with minor user and consent counts
 */
router.get(
  '/reports/coppa',
  verifyToken,
  verifyRole(['SITE_ADMIN', 'SCHOOL_ADMIN']),
  adminController.generateCOPPAReport
);

/**
 * GET /api/admin/reports/ferpa
 * Generate FERPA compliance report
 * Query: startDate, endDate, schoolId (optional)
 * Returns: FERPA audit report with student data access logs
 */
router.get(
  '/reports/ferpa',
  verifyToken,
  verifyRole(['SITE_ADMIN', 'SCHOOL_ADMIN']),
  adminController.generateFERPAReport
);

/**
 * GET /api/admin/reports/ccpa
 * Generate CCPA compliance report
 * Query: startDate, endDate, schoolId (optional)
 * Returns: CCPA audit report with deletion and opt-out requests
 */
router.get(
  '/reports/ccpa',
  verifyToken,
  verifyRole(['SITE_ADMIN', 'SCHOOL_ADMIN']),
  adminController.generateCCPAReport
);

// ============================================================================
// Dashboard & Monitoring Routes (3 routes)
// ============================================================================

/**
 * GET /api/admin/audit-logs
 * Get audit logs with filtering
 * Query: adminId, action, resourceType, startDate, endDate, page, limit
 * Returns: Paginated audit log entries
 */
router.get(
  '/audit-logs',
  verifyToken,
  verifyRole(['SITE_ADMIN', 'SCHOOL_ADMIN']),
  adminController.getAuditLogs
);

/**
 * GET /api/admin/dashboard/stats
 * Get dashboard statistics
 * Query: schoolId (optional, defaults to user's school)
 * Returns: { activeAuctions, pendingApprovals, dailyRevenue, totalUsers, totalStudents }
 */
router.get(
  '/dashboard/stats',
  verifyToken,
  verifyRole(['SITE_ADMIN', 'SCHOOL_ADMIN']),
  adminController.getDashboardStats
);

/**
 * GET /api/admin/dashboard/health
 * Get system health status
 * Returns: { database: 'HEALTHY'|'UNHEALTHY', timestamp, responseTime }
 */
router.get(
  '/dashboard/health',
  verifyToken,
  verifyRole(['SITE_ADMIN', 'SCHOOL_ADMIN']),
  adminController.getSystemHealth
);

// ============================================================================
// Payment Gateway Management
// ============================================================================

/**
 * POST /api/admin/schools/:schoolId/test-gateway
 * Set up a dummy test payment gateway for a school so auctions can be created
 * during development/testing without a real payment processor.
 * RBAC: SITE_ADMIN only (or SCHOOL_ADMIN for their own school)
 */
router.post(
  '/schools/:schoolId/test-gateway',
  verifyToken,
  verifyRole(['SITE_ADMIN', 'SCHOOL_ADMIN']),
  async (req, res) => {
    try {
      const { pool } = require('../models/index');
      const { schoolId } = req.params;

      // SCHOOL_ADMIN may only set up a gateway for their own school
      if (req.user.role === 'SCHOOL_ADMIN') {
        const userSchoolId = req.user.schoolId || req.user.school_id;
        if (userSchoolId !== schoolId) {
          return res.status(403).json({ success: false, message: 'You can only manage gateways for your own school.' });
        }
      }

      // Verify school exists
      const schoolResult = await pool.query('SELECT id, name FROM schools WHERE id = $1', [schoolId]);
      if (schoolResult.rows.length === 0) {
        return res.status(404).json({ success: false, message: 'School not found.' });
      }

      // Return existing if already configured
      const existing = await pool.query(
        'SELECT id FROM payment_gateways WHERE school_id = $1 AND is_active = TRUE LIMIT 1',
        [schoolId]
      );
      if (existing.rows.length > 0) {
        return res.json({
          success: true,
          message: 'A payment gateway is already configured for this school.',
          gatewayId: existing.rows[0].id,
          alreadyExisted: true
        });
      }

      // Insert dummy test gateway
      const result = await pool.query(
        `INSERT INTO payment_gateways (
           school_id, gateway_type, gateway_name,
           api_key_encrypted, api_secret_encrypted,
           is_active, is_primary, currency_code,
           created_by_user_id
         ) VALUES ($1, $2, $3, $4, $5, TRUE, TRUE, 'USD', $6)
         RETURNING id`,
        [
          schoolId,
          'STRIPE',
          'Test Gateway — NOT for real payments',
          'test_dummy_key_not_for_production',
          'test_dummy_secret_not_for_production',
          req.user.id
        ]
      );

      return res.status(201).json({
        success: true,
        message: 'Test payment gateway created. Auctions can now be created for this school.',
        gatewayId: result.rows[0].id
      });
    } catch (error) {
      console.error('Error setting up test gateway:', error);
      return res.status(500).json({ success: false, message: error.message });
    }
  }
);

/**
 * GET /api/admin/schools/:schoolId/gateways
 * List payment gateways configured for a school
 */
router.get(
  '/schools/:schoolId/gateways',
  verifyToken,
  verifyRole(['SITE_ADMIN', 'SCHOOL_ADMIN']),
  async (req, res) => {
    try {
      const { pool } = require('../models/index');
      const { schoolId } = req.params;
      const result = await pool.query(
        `SELECT id, gateway_type, gateway_name, is_active, is_primary, currency_code, created_at
         FROM payment_gateways WHERE school_id = $1 ORDER BY is_primary DESC, created_at DESC`,
        [schoolId]
      );
      return res.json({ success: true, gateways: result.rows });
    } catch (error) {
      return res.status(500).json({ success: false, message: error.message });
    }
  }
);

// ============================================================================
// Route Summary (15 routes)
// ============================================================================

/*
  USER MANAGEMENT (5 routes):
  - GET    /api/admin/users/:userId
  - GET    /api/admin/users
  - PUT    /api/admin/users/:userId/role
  - DELETE /api/admin/users/:userId
  - GET    /api/admin/users/:userId/data

  AUCTION MANAGEMENT (7 routes):
  - GET    /api/admin/auctions/:auctionId
  - GET    /api/admin/auctions
  - POST   /api/admin/auctions/:auctionId/approve
  - POST   /api/admin/auctions/:auctionId/reject
  - PUT    /api/admin/auctions/:auctionId/fee
  - PUT    /api/admin/auctions/:auctionId/extend
  - POST   /api/admin/auctions/:auctionId/close

  PAYMENT MANAGEMENT (4 routes):
  - GET    /api/admin/payments/:paymentId
  - GET    /api/admin/payments
  - POST   /api/admin/payments/:paymentId/refund
  - GET    /api/admin/payments/statistics

  COMPLIANCE REPORTING (4 routes):
  - GET    /api/admin/reports/gdpr
  - GET    /api/admin/reports/coppa
  - GET    /api/admin/reports/ferpa
  - GET    /api/admin/reports/ccpa

  DASHBOARD & MONITORING (3 routes):
  - GET    /api/admin/audit-logs
  - GET    /api/admin/dashboard/stats
  - GET    /api/admin/dashboard/health
*/

module.exports = router;
