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

// Placeholder payment service (will be injected in production)
const paymentController = new PaymentController(null);

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
  (req, res, next) => paymentController.processPayment(req, res, next)
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
  (req, res, next) => paymentController.getPaymentStatus(req, res, next)
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
  (req, res, next) => paymentController.refundPayment(req, res, next)
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
  (req, res, next) => paymentController.handleWebhook(req, res, next)
);

/**
 * ============================================================================
 * EXPORT ROUTES
 * ============================================================================
 */

module.exports = router;
