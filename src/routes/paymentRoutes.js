/**
 * ============================================================================
 * Payment Routes
 * Silent Auction Gallery - Payment Processing Endpoints
 * ============================================================================
 */

const express = require('express');
const router = express.Router();
const authMiddleware = require('../middleware/authMiddleware');
const PaymentController = require('../controllers/paymentController');
const {
  StripeGateway,
  SquareGateway,
  PayPalGateway,
  PaymentService,
  FraudDetectionService
} = require('../services/paymentService');

/**
 * NullPaymentService — stand-in when no gateway env vars are configured.
 */
class NullPaymentService {
  _notConfigured() { throw new Error('PaymentService not configured'); }
  async processPayment()   { this._notConfigured(); }
  async getPaymentStatus() { this._notConfigured(); }
  async processRefund()    { this._notConfigured(); }
  async handleWebhook()    { this._notConfigured(); }
}

function buildPaymentService(db) {
  const gateways = {};

  if (process.env.STRIPE_SECRET_KEY) {
    gateways.STRIPE = new StripeGateway({
      apiKey: process.env.STRIPE_SECRET_KEY,
      webhookSecret: process.env.STRIPE_WEBHOOK_SECRET
    });
  }
  if (process.env.SQUARE_ACCESS_TOKEN) {
    gateways.SQUARE = new SquareGateway({
      apiKey: process.env.SQUARE_ACCESS_TOKEN,
      environment: process.env.SQUARE_ENVIRONMENT || 'production'
    });
  }
  if (process.env.PAYPAL_CLIENT_ID && process.env.PAYPAL_CLIENT_SECRET) {
    gateways.PAYPAL = new PayPalGateway({
      clientId: process.env.PAYPAL_CLIENT_ID,
      clientSecret: process.env.PAYPAL_CLIENT_SECRET,
      environment: process.env.PAYPAL_ENVIRONMENT || 'production',
      webhookId: process.env.PAYPAL_WEBHOOK_ID
    });
  }

  if (Object.keys(gateways).length === 0) {
    return new NullPaymentService();
  }

  return new PaymentService({
    db,
    gateways,
    fraudDetectionService: new FraudDetectionService({ db }),
    complianceService: { logTransaction: async () => {} }
  });
}

// Lazily resolved on first use — pool not available at module load time
// (same pattern as adminRoutes.js)
let _paymentController = null;
function getPaymentController() {
  if (!_paymentController) {
    const { pool } = require('../models/index');
    _paymentController = new PaymentController(buildPaymentService(pool));
  }
  return _paymentController;
}

/**
 * POST /api/payments
 * Process payment for bid
 * Auth: Required (any authenticated user)
 *
 * Headers:
 * - Authorization: Bearer <accessToken>
 * - Idempotency-Key: <uuid> (optional, prevents double-charge)
 *
 * Body:
 * {
 *   "auctionId": "uuid",
 *   "amount": 175.00,
 *   "paymentToken": "tok_123",
 *   "description": "Payment for auction xyz"
 * }
 *
 * Response: 201
 * {
 *   "success": true,
 *   "message": "Payment processed successfully",
 *   "data": {
 *     "transactionId": "txn_123",
 *     "auctionId": "uuid",
 *     "amount": 175.00,
 *     "platformFee": 6.38,
 *     "totalCharged": 181.38,
 *     "status": "completed",
 *     "createdAt": "2026-01-27T15:30:45Z"
 *   }
 * }
 */
router.post('/',
  authMiddleware.verifyToken,
  (req, res, next) => getPaymentController().processPayment(req, res, next)
);

/**
 * GET /api/payments/:transactionId
 * Get payment transaction details
 * Auth: Required (owner or SITE_ADMIN)
 *
 * Headers:
 * - Authorization: Bearer <accessToken>
 *
 * Response: 200
 * {
 *   "success": true,
 *   "data": {
 *     "transactionId": "txn_123",
 *     "auctionId": "uuid",
 *     "amount": 175.00,
 *     "platformFee": 6.38,
 *     "status": "completed",
 *     "gateway": "stripe",
 *     "createdAt": "2026-01-27T15:30:45Z",
 *     "updatedAt": "2026-01-27T15:30:45Z",
 *     "refundedAmount": null,
 *     "refundReason": null
 *   }
 * }
 */
router.get('/:transactionId',
  authMiddleware.verifyToken,
  (req, res, next) => getPaymentController().getPaymentStatus(req, res, next)
);

/**
 * POST /api/payments/:transactionId/refund
 * Refund payment (Full or Partial)
 * Auth: Required (SITE_ADMIN or SCHOOL_ADMIN only)
 * RBAC: Enforced - admin roles only
 *
 * Headers:
 * - Authorization: Bearer <accessToken>
 *
 * Body:
 * {
 *   "amount": 175.00 (optional, for partial refund),
 *   "reason": "Auction cancelled"
 * }
 *
 * Response: 200
 * {
 *   "success": true,
 *   "message": "Refund issued successfully",
 *   "data": {
 *     "refundId": "ref_123",
 *     "transactionId": "txn_123",
 *     "amount": 175.00,
 *     "status": "completed",
 *     "reason": "Auction cancelled",
 *     "processedBy": "admin@school.edu",
 *     "createdAt": "2026-01-27T15:30:45Z"
 *   }
 * }
 */
router.post('/:transactionId/refund',
  authMiddleware.verifyToken,
  authMiddleware.verifyRole('SITE_ADMIN', 'SCHOOL_ADMIN'),
  (req, res, next) => getPaymentController().refundPayment(req, res, next)
);

/**
 * POST /api/webhooks/payment
 * Generic payment webhook handler
 * Auth: NOT required (signature verified instead)
 *
 * Headers:
 * - X-Webhook-Signature: <signature>
 * - X-Gateway: stripe|square|paypal|authorize.net
 *
 * Body: Gateway-specific event JSON
 *
 * Response: 200
 * {
 *   "success": true,
 *   "message": "Webhook processed"
 * }
 */
router.post('/webhooks/payment',
  (req, res, next) => getPaymentController().handleWebhook(req, res, next)
);

/**
 * ============================================================================
 * EXPORT ROUTES
 * ============================================================================
 */

module.exports = router;
