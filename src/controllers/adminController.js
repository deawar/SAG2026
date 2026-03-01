/**
 * Admin Controller - Section 8
 * HTTP request handlers for admin dashboard endpoints
 * 
 * CRITICAL: All methods enforce RBAC via verifyToken + verifyRole middleware
 * CRITICAL: All responses follow consistent error/success format
 */

const AdminService = require('../services/adminService');
const adminService = new AdminService();
const { EmailProvider, EmailTemplateService } = require('../services/notificationService');

const emailProvider = new EmailProvider({
  provider: 'smtp',
  host: process.env.SMTP_HOST,
  port: parseInt(process.env.SMTP_PORT) || 587,
  secure: process.env.SMTP_SECURE === 'true',
  user: process.env.SMTP_USER,
  password: process.env.SMTP_PASSWORD,
  fromEmail: process.env.MAIL_FROM || process.env.SMTP_USER
});

/**
 * AdminController - Handles all HTTP requests for admin operations
 */
class AdminController {
  constructor() {
    // Bind all methods so 'this' works when Express calls them as callbacks
    this.getUserById = this.getUserById.bind(this);
    this.listUsers = this.listUsers.bind(this);
    this.updateUserRole = this.updateUserRole.bind(this);
    this.deactivateUser = this.deactivateUser.bind(this);
    this.exportUserData = this.exportUserData.bind(this);
    this.updateUserProfile = this.updateUserProfile.bind(this);
    this.updateUserStatus = this.updateUserStatus.bind(this);
    this.resetUserMFA = this.resetUserMFA.bind(this);
    this.deleteUser = this.deleteUser.bind(this);
    this.resetUserPassword = this.resetUserPassword.bind(this);
    this.getAuctionById = this.getAuctionById.bind(this);
    this.listAuctionsByStatus = this.listAuctionsByStatus.bind(this);
    this.approveAuction = this.approveAuction.bind(this);
    this.rejectAuction = this.rejectAuction.bind(this);
    this.setAuctionFee = this.setAuctionFee.bind(this);
    this.extendAuction = this.extendAuction.bind(this);
    this.closeForcibly = this.closeForcibly.bind(this);
    this.deleteAuction = this.deleteAuction.bind(this);
    this.getPaymentById = this.getPaymentById.bind(this);
    this.listPayments = this.listPayments.bind(this);
    this.processRefund = this.processRefund.bind(this);
    this.getPaymentStatistics = this.getPaymentStatistics.bind(this);
    this.generateGDPRReport = this.generateGDPRReport.bind(this);
    this.generateCOPPAReport = this.generateCOPPAReport.bind(this);
    this.generateFERPAReport = this.generateFERPAReport.bind(this);
    this.generateCCPAReport = this.generateCCPAReport.bind(this);
    this.getAuditLogs = this.getAuditLogs.bind(this);
    this.getDashboardStats = this.getDashboardStats.bind(this);
    this.getSystemHealth = this.getSystemHealth.bind(this);
  }

  /**
   * ========== USER MANAGEMENT ENDPOINTS (5 methods) ==========
   */

  /**
   * GET /api/admin/users/:userId
   * Get user details with authorization check
   */
  async getUserById(req, res) {
    try {
      const { userId } = req.params;
      const adminId = req.user.id; // Set by verifyToken middleware

      // Validate input
      if (!userId || userId.length === 0) {
        return res.status(400).json({
          success: false,
          error: 'USER_ID_REQUIRED'
        });
      }

      const user = await adminService.getUserById(userId, adminId);

      return res.status(200).json({
        success: true,
        user
      });
    } catch (error) {
      return this.handleError(error, res);
    }
  }

  /**
   * GET /api/admin/users
   * List users with pagination and filtering
   */
  async listUsers(req, res) {
    try {
      const adminId = req.user.id;
      const { role, status, search, page = 1, limit = 20 } = req.query;

      const filters = {
        role: role || null,
        status: status || null,
        search: search || null,
        page: parseInt(page),
        limit: parseInt(limit)
      };

      // Validate pagination
      if (filters.page < 1 || filters.limit < 1 || filters.limit > 100) {
        return res.status(400).json({
          success: false,
          error: 'INVALID_PAGINATION'
        });
      }

      const result = await adminService.listUsers(filters, adminId);

      return res.status(200).json({
        success: true,
        ...result
      });
    } catch (error) {
      return this.handleError(error, res);
    }
  }

  /**
   * PUT /api/admin/users/:userId/role
   * Change user role (SITE_ADMIN only)
   */
  async updateUserRole(req, res) {
    try {
      const { userId } = req.params;
      const { newRole } = req.body;
      const adminId = req.user.id;

      if (!userId || !newRole) {
        return res.status(400).json({
          success: false,
          error: 'USERID_AND_NEWROLE_REQUIRED'
        });
      }

      const result = await adminService.updateUserRole(userId, newRole, adminId);

      return res.status(200).json({
        success: true,
        result
      });
    } catch (error) {
      return this.handleError(error, res);
    }
  }

  /**
   * DELETE /api/admin/users/:userId
   * Deactivate user
   */
  async deactivateUser(req, res) {
    try {
      const { userId } = req.params;
      const { reason } = req.body;
      const adminId = req.user.id;

      if (!userId) {
        return res.status(400).json({
          success: false,
          error: 'USER_ID_REQUIRED'
        });
      }

      const result = await adminService.deactivateUser(userId, reason, adminId);

      return res.status(200).json({
        success: true,
        result
      });
    } catch (error) {
      return this.handleError(error, res);
    }
  }

  /**
   * GET /api/admin/users/:userId/data
   * Export user data in GDPR format
   */
  async exportUserData(req, res) {
    try {
      const { userId } = req.params;

      if (!userId) {
        return res.status(400).json({
          success: false,
          error: 'USER_ID_REQUIRED'
        });
      }

      const userData = await adminService.exportUserData(userId);

      // Set headers for GDPR data export
      res.setHeader('Content-Type', 'application/json');
      res.setHeader('Content-Disposition', `attachment; filename="user-data-${userId}.json"`);

      return res.status(200).json(userData);
    } catch (error) {
      return this.handleError(error, res);
    }
  }

  /**
   * PUT /api/admin/users/:userId/profile
   * Update user name and/or email
   */
  async updateUserProfile(req, res) {
    try {
      const { userId } = req.params;
      const { firstName, lastName, email, phoneNumber, schoolId } = req.body;
      const adminId = req.user.id;

      if (!userId) {
        return res.status(400).json({ success: false, error: 'USER_ID_REQUIRED' });
      }

      const result = await adminService.updateUserProfile(userId, { firstName, lastName, email, phoneNumber, schoolId }, adminId);
      return res.status(200).json({ success: true, result });
    } catch (error) {
      return this.handleError(error, res);
    }
  }

  /**
   * PUT /api/admin/users/:userId/status
   * Change user account status (ACTIVE / SUSPENDED / INACTIVE)
   */
  async updateUserStatus(req, res) {
    try {
      const { userId } = req.params;
      const { newStatus } = req.body;
      const adminId = req.user.id;

      if (!userId || !newStatus) {
        return res.status(400).json({ success: false, error: 'USERID_AND_NEWSTATUS_REQUIRED' });
      }

      const result = await adminService.updateUserStatus(userId, newStatus, adminId);
      return res.status(200).json({ success: true, result });
    } catch (error) {
      return this.handleError(error, res);
    }
  }

  /**
   * POST /api/admin/users/:userId/reset-mfa
   * Reset user MFA (SITE_ADMIN only)
   */
  async resetUserMFA(req, res) {
    try {
      const { userId } = req.params;
      const adminId = req.user.id;

      if (!userId) {
        return res.status(400).json({ success: false, error: 'USER_ID_REQUIRED' });
      }

      const result = await adminService.resetUserMFA(userId, adminId);
      return res.status(200).json({ success: true, result });
    } catch (error) {
      return this.handleError(error, res);
    }
  }

  /**
   * DELETE /api/admin/users/:userId/permanent
   * Permanently delete a user account (SITE_ADMIN only)
   */
  async deleteUser(req, res) {
    try {
      const { userId } = req.params;
      const { reason } = req.body;
      const adminId = req.user.id;

      if (!userId) {
        return res.status(400).json({ success: false, error: 'USER_ID_REQUIRED' });
      }

      const result = await adminService.adminDeleteUser(userId, reason, adminId);
      return res.status(200).json({ success: true, result });
    } catch (error) {
      return this.handleError(error, res);
    }
  }

  /**
   * POST /api/admin/users/:userId/reset-password
   * Admin-triggered password reset — sends a reset email to the user.
   * Falls back to returning the URL if email delivery fails.
   */
  async resetUserPassword(req, res) {
    try {
      const { userId } = req.params;
      const adminId = req.user.id;

      if (!userId) {
        return res.status(400).json({ success: false, error: 'USER_ID_REQUIRED' });
      }

      const result = await adminService.adminResetUserPassword(userId, adminId);

      const resetUrl = `${req.protocol}://${req.get('host')}/password-reset.html?token=${result.resetToken}`;

      let emailSent = false;
      try {
        const emailContent = EmailTemplateService.generateTemplate('password-reset', {
          firstName: result.userFirstName || result.userEmail.split('@')[0],
          resetLink: resetUrl
        });
        await emailProvider.send(result.userEmail, emailContent.subject, emailContent.html, emailContent.text);
        emailSent = true;
      } catch (emailError) {
        console.error('Failed to send password reset email:', emailError.message);
      }

      return res.status(200).json({
        success: true,
        userEmail: result.userEmail,
        emailSent,
        resetUrl: emailSent ? undefined : resetUrl,
        message: emailSent
          ? `Password reset email sent to ${result.userEmail}.`
          : `Could not send email. Share this link with the user — expires in 24 hours.`
      });
    } catch (error) {
      return this.handleError(error, res);
    }
  }

  /**
   * ========== AUCTION MANAGEMENT ENDPOINTS (7 methods) ==========
   */

  /**
   * GET /api/admin/auctions/:auctionId
   * Get auction details
   */
  async getAuctionById(req, res) {
    try {
      const { auctionId } = req.params;
      const adminId = req.user.id;

      if (!auctionId) {
        return res.status(400).json({
          success: false,
          error: 'AUCTION_ID_REQUIRED'
        });
      }

      const auction = await adminService.getAuctionById(auctionId, adminId);

      return res.status(200).json({
        success: true,
        auction
      });
    } catch (error) {
      return this.handleError(error, res);
    }
  }

  /**
   * GET /api/admin/auctions
   * List auctions by status
   */
  async listAuctionsByStatus(req, res) {
    try {
      const { status } = req.query;
      const adminId = req.user.id;

      // If no status provided, list all auctions
      if (!status) {
        const auctions = await adminService.listAllAuctions(adminId);
        return res.status(200).json({
          success: true,
          auctions,
          count: auctions.length
        });
      }

      const auctions = await adminService.listAuctionsByStatus(status, adminId);

      return res.status(200).json({
        success: true,
        auctions,
        count: auctions.length
      });
    } catch (error) {
      return this.handleError(error, res);
    }
  }

  /**
   * POST /api/admin/auctions/:auctionId/approve
   * Approve auction
   */
  async approveAuction(req, res) {
    try {
      const { auctionId } = req.params;
      const adminId = req.user.id;

      if (!auctionId) {
        return res.status(400).json({
          success: false,
          error: 'AUCTION_ID_REQUIRED'
        });
      }

      const result = await adminService.approveAuction(auctionId, adminId);

      return res.status(200).json({
        success: true,
        result
      });
    } catch (error) {
      return this.handleError(error, res);
    }
  }

  /**
   * POST /api/admin/auctions/:auctionId/reject
   * Reject auction
   */
  async rejectAuction(req, res) {
    try {
      const { auctionId } = req.params;
      const { reason } = req.body;
      const adminId = req.user.id;

      if (!auctionId) {
        return res.status(400).json({
          success: false,
          error: 'AUCTION_ID_REQUIRED'
        });
      }

      const result = await adminService.rejectAuction(auctionId, reason, adminId);

      return res.status(200).json({
        success: true,
        result
      });
    } catch (error) {
      return this.handleError(error, res);
    }
  }

  /**
   * PUT /api/admin/auctions/:auctionId/fee
   * Set custom auction fee
   */
  async setAuctionFee(req, res) {
    try {
      const { auctionId } = req.params;
      const { feePercent } = req.body;
      const adminId = req.user.id;

      if (!auctionId || typeof feePercent !== 'number') {
        return res.status(400).json({
          success: false,
          error: 'AUCTIONID_AND_FEEPERCENT_REQUIRED'
        });
      }

      const result = await adminService.setAuctionFee(auctionId, feePercent, adminId);

      return res.status(200).json({
        success: true,
        result
      });
    } catch (error) {
      return this.handleError(error, res);
    }
  }

  /**
   * PUT /api/admin/auctions/:auctionId/extend
   * Extend auction end time
   */
  async extendAuction(req, res) {
    try {
      const { auctionId } = req.params;
      const { hours } = req.body;
      const adminId = req.user.id;

      if (!auctionId || typeof hours !== 'number') {
        return res.status(400).json({
          success: false,
          error: 'AUCTIONID_AND_HOURS_REQUIRED'
        });
      }

      const result = await adminService.extendAuction(auctionId, hours, adminId);

      return res.status(200).json({
        success: true,
        result
      });
    } catch (error) {
      return this.handleError(error, res);
    }
  }

  /**
   * POST /api/admin/auctions/:auctionId/close
   * Force close auction
   */
  async closeForcibly(req, res) {
    try {
      const { auctionId } = req.params;
      const { reason } = req.body;
      const adminId = req.user.id;

      if (!auctionId) {
        return res.status(400).json({
          success: false,
          error: 'AUCTION_ID_REQUIRED'
        });
      }

      const result = await adminService.closeForcibly(auctionId, reason, adminId);

      return res.status(200).json({
        success: true,
        result
      });
    } catch (error) {
      return this.handleError(error, res);
    }
  }

  /**
   * DELETE /api/admin/auctions/:auctionId
   * Soft-delete a DRAFT, CANCELLED, or ENDED auction
   */
  async deleteAuction(req, res) {
    try {
      const { auctionId } = req.params;
      const adminId = req.user.id;

      const result = await adminService.deleteAuction(auctionId, adminId);

      return res.status(200).json({ success: true, result });
    } catch (error) {
      return this.handleError(error, res);
    }
  }

  /**
   * ========== PAYMENT MANAGEMENT ENDPOINTS (4 methods) ==========
   */

  /**
   * GET /api/admin/payments/:paymentId
   * Get payment details
   */
  async getPaymentById(req, res) {
    try {
      const { paymentId } = req.params;
      const adminId = req.user.id;

      if (!paymentId) {
        return res.status(400).json({
          success: false,
          error: 'PAYMENT_ID_REQUIRED'
        });
      }

      const payment = await adminService.getPaymentById(paymentId, adminId);

      return res.status(200).json({
        success: true,
        payment
      });
    } catch (error) {
      return this.handleError(error, res);
    }
  }

  /**
   * GET /api/admin/payments
   * List payments with filtering
   */
  async listPayments(req, res) {
    try {
      const adminId = req.user.id;
      const { status, gateway, minAmount, maxAmount, page = 1, limit = 20 } = req.query;

      const filters = {
        status: status || null,
        gateway: gateway || null,
        minAmount: minAmount ? parseFloat(minAmount) : null,
        maxAmount: maxAmount ? parseFloat(maxAmount) : null,
        page: parseInt(page),
        limit: parseInt(limit)
      };

      const payments = await adminService.listPayments(filters, adminId);

      return res.status(200).json({
        success: true,
        payments,
        count: payments.length
      });
    } catch (error) {
      return this.handleError(error, res);
    }
  }

  /**
   * POST /api/admin/payments/:paymentId/refund
   * Process refund
   */
  async processRefund(req, res) {
    try {
      const { paymentId } = req.params;
      const { amount, reason } = req.body;
      const adminId = req.user.id;

      if (!paymentId || typeof amount !== 'number' || amount <= 0) {
        return res.status(400).json({
          success: false,
          error: 'PAYMENTID_AND_AMOUNT_REQUIRED'
        });
      }

      const result = await adminService.processRefund(paymentId, amount, reason, adminId);

      return res.status(200).json({
        success: true,
        result
      });
    } catch (error) {
      return this.handleError(error, res);
    }
  }

  /**
   * GET /api/admin/payments/statistics
   * Get payment statistics
   */
  async getPaymentStatistics(req, res) {
    try {
      const adminId = req.user.id;
      const { period = 'month' } = req.query;

      const statistics = await adminService.getPaymentStatistics(period, adminId);

      return res.status(200).json({
        success: true,
        statistics
      });
    } catch (error) {
      return this.handleError(error, res);
    }
  }

  /**
   * ========== COMPLIANCE ENDPOINTS (4 methods) ==========
   */

  /**
   * GET /api/admin/reports/gdpr
   * Generate GDPR compliance report
   */
  async generateGDPRReport(req, res) {
    try {
      const { startDate, endDate, schoolId } = req.query;
      const adminId = req.user.id;

      if (!startDate || !endDate) {
        return res.status(400).json({
          success: false,
          error: 'START_DATE_AND_END_DATE_REQUIRED'
        });
      }

      const report = await adminService.generateGDPRReport(
        new Date(startDate),
        new Date(endDate),
        schoolId,
        adminId
      );

      return res.status(200).json({
        success: true,
        report
      });
    } catch (error) {
      return this.handleError(error, res);
    }
  }

  /**
   * GET /api/admin/reports/coppa
   * Generate COPPA compliance report
   */
  async generateCOPPAReport(req, res) {
    try {
      const { startDate, endDate, schoolId } = req.query;
      const adminId = req.user.id;

      if (!startDate || !endDate) {
        return res.status(400).json({
          success: false,
          error: 'START_DATE_AND_END_DATE_REQUIRED'
        });
      }

      const report = await adminService.generateCOPPAReport(
        new Date(startDate),
        new Date(endDate),
        schoolId,
        adminId
      );

      return res.status(200).json({
        success: true,
        report
      });
    } catch (error) {
      return this.handleError(error, res);
    }
  }

  /**
   * GET /api/admin/reports/ferpa
   * Generate FERPA compliance report
   */
  async generateFERPAReport(req, res) {
    try {
      const { startDate, endDate, schoolId } = req.query;
      const adminId = req.user.id;

      if (!startDate || !endDate) {
        return res.status(400).json({
          success: false,
          error: 'START_DATE_AND_END_DATE_REQUIRED'
        });
      }

      const report = await adminService.generateFERPAReport(
        new Date(startDate),
        new Date(endDate),
        schoolId,
        adminId
      );

      return res.status(200).json({
        success: true,
        report
      });
    } catch (error) {
      return this.handleError(error, res);
    }
  }

  /**
   * GET /api/admin/reports/ccpa
   * Generate CCPA compliance report
   */
  async generateCCPAReport(req, res) {
    try {
      const { startDate, endDate, schoolId } = req.query;
      const adminId = req.user.id;

      if (!startDate || !endDate) {
        return res.status(400).json({
          success: false,
          error: 'START_DATE_AND_END_DATE_REQUIRED'
        });
      }

      const report = await adminService.generateCCPAReport(
        new Date(startDate),
        new Date(endDate),
        schoolId,
        adminId
      );

      return res.status(200).json({
        success: true,
        report
      });
    } catch (error) {
      return this.handleError(error, res);
    }
  }

  /**
   * ========== AUDIT LOG & DASHBOARD ENDPOINTS (3 methods) ==========
   */

  /**
   * GET /api/admin/audit-logs
   * Get audit logs with filtering
   */
  async getAuditLogs(req, res) {
    try {
      const { adminId, action, resourceType, startDate, endDate, page = 1, limit = 50 } = req.query;

      const filters = {
        adminId: adminId || null,
        action: action || null,
        resourceType: resourceType || null,
        startDate: startDate ? new Date(startDate) : null,
        endDate: endDate ? new Date(endDate) : null,
        page: parseInt(page),
        limit: parseInt(limit)
      };

      const result = await adminService.getAuditLog(filters);

      return res.status(200).json({
        success: true,
        ...result
      });
    } catch (error) {
      return this.handleError(error, res);
    }
  }

  /**
   * GET /api/admin/dashboard/stats
   * Get dashboard statistics
   */
  async getDashboardStats(req, res) {
    try {
      const { schoolId } = req.query;
      const adminId = req.user.id;

      // Verify school access
      const admin = await adminService.verifyAdminAccess(adminId);
      const targetSchoolId = schoolId || admin.school_id;

      if (admin.role === 'SCHOOL_ADMIN' && targetSchoolId !== admin.school_id) {
        return res.status(403).json({
          success: false,
          error: 'CROSS_SCHOOL_ACCESS_DENIED'
        });
      }

      const stats = await adminService.getDashboardStats(targetSchoolId);

      return res.status(200).json({
        success: true,
        stats
      });
    } catch (error) {
      return this.handleError(error, res);
    }
  }

  /**
   * GET /api/admin/dashboard/health
   * Get system health status
   */
  async getSystemHealth(req, res) {
    try {
      const health = await adminService.getSystemHealth();

      return res.status(200).json({
        success: true,
        health
      });
    } catch (error) {
      return this.handleError(error, res);
    }
  }

  /**
   * ========== ERROR HANDLING ==========
   */

  /**
   * Handle service errors and return appropriate HTTP status codes
   */
  handleError(error, res) {
    const errorMap = {
      'USER_NOT_FOUND': { status: 404, message: 'User not found' },
      'AUCTION_NOT_FOUND': { status: 404, message: 'Auction not found' },
      'PAYMENT_NOT_FOUND': { status: 404, message: 'Payment not found' },
      'INSUFFICIENT_PERMISSIONS': { status: 403, message: 'Insufficient permissions' },
      'CROSS_SCHOOL_ACCESS_DENIED': { status: 403, message: 'Cross-school access denied' },
      'INVALID_ROLE': { status: 400, message: 'Invalid role' },
      'INVALID_STATUS': { status: 400, message: 'Invalid status' },
      'INVALID_STATE_TRANSITION': { status: 400, message: 'Invalid state transition' },
      'INVALID_FEE_PERCENT': { status: 400, message: 'Fee must be between 0 and 100' },
      'INVALID_EXTENSION_HOURS': { status: 400, message: 'Extension hours must be between 1 and 720' },
      'REFUND_EXCEEDS_PAYMENT': { status: 400, message: 'Refund amount exceeds payment' },
      'AUCTION_ALREADY_CLOSED': { status: 400, message: 'Auction is already closed' },
      'AUCTION_NOT_DELETABLE': { status: 400, message: 'Only DRAFT, CANCELLED, or ENDED auctions can be deleted' },
      'ADMIN_NOT_FOUND': { status: 401, message: 'Admin credentials invalid' },
      'EMAIL_ALREADY_IN_USE': { status: 409, message: 'Email address is already in use by another account' },
      'NO_FIELDS_TO_UPDATE': { status: 400, message: 'No fields provided to update' },
      'CANNOT_DELETE_SELF': { status: 400, message: 'You cannot delete your own account' },
      'CANNOT_DELETE_SITE_ADMIN': { status: 403, message: 'Site admin accounts cannot be deleted' }
    };

    const errorType = error.message;
    const mapping = errorMap[errorType] || { status: 500, message: 'Internal server error' };

    return res.status(mapping.status).json({
      success: false,
      error: errorType,
      message: mapping.message
    });
  }
}

// Export controller instance
module.exports = new AdminController();
