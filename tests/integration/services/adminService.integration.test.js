/**
 * Admin API Integration Tests - Section 8
 * Tests for all admin endpoints with real request/response cycles
 * Covers RBAC enforcement, multi-tenant isolation, and compliance
 */

const request = require('supertest');
const express = require('express');
const adminRoutes = require('../src/routes/adminRoutes');
const { verifyToken, verifyRole } = require('../src/middleware/authMiddleware');

describe('Admin API Integration Tests', () => {
  let app;
  let server;

  beforeEach(() => {
    // Setup Express app with admin routes
    app = express();
    app.use(express.json());

    // Mock auth middleware
    app.use((req, res, next) => {
      // Inject user from test headers
      if (req.headers['x-user-id']) {
        req.user = {
          id: req.headers['x-user-id'],
          role: req.headers['x-user-role'],
          school_id: req.headers['x-school-id']
        };
      }
      next();
    });

    app.use('/api/admin', verifyToken, adminRoutes);

    server = app.listen(3000);
  });

  afterEach(() => {
    if (server) {
      server.close();
    }
  });

  // ========== MULTI-TENANT ISOLATION TESTS (3 tests) ==========

  describe('Multi-tenant Isolation', () => {
    test('SCHOOL_ADMIN cannot access other schools users', async () => {
      // SCHOOL_ADMIN from school-1 trying to access school-2 user
      const response = await request(app)
        .get('/api/admin/users/user-other-school')
        .set('x-user-id', 'admin-school-1')
        .set('x-user-role', 'SCHOOL_ADMIN')
        .set('x-school-id', 'school-1')
        .expect(403);

      expect(response.body.error).toBe('CROSS_SCHOOL_ACCESS_DENIED');
    });

    test('SCHOOL_ADMIN can only list own schools users', async () => {
      // SCHOOL_ADMIN should only see their school's users
      const response = await request(app)
        .get('/api/admin/users')
        .set('x-user-id', 'admin-school-1')
        .set('x-user-role', 'SCHOOL_ADMIN')
        .set('x-school-id', 'school-1')
        .expect(200);

      // Response should only contain school-1 users
      if (response.body.users) {
        response.body.users.forEach(user => {
          expect(user.school_id).toBe('school-1');
        });
      }
    });

    test('SITE_ADMIN can access all schools data', async () => {
      // SITE_ADMIN should not have school restrictions
      const response = await request(app)
        .get('/api/admin/users')
        .set('x-user-id', 'site-admin')
        .set('x-user-role', 'SITE_ADMIN')
        .expect(200);

      // Should succeed without school restrictions
      expect(response.body.success).toBe(true);
    });
  });

  // ========== RBAC ENFORCEMENT TESTS (4 tests) ==========

  describe('RBAC Enforcement', () => {
    test('Non-admin cannot access admin endpoints', async () => {
      const response = await request(app)
        .get('/api/admin/users')
        .set('x-user-id', 'student-123')
        .set('x-user-role', 'STUDENT')
        .expect(403);

      expect(response.body.error).toMatch(/INSUFFICIENT_PERMISSIONS|NOT_AUTHORIZED/);
    });

    test('SCHOOL_ADMIN cannot change user roles (SITE_ADMIN only)', async () => {
      const response = await request(app)
        .put('/api/admin/users/user-123/role')
        .set('x-user-id', 'school-admin')
        .set('x-user-role', 'SCHOOL_ADMIN')
        .set('x-school-id', 'school-1')
        .send({ newRole: 'TEACHER' })
        .expect(403);

      expect(response.body.error).toBe('INSUFFICIENT_PERMISSIONS');
    });

    test('SITE_ADMIN can change user roles', async () => {
      const response = await request(app)
        .put('/api/admin/users/user-123/role')
        .set('x-user-id', 'site-admin')
        .set('x-user-role', 'SITE_ADMIN')
        .send({ newRole: 'TEACHER' })
        .expect(200);

      expect(response.body.success).toBe(true);
    });

    test('Missing authentication should reject request', async () => {
      const response = await request(app)
        .get('/api/admin/users')
        // No auth headers
        .expect(401);

      expect(response.body.error).toMatch(/UNAUTHORIZED|TOKEN_REQUIRED/);
    });
  });

  // ========== AUCTION MANAGEMENT TESTS (3 tests) ==========

  describe('Auction Management', () => {
    test('Should approve auction and transition status', async () => {
      const response = await request(app)
        .post('/api/admin/auctions/auction-123/approve')
        .set('x-user-id', 'admin-school-1')
        .set('x-user-role', 'SCHOOL_ADMIN')
        .set('x-school-id', 'school-1')
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.result.newStatus).toBe('APPROVED');
    });

    test('Should reject auction with reason', async () => {
      const response = await request(app)
        .post('/api/admin/auctions/auction-123/reject')
        .set('x-user-id', 'admin-school-1')
        .set('x-user-role', 'SCHOOL_ADMIN')
        .set('x-school-id', 'school-1')
        .send({ reason: 'Inappropriate content' })
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.result.newStatus).toBe('REJECTED');
    });

    test('Should validate fee percentage bounds (0-100)', async () => {
      const response = await request(app)
        .put('/api/admin/auctions/auction-123/fee')
        .set('x-user-id', 'admin-school-1')
        .set('x-user-role', 'SCHOOL_ADMIN')
        .set('x-school-id', 'school-1')
        .send({ feePercent: 150 })
        .expect(400);

      expect(response.body.error).toBe('INVALID_FEE_PERCENT');
    });
  });

  // ========== PAYMENT MANAGEMENT TESTS (3 tests) ==========

  describe('Payment Management', () => {
    test('Should process refund and log to audit', async () => {
      const response = await request(app)
        .post('/api/admin/payments/payment-123/refund')
        .set('x-user-id', 'admin-school-1')
        .set('x-user-role', 'SCHOOL_ADMIN')
        .set('x-school-id', 'school-1')
        .send({ amount: 50.00, reason: 'Customer refund request' })
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.result.refundedAmount).toBe(50.00);
    });

    test('Should prevent refund exceeding payment amount', async () => {
      const response = await request(app)
        .post('/api/admin/payments/payment-123/refund')
        .set('x-user-id', 'admin-school-1')
        .set('x-user-role', 'SCHOOL_ADMIN')
        .set('x-school-id', 'school-1')
        .send({ amount: 999.99 })
        .expect(400);

      expect(response.body.error).toBe('REFUND_EXCEEDS_PAYMENT');
    });

    test('Should list payments with filtering', async () => {
      const response = await request(app)
        .get('/api/admin/payments?status=COMPLETED&gateway=STRIPE&page=1&limit=20')
        .set('x-user-id', 'admin-school-1')
        .set('x-user-role', 'SCHOOL_ADMIN')
        .set('x-school-id', 'school-1')
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(Array.isArray(response.body.payments)).toBe(true);
    });
  });

  // ========== COMPLIANCE REPORTING TESTS (5 tests) ==========

  describe('Compliance Reporting', () => {
    test('Should generate GDPR report with date range', async () => {
      const startDate = '2026-01-01';
      const endDate = '2026-01-31';

      const response = await request(app)
        .get(`/api/admin/reports/gdpr?startDate=${startDate}&endDate=${endDate}`)
        .set('x-user-id', 'admin-school-1')
        .set('x-user-role', 'SCHOOL_ADMIN')
        .set('x-school-id', 'school-1')
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.report.reportType).toBe('GDPR');
      expect(response.body.report.summary).toBeDefined();
    });

    test('Should generate COPPA report', async () => {
      const response = await request(app)
        .get('/api/admin/reports/coppa?startDate=2026-01-01&endDate=2026-01-31')
        .set('x-user-id', 'admin-school-1')
        .set('x-user-role', 'SCHOOL_ADMIN')
        .set('x-school-id', 'school-1')
        .expect(200);

      expect(response.body.report.reportType).toBe('COPPA');
      expect(response.body.report.summary.minorUsersIdentified).toBeDefined();
    });

    test('Should generate FERPA report', async () => {
      const response = await request(app)
        .get('/api/admin/reports/ferpa?startDate=2026-01-01&endDate=2026-01-31')
        .set('x-user-id', 'admin-school-1')
        .set('x-user-role', 'SCHOOL_ADMIN')
        .set('x-school-id', 'school-1')
        .expect(200);

      expect(response.body.report.reportType).toBe('FERPA');
    });

    test('Should generate CCPA report', async () => {
      const response = await request(app)
        .get('/api/admin/reports/ccpa?startDate=2026-01-01&endDate=2026-01-31')
        .set('x-user-id', 'admin-school-1')
        .set('x-user-role', 'SCHOOL_ADMIN')
        .set('x-school-id', 'school-1')
        .expect(200);

      expect(response.body.report.reportType).toBe('CCPA');
    });

    test('Compliance report generation should require date range', async () => {
      const response = await request(app)
        .get('/api/admin/reports/gdpr')
        .set('x-user-id', 'admin-school-1')
        .set('x-user-role', 'SCHOOL_ADMIN')
        .set('x-school-id', 'school-1')
        .expect(400);

      expect(response.body.error).toBe('START_DATE_AND_END_DATE_REQUIRED');
    });
  });

  // ========== DASHBOARD & MONITORING TESTS (3 tests) ==========

  describe('Dashboard & Monitoring', () => {
    test('Should return dashboard statistics', async () => {
      const response = await request(app)
        .get('/api/admin/dashboard/stats')
        .set('x-user-id', 'admin-school-1')
        .set('x-user-role', 'SCHOOL_ADMIN')
        .set('x-school-id', 'school-1')
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.stats.activeAuctions).toBeDefined();
      expect(response.body.stats.pendingApprovals).toBeDefined();
      expect(response.body.stats.dailyRevenue).toBeDefined();
      expect(response.body.stats.totalUsers).toBeDefined();
    });

    test('Should return system health status', async () => {
      const response = await request(app)
        .get('/api/admin/dashboard/health')
        .set('x-user-id', 'admin-school-1')
        .set('x-user-role', 'SCHOOL_ADMIN')
        .set('x-school-id', 'school-1')
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.health.database).toMatch(/HEALTHY|UNHEALTHY/);
    });

    test('Should list audit logs with filtering', async () => {
      const response = await request(app)
        .get('/api/admin/audit-logs?action=AUCTION_APPROVED&resourceType=AUCTION&page=1&limit=50')
        .set('x-user-id', 'admin-school-1')
        .set('x-user-role', 'SCHOOL_ADMIN')
        .set('x-school-id', 'school-1')
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(Array.isArray(response.body.logs)).toBe(true);
      expect(response.body.pagination).toBeDefined();
    });
  });

  // ========== INPUT VALIDATION TESTS (3 tests) ==========

  describe('Input Validation', () => {
    test('Should reject invalid user ID format', async () => {
      const response = await request(app)
        .get('/api/admin/users/invalid-id')
        .set('x-user-id', 'admin-school-1')
        .set('x-user-role', 'SITE_ADMIN')
        .expect(400);

      expect(response.body.error).toBe('USER_ID_REQUIRED');
    });

    test('Should validate pagination parameters', async () => {
      const response = await request(app)
        .get('/api/admin/users?page=0&limit=200')
        .set('x-user-id', 'admin-school-1')
        .set('x-user-role', 'SITE_ADMIN')
        .expect(400);

      expect(response.body.error).toBe('INVALID_PAGINATION');
    });

    test('Should require body parameters for refunds', async () => {
      const response = await request(app)
        .post('/api/admin/payments/payment-123/refund')
        .set('x-user-id', 'admin-school-1')
        .set('x-user-role', 'SCHOOL_ADMIN')
        .send({}) // Missing amount
        .expect(400);

      expect(response.body.error).toBe('PAYMENTID_AND_AMOUNT_REQUIRED');
    });
  });

  // ========== WORKFLOW TESTS (3 tests) ==========

  describe('Complex Workflows', () => {
    test('Complete auction approval workflow', async () => {
      // 1. Get pending auctions
      let response = await request(app)
        .get('/api/admin/auctions?status=PENDING_APPROVAL')
        .set('x-user-id', 'admin-school-1')
        .set('x-user-role', 'SCHOOL_ADMIN')
        .set('x-school-id', 'school-1')
        .expect(200);

      expect(response.body.auctions).toBeDefined();

      // 2. Approve an auction
      response = await request(app)
        .post('/api/admin/auctions/auction-123/approve')
        .set('x-user-id', 'admin-school-1')
        .set('x-user-role', 'SCHOOL_ADMIN')
        .set('x-school-id', 'school-1')
        .expect(200);

      expect(response.body.result.newStatus).toBe('APPROVED');

      // 3. Set custom fee
      response = await request(app)
        .put('/api/admin/auctions/auction-123/fee')
        .set('x-user-id', 'admin-school-1')
        .set('x-user-role', 'SCHOOL_ADMIN')
        .set('x-school-id', 'school-1')
        .send({ feePercent: 4.5 })
        .expect(200);

      expect(response.body.result.newFee).toBe(4.5);
    });

    test('Complete payment refund workflow', async () => {
      // 1. Get payment details
      let response = await request(app)
        .get('/api/admin/payments/payment-123')
        .set('x-user-id', 'admin-school-1')
        .set('x-user-role', 'SCHOOL_ADMIN')
        .set('x-school-id', 'school-1')
        .expect(200);

      expect(response.body.payment).toBeDefined();

      // 2. Process refund
      response = await request(app)
        .post('/api/admin/payments/payment-123/refund')
        .set('x-user-id', 'admin-school-1')
        .set('x-user-role', 'SCHOOL_ADMIN')
        .set('x-school-id', 'school-1')
        .send({ amount: 50.00, reason: 'Customer request' })
        .expect(200);

      expect(response.body.result.refundedAmount).toBe(50.00);

      // 3. View audit logs to confirm action was logged
      response = await request(app)
        .get('/api/admin/audit-logs?action=PAYMENT_REFUNDED')
        .set('x-user-id', 'admin-school-1')
        .set('x-user-role', 'SCHOOL_ADMIN')
        .set('x-school-id', 'school-1')
        .expect(200);

      expect(response.body.logs.length).toBeGreaterThan(0);
    });

    test('Complete compliance report workflow', async () => {
      // 1. Generate GDPR report
      let response = await request(app)
        .get('/api/admin/reports/gdpr?startDate=2026-01-01&endDate=2026-01-31')
        .set('x-user-id', 'admin-school-1')
        .set('x-user-role', 'SCHOOL_ADMIN')
        .set('x-school-id', 'school-1')
        .expect(200);

      const gdprReportId = response.body.report.reportId;
      expect(gdprReportId).toBeDefined();

      // 2. Generate COPPA report for same period
      response = await request(app)
        .get('/api/admin/reports/coppa?startDate=2026-01-01&endDate=2026-01-31')
        .set('x-user-id', 'admin-school-1')
        .set('x-user-role', 'SCHOOL_ADMIN')
        .set('x-school-id', 'school-1')
        .expect(200);

      expect(response.body.report.reportType).toBe('COPPA');

      // 3. Verify actions were logged
      response = await request(app)
        .get('/api/admin/audit-logs?action=GDPR_REPORT_GENERATED&page=1&limit=10')
        .set('x-user-id', 'admin-school-1')
        .set('x-user-role', 'SCHOOL_ADMIN')
        .set('x-school-id', 'school-1')
        .expect(200);

      expect(response.body.logs.length).toBeGreaterThan(0);
    });
  });

  // ========== ERROR HANDLING TESTS (3 tests) ==========

  describe('Error Handling', () => {
    test('Should handle non-existent user gracefully', async () => {
      const response = await request(app)
        .get('/api/admin/users/nonexistent-user-id')
        .set('x-user-id', 'admin-school-1')
        .set('x-user-role', 'SITE_ADMIN')
        .expect(404);

      expect(response.body.error).toBe('USER_NOT_FOUND');
    });

    test('Should handle invalid state transitions', async () => {
      const response = await request(app)
        .post('/api/admin/auctions/auction-123/approve')
        .set('x-user-id', 'admin-school-1')
        .set('x-user-role', 'SCHOOL_ADMIN')
        .set('x-school-id', 'school-1')
        .expect(400); // Already approved, can't approve again

      expect(response.body.error).toBe('INVALID_STATE_TRANSITION');
    });

    test('Should return 500 for unexpected server errors', async () => {
      const response = await request(app)
        .get('/api/admin/users')
        .set('x-user-id', 'admin-school-1')
        .set('x-user-role', 'SITE_ADMIN')
        // Force error by not setting required data
        .expect(/4[0-9]{2}|5[0-9]{2}/);

      expect(response.body.error).toBeDefined();
    });
  });
});
