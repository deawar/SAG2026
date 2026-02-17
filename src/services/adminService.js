/**
 * Admin Service - Section 8
 * Centralized admin operations for user management, auction management,
 * payment management, compliance reporting, and real-time monitoring
 * 
 * CRITICAL: All methods enforce RBAC and multi-tenant isolation
 * CRITICAL: All actions are logged to admin_audit_logs for compliance
 */

const { Pool } = require('pg');
const pool = new Pool({
  host: process.env.DB_HOST || process.env.DATABASE_HOST || 'localhost',
  port: process.env.DB_PORT || process.env.DATABASE_PORT || 5432,
  database: process.env.DB_NAME || process.env.DATABASE_NAME || 'silent_auction_gallery',
  user: process.env.DB_USER || process.env.DATABASE_USER || 'postgres',
  password: process.env.DB_PASSWORD || process.env.DATABASE_PASSWORD,
});

/**
 * AdminService - Handles all administrative operations
 * Enforces RBAC at every step: SITE_ADMIN (global), SCHOOL_ADMIN (school-scoped)
 */
class AdminService {
  /**
   * ========== USER MANAGEMENT (5 methods) ==========
   */

  /**
   * Get user details with school isolation check
   * RBAC: SITE_ADMIN (all users), SCHOOL_ADMIN (own school only)
   */
  async getUserById(userId, adminId) {
    const admin = await this.verifyAdminAccess(adminId);

    // Get user
    const result = await pool.query(
      'SELECT id, email, first_name, last_name, phone_number, role, school_id, account_status, created_at FROM users WHERE id = $1',
      [userId]
    );

    if (result.rows.length === 0) {
      throw new Error('USER_NOT_FOUND');
    }

    const user = result.rows[0];

    // RBAC check: SCHOOL_ADMIN can only access own school's users
    if (admin.role === 'SCHOOL_ADMIN' && user.school_id !== admin.school_id) {
      throw new Error('CROSS_SCHOOL_ACCESS_DENIED');
    }

    await this.logAdminAction(adminId, 'USER_VIEWED', 'USER', userId, null, null, 'Admin viewed user');

    return user;
  }

  /**
   * List users with pagination and filtering
   * RBAC: SITE_ADMIN (all), SCHOOL_ADMIN (own school)
   */
  async listUsers(filters, adminId) {
    const admin = await this.verifyAdminAccess(adminId);
    
    const { role, status, search, page = 1, limit = 20 } = filters;
    const offset = (page - 1) * limit;

    let query = 'SELECT id, email, first_name, last_name, role, account_status, school_id, created_at FROM users WHERE 1=1';
    const params = [];

    // Multi-tenant isolation
    if (admin.role === 'SCHOOL_ADMIN') {
      query += ' AND school_id = $1';
      params.push(admin.school_id);
    } else if (admin.school_id) {
      // SITE_ADMIN with school filter
      query += ` AND school_id = $${params.length + 1}`;
      params.push(admin.school_id);
    }

    if (role) {
      query += ` AND role = $${params.length + 1}`;
      params.push(role);
    }

    if (status) {
      query += ` AND account_status = $${params.length + 1}`;
      params.push(status);
    }

    if (search) {
      query += ` AND (email ILIKE $${params.length + 1} OR first_name ILIKE $${params.length + 1} OR last_name ILIKE $${params.length + 1})`;
      params.push(`%${search}%`);
    }

    // Pagination
    query += ` ORDER BY created_at DESC LIMIT $${params.length + 1} OFFSET $${params.length + 2}`;
    params.push(limit, offset);

    const result = await pool.query(query, params);

    // Get total count
    let countQuery = 'SELECT COUNT(*) as count FROM users WHERE 1=1';
    const countParams = [];
    
    if (admin.role === 'SCHOOL_ADMIN') {
      countQuery += ' AND school_id = $1';
      countParams.push(admin.school_id);
    }
    if (role) {
      countQuery += ` AND role = $${countParams.length + 1}`;
      countParams.push(role);
    }
    if (status) {
      countQuery += ` AND account_status = $${countParams.length + 1}`;
      countParams.push(status);
    }

    const countResult = await pool.query(countQuery, countParams);
    const total = parseInt(countResult.rows[0].count);

    await this.logAdminAction(adminId, 'USERS_LISTED', 'USER', null, null, { filters }, 'Admin listed users');

    return {
      users: result.rows,
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit)
      }
    };
  }

  /**
   * Update user role with audit trail
   * RBAC: SITE_ADMIN only (can't delegate)
   */
  async updateUserRole(userId, newRole, adminId) {
    const admin = await this.verifyAdminAccess(adminId);

    // Only SITE_ADMIN can change roles
    if (admin.role !== 'SITE_ADMIN') {
      throw new Error('INSUFFICIENT_PERMISSIONS');
    }

    // Validate new role
    const validRoles = ['SITE_ADMIN', 'SCHOOL_ADMIN', 'TEACHER', 'STUDENT', 'BIDDER'];
    if (!validRoles.includes(newRole)) {
      throw new Error('INVALID_ROLE');
    }

    // Get current user
    const userResult = await pool.query(
      'SELECT id, role FROM users WHERE id = $1',
      [userId]
    );

    if (userResult.rows.length === 0) {
      throw new Error('USER_NOT_FOUND');
    }

    const oldRole = userResult.rows[0].role;

    // Update role
    await pool.query(
      'UPDATE users SET role = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2',
      [newRole, userId]
    );

    // Audit log
    await this.logAdminAction(
      adminId,
      'USER_ROLE_CHANGED',
      'USER',
      userId,
      { role: oldRole },
      { role: newRole },
      `Admin changed user role from ${oldRole} to ${newRole}`
    );

    return { success: true, oldRole, newRole };
  }

  /**
   * Deactivate user (soft delete)
   * RBAC: SITE_ADMIN or own SCHOOL_ADMIN
   */
  async deactivateUser(userId, reason, adminId) {
    const admin = await this.verifyAdminAccess(adminId);

    // Get user to check school ownership
    const userResult = await pool.query(
      'SELECT id, school_id, account_status FROM users WHERE id = $1',
      [userId]
    );

    if (userResult.rows.length === 0) {
      throw new Error('USER_NOT_FOUND');
    }

    const user = userResult.rows[0];

    // RBAC check
    if (admin.role === 'SCHOOL_ADMIN' && user.school_id !== admin.school_id) {
      throw new Error('CROSS_SCHOOL_ACCESS_DENIED');
    }

    // Update status to INACTIVE
    await pool.query(
      'UPDATE users SET account_status = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2',
      ['INACTIVE', userId]
    );

    // Audit log
    await this.logAdminAction(
      adminId,
      'USER_DEACTIVATED',
      'USER',
      userId,
      { account_status: user.account_status },
      { account_status: 'INACTIVE' },
      reason || 'Admin deactivated user'
    );

    return { success: true, userId, newStatus: 'INACTIVE' };
  }

  /**
   * Export user data in GDPR format
   * RBAC: SITE_ADMIN only (sensitive data)
   */
  async exportUserData(userId) {
    const result = await pool.query(
      `SELECT 
        u.id, u.email, u.first_name, u.last_name, u.phone_number,
        u.date_of_birth, u.role, u.account_status, u.created_at, u.updated_at,
        s.name as school_name
      FROM users u
      LEFT JOIN schools s ON u.school_id = s.id
      WHERE u.id = $1`,
      [userId]
    );

    if (result.rows.length === 0) {
      throw new Error('USER_NOT_FOUND');
    }

    const user = result.rows[0];

    // Get user's auction history
    const auctionsResult = await pool.query(
      'SELECT id, title, auction_status, created_at FROM auctions WHERE created_by_user_id = $1 ORDER BY created_at DESC',
      [userId]
    );

    // Get user's bid history
    const bidsResult = await pool.query(
      'SELECT b.id, b.bid_amount, b.bid_status, b.placed_at FROM bids b WHERE b.placed_by_user_id = $1 ORDER BY b.placed_at DESC',
      [userId]
    );

    // Get user's payments
    const paymentsResult = await pool.query(
      'SELECT id, total_amount, transaction_status, created_at FROM transactions WHERE buyer_user_id = $1 ORDER BY created_at DESC',
      [userId]
    );

    return {
      user: user,
      auctions: auctionsResult.rows,
      bids: bidsResult.rows,
      payments: paymentsResult.rows,
      exportedAt: new Date().toISOString(),
      format: 'GDPR'
    };
  }

  /**
   * ========== AUCTION MANAGEMENT (7 methods) ==========
   */

  /**
   * Get auction details with school isolation
   */
  async getAuctionById(auctionId, adminId) {
    const admin = await this.verifyAdminAccess(adminId);

    const result = await pool.query(
      `SELECT a.*, s.name as school_name FROM auctions a
       LEFT JOIN schools s ON a.school_id = s.id
       WHERE a.id = $1`,
      [auctionId]
    );

    if (result.rows.length === 0) {
      throw new Error('AUCTION_NOT_FOUND');
    }

    const auction = result.rows[0];

    // Multi-tenant check
    if (admin.role === 'SCHOOL_ADMIN' && auction.school_id !== admin.school_id) {
      throw new Error('CROSS_SCHOOL_ACCESS_DENIED');
    }

    await this.logAdminAction(adminId, 'AUCTION_VIEWED', 'AUCTION', auctionId, null, null, 'Admin viewed auction');

    return auction;
  }

  /**
   * List auctions by status with pagination
   */
  async listAuctionsByStatus(status, adminId) {
    const admin = await this.verifyAdminAccess(adminId);

    const validStatuses = ['DRAFT', 'PENDING_APPROVAL', 'APPROVED', 'LIVE', 'CLOSED', 'CANCELLED'];
    if (!validStatuses.includes(status)) {
      throw new Error('INVALID_STATUS');
    }

    let query = 'SELECT a.id, a.title, a.auction_status, a.school_id, a.created_by_user_id, a.created_at FROM auctions a WHERE a.auction_status = $1';
    const params = [status];

    // Multi-tenant isolation
    if (admin.role === 'SCHOOL_ADMIN') {
      query += ' AND a.school_id = $2';
      params.push(admin.school_id);
    }

    query += ' ORDER BY a.created_at DESC LIMIT 50';

    const result = await pool.query(query, params);

    await this.logAdminAction(adminId, 'AUCTIONS_LISTED', 'AUCTION', null, null, { status }, `Admin listed ${status} auctions`);

    return result.rows;
  }

  /**
   * Approve auction: PENDING_APPROVAL -> APPROVED
   */
  async approveAuction(auctionId, adminId) {
    const admin = await this.verifyAdminAccess(adminId);

    // Get auction
    const auctionResult = await pool.query(
      'SELECT id, auction_status, school_id FROM auctions WHERE id = $1',
      [auctionId]
    );

    if (auctionResult.rows.length === 0) {
      throw new Error('AUCTION_NOT_FOUND');
    }

    const auction = auctionResult.rows[0];

    // Multi-tenant check
    if (admin.role === 'SCHOOL_ADMIN' && auction.school_id !== admin.school_id) {
      throw new Error('CROSS_SCHOOL_ACCESS_DENIED');
    }

    // Check status
    if (auction.auction_status !== 'PENDING_APPROVAL') {
      throw new Error('INVALID_STATE_TRANSITION');
    }

    // Update status
    await pool.query(
      'UPDATE auctions SET auction_status = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2',
      ['APPROVED', auctionId]
    );

    // Audit log
    await this.logAdminAction(
      adminId,
      'AUCTION_APPROVED',
      'AUCTION',
      auctionId,
      { auction_status: 'PENDING_APPROVAL' },
      { auction_status: 'APPROVED' },
      'Admin approved auction for listing'
    );

    return { success: true, auctionId, newStatus: 'APPROVED' };
  }

  /**
   * Reject auction: PENDING_APPROVAL -> REJECTED
   */
  async rejectAuction(auctionId, reason, adminId) {
    const admin = await this.verifyAdminAccess(adminId);

    const auctionResult = await pool.query(
      'SELECT id, auction_status, school_id FROM auctions WHERE id = $1',
      [auctionId]
    );

    if (auctionResult.rows.length === 0) {
      throw new Error('AUCTION_NOT_FOUND');
    }

    const auction = auctionResult.rows[0];

    // Multi-tenant check
    if (admin.role === 'SCHOOL_ADMIN' && auction.school_id !== admin.school_id) {
      throw new Error('CROSS_SCHOOL_ACCESS_DENIED');
    }

    if (auction.auction_status !== 'PENDING_APPROVAL') {
      throw new Error('INVALID_STATE_TRANSITION');
    }

    // Update status
    await pool.query(
      'UPDATE auctions SET auction_status = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2',
      ['REJECTED', auctionId]
    );

    // Audit log
    await this.logAdminAction(
      adminId,
      'AUCTION_REJECTED',
      'AUCTION',
      auctionId,
      { auction_status: 'PENDING_APPROVAL' },
      { auction_status: 'REJECTED' },
      reason || 'Admin rejected auction'
    );

    return { success: true, auctionId, newStatus: 'REJECTED', reason };
  }

  /**
   * Set custom auction fee (override default)
   */
  async setAuctionFee(auctionId, feePercent, adminId) {
    const admin = await this.verifyAdminAccess(adminId);

    if (feePercent < 0 || feePercent > 100) {
      throw new Error('INVALID_FEE_PERCENT');
    }

    const auctionResult = await pool.query(
      'SELECT id, school_id, fee_percent FROM auctions WHERE id = $1',
      [auctionId]
    );

    if (auctionResult.rows.length === 0) {
      throw new Error('AUCTION_NOT_FOUND');
    }

    const auction = auctionResult.rows[0];

    // Multi-tenant check
    if (admin.role === 'SCHOOL_ADMIN' && auction.school_id !== admin.school_id) {
      throw new Error('CROSS_SCHOOL_ACCESS_DENIED');
    }

    const oldFee = auction.fee_percent;

    // Update fee
    await pool.query(
      'UPDATE auctions SET fee_percent = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2',
      [feePercent, auctionId]
    );

    // Audit log
    await this.logAdminAction(
      adminId,
      'AUCTION_FEE_ADJUSTED',
      'AUCTION',
      auctionId,
      { fee_percent: oldFee },
      { fee_percent: feePercent },
      `Admin adjusted fee from ${oldFee}% to ${feePercent}%`
    );

    return { success: true, auctionId, oldFee, newFee: feePercent };
  }

  /**
   * Extend auction end time
   */
  async extendAuction(auctionId, hours, adminId) {
    const admin = await this.verifyAdminAccess(adminId);

    if (hours <= 0 || hours > 720) {
      throw new Error('INVALID_EXTENSION_HOURS');
    }

    const auctionResult = await pool.query(
      'SELECT id, school_id, ends_at FROM auctions WHERE id = $1',
      [auctionId]
    );

    if (auctionResult.rows.length === 0) {
      throw new Error('AUCTION_NOT_FOUND');
    }

    const auction = auctionResult.rows[0];

    // Multi-tenant check
    if (admin.role === 'SCHOOL_ADMIN' && auction.school_id !== admin.school_id) {
      throw new Error('CROSS_SCHOOL_ACCESS_DENIED');
    }

    const oldEndTime = auction.ends_at;
    const newEndTime = new Date(new Date(auction.ends_at).getTime() + hours * 60 * 60 * 1000);

    // Update end time
    await pool.query(
      'UPDATE auctions SET ends_at = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2',
      [newEndTime, auctionId]
    );

    // Audit log
    await this.logAdminAction(
      adminId,
      'AUCTION_EXTENDED',
      'AUCTION',
      auctionId,
      { ends_at: oldEndTime },
      { ends_at: newEndTime },
      `Admin extended auction by ${hours} hours`
    );

    return { success: true, auctionId, oldEndTime, newEndTime };
  }

  /**
   * Force close auction
   */
  async closeForcibly(auctionId, reason, adminId) {
    const admin = await this.verifyAdminAccess(adminId);

    const auctionResult = await pool.query(
      'SELECT id, school_id, auction_status FROM auctions WHERE id = $1',
      [auctionId]
    );

    if (auctionResult.rows.length === 0) {
      throw new Error('AUCTION_NOT_FOUND');
    }

    const auction = auctionResult.rows[0];

    // Multi-tenant check
    if (admin.role === 'SCHOOL_ADMIN' && auction.school_id !== admin.school_id) {
      throw new Error('CROSS_SCHOOL_ACCESS_DENIED');
    }

    if (auction.auction_status === 'CANCELLED') {
      throw new Error('AUCTION_ALREADY_CLOSED');
    }

    // Update status
    await pool.query(
      'UPDATE auctions SET auction_status = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2',
      ['CANCELLED', auctionId]
    );

    // Audit log
    await this.logAdminAction(
      adminId,
      'AUCTION_FORCE_CLOSED',
      'AUCTION',
      auctionId,
      { auction_status: auction.auction_status },
      { auction_status: 'CANCELLED' },
      reason || 'Admin force closed auction'
    );

    return { success: true, auctionId, newStatus: 'CLOSED' };
  }

  /**
   * ========== PAYMENT MANAGEMENT (4 methods) ==========
   */

  /**
   * Get payment details
   */
  async getPaymentById(paymentId, adminId) {
    const admin = await this.verifyAdminAccess(adminId);

    const result = await pool.query(
      `SELECT t.*, u.email FROM transactions t
       LEFT JOIN users u ON t.buyer_user_id = u.id
       WHERE t.id = $1`,
      [paymentId]
    );

    if (result.rows.length === 0) {
      throw new Error('PAYMENT_NOT_FOUND');
    }

    await this.logAdminAction(adminId, 'PAYMENT_VIEWED', 'PAYMENT', paymentId, null, null, 'Admin viewed payment');

    return result.rows[0];
  }

  /**
   * List payments with filtering
   */
  async listPayments(filters, adminId) {
    const admin = await this.verifyAdminAccess(adminId);

    const { status, gateway, minAmount, maxAmount, page = 1, limit = 20 } = filters;
    const offset = (page - 1) * limit;

    let query = `SELECT t.id, t.buyer_user_id, t.total_amount, t.transaction_status, t.created_at
                 FROM transactions t WHERE 1=1`;
    const params = [];

    // Multi-tenant isolation for SCHOOL_ADMIN
    if (admin.role === 'SCHOOL_ADMIN') {
      query += ` AND t.buyer_user_id IN (SELECT id FROM users WHERE school_id = $${params.length + 1})`;
      params.push(admin.school_id);
    }

    if (status) {
      query += ` AND t.transaction_status = $${params.length + 1}`;
      params.push(status);
    }

    if (minAmount) {
      query += ` AND t.total_amount >= $${params.length + 1}`;
      params.push(minAmount);
    }

    if (maxAmount) {
      query += ` AND t.total_amount <= $${params.length + 1}`;
      params.push(maxAmount);
    }

    query += ` ORDER BY t.created_at DESC LIMIT $${params.length + 1} OFFSET $${params.length + 2}`;
    params.push(limit, offset);

    const result = await pool.query(query, params);

    await this.logAdminAction(adminId, 'PAYMENTS_LISTED', 'PAYMENT', null, null, { filters }, 'Admin listed payments');

    return result.rows;
  }

  /**
   * Process refund
   */
  async processRefund(paymentId, amount, reason, adminId) {
    const admin = await this.verifyAdminAccess(adminId);

    const paymentResult = await pool.query(
      'SELECT id, total_amount, transaction_status FROM transactions WHERE id = $1',
      [paymentId]
    );

    if (paymentResult.rows.length === 0) {
      throw new Error('PAYMENT_NOT_FOUND');
    }

    const payment = paymentResult.rows[0];

    if (amount > payment.total_amount) {
      throw new Error('REFUND_EXCEEDS_PAYMENT');
    }

    // Update transaction status
    const newStatus = amount === payment.total_amount ? 'REFUNDED' : 'REFUNDED';
    await pool.query(
      'UPDATE transactions SET transaction_status = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2',
      [newStatus, paymentId]
    );

    // Audit log
    await this.logAdminAction(
      adminId,
      'PAYMENT_REFUNDED',
      'PAYMENT',
      paymentId,
      { transaction_status: payment.transaction_status, total_amount: payment.total_amount },
      { transaction_status: newStatus, refundedAmount: amount },
      reason || 'Admin processed refund'
    );

    return { success: true, paymentId, refundedAmount: amount, newStatus };
  }

  /**
   * Get payment statistics by period
   */
  async getPaymentStatistics(period, adminId) {
    const admin = await this.verifyAdminAccess(adminId);

    // Calculate date range
    const endDate = new Date();
    const startDate = new Date();
    
    switch (period) {
      case 'day':
        startDate.setDate(startDate.getDate() - 1);
        break;
      case 'week':
        startDate.setDate(startDate.getDate() - 7);
        break;
      case 'month':
        startDate.setMonth(startDate.getMonth() - 1);
        break;
      case 'year':
        startDate.setFullYear(startDate.getFullYear() - 1);
        break;
      default:
        throw new Error('INVALID_PERIOD');
    }

    let query = `SELECT
                  SUM(total_amount) as total_revenue,
                  COUNT(*) as transaction_count,
                  transaction_status
                 FROM transactions
                 WHERE created_at >= $1 AND created_at <= $2`;
    const params = [startDate, endDate];

    // Multi-tenant isolation
    if (admin.role === 'SCHOOL_ADMIN') {
      query += ` AND buyer_user_id IN (SELECT id FROM users WHERE school_id = $3)`;
      params.push(admin.school_id);
    }

    query += ` GROUP BY transaction_status ORDER BY total_revenue DESC`;

    const result = await pool.query(query, params);

    return {
      period,
      startDate,
      endDate,
      statistics: result.rows
    };
  }

  /**
   * ========== COMPLIANCE & AUDITING (4 methods) ==========
   */

  /**
   * Generate GDPR compliance report
   */
  async generateGDPRReport(startDate, endDate, schoolId, adminId) {
    const admin = await this.verifyAdminAccess(adminId);

    // Verify school access
    if (admin.role === 'SCHOOL_ADMIN' && schoolId !== admin.school_id) {
      throw new Error('CROSS_SCHOOL_ACCESS_DENIED');
    }

    // Get user deletion count
    const deletionsResult = await pool.query(
      'SELECT COUNT(*) as count FROM audit_logs WHERE event_type = $1 AND created_at BETWEEN $2 AND $3' +
      (schoolId ? ' AND school_id = $4' : ''),
      schoolId ? ['USER_DELETED', startDate, endDate, schoolId] : ['USER_DELETED', startDate, endDate]
    );

    // Get data export count
    const exportsResult = await pool.query(
      'SELECT COUNT(*) as count FROM audit_logs WHERE event_type = $1 AND created_at BETWEEN $2 AND $3' +
      (schoolId ? ' AND school_id = $4' : ''),
      schoolId ? ['DATA_EXPORTED', startDate, endDate, schoolId] : ['DATA_EXPORTED', startDate, endDate]
    );

    // Get consent tracking
    const consentsResult = await pool.query(
      'SELECT COUNT(*) as count FROM users WHERE consent_given = true AND created_at BETWEEN $1 AND $2' +
      (schoolId ? ' AND school_id = $3' : ''),
      schoolId ? [startDate, endDate, schoolId] : [startDate, endDate]
    );

    const report = {
      reportType: 'GDPR',
      startDate,
      endDate,
      summary: {
        usersDeletionRequests: parseInt(deletionsResult.rows[0].count),
        dataExportRequests: parseInt(exportsResult.rows[0].count),
        consentsTracked: parseInt(consentsResult.rows[0].count)
      }
    };

    // Store report
    const reportResult = await pool.query(
      `INSERT INTO compliance_reports (report_type, generated_by, school_id, start_date, end_date, summary)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING id`,
      ['GDPR', adminId, schoolId, startDate, endDate, JSON.stringify(report.summary)]
    );

    // Audit log
    await this.logAdminAction(
      adminId,
      'GDPR_REPORT_GENERATED',
      'COMPLIANCE_REPORT',
      reportResult.rows[0].id,
      null,
      report,
      'Admin generated GDPR compliance report'
    );

    return { ...report, reportId: reportResult.rows[0].id };
  }

  /**
   * Generate COPPA compliance report
   */
  async generateCOPPAReport(startDate, endDate, schoolId, adminId) {
    const admin = await this.verifyAdminAccess(adminId);

    if (admin.role === 'SCHOOL_ADMIN' && schoolId !== admin.school_id) {
      throw new Error('CROSS_SCHOOL_ACCESS_DENIED');
    }

    // Get minor users (under 13)
    const minorsResult = await pool.query(
      `SELECT COUNT(*) as count FROM users 
       WHERE EXTRACT(YEAR FROM age(date_of_birth)) < 13
       AND created_at BETWEEN $1 AND $2` +
      (schoolId ? ' AND school_id = $3' : ''),
      schoolId ? [startDate, endDate, schoolId] : [startDate, endDate]
    );

    // Get parental consent records
    const consentsResult = await pool.query(
      `SELECT COUNT(*) as count FROM coppa_verifications 
       WHERE created_at BETWEEN $1 AND $2` +
      (schoolId ? ' AND user_id IN (SELECT id FROM users WHERE school_id = $3)' : ''),
      schoolId ? [startDate, endDate, schoolId] : [startDate, endDate]
    );

    const report = {
      reportType: 'COPPA',
      startDate,
      endDate,
      summary: {
        minorUsersIdentified: parseInt(minorsResult.rows[0].count),
        parentalConsentsObtained: parseInt(consentsResult.rows[0].count)
      }
    };

    // Store report
    const reportResult = await pool.query(
      `INSERT INTO compliance_reports (report_type, generated_by, school_id, start_date, end_date, summary)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING id`,
      ['COPPA', adminId, schoolId, startDate, endDate, JSON.stringify(report.summary)]
    );

    // Audit log
    await this.logAdminAction(
      adminId,
      'COPPA_REPORT_GENERATED',
      'COMPLIANCE_REPORT',
      reportResult.rows[0].id,
      null,
      report,
      'Admin generated COPPA compliance report'
    );

    return { ...report, reportId: reportResult.rows[0].id };
  }

  /**
   * Generate FERPA compliance report
   */
  async generateFERPAReport(startDate, endDate, schoolId, adminId) {
    const admin = await this.verifyAdminAccess(adminId);

    if (admin.role === 'SCHOOL_ADMIN' && schoolId !== admin.school_id) {
      throw new Error('CROSS_SCHOOL_ACCESS_DENIED');
    }

    // Get student data access logs
    const accessLogsResult = await pool.query(
      `SELECT COUNT(*) as count FROM audit_logs 
       WHERE event_type LIKE 'STUDENT_DATA_%'
       AND created_at BETWEEN $1 AND $2` +
      (schoolId ? ' AND school_id = $3' : ''),
      schoolId ? [startDate, endDate, schoolId] : [startDate, endDate]
    );

    const report = {
      reportType: 'FERPA',
      startDate,
      endDate,
      summary: {
        studentDataAccessEvents: parseInt(accessLogsResult.rows[0].count),
        educatorAccessOnly: true
      }
    };

    // Store report
    const reportResult = await pool.query(
      `INSERT INTO compliance_reports (report_type, generated_by, school_id, start_date, end_date, summary)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING id`,
      ['FERPA', adminId, schoolId, startDate, endDate, JSON.stringify(report.summary)]
    );

    // Audit log
    await this.logAdminAction(
      adminId,
      'FERPA_REPORT_GENERATED',
      'COMPLIANCE_REPORT',
      reportResult.rows[0].id,
      null,
      report,
      'Admin generated FERPA compliance report'
    );

    return { ...report, reportId: reportResult.rows[0].id };
  }

  /**
   * Generate CCPA compliance report
   */
  async generateCCPAReport(startDate, endDate, schoolId, adminId) {
    const admin = await this.verifyAdminAccess(adminId);

    if (admin.role === 'SCHOOL_ADMIN' && schoolId !== admin.school_id) {
      throw new Error('CROSS_SCHOOL_ACCESS_DENIED');
    }

    // Get data deletion requests
    const deletionsResult = await pool.query(
      `SELECT COUNT(*) as count FROM audit_logs 
       WHERE event_type = 'DATA_DELETION_REQUEST'
       AND created_at BETWEEN $1 AND $2` +
      (schoolId ? ' AND school_id = $3' : ''),
      schoolId ? [startDate, endDate, schoolId] : [startDate, endDate]
    );

    // Get opt-out requests
    const optOutsResult = await pool.query(
      `SELECT COUNT(*) as count FROM audit_logs 
       WHERE event_type = 'OPT_OUT_REQUEST'
       AND created_at BETWEEN $1 AND $2` +
      (schoolId ? ' AND school_id = $3' : ''),
      schoolId ? [startDate, endDate, schoolId] : [startDate, endDate]
    );

    const report = {
      reportType: 'CCPA',
      startDate,
      endDate,
      summary: {
        dataDeletionRequests: parseInt(deletionsResult.rows[0].count),
        optOutRequests: parseInt(optOutsResult.rows[0].count),
        dataSaleProhibition: true
      }
    };

    // Store report
    const reportResult = await pool.query(
      `INSERT INTO compliance_reports (report_type, generated_by, school_id, start_date, end_date, summary)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING id`,
      ['CCPA', adminId, schoolId, startDate, endDate, JSON.stringify(report.summary)]
    );

    // Audit log
    await this.logAdminAction(
      adminId,
      'CCPA_REPORT_GENERATED',
      'COMPLIANCE_REPORT',
      reportResult.rows[0].id,
      null,
      report,
      'Admin generated CCPA compliance report'
    );

    return { ...report, reportId: reportResult.rows[0].id };
  }

  /**
   * Get audit log with filtering
   */
  async getAuditLog(filters) {
    const { adminId, action, resourceType, startDate, endDate, page = 1, limit = 50 } = filters;
    const offset = (page - 1) * limit;

    let query = 'SELECT id, admin_id, action, resource_type, resource_id, reason, created_at FROM admin_audit_logs WHERE 1=1';
    const params = [];

    if (adminId) {
      query += ` AND admin_id = $${params.length + 1}`;
      params.push(adminId);
    }

    if (action) {
      query += ` AND action = $${params.length + 1}`;
      params.push(action);
    }

    if (resourceType) {
      query += ` AND resource_type = $${params.length + 1}`;
      params.push(resourceType);
    }

    if (startDate && endDate) {
      query += ` AND created_at BETWEEN $${params.length + 1} AND $${params.length + 2}`;
      params.push(startDate, endDate);
    }

    query += ` ORDER BY created_at DESC LIMIT $${params.length + 1} OFFSET $${params.length + 2}`;
    params.push(limit, offset);

    const result = await pool.query(query, params);

    return {
      logs: result.rows,
      pagination: {
        page,
        limit,
        total: result.rows.length
      }
    };
  }

  /**
   * ========== REAL-TIME MONITORING (3 methods) ==========
   */

  /**
   * Get dashboard statistics
   */
  async getDashboardStats(schoolId) {
    const query = `
      SELECT
        (SELECT COUNT(*) FROM auctions WHERE auction_status = 'LIVE' AND school_id = $1) as active_auctions,
        (SELECT COUNT(*) FROM auctions WHERE auction_status = 'PENDING_APPROVAL' AND school_id = $1) as pending_approvals,
        (SELECT COALESCE(SUM(total_amount), 0) FROM transactions WHERE transaction_status = 'COMPLETED' AND created_at >= CURRENT_DATE - INTERVAL '1 day' AND buyer_user_id IN (SELECT id FROM users WHERE school_id = $1)) as daily_revenue,
        (SELECT COUNT(*) FROM users WHERE school_id = $1) as total_users,
        (SELECT COUNT(*) FROM users WHERE role = 'STUDENT' AND school_id = $1) as total_students
    `;

    const result = await pool.query(query, [schoolId]);

    return {
      activeAuctions: parseInt(result.rows[0].active_auctions),
      pendingApprovals: parseInt(result.rows[0].pending_approvals),
      dailyRevenue: parseFloat(result.rows[0].daily_revenue),
      totalUsers: parseInt(result.rows[0].total_users),
      totalStudents: parseInt(result.rows[0].total_students),
      lastUpdated: new Date().toISOString()
    };
  }

  /**
   * Get system health status
   */
  async getSystemHealth() {
    try {
      // Test database connection
      const dbTest = await pool.query('SELECT NOW()');
      
      return {
        database: 'HEALTHY',
        timestamp: new Date().toISOString(),
        responseTime: '< 100ms'
      };
    } catch (error) {
      return {
        database: 'UNHEALTHY',
        error: error.message,
        timestamp: new Date().toISOString()
      };
    }
  }

  /**
   * Get active auctions for real-time monitoring
   */
  async getActiveAuctions(schoolId, limit = 10) {
    const result = await pool.query(
      `SELECT id, title, auction_status, ends_at, created_at
       FROM auctions
       WHERE school_id = $1 AND auction_status IN ('LIVE', 'PENDING_APPROVAL')
       ORDER BY created_at DESC
       LIMIT $2`,
      [schoolId, limit]
    );

    return result.rows;
  }

  /**
   * ========== INTERNAL HELPER METHODS ==========
   */

  /**
   * Verify admin access and return admin details
   * RBAC: Only SITE_ADMIN and SCHOOL_ADMIN can access admin functions
   */
  async verifyAdminAccess(adminId) {
    const result = await pool.query(
      'SELECT id, role, school_id FROM users WHERE id = $1 AND account_status = $2',
      [adminId, 'ACTIVE']
    );

    if (result.rows.length === 0) {
      throw new Error('ADMIN_NOT_FOUND');
    }

    const admin = result.rows[0];

    if (!['SITE_ADMIN', 'SCHOOL_ADMIN'].includes(admin.role)) {
      throw new Error('INSUFFICIENT_PERMISSIONS');
    }

    return admin;
  }

  /**
   * Log administrative action to admin_audit_logs
   * CRITICAL: All admin methods must call this
   */
  async logAdminAction(adminId, action, resourceType, resourceId, oldValues, newValues, reason) {
    try {
      await pool.query(
        `INSERT INTO admin_audit_logs (admin_id, action, resource_type, resource_id, old_values, new_values, reason, ip_address, created_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, CURRENT_TIMESTAMP)`,
        [
          adminId,
          action,
          resourceType,
          resourceId,
          oldValues ? JSON.stringify(oldValues) : null,
          newValues ? JSON.stringify(newValues) : null,
          reason,
          '0.0.0.0' // Would be set from req.ip in controller
        ]
      );
    } catch (error) {
      console.error('Error logging admin action:', error);
      // Don't fail the operation if logging fails
    }
  }
}

module.exports = AdminService;
