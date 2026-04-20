/**
 * Admin Routes - Section 8
 * All routes require SITE_ADMIN or SCHOOL_ADMIN role
 * All routes log administrative actions via adminService
 */

const express = require('express');
const router = express.Router();
const adminController = require('../controllers/adminController');
const { verifyToken, verifyRole, requireAdmin2fa } = require('../middleware/authMiddleware');
const { SessionService, tokenBlacklist } = require('../services/authenticationService');

// Lazily-resolved session service — pool is not available at module load time
// so we instantiate on first use inside route handlers.
let _adminSessionService = null;
function getAdminSessionService() {
  if (!_adminSessionService) {
    const { pool } = require('../models/index');
    _adminSessionService = new SessionService({ db: pool });
  }
  return _adminSessionService;
}

/**
 * CRITICAL: All admin routes require:
 * 1. verifyToken (JWT validation)
 * 2. requireAdmin2fa (2FA enforcement — blocks admins whose token predates 2FA setup)
 * 3. verifyRole(['SITE_ADMIN', 'SCHOOL_ADMIN']) (RBAC check)
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
  requireAdmin2fa,
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
  requireAdmin2fa,
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
  requireAdmin2fa,
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
  requireAdmin2fa,
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
  requireAdmin2fa,
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
  requireAdmin2fa,
  verifyRole(['SITE_ADMIN']),
  adminController.updateUserRole
);

/**
 * POST /api/admin/users/:userId/reset-password
 * Admin-triggered password reset — returns reset URL for the admin to relay
 * RBAC: SITE_ADMIN or SCHOOL_ADMIN (own school)
 */
router.post(
  '/users/:userId/reset-password',
  verifyToken,
  requireAdmin2fa,
  verifyRole(['SITE_ADMIN', 'SCHOOL_ADMIN']),
  adminController.resetUserPassword
);

/**
 * DELETE /api/admin/users/:userId/permanent
 * Permanently delete a user account (sets deleted_at, cannot be undone)
 * RBAC: SITE_ADMIN only
 */
router.delete(
  '/users/:userId/permanent',
  verifyToken,
  requireAdmin2fa,
  verifyRole(['SITE_ADMIN']),
  adminController.deleteUser
);

/**
 * DELETE /api/admin/users/:userId
 * Deactivate user (soft delete)
 * Body: { reason: 'string' }
 */
router.delete(
  '/users/:userId',
  verifyToken,
  requireAdmin2fa,
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
  requireAdmin2fa,
  verifyRole(['SITE_ADMIN']),
  adminController.exportUserData
);

// ============================================================================
// Auction Management Routes (7 routes)
// ============================================================================

/**
 * GET /api/admin/auctions/search?q=
 * Search auctions by title or school name
 * SITE_ADMIN: all schools; SCHOOL_ADMIN: own school only
 * Must be declared before /auctions/:auctionId to avoid param capture
 */
router.get(
  '/auctions/search',
  verifyToken,
  requireAdmin2fa,
  verifyRole(['SITE_ADMIN', 'SCHOOL_ADMIN']),
  adminController.searchAuctions
);

/**
 * GET /api/admin/auctions/:auctionId
 * Get auction details
 */
router.get(
  '/auctions/:auctionId',
  verifyToken,
  requireAdmin2fa,
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
  requireAdmin2fa,
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
  requireAdmin2fa,
  verifyRole(['SITE_ADMIN', 'SCHOOL_ADMIN']),
  adminController.deleteAuction
);

/**
 * POST /api/admin/auctions/:auctionId/approve
 * Approve auction (DRAFT or PENDING_APPROVAL -> APPROVED)
 */
router.post(
  '/auctions/:auctionId/approve',
  verifyToken,
  requireAdmin2fa,
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
  requireAdmin2fa,
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
  requireAdmin2fa,
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
  requireAdmin2fa,
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
  requireAdmin2fa,
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
  requireAdmin2fa,
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
  requireAdmin2fa,
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
  requireAdmin2fa,
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
  requireAdmin2fa,
  verifyRole(['SITE_ADMIN', 'SCHOOL_ADMIN']),
  adminController.getPaymentStatistics
);

// ============================================================================
// Compliance Reporting Routes (4 routes)
// ============================================================================

/**
 * GET /api/admin/reports
 * Lightweight summary of all compliance report types
 * Must be declared before /reports/:type to avoid param capture
 */
router.get(
  '/reports',
  verifyToken,
  requireAdmin2fa,
  verifyRole(['SITE_ADMIN', 'SCHOOL_ADMIN']),
  adminController.getReportsSummary
);

/**
 * GET /api/admin/reports/gdpr
 * Generate GDPR compliance report
 * Query: startDate, endDate, schoolId (optional)
 * Returns: GDPR audit report with user deletion/export counts
 */
router.get(
  '/reports/gdpr',
  verifyToken,
  requireAdmin2fa,
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
  requireAdmin2fa,
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
  requireAdmin2fa,
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
  requireAdmin2fa,
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
  requireAdmin2fa,
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
  requireAdmin2fa,
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
  requireAdmin2fa,
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
  requireAdmin2fa,
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
  requireAdmin2fa,
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
// Fulfillment Management
// ============================================================================

const { getSharedEmailProvider, notifyArtworkShipped } = require('../services/notificationService');

/**
 * GET /api/admin/wins
 * List all unshipped (and recently shipped) wins, school-scoped for SCHOOL_ADMIN.
 * Query params: ?status=unshipped|all  (default: unshipped)
 */
router.get(
  '/wins',
  verifyToken,
  requireAdmin2fa,
  verifyRole(['SITE_ADMIN', 'SCHOOL_ADMIN']),
  async (req, res) => {
    try {
      const { pool } = require('../models/index');
      const adminRole     = req.user.role;
      const adminSchoolId = req.user.schoolId;
      const showAll       = req.query.status === 'all';

      const schoolFilter = adminRole === 'SCHOOL_ADMIN'
        ? `AND a.school_id = '${adminSchoolId}'`
        : '';
      const shippedFilter = showAll ? '' : 'AND b.shipped_at IS NULL';

      const result = await pool.query(
        `SELECT b.id              AS "bidId",
                b.bid_amount      AS "winningBid",
                b.shipped_at      AS "shippedAt",
                b.tracking_carrier AS "trackingCarrier",
                b.tracking_number  AS "trackingNumber",
                b.delivered_at    AS "deliveredAt",
                b.fulfillment_notes AS "fulfillmentNotes",
                aw.id             AS "artworkId",
                aw.title          AS "artworkTitle",
                a.id              AS "auctionId",
                a.title           AS "auctionTitle",
                a.school_id       AS "schoolId",
                u.id              AS "winnerId",
                u.first_name      AS "winnerFirstName",
                u.last_name       AS "winnerLastName",
                u.email           AS "winnerEmail"
         FROM   bids b
         JOIN   auctions a  ON  a.id = b.auction_id
         JOIN   artwork  aw ON aw.id = b.artwork_id
         JOIN   users    u  ON  u.id = b.placed_by_user_id
         WHERE  b.bid_status = 'ACCEPTED'
           AND  a.deleted_at IS NULL
           ${schoolFilter}
           ${shippedFilter}
         ORDER  BY b.placed_at DESC
         LIMIT  200`
      );

      return res.json({ success: true, wins: result.rows });
    } catch (error) {
      return res.status(500).json({ success: false, message: error.message });
    }
  }
);

/**
 * PATCH /api/admin/wins/:id/fulfillment
 * Mark a won bid as shipped, record tracking info, or confirm delivery.
 * Body: { shipped?: bool, trackingCarrier?, trackingNumber?, delivered?: bool, notes? }
 * RBAC: SITE_ADMIN (any win), SCHOOL_ADMIN (own school only).
 */
router.patch(
  '/wins/:id/fulfillment',
  verifyToken,
  requireAdmin2fa,
  verifyRole(['SITE_ADMIN', 'SCHOOL_ADMIN']),
  async (req, res) => {
    try {
      const { id } = req.params;
      const { shipped, trackingCarrier, trackingNumber, delivered, notes } = req.body;
      const adminRole     = req.user.role;
      const adminSchoolId = req.user.schoolId;
      const { pool } = require('../models/index');

      // Fetch the bid with school + winner details for ownership check + notification
      const bidResult = await pool.query(
        `SELECT b.id, b.placed_by_user_id, b.bid_status, b.shipped_at,
                a.school_id,
                aw.title   AS artwork_title,
                u.email    AS winner_email,
                u.first_name AS winner_first_name
         FROM   bids b
         JOIN   auctions a  ON  a.id = b.auction_id
         JOIN   artwork  aw ON aw.id = b.artwork_id
         JOIN   users    u  ON  u.id = b.placed_by_user_id
         WHERE  b.id = $1 AND b.bid_status = 'ACCEPTED'`,
        [id]
      );

      if (bidResult.rows.length === 0) {
        return res.status(404).json({ success: false, message: 'Win not found' });
      }

      const bid = bidResult.rows[0];

      // School scope enforcement for SCHOOL_ADMIN
      if (adminRole === 'SCHOOL_ADMIN' && bid.school_id !== adminSchoolId) {
        return res.status(403).json({ success: false, message: 'Access denied: not your school' });
      }

      // Build the SET clause dynamically — only update provided fields
      const fields  = [];
      const values  = [id]; // $1 = bid id
      let   idx     = 2;

      if (shipped === true && !bid.shipped_at) {
        fields.push(`shipped_at = CURRENT_TIMESTAMP`);
      } else if (shipped === false) {
        fields.push(`shipped_at = NULL`);
      }
      if (trackingCarrier !== undefined) {
        fields.push(`tracking_carrier = $${idx++}`);
        values.push(trackingCarrier || null);
      }
      if (trackingNumber !== undefined) {
        fields.push(`tracking_number = $${idx++}`);
        values.push(trackingNumber || null);
      }
      if (delivered === true) {
        fields.push(`delivered_at = CURRENT_TIMESTAMP`);
      } else if (delivered === false) {
        fields.push(`delivered_at = NULL`);
      }
      if (notes !== undefined) {
        fields.push(`fulfillment_notes = $${idx++}`);
        values.push(notes || null);
      }

      if (fields.length === 0) {
        return res.status(400).json({ success: false, message: 'No fields to update' });
      }

      await pool.query(
        `UPDATE bids SET ${fields.join(', ')} WHERE id = $1`,
        values
      );

      // Audit log
      await pool.query(
        `INSERT INTO audit_logs (user_id, action_category, action_type, action_details)
         VALUES ($1, 'ADMIN', 'FULFILLMENT_UPDATE', $2)`,
        [req.user.id, JSON.stringify({ bidId: id, shipped, trackingCarrier, trackingNumber, delivered })]
      ).catch(() => {});

      // Notify winner when newly marked as shipped
      if (shipped === true && !bid.shipped_at && bid.winner_email) {
        setImmediate(() => {
          notifyArtworkShipped(getSharedEmailProvider(), pool, {
            userId: bid.placed_by_user_id,
            email: bid.winner_email,
            firstName: bid.winner_first_name,
            artworkTitle: bid.artwork_title,
            trackingCarrier: trackingCarrier || null,
            trackingNumber: trackingNumber || null
          }).catch(err => console.error('[notification] shipped failed:', err.message));
        });
      }

      return res.json({ success: true, message: 'Fulfillment updated' });
    } catch (error) {
      return res.status(500).json({ success: false, message: error.message });
    }
  }
);

// ============================================================================
// Session Management (admin force-logout)
// ============================================================================

/**
 * DELETE /api/admin/users/:userId/sessions
 * Force-logout a user by revoking all of their active sessions.
 * RBAC: SITE_ADMIN (any user), SCHOOL_ADMIN (own school users — ownership not checked here,
 *       relies on the caller's audit responsibility).
 */
router.delete(
  '/users/:userId/sessions',
  verifyToken,
  requireAdmin2fa,
  verifyRole(['SITE_ADMIN', 'SCHOOL_ADMIN']),
  async (req, res) => {
    try {
      const { userId } = req.params;
      const svc = getAdminSessionService();

      const revokedJtis = await svc.revokeAllExcept(userId, null); // revoke ALL

      const sevenDaysMs = 7 * 24 * 60 * 60 * 1000;
      await Promise.all(
        revokedJtis.map(jti =>
          tokenBlacklist.revoke(jti, new Date(Date.now() + sevenDaysMs)).catch(() => {})
        )
      );

      // Audit log
      const { pool } = require('../models/index');
      await pool.query(
        `INSERT INTO audit_logs (user_id, action_category, action_type, action_details)
         VALUES ($1, 'ADMIN', 'FORCE_LOGOUT', $2)`,
        [req.user.id, JSON.stringify({ targetUserId: userId, revokedCount: revokedJtis.length })]
      ).catch(() => {});

      return res.json({
        success: true,
        revokedCount: revokedJtis.length,
        message: `Force-logged out user: ${revokedJtis.length} session(s) revoked`
      });
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
