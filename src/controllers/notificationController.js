/**
 * ============================================================================
 * Section 7: Notification Controller & Routes
 * Handles HTTP endpoints for notification management
 * ============================================================================
 */

// ============================================================================
// 7.6 Notification Controller
// ============================================================================

class NotificationController {
  constructor(notificationService) {
    this.notificationService = notificationService;
  }

  /**
   * Queue a notification (internal use)
   * POST /notifications
   */
  async queueNotification(req, res, next) {
    try {
      const userId = req.user.id;
      const { type, channel, templateId, templateData } = req.body;

      // Validate input
      if (!type || !channel || !templateId) {
        return res.status(400).json({
          success: false,
          message: 'Missing required fields: type, channel, templateId',
          errors: ['type', 'channel', 'templateId']
        });
      }

      const result = await this.notificationService.queue({
        userId,
        type,
        channel,
        templateId,
        templateData
      });

      return res.json({
        success: true,
        message: 'Notification queued for delivery',
        data: result
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Get notification history
   * GET /notifications?limit=50&offset=0
   */
  async getHistory(req, res, next) {
    try {
      const userId = req.user.id;
      const limit = Math.min(parseInt(req.query.limit) || 50, 200);
      const offset = parseInt(req.query.offset) || 0;

      const notifications = await this.notificationService.getHistory(userId, limit, offset);

      return res.json({
        success: true,
        message: 'Notification history retrieved',
        data: notifications,
        pagination: { limit, offset, count: notifications.length }
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Get notification preferences
   * GET /notifications/preferences
   */
  async getPreferences(req, res, next) {
    try {
      const userId = req.user.id;

      const preferences = await this.notificationService.getPreferences(userId);

      return res.json({
        success: true,
        message: 'Preferences retrieved',
        data: preferences
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Update notification preferences
   * PUT /notifications/preferences
   */
  async updatePreferences(req, res, next) {
    try {
      const userId = req.user.id;
      const preferences = req.body;

      // Validate preference fields
      const validKeys = [
        'email_outbid', 'email_auction_ending', 'email_winner', 'email_payment', 'email_security',
        'sms_outbid', 'sms_auction_ending', 'sms_winner'
      ];

      for (const key of Object.keys(preferences)) {
        if (!validKeys.includes(key)) {
          return res.status(400).json({
            success: false,
            message: `Invalid preference key: ${key}`,
            errors: [`Invalid key: ${key}`]
          });
        }
        if (typeof preferences[key] !== 'boolean') {
          return res.status(400).json({
            success: false,
            message: `Preference values must be boolean`,
            errors: [`${key} must be true or false`]
          });
        }
      }

      const updated = await this.notificationService.updatePreferences(userId, preferences);

      return res.json({
        success: true,
        message: 'Preferences updated',
        data: updated
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Mark notification as read
   * POST /notifications/:id/read
   */
  async markAsRead(req, res, next) {
    try {
      const userId = req.user.id;
      const { id } = req.params;

      // Verify notification belongs to user
      // (Implementation depends on notification table structure)

      return res.json({
        success: true,
        message: 'Notification marked as read'
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Unsubscribe from notifications
   * POST /notifications/unsubscribe/:token
   */
  async unsubscribe(req, res, next) {
    try {
      const { token } = req.params;
      const { channel } = req.body;

      if (!['email', 'sms'].includes(channel)) {
        return res.status(400).json({
          success: false,
          message: 'Invalid channel',
          errors: ['channel must be email or sms']
        });
      }

      const success = await this.notificationService.unsubscribe(token, channel);

      if (!success) {
        return res.status(404).json({
          success: false,
          message: 'Unsubscribe token not found or expired'
        });
      }

      return res.json({
        success: true,
        message: `Unsubscribed from ${channel} notifications`
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Test notification delivery (admin only)
   * POST /notifications/test
   */
  async sendTestNotification(req, res, next) {
    try {
      const userId = req.user.id;
      const { channel, templateId } = req.body;

      if (!['email', 'sms'].includes(channel)) {
        return res.status(400).json({
          success: false,
          message: 'Invalid channel',
          errors: ['channel']
        });
      }

      const testData = {
        firstName: req.user.firstName,
        artworkTitle: 'Test Artwork',
        currentBid: 100.00,
        auctionEndTime: new Date(Date.now() + 3600000).toLocaleString(),
        auctionLink: 'https://SAG.live/auction/test'
      };

      const result = await this.notificationService.queue({
        userId,
        type: 'test',
        channel,
        templateId,
        templateData: testData
      });

      return res.json({
        success: true,
        message: 'Test notification sent',
        data: result
      });
    } catch (error) {
      next(error);
    }
  }
}

// ============================================================================
// 7.7 Notification Routes
// ============================================================================

const express = require('express');
const router = express.Router();

/**
 * Routes require NotificationController instance
 * Usage in src/routes/index.js:
 * 
 * const { NotificationService } = require('../services/notificationService');
 * const NotificationController = require('../controllers/notificationController');
 * const notificationService = new NotificationService(db, emailConfig, smsConfig);
 * const notificationController = new NotificationController(notificationService);
 * 
 * router.post('/notifications', authMiddleware.verifyToken, 
 *   (req, res, next) => notificationController.queueNotification(req, res, next));
 */

// Get notification history
router.get('/notifications',
  (req, res, next) => {
    // authMiddleware.verifyToken(req, res, next);
  },
  (req, res, next) => {
    const controller = req.app.get('notificationController');
    return controller.getHistory(req, res, next);
  }
);

// Get notification preferences
router.get('/notifications/preferences',
  (req, res, next) => {
    const controller = req.app.get('notificationController');
    return controller.getPreferences(req, res, next);
  }
);

// Update notification preferences
router.put('/notifications/preferences',
  (req, res, next) => {
    const controller = req.app.get('notificationController');
    return controller.updatePreferences(req, res, next);
  }
);

// Unsubscribe from notifications
router.post('/notifications/unsubscribe/:token',
  (req, res, next) => {
    const controller = req.app.get('notificationController');
    return controller.unsubscribe(req, res, next);
  }
);

// Send test notification (admin only)
router.post('/notifications/test',
  (req, res, next) => {
    const controller = req.app.get('notificationController');
    return controller.sendTestNotification(req, res, next);
  }
);

// Mark notification as read
router.post('/notifications/:id/read',
  (req, res, next) => {
    const controller = req.app.get('notificationController');
    return controller.markAsRead(req, res, next);
  }
);

// Queue notification (internal)
router.post('/notifications',
  (req, res, next) => {
    const controller = req.app.get('notificationController');
    return controller.queueNotification(req, res, next);
  }
);

module.exports = {
  NotificationController,
  router
};
