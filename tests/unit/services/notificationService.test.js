/**
 * ============================================================================
 * Section 7: Notification Service - Unit Tests
 * 25+ tests covering email, SMS, templates, preferences, retry logic
 * ============================================================================
 */

describe('NotificationService', () => {
  let notificationService;
  let mockDb;
  let emailProvider;
  let smsProvider;

  beforeEach(() => {
    // Mock database
    mockDb = {
      query: jest.fn()
    };

    // Mock email config
    const emailConfig = {
      provider: 'smtp',
      host: 'smtp.example.com',
      port: 587,
      secure: true,
      user: 'test@example.com',
      password: 'password',
      fromEmail: 'noreply@SAG.live'
    };

    // Mock SMS config
    const smsConfig = {
      enabled: true,
      accountSid: 'AC_test',
      authToken: 'token',
      fromNumber: '+12125551234'
    };

    const { NotificationService, EmailProvider } = require('../../src/services/notificationService');
    notificationService = new NotificationService(mockDb, emailConfig, smsConfig);
  });

  // ========== Email Template Tests ==========

  describe('EmailTemplateService', () => {
    const { EmailTemplateService } = require('../../src/services/notificationService');

    test('should generate welcome email template', () => {
      const data = {
        firstName: 'John',
        verificationLink: 'https://SAG.live/verify?token=123'
      };

      const template = EmailTemplateService.generateTemplate('welcome', data);

      expect(template.subject).toContain('Welcome');
      expect(template.html).toContain('John');
      expect(template.html).toContain(data.verificationLink);
      expect(template.text).toBeDefined();
    });

    test('should generate outbid alert email template', () => {
      const data = {
        firstName: 'Jane',
        artworkTitle: 'Sunset Painting',
        currentBid: 150.00,
        auctionEndTime: '2026-01-29 18:00:00',
        auctionLink: 'https://SAG.live/auction/123'
      };

      const template = EmailTemplateService.generateTemplate('outbid-alert', data);

      expect(template.subject).toContain('outbid');
      expect(template.subject).toContain('Sunset Painting');
      expect(template.html).toContain('$150.00');
      expect(template.html).toContain(data.auctionLink);
    });

    test('should generate winner notification email template', () => {
      const data = {
        firstName: 'Winner',
        artworkTitle: 'Abstract Art',
        winningBid: 500.00,
        paymentLink: 'https://SAG.live/payment/123'
      };

      const template = EmailTemplateService.generateTemplate('winner-notification', data);

      expect(template.subject).toContain('Congratulations');
      expect(template.html).toContain('You won');
      expect(template.html).toContain('$500.00');
    });

    test('should escape HTML in template data', () => {
      const data = {
        firstName: '<script>alert("xss")</script>',
        verificationLink: 'https://example.com'
      };

      const template = EmailTemplateService.generateTemplate('welcome', data);

      expect(template.html).not.toContain('<script>');
      expect(template.html).toContain('&lt;script&gt;');
    });

    test('should throw error for unknown template', () => {
      expect(() => {
        EmailTemplateService.generateTemplate('unknown-template', {});
      }).toThrow('Unknown email template');
    });

    test('should generate all 10 email templates without error', () => {
      const templates = [
        'welcome', 'email-verification', 'outbid-alert', 'auction-ending',
        'winner-notification', 'payment-receipt', 'refund-confirmation',
        'password-reset', 'security-alert', 'auction-approved'
      ];

      const testData = {
        firstName: 'Test',
        email: 'test@example.com',
        artworkTitle: 'Test Art',
        currentBid: 100,
        winningBid: 100,
        amount: 100,
        transactionId: 'txn_123',
        resetLink: 'https://example.com/reset',
        verificationLink: 'https://example.com/verify',
        auctionLink: 'https://example.com/auction',
        paymentLink: 'https://example.com/payment',
        auctionEndTime: new Date().toLocaleString(),
        alertType: 'Login from new device',
        details: 'A new login was detected',
        actionLink: 'https://example.com/security',
        reason: 'Customer request',
        refundLink: 'https://example.com/refund'
      };

      templates.forEach(templateId => {
        expect(() => {
          EmailTemplateService.generateTemplate(templateId, testData);
        }).not.toThrow();
      });
    });
  });

  // ========== Notification Queueing Tests ==========

  describe('queue', () => {
    test('should queue email notification successfully', async () => {
      mockDb.query
        .mockResolvedValueOnce({ rows: [{ email: 'test@example.com', phone_number: '+12125551234' }] })
        .mockResolvedValueOnce({ rows: [{ email: 'test@example.com', phone_number: '+12125551234' }] })
        .mockResolvedValueOnce({ rows: [{ email: 'test@example.com', phone_number: '+12125551234' }] })
        .mockResolvedValueOnce({ rows: [{ id: 'notif-123', status: 'pending' }] });

      const result = await notificationService.queue({
        userId: 'user-123',
        type: 'outbid-alert',
        channel: 'email',
        templateId: 'outbid-alert',
        templateData: { firstName: 'John', artworkTitle: 'Art', currentBid: 100 }
      });

      expect(result.status).toBe('queued');
      expect(result.id).toBe('notif-123');
    });

    test('should throw error for invalid channel', async () => {
      await expect(notificationService.queue({
        userId: 'user-123',
        type: 'test',
        channel: 'invalid',
        templateId: 'test',
        templateData: {}
      })).rejects.toThrow('Invalid channel');
    });

    test('should throw error for user not found', async () => {
      mockDb.query.mockResolvedValueOnce({ rows: [] });

      await expect(notificationService.queue({
        userId: 'invalid-user',
        type: 'test',
        channel: 'email',
        templateId: 'welcome',
        templateData: {}
      })).rejects.toThrow('User not found');
    });

    test('should throw error if no email for email channel', async () => {
      mockDb.query.mockResolvedValueOnce({ rows: [{ email: null, phone_number: '+12125551234' }] });

      await expect(notificationService.queue({
        userId: 'user-123',
        type: 'test',
        channel: 'email',
        templateId: 'welcome',
        templateData: {}
      })).rejects.toThrow('No email address');
    });

    test('should skip notification if user disabled preference', async () => {
      mockDb.query
        .mockResolvedValueOnce({ rows: [{ email: 'test@example.com', phone_number: '+12125551234' }] })
        .mockResolvedValueOnce({ rows: [{ email_outbid: false }] });

      const result = await notificationService.queue({
        userId: 'user-123',
        type: 'outbid-alert',
        channel: 'email',
        templateId: 'outbid-alert',
        templateData: {}
      });

      expect(result.status).toBe('skipped');
      expect(result.reason).toContain('disabled');
    });
  });

  // ========== Preference Management Tests ==========

  describe('getPreferences', () => {
    test('should return user preferences', async () => {
      const prefs = {
        user_id: 'user-123',
        email_outbid: true,
        email_auction_ending: false,
        sms_outbid: true
      };

      mockDb.query.mockResolvedValueOnce({ rows: [prefs] });

      const result = await notificationService.getPreferences('user-123');

      expect(result.email_outbid).toBe(true);
      expect(result.email_auction_ending).toBe(false);
      expect(result.sms_outbid).toBe(true);
    });

    test('should return default preferences if none set', async () => {
      mockDb.query.mockResolvedValueOnce({ rows: [] });

      const result = await notificationService.getPreferences('user-123');

      expect(result.email_outbid).toBe(true);
      expect(result.email_auction_ending).toBe(true);
      expect(result.sms_outbid).toBe(false);
    });
  });

  describe('updatePreferences', () => {
    test('should update user preferences', async () => {
      mockDb.query.mockResolvedValueOnce({
        rows: [{
          user_id: 'user-123',
          email_outbid: false,
          sms_outbid: true
        }]
      });

      const result = await notificationService.updatePreferences('user-123', {
        email_outbid: false,
        sms_outbid: true
      });

      expect(result.email_outbid).toBe(false);
      expect(result.sms_outbid).toBe(true);
    });
  });

  // ========== Notification History Tests ==========

  describe('getHistory', () => {
    test('should retrieve notification history', async () => {
      const history = [
        { id: '1', notification_type: 'outbid-alert', status: 'sent' },
        { id: '2', notification_type: 'winner-notification', status: 'sent' }
      ];

      mockDb.query.mockResolvedValueOnce({ rows: history });

      const result = await notificationService.getHistory('user-123', 50, 0);

      expect(result).toHaveLength(2);
      expect(result[0].notification_type).toBe('outbid-alert');
    });

    test('should respect limit and offset', async () => {
      mockDb.query.mockResolvedValueOnce({ rows: [] });

      await notificationService.getHistory('user-123', 25, 50);

      const query = mockDb.query.mock.calls[0][1];
      expect(query[1]).toBe(25); // limit
      expect(query[2]).toBe(50); // offset
    });
  });

  // ========== Unsubscribe Tests ==========

  describe('unsubscribe', () => {
    test('should unsubscribe user from email notifications', async () => {
      mockDb.query.mockResolvedValueOnce({
        rows: [{ user_id: 'user-123' }]
      });

      const result = await notificationService.unsubscribe('token-123', 'email');

      expect(result).toBe(true);
    });

    test('should return false for invalid token', async () => {
      mockDb.query.mockResolvedValueOnce({ rows: [] });

      const result = await notificationService.unsubscribe('invalid-token', 'email');

      expect(result).toBe(false);
    });
  });

  // ========== Token Generation Tests ==========

  describe('generateUnsubscribeToken', () => {
    test('should generate unique unsubscribe tokens', () => {
      const token1 = notificationService.generateUnsubscribeToken('user-123');
      const token2 = notificationService.generateUnsubscribeToken('user-123');

      expect(token1).not.toBe(token2);
      expect(token1).toHaveLength(64); // 32 bytes hex = 64 chars
    });
  });

  // ========== SMS Message Building Tests ==========

  describe('buildSMSMessage', () => {
    test('should build outbid alert SMS', () => {
      const message = notificationService.buildSMSMessage('outbid-alert', {
        artworkTitle: 'Painting',
        currentBid: 100,
        auctionLink: 'https://SAG.live/auction/123'
      });

      expect(message).toContain('Outbid');
      expect(message).toContain('Painting');
      expect(message).toContain('$100');
    });

    test('should build winner SMS', () => {
      const message = notificationService.buildSMSMessage('winner-notification', {
        artworkTitle: 'Art',
        winningBid: 500,
        paymentLink: 'https://SAG.live/payment/123'
      });

      expect(message).toContain('won');
      expect(message).toContain('$500');
    });
  });

  // ========== Retry Logic Tests ==========

  describe('retryFailedNotifications', () => {
    test('should retry failed notifications', async () => {
      mockDb.query.mockResolvedValueOnce({
        rows: [
          { id: 'notif-1' },
          { id: 'notif-2' }
        ]
      });

      const result = await notificationService.retryFailedNotifications();

      expect(result.retried).toBe(2);
    });

    test('should not retry beyond max attempts', async () => {
      mockDb.query.mockResolvedValueOnce({ rows: [] });

      const result = await notificationService.retryFailedNotifications();

      expect(result.retried).toBe(0);
    });
  });

  // ========== Delivery Tests ==========

  describe('deliver', () => {
    test('should deliver pending notification', async () => {
      const notification = {
        id: 'notif-123',
        channel: 'in-app',
        delivery_attempts: 0,
        template_id: 'welcome',
        template_data: JSON.stringify({ firstName: 'John' })
      };

      mockDb.query
        .mockResolvedValueOnce({ rows: [notification] })
        .mockResolvedValueOnce({ rows: [] });

      const result = await notificationService.deliver('notif-123');

      expect(result.status).toBe('sent');
    });

    test('should fail notification after max retries', async () => {
      const notification = {
        id: 'notif-123',
        channel: 'email',
        delivery_attempts: 3,
        template_id: 'welcome',
        template_data: JSON.stringify({ firstName: 'John' })
      };

      mockDb.query.mockResolvedValueOnce({ rows: [notification] });

      const result = await notificationService.deliver('notif-123');

      expect(result.reason).toContain('Max retries');
    });
  });
});

// ============================================================================
// Section 7: Notification Controller - Unit Tests
// ============================================================================

describe('NotificationController', () => {
  let controller;
  let mockService;
  let req, res, next;

  beforeEach(() => {
    mockService = {
      queue: jest.fn(),
      getHistory: jest.fn(),
      getPreferences: jest.fn(),
      updatePreferences: jest.fn(),
      unsubscribe: jest.fn()
    };

    const { NotificationController } = require('../../src/controllers/notificationController');
    controller = new NotificationController(mockService);

    req = {
      user: { id: 'user-123', firstName: 'John' },
      body: {},
      query: {},
      params: {}
    };

    res = {
      json: jest.fn().mockReturnThis(),
      status: jest.fn().mockReturnThis()
    };

    next = jest.fn();
  });

  test('should queue notification successfully', async () => {
    req.body = {
      type: 'outbid-alert',
      channel: 'email',
      templateId: 'outbid-alert',
      templateData: {}
    };

    mockService.queue.mockResolvedValueOnce({ id: 'notif-123', status: 'queued' });

    await controller.queueNotification(req, res, next);

    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
      success: true,
      data: expect.objectContaining({ status: 'queued' })
    }));
  });

  test('should return 400 for missing fields', async () => {
    req.body = { type: 'test' }; // missing channel, templateId

    await controller.queueNotification(req, res, next);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
      success: false,
      errors: expect.any(Array)
    }));
  });

  test('should get notification history', async () => {
    mockService.getHistory.mockResolvedValueOnce([
      { id: '1', type: 'outbid' },
      { id: '2', type: 'winner' }
    ]);

    await controller.getHistory(req, res, next);

    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
      success: true,
      data: expect.arrayContaining([])
    }));
  });

  test('should get preferences', async () => {
    mockService.getPreferences.mockResolvedValueOnce({
      email_outbid: true,
      sms_outbid: false
    });

    await controller.getPreferences(req, res, next);

    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
      success: true,
      data: expect.any(Object)
    }));
  });

  test('should update preferences', async () => {
    req.body = { email_outbid: false, sms_outbid: true };

    mockService.updatePreferences.mockResolvedValueOnce({
      email_outbid: false,
      sms_outbid: true
    });

    await controller.updatePreferences(req, res, next);

    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
      success: true
    }));
  });

  test('should reject invalid preference field', async () => {
    req.body = { invalid_field: true };

    await controller.updatePreferences(req, res, next);

    expect(res.status).toHaveBeenCalledWith(400);
  });

  test('should unsubscribe from notifications', async () => {
    req.params = { token: 'token-123' };
    req.body = { channel: 'email' };

    mockService.unsubscribe.mockResolvedValueOnce(true);

    await controller.unsubscribe(req, res, next);

    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
      success: true,
      message: expect.stringContaining('Unsubscribed')
    }));
  });

  test('should return 404 for invalid unsubscribe token', async () => {
    req.params = { token: 'invalid' };
    req.body = { channel: 'email' };

    mockService.unsubscribe.mockResolvedValueOnce(false);

    await controller.unsubscribe(req, res, next);

    expect(res.status).toHaveBeenCalledWith(404);
  });

  test('should send test notification', async () => {
    req.body = { channel: 'email', templateId: 'outbid-alert' };

    mockService.queue.mockResolvedValueOnce({ id: 'test-notif', status: 'queued' });

    await controller.sendTestNotification(req, res, next);

    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
      success: true,
      message: expect.stringContaining('Test')
    }));
  });
});
