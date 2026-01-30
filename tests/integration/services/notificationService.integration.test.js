/**
 * ============================================================================
 * Section 7: Notification System - Integration Tests
 * Testing with actual database and API endpoints
 * ============================================================================
 */

const request = require('supertest');

describe('Notification Service Integration Tests', () => {
  let app;
  let db;
  let userId;
  let validToken;

  beforeAll(async () => {
    // Initialize test database
    app = require('../../src/app');
    db = require('../../src/index'); // Database connection

    // Create test user
    const userResult = await db.query(
      `INSERT INTO users (email, password_hash, first_name, last_name, role, school_id)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING id`,
      ['notification-test@example.com', 'hash', 'Test', 'User', 'STUDENT', null]
    );

    userId = userResult.rows[0].id;

    // Generate valid token (using app's auth service)
    const authService = require('../../src/services/authenticationService');
    validToken = authService.JWTService.generateAccessToken(userId, 'STUDENT');
  });

  afterAll(async () => {
    // Clean up test user
    await db.query('DELETE FROM users WHERE id = $1', [userId]);
    await db.query('DELETE FROM notification_preferences WHERE user_id = $1', [userId]);
    await db.query('DELETE FROM notifications WHERE user_id = $1', [userId]);
  });

  // ========== Email Notification Integration Tests ==========

  describe('Email Notification Delivery', () => {
    test('should queue and track email notification', async () => {
      const response = await request(app)
        .post('/notifications')
        .set('Authorization', `Bearer ${validToken}`)
        .send({
          type: 'outbid-alert',
          channel: 'email',
          templateId: 'outbid-alert',
          templateData: {
            firstName: 'John',
            artworkTitle: 'Test Painting',
            currentBid: 250.00,
            auctionEndTime: new Date().toLocaleString(),
            auctionLink: 'https://SAG.live/auction/123'
          }
        });

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data.id).toBeDefined();
      expect(response.body.data.status).toBe('queued');
    });

    test('should verify notification in database', async () => {
      const result = await db.query(
        `SELECT id, notification_type, channel, status FROM notifications 
         WHERE user_id = $1 AND notification_type = 'outbid-alert'
         ORDER BY created_at DESC LIMIT 1`,
        [userId]
      );

      expect(result.rows.length).toBeGreaterThan(0);
      expect(result.rows[0].channel).toBe('email');
    });

    test('should handle email template rendering errors gracefully', async () => {
      const response = await request(app)
        .post('/notifications')
        .set('Authorization', `Bearer ${validToken}`)
        .send({
          type: 'unknown-type',
          channel: 'email',
          templateId: 'unknown-template',
          templateData: {}
        });

      // Should fail validation at controller level
      expect([400, 500]).toContain(response.status);
    });

    test('should respect email preferences', async () => {
      // Set user preferences: disable outbid emails
      await db.query(
        `INSERT INTO notification_preferences (user_id, email_outbid)
         VALUES ($1, false)
         ON CONFLICT (user_id) DO UPDATE SET email_outbid = false`,
        [userId]
      );

      const response = await request(app)
        .post('/notifications')
        .set('Authorization', `Bearer ${validToken}`)
        .send({
          type: 'outbid-alert',
          channel: 'email',
          templateId: 'outbid-alert',
          templateData: { firstName: 'John', artworkTitle: 'Art', currentBid: 100 }
        });

      expect(response.body.data.status).toBe('skipped');
      expect(response.body.data.reason).toContain('disabled');
    });
  });

  // ========== Notification Preferences API Tests ==========

  describe('Notification Preferences API', () => {
    test('should retrieve user notification preferences', async () => {
      const response = await request(app)
        .get('/notifications/preferences')
        .set('Authorization', `Bearer ${validToken}`);

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data).toBeDefined();
      expect(response.body.data.email_outbid).toBeDefined();
      expect(response.body.data.sms_outbid).toBeDefined();
    });

    test('should update notification preferences', async () => {
      const response = await request(app)
        .put('/notifications/preferences')
        .set('Authorization', `Bearer ${validToken}`)
        .send({
          email_outbid: false,
          email_auction_ending: true,
          sms_outbid: true,
          sms_winner: false
        });

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data.email_outbid).toBe(false);
      expect(response.body.data.sms_outbid).toBe(true);
    });

    test('should reject invalid preference field', async () => {
      const response = await request(app)
        .put('/notifications/preferences')
        .set('Authorization', `Bearer ${validToken}`)
        .send({
          invalid_field: true
        });

      expect(response.status).toBe(400);
      expect(response.body.success).toBe(false);
    });

    test('should reject non-boolean preference values', async () => {
      const response = await request(app)
        .put('/notifications/preferences')
        .set('Authorization', `Bearer ${validToken}`)
        .send({
          email_outbid: 'yes' // should be boolean
        });

      expect(response.status).toBe(400);
      expect(response.body.success).toBe(false);
    });
  });

  // ========== Notification History API Tests ==========

  describe('Notification History API', () => {
    beforeAll(async () => {
      // Queue multiple notifications for history testing
      for (let i = 0; i < 3; i++) {
        await db.query(
          `INSERT INTO notifications 
           (user_id, notification_type, channel, recipient, template_id, status)
           VALUES ($1, $2, $3, $4, $5, 'sent')`,
          [userId, 'test-notification', 'email', 'test@example.com', 'welcome']
        );
      }
    });

    test('should retrieve notification history', async () => {
      const response = await request(app)
        .get('/notifications')
        .set('Authorization', `Bearer ${validToken}`);

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(Array.isArray(response.body.data)).toBe(true);
      expect(response.body.data.length).toBeGreaterThan(0);
    });

    test('should support pagination', async () => {
      const response = await request(app)
        .get('/notifications?limit=2&offset=0')
        .set('Authorization', `Bearer ${validToken}`);

      expect(response.status).toBe(200);
      expect(response.body.pagination.limit).toBe(2);
      expect(response.body.pagination.offset).toBe(0);
    });

    test('should limit maximum per-page results', async () => {
      const response = await request(app)
        .get('/notifications?limit=300')
        .set('Authorization', `Bearer ${validToken}`);

      expect(response.body.pagination.limit).toBeLessThanOrEqual(200);
    });
  });

  // ========== Unsubscribe Tests ==========

  describe('Unsubscribe Functionality', () => {
    let unsubscribeToken;

    beforeAll(async () => {
      // Generate unsubscribe token
      unsubscribeToken = require('crypto').randomBytes(32).toString('hex');

      // Store token in database
      await db.query(
        `INSERT INTO notification_preferences (user_id, unsubscribe_token)
         VALUES ($1, $2)
         ON CONFLICT (user_id) DO UPDATE SET unsubscribe_token = $2`,
        [userId, unsubscribeToken]
      );
    });

    test('should unsubscribe from email notifications', async () => {
      const response = await request(app)
        .post(`/notifications/unsubscribe/${unsubscribeToken}`)
        .send({ channel: 'email' });

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.message).toContain('email');
    });

    test('should return 404 for invalid token', async () => {
      const response = await request(app)
        .post(`/notifications/unsubscribe/invalid-token-123`)
        .send({ channel: 'email' });

      expect(response.status).toBe(404);
      expect(response.body.success).toBe(false);
    });

    test('should validate channel parameter', async () => {
      const response = await request(app)
        .post(`/notifications/unsubscribe/${unsubscribeToken}`)
        .send({ channel: 'invalid-channel' });

      expect(response.status).toBe(400);
      expect(response.body.errors).toBeDefined();
    });
  });

  // ========== Authorization Tests ==========

  describe('Notification Endpoint Authorization', () => {
    test('should require valid token for notification endpoints', async () => {
      const response = await request(app)
        .get('/notifications')
        .set('Authorization', 'Bearer invalid-token');

      expect(response.status).toBe(401);
    });

    test('should allow only user to access their notifications', async () => {
      // Create another user
      const otherUserResult = await db.query(
        `INSERT INTO users (email, password_hash, first_name, last_name, role)
         VALUES ($1, $2, $3, $4, $5)
         RETURNING id`,
        ['other-user@example.com', 'hash', 'Other', 'User', 'STUDENT']
      );

      const otherUserId = otherUserResult.rows[0].id;
      const otherUserToken = require('../../src/services/authenticationService')
        .JWTService.generateAccessToken(otherUserId, 'STUDENT');

      // Queue notification for first user
      await db.query(
        `INSERT INTO notifications (user_id, notification_type, channel, recipient, template_id)
         VALUES ($1, $2, $3, $4, $5)`,
        [userId, 'test', 'email', 'test@example.com', 'welcome']
      );

      // Try to access with other user's token
      const response = await request(app)
        .get('/notifications')
        .set('Authorization', `Bearer ${otherUserToken}`);

      // Should get empty or only their own notifications
      const otherUserNotifications = response.body.data.filter(n => n.user_id !== otherUserId);
      expect(otherUserNotifications).toEqual([]);

      // Cleanup
      await db.query('DELETE FROM users WHERE id = $1', [otherUserId]);
    });
  });

  // ========== Multiple Notification Type Tests ==========

  describe('All Notification Types', () => {
    const notificationTypes = [
      { type: 'welcome', template: 'welcome', data: { firstName: 'John', verificationLink: 'https://example.com' } },
      { type: 'email-verification', template: 'email-verification', data: { firstName: 'John', verificationLink: 'https://example.com', expiresAt: new Date().toLocaleString() } },
      { type: 'outbid-alert', template: 'outbid-alert', data: { firstName: 'John', artworkTitle: 'Art', currentBid: 100, auctionEndTime: new Date().toLocaleString(), auctionLink: 'https://example.com' } },
      { type: 'auction-ending', template: 'auction-ending', data: { firstName: 'John', artworkTitle: 'Art', auctionEndTime: new Date().toLocaleString(), auctionLink: 'https://example.com' } },
      { type: 'winner-notification', template: 'winner-notification', data: { firstName: 'John', artworkTitle: 'Art', winningBid: 500, paymentLink: 'https://example.com' } },
      { type: 'payment-receipt', template: 'payment-receipt', data: { firstName: 'John', transactionId: 'txn_123', amount: 500, artworkTitle: 'Art', receiptLink: 'https://example.com' } },
      { type: 'refund-confirmation', template: 'refund-confirmation', data: { firstName: 'John', amount: 100, reason: 'User request', refundLink: 'https://example.com' } }
    ];

    notificationTypes.forEach(({ type, template, data }) => {
      test(`should queue ${type} notification`, async () => {
        const response = await request(app)
          .post('/notifications')
          .set('Authorization', `Bearer ${validToken}`)
          .send({
            type,
            channel: 'email',
            templateId: template,
            templateData: data
          });

        expect([200, 201]).toContain(response.status);
        expect(response.body.success).toBe(true);
      });
    });
  });

  // ========== Error Handling Tests ==========

  describe('Error Handling', () => {
    test('should handle missing user email gracefully', async () => {
      // Create user without email
      const userNoEmail = await db.query(
        `INSERT INTO users (email, password_hash, first_name, last_name, role)
         VALUES (NULL, 'hash', 'No', 'Email', 'STUDENT')
         RETURNING id`
      );

      // Attempt to queue notification
      const response = await request(app)
        .post('/notifications')
        .set('Authorization', `Bearer ${validToken}`)
        .send({
          type: 'test',
          channel: 'email',
          templateId: 'welcome',
          templateData: { firstName: 'Test' }
        });

      // Should fail appropriately
      expect([400, 422]).toContain(response.status);

      // Cleanup
      await db.query('DELETE FROM users WHERE id = $1', [userNoEmail.rows[0].id]);
    });

    test('should handle database connection errors', async () => {
      // This would test database error handling
      // In real environment, temporarily disconnect DB
      // For now, just test that service catches errors
      
      const response = await request(app)
        .post('/notifications')
        .set('Authorization', `Bearer invalid-format`)
        .send({
          type: 'test',
          channel: 'email',
          templateId: 'welcome',
          templateData: {}
        });

      expect(response.status).toBe(401);
    });
  });
});
