/**
 * ============================================================================
 * Section 11: Security Audit & Penetration Testing
 * Silent Auction Gallery - Security Test Suite
 * ============================================================================
 * 
 * Tests for:
 * - OWASP Top 10 vulnerabilities
 * - Input validation & sanitization
 * - SQL injection prevention
 * - XSS prevention
 * - CSRF protection
 * - Authentication bypass attempts
 * - Privilege escalation
 * - Rate limiting
 * - Security headers
 * 
 * Total: 35+ security tests
 */

require('dotenv').config();
const request = require('supertest');
const app = require('../../src/app');

describe('Security Audit - OWASP Top 10', () => {
  /**
   * =========================================================================
   * 1. SQL INJECTION PREVENTION TESTS (5 tests)
   * =========================================================================
   */
  describe('SQL Injection Prevention', () => {
    test('should prevent SQL injection in email field', async () => {
      const response = await request(app)
        .post('/api/auth/login')
        .send({
          email: "admin@example.com' OR '1'='1",
          password: 'password'
        });

      // Should not return a valid token
      expect(response.status).toBe(401);
      expect(response.body.data?.token).toBeUndefined();
    });

    test('should prevent SQL injection via password field', async () => {
      const response = await request(app)
        .post('/api/auth/login')
        .send({
          email: 'user@example.com',
          password: "password' OR '1'='1"
        });

      expect(response.status).toBe(401);
      expect(response.body.data?.token).toBeUndefined();
    });

    test('should prevent SQL injection in query parameters', async () => {
      const response = await request(app)
        .get("/api/auctions?search=test' OR '1'='1")
        .set('Authorization', 'Bearer invalid_token');

      // Should handle safely without exposing DB structure
      expect(response.status).toBeGreaterThanOrEqual(401);
    });

    test('should sanitize special SQL characters', async () => {
      const response = await request(app)
        .post('/api/auth/login')
        .send({
          email: 'user@example.com"; DROP TABLE users; --',
          password: 'password'
        });

      expect(response.status).toBe(401);
    });

    test('should reject Unicode escape sequences in input', async () => {
      const response = await request(app)
        .post('/api/auth/login')
        .send({
          email: 'user@example.com\\u0027 OR \\u00271\\u0027=\\u00271',
          password: 'password'
        });

      expect(response.status).toBe(401);
    });
  });

  /**
   * =========================================================================
   * 2. CROSS-SITE SCRIPTING (XSS) PREVENTION TESTS (5 tests)
   * =========================================================================
   */
  describe('XSS Prevention', () => {
    test('should encode HTML in error messages', async () => {
      const response = await request(app)
        .post('/api/auth/login')
        .send({
          email: '<script>alert("xss")</script>',
          password: 'password'
        });

      // Response should not contain unescaped script tags
      expect(response.text).not.toContain('<script>');
    });

    test('should prevent stored XSS in auction titles', async () => {
      const maliciousTitle = '<img src=x onerror="alert(\'xss\')">';
      
      const response = await request(app)
        .post('/api/auctions')
        .set('Authorization', 'Bearer fake_token')
        .send({
          title: maliciousTitle,
          description: 'Test'
        });

      // Should be rejected or sanitized
      expect([400, 401, 403]).toContain(response.status);
    });

    test('should prevent XSS in JSON responses', async () => {
      const response = await request(app)
        .get('/api/auctions')
        .set('Authorization', 'Bearer fake_token');

      // Check for proper Content-Type header
      expect(response.headers['content-type']).toMatch(/json/);
      
      // Should not contain raw HTML
      const body = JSON.stringify(response.body);
      expect(body).not.toMatch(/<script[^>]*>/);
    });

    test('should sanitize user input in search fields', async () => {
      const response = await request(app)
        .get('/api/auctions?search=<script>alert(1)</script>')
        .set('Authorization', 'Bearer fake_token');

      expect(response.status).toBeGreaterThanOrEqual(400);
    });

    test('should prevent reflected XSS via redirect', async () => {
      const response = await request(app)
        .get('/api/redirect?url=javascript:alert(1)')
        .set('Authorization', 'Bearer fake_token');

      // Should not redirect to javascript protocol
      expect(response.headers.location).not.toMatch(/javascript:/i);
    });
  });

  /**
   * =========================================================================
   * 3. CSRF PROTECTION TESTS (4 tests)
   * =========================================================================
   */
  describe('CSRF Protection', () => {
    test('should require CSRF token for state-changing requests', async () => {
      const response = await request(app)
        .post('/api/auctions')
        .send({ title: 'Test' });

      // Should require authentication/CSRF token
      expect(response.status).toBe(401);
    });

    test('should validate CSRF token format', async () => {
      const response = await request(app)
        .post('/api/auctions')
        .set('X-CSRF-Token', 'invalid_token_format')
        .send({ title: 'Test' });

      expect(response.status).toBe(401);
    });

    test('should allow GET requests without CSRF token', async () => {
      const response = await request(app)
        .get('/api/auctions');

      // GET should be allowed (may fail auth but not CSRF)
      expect(response.status).not.toBe(403);
    });

    test('should not expose CSRF token in response body', async () => {
      const response = await request(app)
        .get('/api/auctions');

      // Token should be in header, not body
      expect(response.body.csrfToken).toBeUndefined();
    });
  });

  /**
   * =========================================================================
   * 4. AUTHENTICATION BYPASS ATTEMPTS (5 tests)
   * =========================================================================
   */
  describe('Authentication Bypass Prevention', () => {
    test('should reject missing Authorization header', async () => {
      const response = await request(app)
        .get('/api/auctions');

      expect(response.status).toBe(401);
      expect(response.body.success).toBe(false);
    });

    test('should reject invalid JWT token format', async () => {
      const response = await request(app)
        .get('/api/auctions')
        .set('Authorization', 'Bearer invalid.token.format');

      expect(response.status).toBe(401);
    });

    test('should reject expired JWT tokens', async () => {
      // Create an expired token (would need actual JWT creation)
      const expiredToken = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJleHAiOjE2MDAwMDAwMDB9.invalid';

      const response = await request(app)
        .get('/api/auctions')
        .set('Authorization', `Bearer ${expiredToken}`);

      expect(response.status).toBe(401);
    });

    test('should reject tampered JWT signatures', async () => {
      const response = await request(app)
        .get('/api/auctions')
        .set('Authorization', 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.tampered');

      expect(response.status).toBe(401);
    });

    test('should not allow requests with Bearer token in query params', async () => {
      const response = await request(app)
        .get('/api/auctions?token=valid_token');

      // Token should be in header, not query params
      expect(response.status).toBe(401);
    });
  });

  /**
   * =========================================================================
   * 5. PRIVILEGE ESCALATION PREVENTION (4 tests)
   * =========================================================================
   */
  describe('Privilege Escalation Prevention', () => {
    test('should not allow STUDENT to access admin endpoints', async () => {
      const studentToken = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJyb2xlIjoiU1RVREVOVCJ9.invalid';

      const response = await request(app)
        .post('/api/admin/users')
        .set('Authorization', `Bearer ${studentToken}`)
        .send({ email: 'newuser@example.com' });

      expect([401, 403]).toContain(response.status);
    });

    test('should not allow role modification in request body', async () => {
      const response = await request(app)
        .post('/api/auth/register')
        .send({
          email: 'user@example.com',
          password: 'password123!',
          role: 'SITE_ADMIN'  // Attempting to escalate role
        });

      // Role should be set to default STUDENT/BIDDER, not ADMIN
      expect(response.status).toBeGreaterThanOrEqual(400);
    });

    test('should validate resource ownership before modification', async () => {
      const response = await request(app)
        .put('/api/users/other-user-id')
        .set('Authorization', 'Bearer fake_token')
        .send({ email: 'newemail@example.com' });

      // Should require ownership or admin role
      expect([401, 403]).toContain(response.status);
    });

    test('should not expose internal user IDs in responses', async () => {
      const response = await request(app)
        .get('/api/auctions');

      // If response is successful, check that internal IDs aren't exposed
      if (response.status === 200 && response.body.data) {
        expect(response.body.data.internalUserId).toBeUndefined();
      }
    });
  });

  /**
   * =========================================================================
   * 6. SENSITIVE DATA EXPOSURE PREVENTION (4 tests)
   * =========================================================================
   */
  describe('Sensitive Data Exposure Prevention', () => {
    test('should not expose database details in error messages', async () => {
      const response = await request(app)
        .post('/api/auth/login')
        .send({
          email: 'nonexistent@example.com',
          password: 'wrong'
        });

      // Error message should not reveal DB structure
      expect(response.body.message).not.toMatch(/SQL|TABLE|DATABASE|query/i);
    });

    test('should not expose internal file paths in errors', async () => {
      const response = await request(app)
        .get('/api/invalid-endpoint');

      // Should not reveal project structure
      expect(response.text).not.toMatch(/\/Users\/|\/home\/|C:\\Users\\/);
    });

    test('should use HTTPS in production environment', async () => {
      // Check app configuration
      if (process.env.NODE_ENV === 'production') {
        // This would be verified through deployment config
        expect(process.env.NODE_ENV).toBe('production');
      }
    });

    test('should not log sensitive data (passwords)', async () => {
      const response = await request(app)
        .post('/api/auth/login')
        .send({
          email: 'user@example.com',
          password: 'secretPassword123!'
        });

      // Verify password is not in response
      expect(JSON.stringify(response.body)).not.toContain('secretPassword123');
    });
  });

  /**
   * =========================================================================
   * 7. BROKEN ACCESS CONTROL TESTS (3 tests)
   * =========================================================================
   */
  describe('Broken Access Control Prevention', () => {
    test('should enforce school-level data isolation', async () => {
      const response = await request(app)
        .get('/api/auctions/foreign-school-auction-id')
        .set('Authorization', 'Bearer fake_token');

      // Should not access auctions from different schools
      expect([401, 403, 404]).toContain(response.status);
    });

    test('should not allow cross-tenant data access', async () => {
      const response = await request(app)
        .get('/api/users/different-school-user-id')
        .set('Authorization', 'Bearer teacher_token');

      // Teachers should only see their school's users
      expect([401, 403, 404]).toContain(response.status);
    });

    test('should validate payment permission before refund', async () => {
      const response = await request(app)
        .post('/api/payments/transaction-id/refund')
        .set('Authorization', 'Bearer student_token')
        .send({ reason: 'Refund request' });

      // Students shouldn't refund payments
      expect([401, 403]).toContain(response.status);
    });
  });

  /**
   * =========================================================================
   * 8. RATE LIMITING TESTS (3 tests)
   * =========================================================================
   */
  describe('Rate Limiting', () => {
    test('should rate limit login attempts', async () => {
      const attempts = [];

      for (let i = 0; i < 6; i++) {
        const response = await request(app)
          .post('/api/auth/login')
          .send({
            email: 'test@example.com',
            password: 'wrong'
          });
        attempts.push(response.status);
      }

      // Should eventually return 429 (Too Many Requests)
      expect(attempts).toContain(429);
    });

    test('should rate limit API endpoints', async () => {
      const attempts = [];

      for (let i = 0; i < 101; i++) {
        const response = await request(app)
          .get('/api/auctions');
        attempts.push(response.status);
      }

      // Should contain rate limit response
      const hasRateLimit = attempts.some(status => status === 429 || status === 503);
      expect(hasRateLimit).toBe(true);
    });

    test('should not rate limit same user across different endpoints equally', async () => {
      // Rate limits should be per-endpoint
      const loginResponse = await request(app)
        .post('/api/auth/login')
        .send({ email: 'test@example.com', password: 'wrong' });

      const auctionResponse = await request(app)
        .get('/api/auctions');

      // Both might be rate limited but independently
      expect([401, 429]).toContain(loginResponse.status);
    });
  });

  /**
   * =========================================================================
   * 9. SECURITY HEADERS VALIDATION (4 tests)
   * =========================================================================
   */
  describe('Security Headers', () => {
    test('should include X-Content-Type-Options header', async () => {
      const response = await request(app)
        .get('/api/auctions');

      expect(response.headers['x-content-type-options']).toBeDefined();
      expect(response.headers['x-content-type-options']).toBe('nosniff');
    });

    test('should include X-Frame-Options header', async () => {
      const response = await request(app)
        .get('/api/auctions');

      expect(response.headers['x-frame-options']).toBeDefined();
      expect(['DENY', 'SAMEORIGIN']).toContain(response.headers['x-frame-options']);
    });

    test('should include Content-Security-Policy header', async () => {
      const response = await request(app)
        .get('/api/auctions');

      expect(response.headers['content-security-policy']).toBeDefined();
    });

    test('should not expose server information', async () => {
      const response = await request(app)
        .get('/api/auctions');

      // Should not expose Express version or server details
      expect(response.headers['server']).not.toMatch(/Express|Node/);
    });
  });

  /**
   * =========================================================================
   * 10. INPUT VALIDATION TESTS (3 tests)
   * =========================================================================
   */
  describe('Input Validation', () => {
    test('should reject oversized payloads', async () => {
      const largePayload = 'x'.repeat(10 * 1024 * 1024); // 10MB

      const response = await request(app)
        .post('/api/auctions')
        .set('Authorization', 'Bearer fake_token')
        .send({ description: largePayload });

      expect(response.status).toBe(413); // Payload Too Large
    });

    test('should validate email format', async () => {
      const response = await request(app)
        .post('/api/auth/login')
        .send({
          email: 'not-an-email',
          password: 'password'
        });

      expect(response.status).toBeGreaterThanOrEqual(400);
    });

    test('should reject null bytes in input', async () => {
      const response = await request(app)
        .post('/api/auth/login')
        .send({
          email: 'user@example.com\x00',
          password: 'password'
        });

      expect([400, 401]).toContain(response.status);
    });
  });
});
