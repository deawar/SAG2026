/**
 * ============================================================================
 * Payment Controller
 * Handles payment processing, refunds, and payment webhooks
 * ============================================================================
 */

const ValidationUtils = require('../utils/validationUtils');

class PaymentController {
  constructor(paymentService) {
    this.paymentService = paymentService;
  }

  /**
   * Process payment for winning auction
   * POST /api/payments
   * @param {Object} req - Express request
   * @param {Object} res - Express response
   * @param {Function} next - Express next middleware
   */
  async processPayment(req, res, next) {
    try {
      // 1. Extract and validate input
      const { auctionId, amount, paymentToken, description } = req.body;
      const userId = req.user.id;

      // 2. Validate required fields
      if (!auctionId || amount === undefined || !paymentToken) {
        return res.status(400).json({
          success: false,
          message: 'Missing required fields: auctionId, amount, paymentToken',
          errors: ['auctionId is required', 'amount is required', 'paymentToken is required']
        });
      }

      // 3. Validate format
      if (!ValidationUtils.validateUUID(auctionId)) {
        return res.status(400).json({
          success: false,
          message: 'Invalid auction ID format',
          errors: ['auctionId must be a valid UUID']
        });
      }

      if (!ValidationUtils.validateAmount(amount)) {
        return res.status(400).json({
          success: false,
          message: 'Invalid payment amount',
          errors: ['amount must be positive and less than $999,999.99']
        });
      }

      // 4. Sanitize description
      const sanitizedDescription = description ? ValidationUtils.sanitizeString(description, 500) : null;

      // 5. Get idempotency key from headers (prevent duplicate charges)
      const idempotencyKey = req.headers['idempotency-key'];

      // 6. Call payment service
      const transaction = await this.paymentService.processPayment({
        userId,
        auctionId,
        amount,
        paymentToken,
        description: sanitizedDescription,
        idempotencyKey,
        ipAddress: req.ip
      });

      // 7. Return transaction (NO sensitive data like token)
      return res.status(201).json({
        success: true,
        message: 'Payment processed successfully',
        data: {
          transactionId: transaction.id,
          auctionId: transaction.auctionId,
          amount: transaction.amount,
          platformFee: transaction.platformFee,
          totalCharged: transaction.amount + transaction.platformFee,
          status: transaction.status,
          createdAt: transaction.createdAt
        }
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Get payment transaction details
   * GET /api/payments/:transactionId
   * @param {Object} req - Express request
   * @param {Object} res - Express response
   * @param {Function} next - Express next middleware
   */
  async getPaymentStatus(req, res, next) {
    try {
      const { transactionId } = req.params;
      const userId = req.user.id;

      // 1. Validate format
      if (!transactionId || typeof transactionId !== 'string') {
        return res.status(400).json({
          success: false,
          message: 'Invalid transaction ID'
        });
      }

      // 2. Retrieve transaction
      const transaction = await this.paymentService.getTransaction(transactionId);

      if (!transaction) {
        return res.status(404).json({
          success: false,
          message: 'Transaction not found'
        });
      }

      // 3. Verify user owns this transaction or is admin
      if (transaction.userId !== userId && req.user.role !== 'SITE_ADMIN') {
        return res.status(403).json({
          success: false,
          message: 'Access denied to this transaction'
        });
      }

      // 4. Return transaction details (NO sensitive data)
      return res.json({
        success: true,
        data: {
          transactionId: transaction.id,
          auctionId: transaction.auctionId,
          amount: transaction.amount,
          platformFee: transaction.platformFee,
          status: transaction.status,
          gateway: transaction.gateway,
          createdAt: transaction.createdAt,
          updatedAt: transaction.updatedAt,
          refundedAmount: transaction.refundedAmount,
          refundReason: transaction.refundReason
        }
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Refund a payment transaction
   * POST /api/payments/:transactionId/refund
   * RBAC: SITE_ADMIN, SCHOOL_ADMIN only
   * @param {Object} req - Express request
   * @param {Object} res - Express response
   * @param {Function} next - Express next middleware
   */
  async refundPayment(req, res, next) {
    try {
      const { transactionId } = req.params;
      const { reason, amount: refundAmount } = req.body;
      const adminId = req.user.id;

      // 1. Validate transaction ID
      if (!transactionId || typeof transactionId !== 'string') {
        return res.status(400).json({
          success: false,
          message: 'Invalid transaction ID'
        });
      }

      // 2. Validate reason
      if (!reason || typeof reason !== 'string') {
        return res.status(400).json({
          success: false,
          message: 'Refund reason is required'
        });
      }

      const sanitizedReason = ValidationUtils.sanitizeString(reason, 200);

      // 3. Retrieve transaction
      const transaction = await this.paymentService.getTransaction(transactionId);

      if (!transaction) {
        return res.status(404).json({
          success: false,
          message: 'Transaction not found'
        });
      }

      // 4. Check 48-hour immutability window
      const age = Date.now() - new Date(transaction.createdAt).getTime();
      if (age > 48 * 60 * 60 * 1000) {
        return res.status(403).json({
          success: false,
          message: 'Transaction is immutable after 48 hours and cannot be refunded'
        });
      }

      // 5. Validate refund amount if provided
      const actualRefundAmount = refundAmount || transaction.amount;
      if (actualRefundAmount > transaction.amount) {
        return res.status(400).json({
          success: false,
          message: 'Refund amount exceeds transaction amount'
        });
      }

      // 6. Process refund
      const refund = await this.paymentService.refundTransaction(
        transactionId,
        sanitizedReason,
        actualRefundAmount,
        adminId
      );

      // 7. Return refund details
      return res.json({
        success: true,
        message: 'Refund issued successfully',
        data: {
          refundId: refund.id,
          transactionId: refund.transactionId,
          amount: refund.amount,
          status: refund.status,
          reason: refund.reason,
          processedBy: refund.processedBy,
          createdAt: refund.createdAt
        }
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Handle payment gateway webhooks
   * POST /api/webhooks/payment
   * Unprotected but signature verified
   * @param {Object} req - Express request
   * @param {Object} res - Express response
   * @param {Function} next - Express next middleware
   */
  async handleWebhook(req, res, next) {
    try {
      // 1. Extract webhook signature from headers
      const signature = req.headers['x-webhook-signature'];
      const gateway = req.headers['x-gateway'];

      if (!signature || !gateway) {
        return res.status(400).json({
          success: false,
          message: 'Missing webhook signature or gateway header'
        });
      }

      // 2. Verify webhook signature (must match gateway secret)
      const isValid = await this.paymentService.verifyWebhookSignature(
        gateway,
        signature,
        req.rawBody || JSON.stringify(req.body)
      );

      if (!isValid) {
        return res.status(401).json({
          success: false,
          message: 'Invalid webhook signature'
        });
      }

      // 3. Extract webhook event type and data
      const { type, data } = req.body;

      if (!type || !data) {
        return res.status(400).json({
          success: false,
          message: 'Missing webhook type or data'
        });
      }

      // 4. Process webhook based on type
      switch (type) {
        case 'payment.completed':
          await this.paymentService.handlePaymentCompleted(data);
          break;
        case 'payment.failed':
          await this.paymentService.handlePaymentFailed(data);
          break;
        case 'payment.refunded':
          await this.paymentService.handlePaymentRefunded(data);
          break;
        default:
          // Ignore unknown webhook types
          break;
      }

      // 5. Return success to acknowledge webhook
      return res.json({
        success: true,
        message: 'Webhook processed'
      });
    } catch (error) {
      // Don't expose errors to gateway - just log and acknowledge
      console.error('Webhook processing error:', error);
      return res.json({
        success: true,
        message: 'Webhook acknowledged'
      });
    }
  }
}

module.exports = PaymentController;
