/**
 * ============================================================================
 * Section 7: Notification System (Email + SMS)
 * Production-Grade Notification Service with Templates & Retry Logic
 * ============================================================================
 */

const nodemailer = require('nodemailer');
const crypto = require('crypto');

// ============================================================================
// 7.1 Notification Model (In-Database Structure)
// ============================================================================
/**
 * Database Schema for notifications table (added to schema.sql):
 *
 * CREATE TABLE notifications (
 *   id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
 *   user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 *   notification_type VARCHAR(50) NOT NULL,
 *   channel VARCHAR(20) NOT NULL CHECK (channel IN ('email', 'sms', 'in-app')),
 *   recipient VARCHAR(255) NOT NULL,
 *   subject VARCHAR(255),
 *   message_content TEXT NOT NULL,
 *   template_id VARCHAR(100),
 *   template_data JSONB,
 *   status VARCHAR(20) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'sent', 'failed', 'bounced', 'unsubscribed')),
 *   delivery_attempts INT DEFAULT 0,
 *   last_attempt_at TIMESTAMP WITH TIME ZONE,
 *   sent_at TIMESTAMP WITH TIME ZONE,
 *   error_message TEXT,
 *   metadata JSONB,
 *   created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
 *   updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
 *   CONSTRAINT notification_user_check CHECK (user_id IS NOT NULL OR recipient IS NOT NULL)
 * );
 *
 * CREATE INDEX idx_notifications_user_status ON notifications(user_id, status);
 * CREATE INDEX idx_notifications_channel ON notifications(channel);
 * CREATE INDEX idx_notifications_pending ON notifications(status) WHERE status = 'pending';
 *
 * CREATE TABLE notification_preferences (
 *   id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
 *   user_id UUID NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
 *   email_outbid BOOLEAN DEFAULT true,
 *   email_auction_ending BOOLEAN DEFAULT true,
 *   email_winner BOOLEAN DEFAULT true,
 *   email_payment BOOLEAN DEFAULT true,
 *   email_security BOOLEAN DEFAULT true,
 *   sms_outbid BOOLEAN DEFAULT false,
 *   sms_auction_ending BOOLEAN DEFAULT false,
 *   sms_winner BOOLEAN DEFAULT true,
 *   unsubscribe_token VARCHAR(255),
 *   created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
 *   updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
 * );
 */

// ============================================================================
// 7.2 Email Template Service
// ============================================================================

class EmailTemplateService {
  /**
   * Generate email content from template
   * @param {string} templateId - Template identifier
   * @param {object} data - Template variables
   * @returns {object} { subject, html, text }
   */
  static generateTemplate(templateId, data) {
    const templates = {
      'welcome': EmailTemplateService.welcomeTemplate,
      'email-verification': EmailTemplateService.emailVerificationTemplate,
      'outbid-alert': EmailTemplateService.outbidAlertTemplate,
      'auction-ending': EmailTemplateService.auctionEndingTemplate,
      'winner-notification': EmailTemplateService.winnerNotificationTemplate,
      'payment-receipt': EmailTemplateService.paymentReceiptTemplate,
      'refund-confirmation': EmailTemplateService.refundConfirmationTemplate,
      'password-reset': EmailTemplateService.passwordResetTemplate,
      'security-alert': EmailTemplateService.securityAlertTemplate,
      'auction-approved': EmailTemplateService.auctionApprovedTemplate
    };

    const templateFn = templates[templateId];
    if (!templateFn) {
      throw new Error(`Unknown email template: ${templateId}`);
    }

    return templateFn(data);
  }

  // ========== Template Functions ==========

  static welcomeTemplate(data) {
    const { firstName, verificationLink } = data;
    return {
      subject: 'Welcome to Silent Auction Gallery',
      html: `
        <h1>Welcome, ${this.escapeHtml(firstName)}!</h1>
        <p>We're excited to have you join our community of bidders and art enthusiasts.</p>
        <p>To get started, please verify your email address by clicking the link below:</p>
        <p><a href="${verificationLink}" style="background-color: #007bff; color: white; padding: 10px 20px; text-decoration: none; border-radius: 5px;">Verify Email</a></p>
        <p>This link will expire in 24 hours.</p>
        <hr />
        <p><small>Silent Auction Gallery Team</small></p>
      `,
      text: `Welcome, ${firstName}!\n\nVerify your email: ${verificationLink}\n\nThis link expires in 24 hours.`
    };
  }

  static emailVerificationTemplate(data) {
    const { firstName, verificationLink } = data;
    return {
      subject: 'Verify Your Email Address',
      html: `
        <h2>Email Verification Required</h2>
        <p>Hello ${this.escapeHtml(firstName)},</p>
        <p>Click the link below to verify your email address and complete your registration:</p>
        <p><a href="${verificationLink}" style="background-color: #28a745; color: white; padding: 10px 20px; text-decoration: none; border-radius: 5px;">Verify Email</a></p>
        <p>Link expires: ${data.expiresAt}</p>
      `,
      text: `Verify your email: ${verificationLink}`
    };
  }

  static outbidAlertTemplate(data) {
    const { firstName, artworkTitle, currentBid, auctionEndTime, auctionLink } = data;
    return {
      subject: `⚡ You've been outbid on ${this.escapeHtml(artworkTitle)}!`,
      html: `
        <h2>Outbid Alert!</h2>
        <p>Hi ${this.escapeHtml(firstName)},</p>
        <p>Someone just placed a higher bid on <strong>${this.escapeHtml(artworkTitle)}</strong>.</p>
        <p><strong>Current bid:</strong> $${currentBid.toFixed(2)}</p>
        <p><strong>Auction ends:</strong> ${auctionEndTime}</p>
        <p><a href="${auctionLink}" style="background-color: #ff6b6b; color: white; padding: 10px 20px; text-decoration: none; border-radius: 5px;">Place a New Bid</a></p>
      `,
      text: `You've been outbid! Current bid: $${currentBid.toFixed(2)} - ${auctionLink}`
    };
  }

  static auctionEndingTemplate(data) {
    const { firstName, artworkTitle, auctionEndTime, auctionLink } = data;
    return {
      subject: `⏰ ${this.escapeHtml(artworkTitle)} - Auction Ends in 1 Hour!`,
      html: `
        <h2>Auction Ending Soon</h2>
        <p>Hi ${this.escapeHtml(firstName)},</p>
        <p><strong>${this.escapeHtml(artworkTitle)}</strong> will close in 1 hour!</p>
        <p><strong>Closes at:</strong> ${auctionEndTime}</p>
        <p><a href="${auctionLink}" style="background-color: #fd7e14; color: white; padding: 10px 20px; text-decoration: none; border-radius: 5px;">View Auction</a></p>
      `,
      text: `Auction ending soon: ${artworkTitle} - ${auctionLink}`
    };
  }

  static winnerNotificationTemplate(data) {
    const { firstName, artworkTitle, winningBid, paymentLink } = data;
    return {
      subject: `🎉 Congratulations! You won ${this.escapeHtml(artworkTitle)}!`,
      html: `
        <h2>You Won!</h2>
        <p>Congratulations, ${this.escapeHtml(firstName)}!</p>
        <p>You are the winning bidder for <strong>${this.escapeHtml(artworkTitle)}</strong>.</p>
        <p><strong>Winning bid:</strong> $${winningBid.toFixed(2)}</p>
        <p><a href="${paymentLink}" style="background-color: #28a745; color: white; padding: 10px 20px; text-decoration: none; border-radius: 5px;">Complete Payment</a></p>
        <p><strong>Action required:</strong> Complete payment within 48 hours to finalize your purchase.</p>
      `,
      text: `You won! Winning bid: $${winningBid.toFixed(2)} - ${paymentLink}`
    };
  }

  static paymentReceiptTemplate(data) {
    const { firstName, transactionId, amount, artworkTitle, receiptLink } = data;
    return {
      subject: `Payment Confirmation - Transaction ${transactionId}`,
      html: `
        <h2>Payment Received</h2>
        <p>Hi ${this.escapeHtml(firstName)},</p>
        <p>Your payment has been processed successfully.</p>
        <p><strong>Artwork:</strong> ${this.escapeHtml(artworkTitle)}</p>
        <p><strong>Amount:</strong> $${amount.toFixed(2)}</p>
        <p><strong>Transaction ID:</strong> ${transactionId}</p>
        <p><a href="${receiptLink}" style="background-color: #17a2b8; color: white; padding: 10px 20px; text-decoration: none; border-radius: 5px;">View Receipt</a></p>
      `,
      text: `Payment confirmed: $${amount.toFixed(2)} - ${receiptLink}`
    };
  }

  static refundConfirmationTemplate(data) {
    const { firstName, amount, reason, refundLink } = data;
    return {
      subject: `Refund Processed - $${amount.toFixed(2)}`,
      html: `
        <h2>Refund Processed</h2>
        <p>Hi ${this.escapeHtml(firstName)},</p>
        <p>Your refund has been processed.</p>
        <p><strong>Amount:</strong> $${amount.toFixed(2)}</p>
        <p><strong>Reason:</strong> ${this.escapeHtml(reason)}</p>
        <p>The refund should appear in your account within 3-5 business days.</p>
        <p><a href="${refundLink}" style="background-color: #6c757d; color: white; padding: 10px 20px; text-decoration: none; border-radius: 5px;">View Details</a></p>
      `,
      text: `Refund processed: $${amount.toFixed(2)}`
    };
  }

  static passwordResetTemplate(data) {
    const { firstName, resetLink } = data;
    return {
      subject: 'Reset Your Silent Auction Gallery Password',
      html: `
        <h2>Password Reset Request</h2>
        <p>Hi ${this.escapeHtml(firstName)},</p>
        <p>Click the link below to reset your password:</p>
        <p><a href="${resetLink}" style="background-color: #007bff; color: white; padding: 10px 20px; text-decoration: none; border-radius: 5px;">Reset Password</a></p>
        <p>This link expires in 1 hour. If you didn't request this, please ignore this email.</p>
      `,
      text: `Reset your password: ${resetLink}`
    };
  }

  static securityAlertTemplate(data) {
    const { firstName, alertType, details, actionLink } = data;
    return {
      subject: `🔒 Security Alert: ${alertType}`,
      html: `
        <h2>Security Alert</h2>
        <p>Hi ${this.escapeHtml(firstName)},</p>
        <p>${this.escapeHtml(details)}</p>
        <p><a href="${actionLink}" style="background-color: #dc3545; color: white; padding: 10px 20px; text-decoration: none; border-radius: 5px;">Secure Your Account</a></p>
      `,
      text: `Security alert: ${details}`
    };
  }

  static auctionApprovedTemplate(data) {
    const { firstName, artworkTitle, auctionStartTime, auctionLink } = data;
    return {
      subject: `✅ Your Auction Approved: ${this.escapeHtml(artworkTitle)}`,
      html: `
        <h2>Auction Approved</h2>
        <p>Hi ${this.escapeHtml(firstName)},</p>
        <p>Your auction for <strong>${this.escapeHtml(artworkTitle)}</strong> has been approved and is now live!</p>
        <p><strong>Starts at:</strong> ${auctionStartTime}</p>
        <p><a href="${auctionLink}" style="background-color: #28a745; color: white; padding: 10px 20px; text-decoration: none; border-radius: 5px;">View Auction</a></p>
      `,
      text: `Your auction is live: ${artworkTitle} - ${auctionLink}`
    };
  }

  /**
   * Escape HTML to prevent XSS
   */
  static escapeHtml(text) {
    if (!text) return '';
    const map = {
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#039;'
    };
    return text.replace(/[&<>"']/g, char => map[char]);
  }
}

// ============================================================================
// 7.3 Email Provider Service
// ============================================================================

class EmailProvider {
  constructor(config) {
    this.config = config;
    this.transporter = null;
    this.initializeTransporter();
  }

  /**
   * Initialize email transporter based on config
   */
  initializeTransporter() {
    if (this.config.provider === 'smtp') {
      this.transporter = nodemailer.createTransport({
        host: this.config.host,
        port: this.config.port,
        secure: this.config.secure !== false,
        auth: {
          user: this.config.user,
          pass: this.config.password
        }
      });
    } else if (this.config.provider === 'sendgrid') {
      // SendGrid via SMTP
      this.transporter = nodemailer.createTransport({
        host: 'smtp.sendgrid.net',
        port: 587,
        auth: {
          user: 'apikey',
          pass: this.config.apiKey
        }
      });
    } else if (this.config.provider === 'aws-ses') {
      // AWS SES via Nodemailer
      this.transporter = nodemailer.createTransport({
        SES: new (require('aws-sdk')).SES({
          apiVersion: '2010-12-01',
          region: this.config.region
        })
      });
    }
  }

  /**
   * Send email
   * @param {string} to - Recipient email
   * @param {string} subject - Email subject
   * @param {string} html - HTML content
   * @param {string} text - Plain text content
   * @returns {Promise} { messageId }
   */
  async send(to, subject, html, text) {
    if (!this.transporter) {
      throw new Error('Email transporter not initialized');
    }

    return this.transporter.sendMail({
      from: this.config.fromEmail,
      to,
      subject,
      html,
      text,
      headers: {
        'X-Mailer': 'Silent-Auction-Gallery/1.0',
        'List-Unsubscribe': `<mailto:unsubscribe@SAG.live>`
      }
    });
  }

  /**
   * Verify transporter connection
   */
  async verify() {
    if (!this.transporter) {
      return false;
    }
    try {
      await this.transporter.verify();
      return true;
    } catch (error) {
      console.error('Email transporter verification failed:', error.message);
      return false;
    }
  }
}

// ============================================================================
// 7.4 SMS Provider Service (Abstract)
// ============================================================================

class SMSProvider {
  /**
   * Send SMS message
   * @throws Must be implemented by subclass
   */
  async send(to, message) {
    throw new Error('send() not implemented');
  }
}

// Twilio SMS Implementation
class TwilioSMSProvider extends SMSProvider {
  constructor(config) {
    super();
    this.config = config;
    this.twilio = require('twilio')(config.accountSid, config.authToken);
  }

  async send(to, message) {
    if (!this.config.enabled) {
      console.log('SMS disabled, skipping send to:', to);
      return { success: false, message: 'SMS disabled' };
    }

    return this.twilio.messages.create({
      body: message,
      from: this.config.fromNumber,
      to
    });
  }
}

// ============================================================================
// 7.5 Notification Service (Main)
// ============================================================================

class NotificationService {
  constructor(database, emailConfig, smsConfig) {
    this.db = database;
    this.emailProvider = new EmailProvider(emailConfig);
    this.smsProvider = new TwilioSMSProvider(smsConfig || {});
    this.maxRetries = 3;
    this.retryDelayMs = 60000; // 1 minute
  }

  /**
   * Queue notification for delivery
   * @param {object} notification - { userId, type, channel, templateId, templateData }
   * @returns {Promise} { id, status }
   */
  async queue(notification) {
    const { userId, type, channel, templateId, templateData } = notification;

    if (!['email', 'sms', 'in-app'].includes(channel)) {
      throw new Error(`Invalid channel: ${channel}`);
    }

    // Get user details
    const userResult = await this.db.query(
      'SELECT email, phone_number FROM users WHERE id = $1 AND deleted_at IS NULL',
      [userId]
    );

    if (userResult.rows.length === 0) {
      throw new Error(`User not found: ${userId}`);
    }

    const user = userResult.rows[0];
    const recipient = channel === 'email' ? user.email : user.phone_number;

    if (!recipient) {
      throw new Error(`No ${channel} address for user: ${userId}`);
    }

    // Check preferences
    const isAllowed = await this.checkPreferences(userId, type, channel);
    if (!isAllowed) {
      return { id: null, status: 'skipped', reason: 'User disabled this notification type' };
    }

    // Insert notification record
    const result = await this.db.query(
      `INSERT INTO notifications 
       (user_id, notification_type, channel, recipient, template_id, template_data, status)
       VALUES ($1, $2, $3, $4, $5, $6, 'pending')
       RETURNING id, status`,
      [userId, type, channel, recipient, templateId, JSON.stringify(templateData)]
    );

    const notificationId = result.rows[0].id;

    // Attempt immediate delivery
    await this.deliver(notificationId);

    return { id: notificationId, status: 'queued' };
  }

  /**
   * Check user notification preferences
   */
  async checkPreferences(userId, notificationType, channel) {
    const result = await this.db.query(
      `SELECT * FROM notification_preferences WHERE user_id = $1`,
      [userId]
    );

    if (result.rows.length === 0) {
      // Default to enabled if no preferences set
      return true;
    }

    const prefs = result.rows[0];
    const prefKey = `${channel}_${notificationType.replace('-', '_').toLowerCase()}`;

    return prefs[prefKey] !== false;
  }

  /**
   * Attempt to deliver notification
   */
  async deliver(notificationId) {
    const result = await this.db.query(
      'SELECT * FROM notifications WHERE id = $1',
      [notificationId]
    );

    if (result.rows.length === 0) {
      throw new Error(`Notification not found: ${notificationId}`);
    }

    const notification = result.rows[0];

    // Check if max retries exceeded
    if (notification.delivery_attempts >= this.maxRetries) {
      await this.db.query(
        'UPDATE notifications SET status = $1 WHERE id = $2',
        ['failed', notificationId]
      );
      return { status: 'failed', reason: 'Max retries exceeded' };
    }

    try {
      let result;

      if (notification.channel === 'email') {
        result = await this.sendEmail(notification);
      } else if (notification.channel === 'sms') {
        result = await this.sendSMS(notification);
      } else if (notification.channel === 'in-app') {
        result = { messageId: 'in-app', status: 'sent' };
      }

      // Update notification record
      await this.db.query(
        `UPDATE notifications 
         SET status = 'sent', sent_at = NOW(), delivery_attempts = delivery_attempts + 1
         WHERE id = $1`,
        [notificationId]
      );

      return { status: 'sent', messageId: result.messageId };
    } catch (error) {
      // Record failed attempt
      await this.db.query(
        `UPDATE notifications 
         SET status = 'failed', 
             error_message = $1,
             delivery_attempts = delivery_attempts + 1,
             last_attempt_at = NOW()
         WHERE id = $2`,
        [error.message, notificationId]
      );

      // Schedule retry if not exceeded max
      if (notification.delivery_attempts < this.maxRetries - 1) {
        setTimeout(() => this.deliver(notificationId), this.retryDelayMs);
      }

      throw error;
    }
  }

  /**
   * Send email notification
   */
  async sendEmail(notification) {
    const templateData = JSON.parse(notification.template_data);
    const emailContent = EmailTemplateService.generateTemplate(
      notification.template_id,
      templateData
    );

    const result = await this.emailProvider.send(
      notification.recipient,
      emailContent.subject,
      emailContent.html,
      emailContent.text
    );

    return { messageId: result.messageId, status: 'sent' };
  }

  /**
   * Send SMS notification
   */
  async sendSMS(notification) {
    const templateData = JSON.parse(notification.template_data);
    
    // Build SMS message (max 160 chars for standard SMS)
    const smsMessage = this.buildSMSMessage(notification.template_id, templateData);

    const result = await this.smsProvider.send(notification.recipient, smsMessage);

    return { messageId: result.sid || result.id, status: 'sent' };
  }

  /**
   * Build SMS message (shorter for SMS, includes link)
   */
  buildSMSMessage(templateId, data) {
    const messages = {
      'outbid-alert': `SAG: Outbid on ${data.artworkTitle}! Current: $${data.currentBid} - ${data.auctionLink}`,
      'auction-ending': `SAG: ${data.artworkTitle} ends in 1 hour! ${data.auctionLink}`,
      'winner-notification': `SAG: You won ${data.artworkTitle}! Pay: $${data.winningBid} - ${data.paymentLink}`,
      'payment-receipt': `SAG: Payment confirmed for $${data.amount}. TxnID: ${data.transactionId}`
    };

    return messages[templateId] || `SAG: ${data.message}`;
  }

  /**
   * Get notification history for user
   */
  async getHistory(userId, limit = 50, offset = 0) {
    const result = await this.db.query(
      `SELECT id, notification_type, channel, recipient, status, sent_at, created_at
       FROM notifications
       WHERE user_id = $1
       ORDER BY created_at DESC
       LIMIT $2 OFFSET $3`,
      [userId, limit, offset]
    );

    return result.rows;
  }

  /**
   * Get user notification preferences
   */
  async getPreferences(userId) {
    const result = await this.db.query(
      'SELECT * FROM notification_preferences WHERE user_id = $1',
      [userId]
    );

    if (result.rows.length === 0) {
      // Return default preferences
      return this.defaultPreferences();
    }

    return result.rows[0];
  }

  /**
   * Update user notification preferences
   */
  async updatePreferences(userId, preferences) {
    const {
      email_outbid,
      email_auction_ending,
      email_winner,
      email_payment,
      email_security,
      sms_outbid,
      sms_auction_ending,
      sms_winner
    } = preferences;

    const result = await this.db.query(
      `INSERT INTO notification_preferences 
       (user_id, email_outbid, email_auction_ending, email_winner, email_payment, 
        email_security, sms_outbid, sms_auction_ending, sms_winner)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
       ON CONFLICT (user_id) DO UPDATE SET
       email_outbid = COALESCE($2, email_outbid),
       email_auction_ending = COALESCE($3, email_auction_ending),
       email_winner = COALESCE($4, email_winner),
       email_payment = COALESCE($5, email_payment),
       email_security = COALESCE($6, email_security),
       sms_outbid = COALESCE($7, sms_outbid),
       sms_auction_ending = COALESCE($8, sms_auction_ending),
       sms_winner = COALESCE($9, sms_winner),
       updated_at = NOW()
       RETURNING *`,
      [userId, email_outbid, email_auction_ending, email_winner, email_payment, 
       email_security, sms_outbid, sms_auction_ending, sms_winner]
    );

    return result.rows[0];
  }

  /**
   * Generate unsubscribe token
   */
  generateUnsubscribeToken(userId) {
    return crypto.randomBytes(32).toString('hex');
  }

  /**
   * Process unsubscribe request
   */
  async unsubscribe(token, channel) {
    const result = await this.db.query(
      `UPDATE notification_preferences 
       SET ${channel}_outbid = false,
           ${channel}_auction_ending = false,
           ${channel}_winner = false,
           updated_at = NOW()
       WHERE unsubscribe_token = $1
       RETURNING user_id`,
      [token]
    );

    return result.rows.length > 0;
  }

  /**
   * Retry failed notifications (background job)
   */
  async retryFailedNotifications() {
    const result = await this.db.query(
      `SELECT id FROM notifications 
       WHERE status = 'failed' 
       AND delivery_attempts < $1
       AND last_attempt_at < NOW() - INTERVAL '5 minutes'
       LIMIT 100`,
      [this.maxRetries]
    );

    for (const row of result.rows) {
      try {
        await this.deliver(row.id);
      } catch (error) {
        console.error(`Failed to retry notification ${row.id}:`, error.message);
      }
    }

    return { retried: result.rows.length };
  }

  /**
   * Default preferences
   */
  defaultPreferences() {
    return {
      email_outbid: true,
      email_auction_ending: true,
      email_winner: true,
      email_payment: true,
      email_security: true,
      sms_outbid: false,
      sms_auction_ending: false,
      sms_winner: true
    };
  }
}

module.exports = {
  NotificationService,
  EmailTemplateService,
  EmailProvider,
  SMSProvider,
  TwilioSMSProvider
};
