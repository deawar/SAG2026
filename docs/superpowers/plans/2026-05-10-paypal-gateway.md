# PayPal Gateway Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add `PayPalGateway` as a fully working third payment gateway alongside the existing Stripe and Square implementations, using the same `PaymentGateway` abstract interface.

**Architecture:** A new `PayPalGateway` class is added to `src/services/paymentService.js`, following the exact same pattern as `StripeGateway` and `SquareGateway`. PayPal's Orders v2 API requires a two-step flow: the server creates an Order (returning an approval URL) and later captures it once the buyer approves — these map to `tokenizePaymentMethod` and `chargeCard` respectively. The gateway is registered by `gateway_type: 'PAYPAL'` in the `payment_gateways` DB table, matching the key used in the `PaymentService.gateways` dispatch map.

**Tech Stack:** `@paypal/checkout-server-sdk` (official PayPal Node.js SDK), Node.js 16+, Jest for tests.

---

## File Structure

| Action | File | Purpose |
|--------|------|---------|
| Modify | `src/services/paymentService.js` | Add `PayPalGateway` class after `SquareGateway`; add to `module.exports` |
| Modify | `src/routes/paymentRoutes.js` | Register `PayPalGateway` in the gateway dispatch map |
| Modify | `src/routes/adminRoutes.js` | Allow `PAYPAL` as a valid `gateway_type` when creating a gateway record |
| Modify | `.env.example` | Document new `PAYPAL_*` environment variables |
| Create | `tests/unit/services/paypalGateway.test.js` | Unit tests for all 5 gateway methods + error paths |

---

## Task 1: Install PayPal SDK and document environment variables

**Files:**
- Run: terminal
- Modify: `.env.example`

- [ ] **Step 1: Install the PayPal SDK**

```bash
cd Silent-Auction-Gallery
npm install @paypal/checkout-server-sdk
```

Expected output: `added 1 package` (or similar — no errors).

- [ ] **Step 2: Verify install**

```bash
node -e "const p = require('@paypal/checkout-server-sdk'); console.log(Object.keys(p.core))"
```

Expected output: `[ 'PayPalHttpClient', 'SandboxEnvironment', 'LiveEnvironment', ... ]`

- [ ] **Step 3: Add PayPal env vars to `.env.example`**

In `.env.example`, append after the existing payment gateway vars:

```
# PayPal Gateway
PAYPAL_CLIENT_ID=your_paypal_client_id_here
PAYPAL_CLIENT_SECRET=your_paypal_client_secret_here
PAYPAL_ENVIRONMENT=sandbox
# PAYPAL_ENVIRONMENT=production   (uncomment for live)
PAYPAL_WEBHOOK_ID=your_paypal_webhook_id_here
```

- [ ] **Step 4: Commit**

```bash
git add package.json package-lock.json .env.example
git commit -m "chore: add @paypal/checkout-server-sdk and document env vars"
```

---

## Task 2: Implement `PayPalGateway` class

**Files:**
- Modify: `src/services/paymentService.js` — insert after line 325 (end of `SquareGateway`) and before line 327 (`// 4.4 Payment Service`)

- [ ] **Step 1: Write the failing test (verify class does not exist yet)**

```bash
node -e "const {PayPalGateway} = require('./src/services/paymentService'); console.log(PayPalGateway)"
```

Expected: `undefined` (not yet exported).

- [ ] **Step 2: Add `PayPalGateway` class to `src/services/paymentService.js`**

Insert the following block immediately after the closing `}` of `SquareGateway` (after line 325) and before the `// 4.4` comment:

```js
// ============================================================================
// 4.3b PayPal Gateway Implementation
// ============================================================================

class PayPalGateway extends PaymentGateway {
  constructor(config) {
    super(config);
    const paypal = require('@paypal/checkout-server-sdk');
    const environment = config.environment === 'production'
      ? new paypal.core.LiveEnvironment(config.clientId, config.clientSecret)
      : new paypal.core.SandboxEnvironment(config.clientId, config.clientSecret);
    this.client = new paypal.core.PayPalHttpClient(environment);
    this.paypal = paypal;
  }

  async tokenizePaymentMethod(paymentData) {
    const { amount, currency, description, returnUrl, cancelUrl, metadata } = paymentData;
    try {
      const request = new this.paypal.orders.OrdersCreateRequest();
      request.prefer('return=representation');
      request.requestBody({
        intent: 'CAPTURE',
        purchase_units: [{
          reference_id: metadata?.artworkId || 'default',
          description: description || 'Silent Auction Gallery purchase',
          amount: {
            currency_code: (currency || 'USD').toUpperCase(),
            value: Number(amount).toFixed(2)
          }
        }],
        application_context: {
          return_url: returnUrl,
          cancel_url: cancelUrl,
          brand_name: 'Silent Auction Gallery',
          user_action: 'PAY_NOW'
        }
      });
      const order = await this.client.execute(request);
      const approvalLink = order.result.links.find(l => l.rel === 'approve');
      return {
        token: order.result.id,
        approvalUrl: approvalLink ? approvalLink.href : null
      };
    } catch (error) {
      throw new Error(`PAYPAL_TOKENIZATION_FAILED: ${error.message}`);
    }
  }

  async chargeCard(chargeData) {
    const { token: orderId } = chargeData;
    try {
      const request = new this.paypal.orders.OrdersCaptureRequest(orderId);
      request.requestBody({});
      const capture = await this.client.execute(request);
      const captureDetail = capture.result.purchase_units[0].payments.captures[0];
      return {
        transactionId: captureDetail.id,
        orderId: capture.result.id,
        status: capture.result.status,
        amount: parseFloat(captureDetail.amount.value),
        currency: captureDetail.amount.currency_code,
        timestamp: new Date(captureDetail.create_time),
        gatewayResponse: capture.result
      };
    } catch (error) {
      throw new Error(`PAYPAL_CHARGE_FAILED: ${error.message}`);
    }
  }

  async refundCharge(refundData) {
    const { transactionId: captureId, amount, reason } = refundData;
    try {
      const request = new this.paypal.payments.CapturesRefundRequest(captureId);
      request.requestBody({
        amount: amount ? { currency_code: 'USD', value: Number(amount).toFixed(2) } : undefined,
        note_to_payer: reason || 'Refund'
      });
      const refund = await this.client.execute(request);
      return {
        refundId: refund.result.id,
        status: refund.result.status,
        amount: refund.result.amount ? parseFloat(refund.result.amount.value) : amount,
        timestamp: new Date(refund.result.create_time)
      };
    } catch (error) {
      throw new Error(`PAYPAL_REFUND_FAILED: ${error.message}`);
    }
  }

  async getTransactionStatus(transactionId) {
    try {
      const request = new this.paypal.payments.CapturesGetRequest(transactionId);
      const capture = await this.client.execute(request);
      return {
        transactionId: capture.result.id,
        status: capture.result.status,
        amount: parseFloat(capture.result.amount.value),
        currency: capture.result.amount.currency_code,
        timestamp: new Date(capture.result.create_time)
      };
    } catch (error) {
      throw new Error(`PAYPAL_STATUS_CHECK_FAILED: ${error.message}`);
    }
  }

  async validateWebhook(webhookData, headers) {
    try {
      const request = new this.paypal.notifications.VerifyWebhookSignatureRequest();
      request.requestBody({
        auth_algo: headers['paypal-auth-algo'],
        cert_url: headers['paypal-cert-url'],
        client_cert_key_id: headers['paypal-transmission-id'],
        transmission_id: headers['paypal-transmission-id'],
        transmission_sig: headers['paypal-transmission-sig'],
        transmission_time: headers['paypal-transmission-time'],
        webhook_id: this.config.webhookId,
        webhook_event: typeof webhookData === 'string' ? JSON.parse(webhookData) : webhookData
      });
      const verification = await this.client.execute(request);
      if (verification.result.verification_status !== 'SUCCESS') {
        throw new Error('Invalid signature');
      }
      const event = typeof webhookData === 'string' ? JSON.parse(webhookData) : webhookData;
      return {
        eventType: event.event_type,
        eventId: event.id,
        data: event.resource
      };
    } catch (error) {
      throw new Error(`PAYPAL_WEBHOOK_INVALID: ${error.message}`);
    }
  }
}
```

- [ ] **Step 3: Add `PayPalGateway` to `module.exports` at the bottom of `src/services/paymentService.js`**

Replace the existing exports block:

```js
module.exports = {
  PaymentGateway,
  StripeGateway,
  SquareGateway,
  PayPalGateway,
  PaymentService,
  FraudDetectionService
};
```

- [ ] **Step 4: Verify the class loads**

```bash
node -e "const {PayPalGateway} = require('./src/services/paymentService'); console.log(typeof PayPalGateway)"
```

Expected: `function`

- [ ] **Step 5: Commit**

```bash
git add src/services/paymentService.js
git commit -m "feat: implement PayPalGateway using Orders v2 API"
```

---

## Task 3: Write unit tests for `PayPalGateway`

**Files:**
- Create: `tests/unit/services/paypalGateway.test.js`

- [ ] **Step 1: Create the test file**

Create `tests/unit/services/paypalGateway.test.js` with the following content:

```js
const { PayPalGateway } = require('../../../src/services/paymentService');

// ── Mock @paypal/checkout-server-sdk ──────────────────────────────────────────
let mockExecute;
jest.mock('@paypal/checkout-server-sdk', () => {
  mockExecute = jest.fn();
  return {
    core: {
      SandboxEnvironment: jest.fn(),
      LiveEnvironment: jest.fn(),
      PayPalHttpClient: jest.fn(() => ({ execute: mockExecute }))
    },
    orders: {
      OrdersCreateRequest: jest.fn(() => ({ prefer: jest.fn(), requestBody: jest.fn() })),
      OrdersCaptureRequest: jest.fn(() => ({ requestBody: jest.fn() })),
      OrdersGetRequest: jest.fn()
    },
    payments: {
      CapturesRefundRequest: jest.fn(() => ({ requestBody: jest.fn() })),
      CapturesGetRequest: jest.fn()
    },
    notifications: {
      VerifyWebhookSignatureRequest: jest.fn(() => ({ requestBody: jest.fn() }))
    }
  };
});

const sandboxConfig = {
  clientId: 'test-client-id',
  clientSecret: 'test-client-secret',
  environment: 'sandbox',
  webhookId: 'test-webhook-id'
};

describe('PayPalGateway', () => {
  let gateway;

  beforeEach(() => {
    jest.clearAllMocks();
    gateway = new PayPalGateway(sandboxConfig);
  });

  // ── constructor ─────────────────────────────────────────────────────────────
  describe('constructor', () => {
    it('uses SandboxEnvironment when environment is sandbox', () => {
      const paypal = require('@paypal/checkout-server-sdk');
      expect(paypal.core.SandboxEnvironment).toHaveBeenCalledWith('test-client-id', 'test-client-secret');
    });

    it('uses LiveEnvironment when environment is production', () => {
      jest.clearAllMocks();
      new PayPalGateway({ ...sandboxConfig, environment: 'production' });
      const paypal = require('@paypal/checkout-server-sdk');
      expect(paypal.core.LiveEnvironment).toHaveBeenCalledWith('test-client-id', 'test-client-secret');
    });
  });

  // ── tokenizePaymentMethod ───────────────────────────────────────────────────
  describe('tokenizePaymentMethod', () => {
    it('creates an order and returns token + approvalUrl', async () => {
      mockExecute.mockResolvedValueOnce({
        result: {
          id: 'ORDER-123',
          links: [
            { rel: 'self', href: 'https://api.paypal.com/v2/checkout/orders/ORDER-123' },
            { rel: 'approve', href: 'https://www.sandbox.paypal.com/checkoutnow?token=ORDER-123' }
          ]
        }
      });

      const result = await gateway.tokenizePaymentMethod({
        amount: 150.00,
        currency: 'USD',
        description: 'Landscape painting',
        returnUrl: 'https://sag.live/payment-success',
        cancelUrl: 'https://sag.live/payment-cancel',
        metadata: { artworkId: 'art-456' }
      });

      expect(result.token).toBe('ORDER-123');
      expect(result.approvalUrl).toBe('https://www.sandbox.paypal.com/checkoutnow?token=ORDER-123');
    });

    it('throws PAYPAL_TOKENIZATION_FAILED on SDK error', async () => {
      mockExecute.mockRejectedValueOnce(new Error('Network error'));

      await expect(gateway.tokenizePaymentMethod({
        amount: 100,
        currency: 'USD',
        description: 'test',
        returnUrl: 'https://sag.live/success',
        cancelUrl: 'https://sag.live/cancel',
        metadata: {}
      })).rejects.toThrow('PAYPAL_TOKENIZATION_FAILED: Network error');
    });

    it('returns null approvalUrl when approve link is missing', async () => {
      mockExecute.mockResolvedValueOnce({
        result: {
          id: 'ORDER-789',
          links: [{ rel: 'self', href: 'https://api.paypal.com/v2/checkout/orders/ORDER-789' }]
        }
      });

      const result = await gateway.tokenizePaymentMethod({
        amount: 50,
        currency: 'USD',
        description: 'test',
        returnUrl: 'https://sag.live/success',
        cancelUrl: 'https://sag.live/cancel',
        metadata: {}
      });

      expect(result.approvalUrl).toBeNull();
    });
  });

  // ── chargeCard (capture) ────────────────────────────────────────────────────
  describe('chargeCard', () => {
    it('captures an approved order and returns normalized result', async () => {
      mockExecute.mockResolvedValueOnce({
        result: {
          id: 'ORDER-123',
          status: 'COMPLETED',
          purchase_units: [{
            payments: {
              captures: [{
                id: 'CAPTURE-456',
                status: 'COMPLETED',
                amount: { value: '150.00', currency_code: 'USD' },
                create_time: '2026-05-10T12:00:00Z'
              }]
            }
          }]
        }
      });

      const result = await gateway.chargeCard({ token: 'ORDER-123' });

      expect(result.transactionId).toBe('CAPTURE-456');
      expect(result.orderId).toBe('ORDER-123');
      expect(result.status).toBe('COMPLETED');
      expect(result.amount).toBe(150.00);
      expect(result.currency).toBe('USD');
      expect(result.timestamp).toBeInstanceOf(Date);
    });

    it('throws PAYPAL_CHARGE_FAILED on SDK error', async () => {
      mockExecute.mockRejectedValueOnce(new Error('Order not approved'));

      await expect(gateway.chargeCard({ token: 'ORDER-BAD' }))
        .rejects.toThrow('PAYPAL_CHARGE_FAILED: Order not approved');
    });
  });

  // ── refundCharge ────────────────────────────────────────────────────────────
  describe('refundCharge', () => {
    it('refunds a capture and returns refund details', async () => {
      mockExecute.mockResolvedValueOnce({
        result: {
          id: 'REFUND-789',
          status: 'COMPLETED',
          amount: { value: '150.00', currency_code: 'USD' },
          create_time: '2026-05-10T13:00:00Z'
        }
      });

      const result = await gateway.refundCharge({
        transactionId: 'CAPTURE-456',
        amount: 150.00,
        reason: 'Customer requested'
      });

      expect(result.refundId).toBe('REFUND-789');
      expect(result.status).toBe('COMPLETED');
      expect(result.amount).toBe(150.00);
      expect(result.timestamp).toBeInstanceOf(Date);
    });

    it('falls back to input amount when response has no amount field', async () => {
      mockExecute.mockResolvedValueOnce({
        result: {
          id: 'REFUND-000',
          status: 'PENDING',
          create_time: '2026-05-10T13:00:00Z'
        }
      });

      const result = await gateway.refundCharge({
        transactionId: 'CAPTURE-456',
        amount: 75.00,
        reason: 'partial refund'
      });

      expect(result.amount).toBe(75.00);
    });

    it('throws PAYPAL_REFUND_FAILED on SDK error', async () => {
      mockExecute.mockRejectedValueOnce(new Error('Capture not found'));

      await expect(gateway.refundCharge({
        transactionId: 'CAPTURE-BAD',
        amount: 50,
        reason: 'test'
      })).rejects.toThrow('PAYPAL_REFUND_FAILED: Capture not found');
    });
  });

  // ── getTransactionStatus ────────────────────────────────────────────────────
  describe('getTransactionStatus', () => {
    it('returns normalized status for a capture', async () => {
      mockExecute.mockResolvedValueOnce({
        result: {
          id: 'CAPTURE-456',
          status: 'COMPLETED',
          amount: { value: '150.00', currency_code: 'USD' },
          create_time: '2026-05-10T12:00:00Z'
        }
      });

      const result = await gateway.getTransactionStatus('CAPTURE-456');

      expect(result.transactionId).toBe('CAPTURE-456');
      expect(result.status).toBe('COMPLETED');
      expect(result.amount).toBe(150.00);
      expect(result.currency).toBe('USD');
    });

    it('throws PAYPAL_STATUS_CHECK_FAILED on SDK error', async () => {
      mockExecute.mockRejectedValueOnce(new Error('Not found'));

      await expect(gateway.getTransactionStatus('CAPTURE-BAD'))
        .rejects.toThrow('PAYPAL_STATUS_CHECK_FAILED: Not found');
    });
  });

  // ── validateWebhook ─────────────────────────────────────────────────────────
  describe('validateWebhook', () => {
    const validHeaders = {
      'paypal-auth-algo': 'SHA256withRSA',
      'paypal-cert-url': 'https://api.paypal.com/v1/notifications/certs/cert-id',
      'paypal-transmission-id': 'trans-id-123',
      'paypal-transmission-sig': 'base64sig==',
      'paypal-transmission-time': '2026-05-10T12:00:00Z'
    };

    const validEvent = {
      id: 'evt-001',
      event_type: 'PAYMENT.CAPTURE.COMPLETED',
      resource: { id: 'CAPTURE-456', status: 'COMPLETED' }
    };

    it('returns parsed event for a valid webhook', async () => {
      mockExecute.mockResolvedValueOnce({
        result: { verification_status: 'SUCCESS' }
      });

      const result = await gateway.validateWebhook(validEvent, validHeaders);

      expect(result.eventType).toBe('PAYMENT.CAPTURE.COMPLETED');
      expect(result.eventId).toBe('evt-001');
      expect(result.data).toEqual({ id: 'CAPTURE-456', status: 'COMPLETED' });
    });

    it('accepts a JSON string as webhookData', async () => {
      mockExecute.mockResolvedValueOnce({
        result: { verification_status: 'SUCCESS' }
      });

      const result = await gateway.validateWebhook(JSON.stringify(validEvent), validHeaders);

      expect(result.eventType).toBe('PAYMENT.CAPTURE.COMPLETED');
    });

    it('throws PAYPAL_WEBHOOK_INVALID when verification_status is FAILURE', async () => {
      mockExecute.mockResolvedValueOnce({
        result: { verification_status: 'FAILURE' }
      });

      await expect(gateway.validateWebhook(validEvent, validHeaders))
        .rejects.toThrow('PAYPAL_WEBHOOK_INVALID: Invalid signature');
    });

    it('throws PAYPAL_WEBHOOK_INVALID on SDK error', async () => {
      mockExecute.mockRejectedValueOnce(new Error('SSL error'));

      await expect(gateway.validateWebhook(validEvent, validHeaders))
        .rejects.toThrow('PAYPAL_WEBHOOK_INVALID: SSL error');
    });
  });
});
```

- [ ] **Step 2: Run the tests to make sure they fail**

```bash
npm test -- --testPathPattern=tests/unit/services/paypalGateway
```

Expected: tests should FAIL with `PayPalGateway is not a constructor` or `Cannot find module` until Task 2 is complete. If Task 2 is already done, they should PASS.

- [ ] **Step 3: Run the full unit suite to confirm no regressions**

```bash
npm run test:unit
```

Expected: All 365 existing tests still pass, plus the new PayPal tests.

- [ ] **Step 4: Commit**

```bash
git add tests/unit/services/paypalGateway.test.js
git commit -m "test: add PayPalGateway unit tests (tokenize, charge, refund, status, webhook)"
```

---

## Task 4: Register `PayPalGateway` in `paymentRoutes.js`

**Files:**
- Modify: `src/routes/paymentRoutes.js` lines 1–27

- [ ] **Step 1: Replace the top of `src/routes/paymentRoutes.js`**

Replace the current `NullPaymentService` block (lines 8–27) with the real gateway wiring:

```js
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

// pool is lazily resolved on first use (matches the pattern used in adminRoutes.js)
let _paymentController = null;
function getPaymentController() {
  if (!_paymentController) {
    const { pool } = require('../models/index');
    _paymentController = new PaymentController(buildPaymentService(pool));
  }
  return _paymentController;
}
```

- [ ] **Step 2: Update all four route handler calls in `src/routes/paymentRoutes.js` to use the lazy getter**

Replace these four lines (approximately lines 63, 93, 129, 150):

```js
// Before → After

(req, res, next) => paymentController.processPayment(req, res, next)
// →
(req, res, next) => getPaymentController().processPayment(req, res, next)

(req, res, next) => paymentController.getPaymentStatus(req, res, next)
// →
(req, res, next) => getPaymentController().getPaymentStatus(req, res, next)

(req, res, next) => paymentController.refundPayment(req, res, next)
// →
(req, res, next) => getPaymentController().refundPayment(req, res, next)

(req, res, next) => paymentController.handleWebhook(req, res, next)
// →
(req, res, next) => getPaymentController().handleWebhook(req, res, next)
```

- [ ] **Step 3: Verify the server still starts**

```bash
node -e "require('./src/routes/paymentRoutes')"
```

Expected: no output (no crash).

- [ ] **Step 4: Commit**

```bash
git add src/routes/paymentRoutes.js
git commit -m "feat: wire PayPalGateway into paymentRoutes gateway dispatch map"
```

---

## Task 5: Allow `PAYPAL` gateway type in `adminRoutes.js`

**Files:**
- Modify: `src/routes/adminRoutes.js` around the gateway insert block (lines ~520–537)

The current insert hardcodes `gateway_type: 'STRIPE'`. We need to accept `PAYPAL` as a valid type too.

- [ ] **Step 1: Find the gateway insert block**

```bash
grep -n "gateway_type\|STRIPE\|PAYPAL\|gateway_name" src/routes/adminRoutes.js
```

Note the line numbers of the insert block that hardcodes `'STRIPE'`.

- [ ] **Step 2: Update the gateway creation handler**

Find this block in `src/routes/adminRoutes.js` (around line 520):

```js
      // Insert dummy test gateway
      const result = await pool.query(
        `INSERT INTO payment_gateways (
           school_id, gateway_type, gateway_name,
           api_key_encrypted, api_secret_encrypted,
           is_active, is_primary, currency_code,
           created_by_user_id
         ) VALUES ($1, $2, $3, $4, $5, TRUE, TRUE, 'USD', $6)
         RETURNING id`,
        [
          schoolId,
          'STRIPE',
          'Test Gateway — NOT for real payments',
          'test_dummy_key_not_for_production',
          'test_dummy_secret_not_for_production',
          req.user.id
        ]
      );
```

Replace it with:

```js
      const { gateway_type: gatewayType = 'STRIPE' } = req.body;
      const allowedTypes = ['STRIPE', 'SQUARE', 'PAYPAL'];
      if (!allowedTypes.includes(gatewayType.toUpperCase())) {
        return res.status(400).json({
          success: false,
          message: `Invalid gateway_type. Allowed: ${allowedTypes.join(', ')}`
        });
      }

      const result = await pool.query(
        `INSERT INTO payment_gateways (
           school_id, gateway_type, gateway_name,
           api_key_encrypted, api_secret_encrypted,
           is_active, is_primary, currency_code,
           created_by_user_id
         ) VALUES ($1, $2, $3, $4, $5, TRUE, TRUE, 'USD', $6)
         RETURNING id`,
        [
          schoolId,
          gatewayType.toUpperCase(),
          `Test ${gatewayType.toUpperCase()} Gateway — NOT for real payments`,
          'test_dummy_key_not_for_production',
          'test_dummy_secret_not_for_production',
          req.user.id
        ]
      );
```

- [ ] **Step 3: Verify the server still starts**

```bash
node -e "require('./src/routes/adminRoutes')"
```

Expected: no output (no crash).

- [ ] **Step 4: Commit**

```bash
git add src/routes/adminRoutes.js
git commit -m "feat: allow STRIPE, SQUARE, PAYPAL gateway types in admin gateway creation"
```

---

## Task 6: Final verification

- [ ] **Step 1: Run the full unit test suite**

```bash
npm run test:unit
```

Expected: all tests pass (365 original + new PayPal tests).

- [ ] **Step 2: Smoke-test the gateway loads**

```bash
node -e "
const { PayPalGateway } = require('./src/services/paymentService');
const g = new PayPalGateway({ clientId: 'id', clientSecret: 'sec', environment: 'sandbox', webhookId: 'wh' });
console.log('methods:', ['tokenizePaymentMethod','chargeCard','refundCharge','getTransactionStatus','validateWebhook'].filter(m => typeof g[m] === 'function'));
"
```

Expected:
```
methods: [ 'tokenizePaymentMethod', 'chargeCard', 'refundCharge', 'getTransactionStatus', 'validateWebhook' ]
```

- [ ] **Step 3: Final commit**

```bash
git add -A
git commit -m "feat: PayPal gateway implementation complete — all unit tests passing"
```

---

## PayPal Developer Setup (for production use)

Before testing end-to-end with real PayPal sandbox:

1. Create a PayPal developer account at developer.paypal.com
2. Create a Sandbox App → get `PAYPAL_CLIENT_ID` and `PAYPAL_CLIENT_SECRET`
3. Create a webhook → get `PAYPAL_WEBHOOK_ID`
4. Set `PAYPAL_ENVIRONMENT=sandbox` in `.env`
5. To go live: change to `PAYPAL_ENVIRONMENT=production` and swap in live credentials

PayPal webhook events to subscribe to:
- `PAYMENT.CAPTURE.COMPLETED`
- `PAYMENT.CAPTURE.DENIED`
- `PAYMENT.CAPTURE.REFUNDED`
