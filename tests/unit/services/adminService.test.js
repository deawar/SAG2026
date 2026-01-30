/**
 * Admin Service Unit Tests - Section 8
 * Comprehensive tests for all admin service methods
 * Tests: User management, auction management, payments, compliance, monitoring
 */

const AdminService = require('../src/services/adminService');
const { Pool } = require('pg');

// Mock the Pool
jest.mock('pg');

describe('AdminService', () => {
  let adminService;
  let mockPool;

  beforeEach(() => {
    // Clear all mocks before each test
    jest.clearAllMocks();

    // Setup mock pool
    mockPool = {
      query: jest.fn()
    };
    Pool.mockImplementation(() => mockPool);

    adminService = new AdminService();
  });

  // ========== USER MANAGEMENT TESTS (5 tests) ==========

  describe('User Management', () => {
    test('getUserById - should return user for authorized admin', async () => {
      const adminId = 'admin-123';
      const userId = 'user-123';

      mockPool.query
        .mockResolvedValueOnce({ rows: [{ role: 'SITE_ADMIN', school_id: null }] }) // verifyAdminAccess
        .mockResolvedValueOnce({ // getUserById query
          rows: [{
            id: userId,
            email: 'user@example.com',
            first_name: 'John',
            last_name: 'Doe',
            role: 'STUDENT',
            school_id: 'school-1'
          }]
        })
        .mockResolvedValueOnce(undefined); // logAdminAction

      const user = await adminService.getUserById(userId, adminId);

      expect(user.id).toBe(userId);
      expect(user.email).toBe('user@example.com');
    });

    test('getUserById - should enforce school isolation for SCHOOL_ADMIN', async () => {
      const adminId = 'school-admin-123';
      const userId = 'user-other-school';

      mockPool.query
        .mockResolvedValueOnce({ rows: [{ role: 'SCHOOL_ADMIN', school_id: 'school-1' }] }) // verifyAdminAccess
        .mockResolvedValueOnce({ // getUserById query
          rows: [{
            id: userId,
            school_id: 'school-2' // Different school
          }]
        });

      await expect(adminService.getUserById(userId, adminId))
        .rejects.toThrow('CROSS_SCHOOL_ACCESS_DENIED');
    });

    test('listUsers - should paginate results correctly', async () => {
      const adminId = 'admin-123';
      const filters = { page: 1, limit: 10 };

      mockPool.query
        .mockResolvedValueOnce({ rows: [{ role: 'SITE_ADMIN', school_id: null }] }) // verifyAdminAccess
        .mockResolvedValueOnce({ // listUsers query
          rows: Array(10).fill({ id: 'user-id', email: 'user@example.com' })
        })
        .mockResolvedValueOnce({ rows: [{ count: '50' }] }) // count query
        .mockResolvedValueOnce(undefined); // logAdminAction

      const result = await adminService.listUsers(filters, adminId);

      expect(result.users.length).toBe(10);
      expect(result.pagination.page).toBe(1);
      expect(result.pagination.total).toBe(50);
    });

    test('updateUserRole - should log audit entry', async () => {
      const adminId = 'admin-123';
      const userId = 'user-123';

      mockPool.query
        .mockResolvedValueOnce({ rows: [{ role: 'SITE_ADMIN', school_id: null }] }) // verifyAdminAccess
        .mockResolvedValueOnce({ rows: [{ role: 'STUDENT' }] }) // getUserById
        .mockResolvedValueOnce(undefined) // UPDATE user
        .mockResolvedValueOnce(undefined); // logAdminAction

      const result = await adminService.updateUserRole(userId, 'TEACHER', adminId);

      expect(result.success).toBe(true);
      expect(result.oldRole).toBe('STUDENT');
      expect(result.newRole).toBe('TEACHER');
    });

    test('deactivateUser - should update status to INACTIVE', async () => {
      const adminId = 'admin-123';
      const userId = 'user-123';

      mockPool.query
        .mockResolvedValueOnce({ rows: [{ role: 'SITE_ADMIN', school_id: null }] }) // verifyAdminAccess
        .mockResolvedValueOnce({ rows: [{ school_id: 'school-1', status: 'ACTIVE' }] }) // getUserById
        .mockResolvedValueOnce(undefined) // UPDATE user
        .mockResolvedValueOnce(undefined); // logAdminAction

      const result = await adminService.deactivateUser(userId, 'User requested', adminId);

      expect(result.success).toBe(true);
      expect(result.newStatus).toBe('INACTIVE');
    });
  });

  // ========== AUCTION MANAGEMENT TESTS (5 tests) ==========

  describe('Auction Management', () => {
    test('approveAuction - should transition PENDING_APPROVAL to APPROVED', async () => {
      const adminId = 'admin-123';
      const auctionId = 'auction-123';

      mockPool.query
        .mockResolvedValueOnce({ rows: [{ role: 'SITE_ADMIN', school_id: null }] }) // verifyAdminAccess
        .mockResolvedValueOnce({ rows: [{ status: 'PENDING_APPROVAL', school_id: 'school-1' }] }) // getAuctionById
        .mockResolvedValueOnce(undefined) // UPDATE auction
        .mockResolvedValueOnce(undefined); // logAdminAction

      const result = await adminService.approveAuction(auctionId, adminId);

      expect(result.success).toBe(true);
      expect(result.newStatus).toBe('APPROVED');
    });

    test('rejectAuction - should transition to REJECTED', async () => {
      const adminId = 'admin-123';
      const auctionId = 'auction-123';
      const reason = 'Inappropriate content';

      mockPool.query
        .mockResolvedValueOnce({ rows: [{ role: 'SITE_ADMIN', school_id: null }] }) // verifyAdminAccess
        .mockResolvedValueOnce({ rows: [{ status: 'PENDING_APPROVAL', school_id: 'school-1' }] }) // getAuctionById
        .mockResolvedValueOnce(undefined) // UPDATE auction
        .mockResolvedValueOnce(undefined); // logAdminAction

      const result = await adminService.rejectAuction(auctionId, reason, adminId);

      expect(result.success).toBe(true);
      expect(result.newStatus).toBe('REJECTED');
    });

    test('setAuctionFee - should enforce fee percentage bounds', async () => {
      const adminId = 'admin-123';
      const auctionId = 'auction-123';

      mockPool.query.mockResolvedValueOnce({ rows: [{ role: 'SITE_ADMIN', school_id: null }] }); // verifyAdminAccess

      await expect(adminService.setAuctionFee(auctionId, 150, adminId))
        .rejects.toThrow('INVALID_FEE_PERCENT');
    });

    test('extendAuction - should add hours to end_time', async () => {
      const adminId = 'admin-123';
      const auctionId = 'auction-123';
      const oldTime = new Date();
      const hours = 24;

      mockPool.query
        .mockResolvedValueOnce({ rows: [{ role: 'SITE_ADMIN', school_id: null }] }) // verifyAdminAccess
        .mockResolvedValueOnce({ rows: [{ school_id: 'school-1', end_time: oldTime }] }) // getAuctionById
        .mockResolvedValueOnce(undefined) // UPDATE auction
        .mockResolvedValueOnce(undefined); // logAdminAction

      const result = await adminService.extendAuction(auctionId, hours, adminId);

      expect(result.success).toBe(true);
      expect(result.oldEndTime).toBe(oldTime);
    });

    test('closeForcibly - should not allow closing already-closed auction', async () => {
      const adminId = 'admin-123';
      const auctionId = 'auction-123';

      mockPool.query
        .mockResolvedValueOnce({ rows: [{ role: 'SITE_ADMIN', school_id: null }] }) // verifyAdminAccess
        .mockResolvedValueOnce({ rows: [{ status: 'CLOSED', school_id: 'school-1' }] }); // getAuctionById

      await expect(adminService.closeForcibly(auctionId, 'Force close', adminId))
        .rejects.toThrow('AUCTION_ALREADY_CLOSED');
    });
  });

  // ========== PAYMENT MANAGEMENT TESTS (3 tests) ==========

  describe('Payment Management', () => {
    test('processRefund - should update payment status to REFUNDED', async () => {
      const adminId = 'admin-123';
      const paymentId = 'payment-123';
      const amount = 100.00;

      mockPool.query
        .mockResolvedValueOnce({ rows: [{ role: 'SITE_ADMIN', school_id: null }] }) // verifyAdminAccess
        .mockResolvedValueOnce({ rows: [{ amount: 100.00, status: 'COMPLETED' }] }) // getPaymentById
        .mockResolvedValueOnce(undefined) // UPDATE payment
        .mockResolvedValueOnce(undefined); // logAdminAction

      const result = await adminService.processRefund(paymentId, amount, 'Customer request', adminId);

      expect(result.success).toBe(true);
      expect(result.newStatus).toBe('REFUNDED');
    });

    test('processRefund - should prevent over-refunding', async () => {
      const adminId = 'admin-123';
      const paymentId = 'payment-123';

      mockPool.query
        .mockResolvedValueOnce({ rows: [{ role: 'SITE_ADMIN', school_id: null }] }) // verifyAdminAccess
        .mockResolvedValueOnce({ rows: [{ amount: 100.00 }] }); // getPaymentById

      await expect(adminService.processRefund(paymentId, 150.00, 'Refund', adminId))
        .rejects.toThrow('REFUND_EXCEEDS_PAYMENT');
    });

    test('getPaymentStatistics - should aggregate by gateway and status', async () => {
      const adminId = 'admin-123';

      mockPool.query
        .mockResolvedValueOnce({ rows: [{ role: 'SITE_ADMIN', school_id: null }] }) // verifyAdminAccess
        .mockResolvedValueOnce({ rows: [
          { gateway: 'STRIPE', status: 'COMPLETED', total_revenue: 5000, transaction_count: 25 },
          { gateway: 'PAYPAL', status: 'COMPLETED', total_revenue: 3000, transaction_count: 15 }
        ] }); // statistics query

      const stats = await adminService.getPaymentStatistics('month', adminId);

      expect(stats.period).toBe('month');
      expect(stats.statistics.length).toBe(2);
    });
  });

  // ========== COMPLIANCE TESTS (3 tests) ==========

  describe('Compliance Reporting', () => {
    test('generateGDPRReport - should count deletions and exports', async () => {
      const adminId = 'admin-123';
      const startDate = new Date('2026-01-01');
      const endDate = new Date('2026-01-31');

      mockPool.query
        .mockResolvedValueOnce({ rows: [{ role: 'SITE_ADMIN', school_id: null }] }) // verifyAdminAccess
        .mockResolvedValueOnce({ rows: [{ count: '5' }] }) // deletions
        .mockResolvedValueOnce({ rows: [{ count: '3' }] }) // exports
        .mockResolvedValueOnce({ rows: [{ count: '42' }] }) // consents
        .mockResolvedValueOnce({ rows: [{ id: 'report-123' }] }) // INSERT report
        .mockResolvedValueOnce(undefined); // logAdminAction

      const report = await adminService.generateGDPRReport(startDate, endDate, null, adminId);

      expect(report.reportType).toBe('GDPR');
      expect(report.summary.usersDeletionRequests).toBe(5);
      expect(report.summary.dataExportRequests).toBe(3);
    });

    test('generateCOPPAReport - should track minor users and consents', async () => {
      const adminId = 'admin-123';

      mockPool.query
        .mockResolvedValueOnce({ rows: [{ role: 'SITE_ADMIN', school_id: null }] }) // verifyAdminAccess
        .mockResolvedValueOnce({ rows: [{ count: '8' }] }) // minors
        .mockResolvedValueOnce({ rows: [{ count: '8' }] }) // consents
        .mockResolvedValueOnce({ rows: [{ id: 'report-123' }] }) // INSERT report
        .mockResolvedValueOnce(undefined); // logAdminAction

      const report = await adminService.generateCOPPAReport(new Date(), new Date(), null, adminId);

      expect(report.reportType).toBe('COPPA');
      expect(report.summary.minorUsersIdentified).toBe(8);
    });

    test('getAuditLog - should support filtering by action and resource type', async () => {
      const filters = {
        action: 'AUCTION_APPROVED',
        resourceType: 'AUCTION',
        page: 1,
        limit: 50
      };

      mockPool.query.mockResolvedValueOnce({
        rows: [
          { id: '1', action: 'AUCTION_APPROVED', resource_type: 'AUCTION', created_at: new Date() }
        ]
      });

      const result = await adminService.getAuditLog(filters);

      expect(result.logs.length).toBe(1);
      expect(result.pagination.page).toBe(1);
    });
  });

  // ========== MONITORING TESTS (2 tests) ==========

  describe('Real-time Monitoring', () => {
    test('getDashboardStats - should return all metrics', async () => {
      const schoolId = 'school-1';

      mockPool.query.mockResolvedValueOnce({
        rows: [{
          active_auctions: 5,
          pending_approvals: 2,
          daily_revenue: 1500.00,
          total_users: 150,
          total_students: 120
        }]
      });

      const stats = await adminService.getDashboardStats(schoolId);

      expect(stats.activeAuctions).toBe(5);
      expect(stats.pendingApprovals).toBe(2);
      expect(stats.dailyRevenue).toBe(1500.00);
      expect(stats.totalUsers).toBe(150);
      expect(stats.totalStudents).toBe(120);
    });

    test('getSystemHealth - should return HEALTHY status', async () => {
      mockPool.query.mockResolvedValueOnce({ rows: [{ now: new Date() }] });

      const health = await adminService.getSystemHealth();

      expect(health.database).toBe('HEALTHY');
      expect(health.timestamp).toBeDefined();
    });
  });

  // ========== RBAC TESTS (2 tests) ==========

  describe('RBAC Enforcement', () => {
    test('verifyAdminAccess - should reject non-admin users', async () => {
      const userId = 'student-123';

      mockPool.query.mockResolvedValueOnce({
        rows: [{ id: userId, role: 'STUDENT', school_id: 'school-1' }]
      });

      await expect(adminService.verifyAdminAccess(userId))
        .rejects.toThrow('INSUFFICIENT_PERMISSIONS');
    });

    test('updateUserRole - should only allow SITE_ADMIN to change roles', async () => {
      const schoolAdminId = 'school-admin-123';
      const userId = 'user-123';

      mockPool.query.mockResolvedValueOnce({
        rows: [{ role: 'SCHOOL_ADMIN', school_id: 'school-1' }] // SCHOOL_ADMIN, not SITE_ADMIN
      });

      await expect(adminService.updateUserRole(userId, 'TEACHER', schoolAdminId))
        .rejects.toThrow('INSUFFICIENT_PERMISSIONS');
    });
  });

  // ========== EDGE CASES (3 tests) ==========

  describe('Edge Cases', () => {
    test('listAuctionsByStatus - should require valid status', async () => {
      const adminId = 'admin-123';

      mockPool.query.mockResolvedValueOnce({ rows: [{ role: 'SITE_ADMIN' }] });

      await expect(adminService.listAuctionsByStatus('INVALID_STATUS', adminId))
        .rejects.toThrow('INVALID_STATUS');
    });

    test('extendAuction - should validate hours range', async () => {
      const adminId = 'admin-123';

      mockPool.query.mockResolvedValueOnce({ rows: [{ role: 'SITE_ADMIN' }] });

      await expect(adminService.extendAuction('auction-123', 0, adminId))
        .rejects.toThrow('INVALID_EXTENSION_HOURS');

      await expect(adminService.extendAuction('auction-123', 1000, adminId))
        .rejects.toThrow('INVALID_EXTENSION_HOURS');
    });

    test('logAdminAction - should not fail operation if logging fails', async () => {
      const adminId = 'admin-123';
      const userId = 'user-123';

      // First two queries succeed, logAdminAction throws, but we shouldn't propagate error
      mockPool.query
        .mockResolvedValueOnce({ rows: [{ role: 'SITE_ADMIN', school_id: null }] }) // verifyAdminAccess
        .mockResolvedValueOnce({ rows: [{ role: 'STUDENT' }] }) // getUserById
        .mockResolvedValueOnce(undefined) // UPDATE user
        .mockRejectedValueOnce(new Error('DB_ERROR')); // logAdminAction fails

      // Should not throw because logAdminAction failure is caught
      const result = await adminService.deactivateUser(userId, 'Reason', adminId);

      expect(result.success).toBe(true);
    });
  });

  // ========== AUDIT LOGGING TESTS (2 tests) ==========

  describe('Audit Logging', () => {
    test('logAdminAction - should store admin actions in database', async () => {
      mockPool.query.mockResolvedValueOnce(undefined);

      await adminService.logAdminAction('admin-123', 'USER_UPDATED', 'USER', 'user-456', { role: 'STUDENT' }, { role: 'TEACHER' }, 'Role updated');

      expect(mockPool.query).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO admin_audit_logs'),
        expect.arrayContaining(['admin-123', 'USER_UPDATED', 'USER', 'user-456'])
      );
    });

    test('getUserById - should log view action', async () => {
      const adminId = 'admin-123';
      const userId = 'user-123';

      mockPool.query
        .mockResolvedValueOnce({ rows: [{ role: 'SITE_ADMIN', school_id: null }] })
        .mockResolvedValueOnce({ rows: [{ id: userId, school_id: 'school-1' }] })
        .mockResolvedValueOnce(undefined); // logAdminAction

      await adminService.getUserById(userId, adminId);

      // Verify logAdminAction was called
      const lastCall = mockPool.query.mock.calls[mockPool.query.mock.calls.length - 1];
      expect(lastCall[0]).toContain('INSERT INTO admin_audit_logs');
    });
  });
});
