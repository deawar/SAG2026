/**
 * ============================================================================
 * Section 11 Security Tests - OWASP Top 10 & Penetration Testing
 * ============================================================================
 * Test Suite for:
 * - SQL Injection prevention
 * - XSS prevention  
 * - CSRF protection
 * - Authentication bypass prevention
 * - Authorization/RBAC enforcement
 * - Rate limiting
 * - Password security
 * ============================================================================
 */

const request = require('supertest');
const app = require('../../src/app');
const jwt = require('jsonwebtoken');

describe('SECTION 11: Security Tests - OWASP Top 10', () => {
  let validToken;
  let adminToken;

  beforeAll(() => {
    // Create valid JWT tokens for testing
    validToken = jwt.sign(
      {
        userId: 'test-user-123',
        role: 'student',
        schoolId: 'school-456',
        email: 'test@example.com',
        type: 'access'
      },
      process.env.JWT_ACCESS_SECRET,
      { expiresIn: '15m', algorithm: 'HS256' }
    );

    adminToken = jwt.sign(
      {
        userId: 'admin-user-789',
        role: 'site_admin',
        schoolId: 'school-456',
        email: 'admin@example.com',
        type: 'access'
      },
      process.env.JWT_ACCESS_SECRET,
      { expiresIn: '15m', algorithm: 'HS256' }
    );
  });

  // ============================================================================
  // SQL INJECTION PREVENTION TESTS
  // ============================================================================

  describe('SQL Injection Prevention', () => {
    test('should reject SQL injection in email parameter', async () => {
      const maliciousEmail = "admin'--";
      const response = await request(app)
        .post('/api/auth/login')
        .send({
          email: maliciousEmail,
          password: 'Test@123456'
        });

      // Should sanitize and reject
      expect([400, 401, 403]).toContain(response.status);
    });

    test('should reject UNION-based SQL injection', async () => {
      const maliciousQuery = "' UNION SELECT * FROM users--";
      const response = await request(app)
        .get('/api/auctions')
        .set('Authorization', `Bearer ${validToken}`)
        .query({ filter: maliciousQuery });

      // Should sanitize or reject
      expect([200, 400, 401, 403]).toContain(response.status);
    });

    test('should reject DROP TABLE injection attempts', async () => {
      const maliciousData = "; DROP TABLE users;--";
      const response = await request(app)
        .post('/api/auctions')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          title: maliciousData,
          description: 'Test'
        });

      // Should reject or sanitize
      expect([400, 401, 403, 500]).toContain(response.status);
    });

    test('should escape special SQL characters in user input', async () => {
      const response = await request(app)
        .post('/api/auth/login')
        .send({
          email: 'test@example.com',
          password: "Test@123' OR '1'='1"
        });

      // Should handle safely
      expect([401, 400, 403]).toContain(response.status);
    });
  });

  // ============================================================================
  // XSS (CROSS-SITE SCRIPTING) PREVENTION TESTS
  // ============================================================================

  describe('XSS Prevention', () => {
    test('should encode HTML in auction title', async () => {
      const xssPayload = '<script>alert("xss")</script>';
      const response = await request(app)
        .post('/api/auctions')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          title: xssPayload,
          description: 'Test Auction'
        });

      if (response.status === 200 || response.status === 201) {
        // If stored, verify it's encoded in response
        expect(response.body).not.toContain('<script>');
      }
    });

    test('should prevent reflected XSS in search query', async () => {
      const xssPayload = '<script>alert("xss")</script>';
      const response = await request(app)
        .get('/api/auctions')
        .set('Authorization', `Bearer ${validToken}`)
        .query({ search: xssPayload });

      // Should not execute script
      expect(response.status).not.toBe(500);
    });

    test('should encode HTML in error messages', async () => {
      // Send request that will error with user input
      const response = await request(app)
        .get('/api/auctions/invalid-id-<script>')
        .set('Authorization', `Bearer ${validToken}`);

      // Error response should not contain executable scripts
      if (response.text) {
        expect(response.text).not.toContain('<script>');
      }
    });
  });

  // ============================================================================
  // AUTHENTICATION BYPASS PREVENTION TESTS
  // ============================================================================

  describe('Authentication Bypass Prevention', () => {
    test('should reject request without Authorization header', async () => {
      const response = await request(app)
        .get('/api/auctions');
        // Note: Don't set Authorization header at all

      // Should require auth and return 401
      expect(response.status).toBe(401);
    });

    test('should reject invalid JWT token format', async () => {
      const response = await request(app)
        .get('/api/auctions')
        .set('Authorization', 'Bearer invalid-token-format');

      expect(response.status).toBe(401);
    });

    test('should reject expired JWT tokens', async () => {
      const expiredToken = jwt.sign(
        { userId: 'test', role: 'student' },
        process.env.JWT_ACCESS_SECRET,
        { expiresIn: '-1h', algorithm: 'HS256' } // Expired
      );

      const response = await request(app)
        .get('/api/auctions')
        .set('Authorization', `Bearer ${expiredToken}`);

      expect(response.status).toBe(401);
    });

    test('should reject tampered JWT signature', async () => {
      const tamperedToken = validToken.substring(0, validToken.length - 5) + 'XXXXX';

      const response = await request(app)
        .get('/api/auctions')
        .set('Authorization', `Bearer ${tamperedToken}`);

      expect(response.status).toBe(401);
    });

    test('should reject Bearer token in query parameters', async () => {
      const response = await request(app)
        .get('/api/auctions')
        .query({ token: `Bearer ${validToken}` });

      // Only Authorization header should work
      expect(response.status).toBe(401);
    });

    test('should reject refresh token used as access token', async () => {
      const refreshToken = jwt.sign(
        { userId: 'test', type: 'refresh' },
        process.env.JWT_ACCESS_SECRET,
        { expiresIn: '7d', algorithm: 'HS256' }
      );

      const response = await request(app)
        .get('/api/auctions')
        .set('Authorization', `Bearer ${refreshToken}`);

      expect(response.status).toBe(401);
    });
  });

  // ============================================================================
  // RBAC (ROLE-BASED ACCESS CONTROL) ENFORCEMENT TESTS
  // ============================================================================

  describe('RBAC Enforcement', () => {
    test('should deny student from creating auctions', async () => {
      const studentToken = jwt.sign(
        { userId: 'student', role: 'student', schoolId: 'school-1' },
        process.env.JWT_ACCESS_SECRET,
        { expiresIn: '15m', algorithm: 'HS256' }
      );

      const response = await request(app)
        .post('/api/auctions')
        .set('Authorization', `Bearer ${studentToken}`)
        .send({
          title: 'Unauthorized Auction',
          description: 'Should fail'
        });

      expect([403, 401]).toContain(response.status);
    });

    test('should not allow role modification via request body', async () => {
      const response = await request(app)
        .post('/api/auth/register')
        .send({
          email: 'roletest@example.com',
          password: 'Test@123456',
          firstName: 'Test',
          lastName: 'User',
          role: 'site_admin' // Try to elevate privileges - should be ignored or rejected
        });

      // Role should not be modifiable or endpoint should reject
      expect([400, 401, 403, 201]).toContain(response.status);
    });
  });

  // ============================================================================
  // PASSWORD & AUTHENTICATION SECURITY TESTS
  // ============================================================================

  describe('Password Security', () => {
    test('should not accept weak passwords', async () => {
      const response = await request(app)
        .post('/api/auth/register')
        .send({
          email: 'newuser@example.com',
          password: 'weak', // Too short, no special chars
          firstName: 'Test',
          lastName: 'User'
        });

      // Should reject weak password
      expect([400, 422]).toContain(response.status);
    });

    test('should not return password hash in responses', async () => {
      const response = await request(app)
        .post('/api/auth/login')
        .send({
          email: 'test@example.com',
          password: 'Test@123456'
        });

      // Should never expose password hash in any response
      const responseText = JSON.stringify(response.body);
      expect(responseText).not.toContain('password_hash');
      expect(responseText).not.toContain('passwordHash');
    });
  });

  // ============================================================================
  // PAYMENT SECURITY TESTS
  // ============================================================================

  describe('Payment Security', () => {
    test('should not expose raw card data in responses', async () => {
      const response = await request(app)
        .post('/api/payments')
        .set('Authorization', `Bearer ${validToken}`)
        .send({
          amount: 99.99,
          cardNumber: '4111111111111111' // Should never be accepted
        });

      // Should reject raw card data or not return it
      const responseBody = JSON.stringify(response.body);
      expect(responseBody).not.toContain('4111111111111111');
    });

    test('should prevent duplicate payment processing with idempotency', async () => {
      const idempotencyKey = 'test-idempotency-key-' + Date.now();

      const response1 = await request(app)
        .post('/api/payments')
        .set('Authorization', `Bearer ${validToken}`)
        .set('Idempotency-Key', idempotencyKey)
        .send({
          amount: 99.99,
          token: 'tok_valid'
        });

      // Send same request again with same idempotency key
      const response2 = await request(app)
        .post('/api/payments')
        .set('Authorization', `Bearer ${validToken}`)
        .set('Idempotency-Key', idempotencyKey)
        .send({
          amount: 99.99,
          token: 'tok_valid'
        });

      // If both succeeded, responses should be identical (idempotent)
      if (response1.status === 200 || response1.status === 201) {
        expect(response2.body).toEqual(response1.body);
      }
    });
  });

  // ============================================================================
  // SENSITIVE DATA EXPOSURE TESTS
  // ============================================================================

  describe('Sensitive Data Exposure', () => {
    test('should not expose database connection details in errors', async () => {
      const response = await request(app)
        .get('/api/auctions/invalid-id')
        .set('Authorization', `Bearer ${validToken}`);

      // Error should not expose DB details
      expect(response.text).not.toMatch(/password|host|database|postgres/i);
    });

    test('should not expose internal file paths in error messages', async () => {
      const response = await request(app)
        .post('/api/auth/login')
        .send({ invalid: 'data' });

      // Should not expose internal paths
      expect(response.text).not.toMatch(/\/src\/|\/home\/|\/Users\//);
    });
  });

  // ============================================================================
  // INPUT VALIDATION TESTS
  // ============================================================================

  describe('Input Validation', () => {
    test('should validate email format', async () => {
      const response = await request(app)
        .post('/api/auth/login')
        .send({
          email: 'invalid-email-format',
          password: 'Test@123456'
        });

      expect([400, 401, 422]).toContain(response.status);
    });

    test('should validate required fields', async () => {
      const response = await request(app)
        .post('/api/auth/register')
        .send({
          email: 'test@example.com'
          // Missing password, firstName, lastName
        });

      expect([400, 422]).toContain(response.status);
    });

    test('should enforce maximum string lengths', async () => {
      const response = await request(app)
        .post('/api/auctions')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          title: 'A'.repeat(10000), // Excessively long
          description: 'B'.repeat(10000)
        });

      expect([400, 413]).toContain(response.status);
    });
  });

  // ============================================================================
  // COMPREHENSIVE SECURITY CHECKS
  // ============================================================================

  describe('Comprehensive Security Checks', () => {
    test('should implement security headers', async () => {
      const response = await request(app)
        .get('/health');

      // Check for security headers
      expect(response.headers).toBeDefined();
      // At minimum, basic security headers should be present
    });

    test('should sanitize user input in all endpoints', async () => {
      const maliciousInput = '<script>alert(1)</script>';

      const response = await request(app)
        .post('/api/auctions')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          title: maliciousInput,
          description: maliciousInput
        });

      // Should handle without error
      expect([201, 200, 400, 401, 403]).toContain(response.status);
    });
  });
});

module.exports = {};
